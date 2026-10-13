import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { cashFlow, type PlannedItem, type TrailingCost } from "../lib/cash-flow.js";

/**
 * The forward view, and the plan it projects from (gap report §3 C4).
 *
 * The doc's rule is "extend the ledger into a forward view; do not build a new
 * ledger", so nothing here writes money. What it does build is the one thing the
 * ledger cannot provide on its own: a PLAN. `budget_items` holds what the farmer
 * expects — school fees in December, fertiliser in March — and everything else in
 * the projection comes from records that already exist: what they are owed, their
 * loan instalments, and their own trailing costs.
 *
 * Trailing costs are the farmer's OWN averages, taken over the last three months
 * of their expense records, and the projection prints how many months each was
 * averaged over so a thin history reads as thin rather than as fact.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

/** How far back the trailing-cost averages are taken. */
const TRAILING_MONTHS = 3;
/** How far ahead the projection runs by default. */
const DEFAULT_HORIZON_DAYS = 90;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toPlanned(i: {
  id: number; label: string; direction: string; amount: unknown; dueOn: Date;
  recurring: string | null; category: string | null;
}): PlannedItem {
  return {
    id: i.id,
    label: i.label,
    direction: i.direction === "inflow" ? "inflow" : "outflow",
    amount: num(i.amount),
    dueOn: new Date(i.dueOn),
    recurring: i.recurring,
    category: i.category,
  };
}

/**
 * The farm's own monthly cost, by category.
 *
 * Averaged over the FULL window rather than over the months that happen to have
 * an entry: a category that only appears in one month is a real cost that happens
 * monthly or a one-off, and dividing by the whole window is the conservative
 * reading of the two. `monthsAveraged` states the window so the farmer can judge.
 */
async function trailingCosts(farmId: number, on: Date): Promise<TrailingCost[]> {
  const since = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth() - TRAILING_MONTHS, on.getUTCDate()));
  const rows = await prisma.transaction.findMany({
    where: { farmId, type: "expense", date: { gte: since, lte: on } },
    select: { category: true, amount: true },
  });

  const byCategory = new Map<string, number>();
  for (const r of rows) {
    const key = (r.category || "other").toLowerCase();
    byCategory.set(key, (byCategory.get(key) ?? 0) + num(r.amount));
  }

  return [...byCategory.entries()]
    .map(([label, total]) => ({
      label,
      monthlyAverage: Math.round((total / TRAILING_MONTHS) * 100) / 100,
      monthsAveraged: TRAILING_MONTHS,
    }))
    .filter((c) => c.monthlyAverage > 0)
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage);
}

/** GET /api/cash-flow?days=90 — the projection, the plan, and what it assumed. */
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const on = new Date();
    const days = Math.min(Math.max(Number(req.query.days) || DEFAULT_HORIZON_DAYS, 7), 365);

    const [deliveries, planned, loans, costs] = await Promise.all([
      prisma.delivery.findMany({
        where: { farmId, status: { not: "paid" } },
        select: {
          id: true, date: true, buyer: true, payBy: true, expectedPay: true, paidAmount: true,
          deductions: { select: { amount: true } },
        },
      }),
      prisma.budgetItem.findMany({ where: { farmId }, orderBy: { dueOn: "asc" } }),
      prisma.farmLoan.findMany({
        where: { farmId, status: "active" },
        select: { id: true, lender: true, instalmentAmount: true, firstInstalmentDue: true, instalmentCount: true, amountPaid: true },
      }),
      trailingCosts(farmId, on),
    ]);

    // Only money with a PROMISE date is projected. A delivery with no payBy has no
    // date to put it on, and inventing one (say, end of month) would be us
    // promising a payment the buyer never agreed to.
    const owed = deliveries
      .map((d) => {
        const net = num(d.expectedPay) - d.deductions.reduce((s, x) => s + num(x.amount), 0) - num(d.paidAmount);
        return {
          id: d.id,
          amount: Math.max(0, Math.round(net * 100) / 100),
          payBy: d.payBy ? new Date(d.payBy) : null,
          label: `${d.buyer} delivery`,
        };
      })
      .filter((o) => o.amount > 0);

    const projection = cashFlow(
      {
        owed,
        planned: planned.map(toPlanned),
        loans: loans.map((l) => ({
          id: l.id,
          lender: l.lender,
          instalmentAmount: l.instalmentAmount != null ? num(l.instalmentAmount) : null,
          firstInstalmentDue: l.firstInstalmentDue ? new Date(l.firstInstalmentDue) : null,
          instalmentCount: l.instalmentCount,
          amountPaid: num(l.amountPaid),
        })),
        trailingCosts: costs,
        regularMonthlyIncome: req.query.regularIncome != null ? num(req.query.regularIncome) : null,
      },
      on,
      days
    );

    return res.json({
      ...projection,
      planned: planned.map(toPlanned),
      assumptions: {
        trailingMonths: TRAILING_MONTHS,
        trailingCosts: costs,
        loansCounted: loans.length,
        owedCounted: owed.length,
        // Deliveries with no promised date, named so a farmer can see what the
        // projection is deliberately leaving out.
        noPromiseDate: deliveries.filter((d) => !d.payBy && d.expectedPay != null && num(d.expectedPay) > 0).length,
      },
    });
  } catch (error) {
    console.error("Cash flow error:", error);
    return res.status(500).json({ error: "Failed to build the projection" });
  }
});

// GET /api/cash-flow/budget — the plan on its own.
router.get("/budget", async (req: Request, res: Response) => {
  try {
    const rows = await prisma.budgetItem.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { dueOn: "asc" },
    });
    return res.json({
      items: rows.map(toPlanned),
      // The whole point of the table, restated where the plan is edited.
      basis: "A plan, not a ledger. Nothing here counts as money spent or received until you record it.",
    });
  } catch (error) {
    console.error("Budget list error:", error);
    return res.status(500).json({ error: "Failed to load the plan" });
  }
});

// POST /api/cash-flow/budget — add a planned item.
router.post("/budget", async (req: Request, res: Response) => {
  try {
    const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
    if (!label) return res.status(400).json({ error: "What is this for?", field: "label" });
    const amount = num(req.body?.amount);
    if (amount <= 0) return res.status(400).json({ error: "Enter the amount", field: "amount" });
    const dueOn = dateOrNull(req.body?.dueOn);
    if (!dueOn) return res.status(400).json({ error: "When is it due?", field: "dueOn" });

    const item = await prisma.budgetItem.create({
      data: {
        farmId: req.user!.farmId!,
        label,
        direction: req.body?.direction === "inflow" ? "inflow" : "outflow",
        amount,
        dueOn,
        category: req.body?.category?.trim() || null,
        // An unrecognised recurrence is stored as once rather than guessed at: a
        // monthly repeat that was meant to be once multiplies a cost by three.
        recurring: ["once", "weekly", "monthly", "seasonal"].includes(req.body?.recurring) ? req.body.recurring : "once",
        notes: req.body?.notes?.trim() || null,
        createdBy: req.user!.userId ?? null,
      },
    });
    return res.status(201).json(item);
  } catch (error) {
    console.error("Budget create error:", error);
    return res.status(500).json({ error: "Failed to save the plan item" });
  }
});

// DELETE /api/cash-flow/budget/:id
router.delete("/budget/:id", async (req: Request, res: Response) => {
  try {
    const removed = await prisma.budgetItem.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!removed.count) return res.status(404).json({ error: "Plan item not found" });
    return res.json({ success: true });
  } catch (error) {
    console.error("Budget delete error:", error);
    return res.status(500).json({ error: "Failed to delete the plan item" });
  }
});

export default router;
