import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  proposeMatches,
  reconciliationSummary,
  scoreMatch,
  type IncomeTransaction,
  type OpenDelivery,
} from "../lib/reconciliation.js";

/**
 * Matching money received to the delivery it settled (gap report §3 C3).
 *
 * This is a MANUAL reconciliation with proposals, on purpose — the doc's own
 * guidance is "match by reference/amount in the existing ledger; manual confirm is
 * enough for a first version". Nothing here writes money. Confirming a match
 * stamps the transaction so it can never be re-proposed, and clears the delivery
 * from the outstanding list.
 *
 * `requireOwner`: this touches the ledger, and a farm member who can silently
 * marry a payment to a delivery could make a disputed month look settled.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

/** How far back proposals are looked for. Older money is history, not a to-do. */
const LOOKBACK_DAYS = 180;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** GET /api/reconciliation — the position, the proposals, and both sides of it. */
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);

    const [txns, deliveries] = await Promise.all([
      prisma.transaction.findMany({
        where: { farmId, type: "income", date: { gte: since } },
        orderBy: { date: "desc" },
        take: 400,
        select: {
          id: true, date: true, amount: true, description: true, paymentMethod: true,
          reference: true, deliveryId: true, matchedAt: true, matchedBy: true,
        },
      }),
      prisma.delivery.findMany({
        where: { farmId, date: { gte: since } },
        orderBy: { date: "desc" },
        take: 400,
        select: {
          id: true, date: true, buyer: true, commodity: true, receiptRef: true,
          expectedPay: true, paidAmount: true,
          deductions: { select: { amount: true } },
        },
      }),
    ]);

    const transactions: IncomeTransaction[] = txns.map((t) => ({
      id: t.id,
      date: new Date(t.date),
      amount: num(t.amount),
      description: t.description,
      paymentMethod: t.paymentMethod,
      reference: t.reference,
      deliveryId: t.deliveryId,
      matchedAt: t.matchedAt,
      matchedBy: t.matchedBy,
    }));

    const openDeliveries: OpenDelivery[] = deliveries.map((d) => ({
      id: d.id,
      date: new Date(d.date),
      buyer: d.buyer,
      commodity: d.commodity,
      receiptRef: d.receiptRef,
      expectedPay: d.expectedPay != null ? num(d.expectedPay) : null,
      deductions: d.deductions.reduce((s, x) => s + num(x.amount), 0),
      paidAmount: d.paidAmount != null ? num(d.paidAmount) : null,
    }));

    const proposals = proposeMatches(transactions, openDeliveries);

    res.json({
      summary: reconciliationSummary(transactions, openDeliveries, proposals),
      proposals: proposals.map((p) => {
        const t = transactions.find((x) => x.id === p.transactionId);
        const d = openDeliveries.find((x) => x.id === p.deliveryId);
        return {
          ...p,
          transaction: t
            ? { id: t.id, date: t.date, amount: t.amount, description: t.description, reference: t.reference }
            : null,
          delivery: d
            ? { id: d.id, date: d.date, buyer: d.buyer, commodity: d.commodity, expectedPay: d.expectedPay }
            : null,
        };
      }),
      // Money in with nothing behind it — the list a farmer works down.
      unmatched: transactions.filter((t) => t.deliveryId == null),
      // Deliveries still owed, so the farmer can see both halves.
      outstanding: openDeliveries.filter(
        (d) => d.expectedPay != null && d.expectedPay - d.deductions - (d.paidAmount ?? 0) > 0.01
      ),
      windowDays: LOOKBACK_DAYS,
    });
  } catch (error) {
    console.error("Reconciliation error:", error);
    res.status(500).json({ error: "Failed to build the reconciliation view" });
  }
});

/** GET /api/reconciliation/why?transactionId=&deliveryId= — why we did or did not propose a pair. */
router.get("/why", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const transactionId = Number(req.query.transactionId);
    const deliveryId = Number(req.query.deliveryId);
    if (!Number.isInteger(transactionId) || !Number.isInteger(deliveryId)) {
      return res.status(400).json({ error: "transactionId and deliveryId are required" });
    }

    const [t, d] = await Promise.all([
      prisma.transaction.findFirst({ where: { id: transactionId, farmId }, select: { id: true, date: true, amount: true, description: true, reference: true, deliveryId: true, matchedAt: true, matchedBy: true } }),
      prisma.delivery.findFirst({ where: { id: deliveryId, farmId }, select: { id: true, date: true, buyer: true, commodity: true, receiptRef: true, expectedPay: true, paidAmount: true, deductions: { select: { amount: true } } } }),
    ]);
    if (!t || !d) return res.status(404).json({ error: "Not found" });

    const proposal = scoreMatch(
      {
        id: t.id, date: new Date(t.date), amount: num(t.amount), description: t.description,
        paymentMethod: null, reference: t.reference, deliveryId: t.deliveryId,
        matchedAt: t.matchedAt, matchedBy: t.matchedBy,
      },
      {
        id: d.id, date: new Date(d.date), buyer: d.buyer, commodity: d.commodity,
        receiptRef: d.receiptRef, expectedPay: d.expectedPay != null ? num(d.expectedPay) : null,
        deductions: d.deductions.reduce((s, x) => s + num(x.amount), 0),
        paidAmount: d.paidAmount != null ? num(d.paidAmount) : null,
      }
    );
    return res.json(proposal);
  } catch (error) {
    console.error("Reconciliation why error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/**
 * POST /api/reconciliation/confirm — the farmer's decision.
 *
 * `{ transactionId, deliveryId }` or `{ transactionId, deliveryId: null }` to
 * unlink. Both sides are scoped to the farm, so a transaction id from another
 * farm cannot be married to a delivery here.
 */
router.post("/confirm", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const transactionId = Number(req.body?.transactionId);
    if (!Number.isInteger(transactionId)) {
      return res.status(400).json({ error: "transactionId is required" });
    }

    const txn = await prisma.transaction.findFirst({ where: { id: transactionId, farmId }, select: { id: true } });
    if (!txn) return res.status(404).json({ error: "Transaction not found" });

    const raw = req.body?.deliveryId;

    // Unlinking is a real operation: a mis-confirmed match must be undoable, or
    // the first mistake makes the whole feature untrustworthy.
    if (raw === null || raw === undefined || raw === "") {
      const cleared = await prisma.transaction.update({
        where: { id: transactionId },
        data: { deliveryId: null, matchedAt: null, matchedBy: null },
      });
      return res.json({ matched: false, transaction: cleared });
    }

    const deliveryId = Number(raw);
    const delivery = await prisma.delivery.findFirst({ where: { id: deliveryId, farmId }, select: { id: true } });
    if (!delivery) return res.status(400).json({ error: "That delivery is not on this farm", field: "deliveryId" });

    // Two receipts cannot both settle one delivery. If one is already confirmed
    // against it, the second is refused rather than silently doubling what the
    // buyer is shown to have paid.
    const already = await prisma.transaction.findFirst({
      where: { farmId, deliveryId, id: { not: transactionId }, matchedAt: { not: null } },
      select: { id: true },
    });
    if (already) {
      return res.status(409).json({
        error: "Another payment is already matched to this delivery — unlink it first",
        otherTransactionId: already.id,
      });
    }

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: { deliveryId, matchedAt: new Date(), matchedBy: "manual" },
    });
    return res.json({ matched: true, transaction: updated });
  } catch (error) {
    console.error("Reconciliation confirm error:", error);
    return res.status(500).json({ error: "Failed to save the match" });
  }
});

export default router;
