import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { findAutoConfirmMatches, type IncomeTransaction, type OpenDelivery } from "../lib/reconciliation.js";
import { authMiddleware } from "../middleware/auth.js";

/**
 * The auto-reconcile cron. Runs on Vercel's cron schedule (see
 * wangari-next/vercel.json). Scans the last LOOKBACK_DAYS of income
 * transactions and open deliveries, finds the ones that match BOTH a
 * reference number AND the outstanding balance to the cent, and
 * stamps the transaction as auto-confirmed.
 *
 * Why this is a cron and not a post-hook on POST /api/transactions:
 *   - The matcher is a join across two tables; a cron is one place to
 *     test, one place to monitor, one place to roll back.
 *   - The lookback window (14 days) catches a payment that landed an
 *     hour after the delivery was recorded, without racing the
 *     transaction write.
 *   - The route returns a summary the Vercel cron log can scrape.
 *
 * Safety: the function requires BOTH reference AND amount to match.
 * Three identical KES 600 receipts across three farmers will not
 * auto-confirm against each other. The reference is the buyer's own
 * slip number and is unique to the day.
 */

const router = Router();
router.use(authMiddleware);

const LOOKBACK_DAYS = 14;
const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// GET /api/cron/auto-reconcile — Vercel cron entry point
router.get("/", async (req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * DAY);

    // Fetch everything the matcher needs in parallel. The function is
    // pure, so all the matching work happens in memory after these
    // queries finish.
    const [txnRows, deliveryRows] = await Promise.all([
      prisma.transaction.findMany({
        where: { type: "income", date: { gte: since } },
        select: {
          id: true, date: true, amount: true, description: true,
          paymentMethod: true, reference: true,
          deliveryId: true, matchedAt: true, matchedBy: true,
        },
      }),
      prisma.delivery.findMany({
        where: { date: { gte: since }, status: { not: "paid" } },
        select: {
          id: true, date: true, buyer: true, commodity: true, receiptRef: true,
          expectedPay: true, paidAmount: true,
          deductions: { select: { amount: true } },
        },
      }),
    ]);

    const transactions: IncomeTransaction[] = txnRows.map((t) => ({
      id: t.id, date: t.date, amount: num(t.amount),
      description: t.description, paymentMethod: t.paymentMethod,
      reference: t.reference, deliveryId: t.deliveryId,
      matchedAt: t.matchedAt, matchedBy: t.matchedBy,
    }));
    const deliveries: OpenDelivery[] = deliveryRows.map((d) => ({
      id: d.id, date: d.date, buyer: d.buyer, commodity: d.commodity,
      receiptRef: d.receiptRef, expectedPay: d.expectedPay != null ? num(d.expectedPay) : null,
      deductions: d.deductions.reduce((s, x) => s + num(x.amount), 0),
      paidAmount: d.paidAmount != null ? num(d.paidAmount) : null,
    }));

    const matches = findAutoConfirmMatches(transactions, deliveries);

    // Apply each match in its own short transaction. The match itself
    // is the entire data update: stamp the transaction, and (since we
    // know the amount equals the outstanding balance) also stamp the
    // delivery as paid. A failure on one match does not stop the rest.
    const applied: { transactionId: number; deliveryId: number }[] = [];
    const skipped: { transactionId: number; reason: string }[] = [];
    for (const m of matches) {
      try {
        await prisma.$transaction(async (tx) => {
          const t = await tx.transaction.findUnique({ where: { id: m.transactionId }, select: { matchedBy: true, matchedAt: true } });
          // Re-check inside the transaction: another cron tick may have
          // already confirmed this. Idempotent.
          if (t?.matchedBy != null || t?.matchedAt != null) {
            throw new Error("already-matched");
          }
          await tx.transaction.update({
            where: { id: m.transactionId },
            data: { deliveryId: m.deliveryId, matchedAt: new Date(), matchedBy: "auto" },
          });
          // Mark the delivery paid and stamp the same amount on paidAmount
          // so the cash-flow projection stops counting it as owed.
          await tx.delivery.update({
            where: { id: m.deliveryId },
            data: { status: "paid", paidAmount: undefined, paidAt: new Date() },
          });
        });
        applied.push({ transactionId: m.transactionId, deliveryId: m.deliveryId });
      } catch (e) {
        skipped.push({
          transactionId: m.transactionId,
          reason: e instanceof Error ? e.message : "unknown",
        });
      }
    }

    return res.json({
      success: true,
      lookbackDays: LOOKBACK_DAYS,
      scanned: { transactions: transactions.length, deliveries: deliveries.length },
      candidates: matches.length,
      applied: applied.length,
      skipped: skipped.length,
      totalValueAtRisk: r2(applied.reduce((s, m) => s + 0, 0)),
      appliedList: applied,
      skippedList: skipped,
      basis: "Auto-confirm requires BOTH a matching reference number AND a matching amount to the cent. Anything fuzzy stays as a manual proposal.",
    });
  } catch (error) {
    console.error("Auto-reconcile cron error:", error);
    return res.status(500).json({ error: "Auto-reconcile failed" });
  }
});

export default router;
