import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { computeRecordGrade, WINDOW_DAYS, type GradeInput, type RecordGrade } from "../lib/record-grade.js";

/**
 * Farm health (M4's pride layer) — the honest version.
 *
 * What was deliberately refused, and what ships instead:
 *  - "You are better than N% of Wangari farms" was refused while 8 of 9 farms
 *    have almost no records: a percentile against empty books ranks a farm
 *    with ONE month of data above everyone — a number we would have made up.
 *    It ships GATED: the percentile is computed from REAL record grades the
 *    moment MIN_FARMS_FOR_PERCENTILE farms hold gradeable records (>= 30-day
 *    spans), and until then the response says exactly why it is null.
 *  - What is real TODAY is self-comparison: this farm's last 30 days against
 *    its own previous 30, on output and money, plus its record strength from
 *    the SAME tested grade the bankable-farm report uses (never re-derived
 *    with different rules).
 */

const router = Router();
router.use(authMiddleware, requireOwner);

/** Minimum gradeable farms before a percentile is anything but noise. */
export const MIN_FARMS_FOR_PERCENTILE = 5;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// GET /api/farm-health
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const since = new Date(today.getTime() - 30 * 86400000);
    const prevSince = new Date(since.getTime() - 30 * 86400000);
    const windowStart = new Date(today.getTime() - WINDOW_DAYS * 86400000);

    // ── One pass over shared data: production dates per farm, ledger per farm. ──
    const [allProdDates, allProdSums, txByFarm, salesCounts, deliveryCounts, curProd, prevProd, curTx, prevTx] =
      await Promise.all([
        prisma.dailyProduction.findMany({ select: { farmId: true, date: true } }),
        prisma.dailyProduction.groupBy({
          by: ["farmId"],
          _sum: { eggsCollected: true, milkCollected: true },
        }),
        prisma.transaction.groupBy({
          by: ["farmId", "type"],
          where: { date: { gte: windowStart } },
          _sum: { amount: true },
        }),
        prisma.sale.groupBy({ by: ["farmId"], _count: true }),
        prisma.delivery.groupBy({ by: ["farmId"], _count: true }),
        prisma.dailyProduction.findMany({
          where: { farmId, date: { gte: since } },
          select: { eggsCollected: true, milkCollected: true },
        }),
        prisma.dailyProduction.findMany({
          where: { farmId, date: { gte: prevSince, lt: since } },
          select: { eggsCollected: true, milkCollected: true },
        }),
        prisma.transaction.groupBy({
          by: ["type"],
          where: { farmId, date: { gte: since } },
          _sum: { amount: true },
        }),
        prisma.transaction.groupBy({
          by: ["type"],
          where: { farmId, date: { gte: prevSince, lt: since } },
          _sum: { amount: true },
        }),
      ]);

    // ── The farm's own grade, derived exactly like farm-record.ts does. ──
    const thisProd = allProdDates.filter((p) => p.farmId === farmId);
    const activityDays = new Set(thisProd.map((p) => ymd(new Date(p.date))));
    const months = new Set(thisProd.map((p) => ymd(new Date(p.date)).slice(0, 7)));
    const sortedDates = thisProd.map((p) => new Date(p.date).getTime()).sort((a, b) => a - b);
    const firstMs = sortedDates[0] ?? null;
    const lastMs = sortedDates[sortedDates.length - 1] ?? null;
    const spanDays = firstMs != null && lastMs != null ? Math.floor((lastMs - firstMs) / 86400000) : 0;
    const monthsElapsed = firstMs != null ? Math.max(1, Math.ceil((lastMs! - firstMs) / (30 * 86400000))) : 0;

    const sumType = (rows: { type: string; _sum: { amount: unknown } }[], t: string) =>
      rows.filter((r) => r.type === t).reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
    const windowIncome = sumType(txByFarm.filter((r) => r.farmId === farmId), "income");
    const windowExpenses = sumType(txByFarm.filter((r) => r.farmId === farmId), "expense");
    const salesCount = salesCounts.find((s) => s.farmId === farmId)?._count ?? 0;
    const deliveriesCount = deliveryCounts.find((d) => d.farmId === farmId)?._count ?? 0;
    const prodSums = allProdSums.find((s) => s.farmId === farmId);
    const hasOutput =
      Number(prodSums?._sum.eggsCollected ?? 0) > 0 ||
      Number(prodSums?._sum.milkCollected ?? 0) > 0;

    const gradeInput: GradeInput = {
      daysWithProduction: activityDays.size,
      recordSpanDays: spanDays,
      recordMonths: monthsElapsed,
      monthsWithRecords: months.size,
      expenses: windowExpenses,
      income: windowIncome,
      salesOrDeliveries: salesCount + deliveriesCount,
      hasOutput,
    };
    const grade: RecordGrade = computeRecordGrade(gradeInput);

    // ── Output & money: this month vs last month. ──
    const outputOf = (rows: { eggsCollected: unknown; milkCollected: unknown }[]) =>
      rows.reduce((s, r) => s + Number(r.eggsCollected || 0) + Number(r.milkCollected || 0), 0);
    const curOutput = outputOf(curProd);
    const prevOutput = outputOf(prevProd);
    const curIncome = sumType(curTx, "income");
    const curExpense = sumType(curTx, "expense");
    const prevIncome = sumType(prevTx, "income");
    const prevExpense = sumType(prevTx, "expense");

    /** Direction with the honest nulls: no previous data is never "flat". */
    const direction = (current: number, previous: number, priorActivity: boolean) => {
      if (!priorActivity) return { direction: null as "up" | "down" | "flat" | null, changePct: null as number | null };
      if (previous <= 0) return { direction: current > 0 ? ("up" as const) : null, changePct: null };
      const change = (current - previous) / previous;
      if (Math.abs(change) < 0.02) return { direction: "flat" as const, changePct: Math.round(change * 100) };
      return { direction: change > 0 ? ("up" as const) : ("down" as const), changePct: Math.round(change * 100) };
    };

    const trends = {
      output: { ...direction(curOutput, prevOutput, prevProd.length > 0), current: curOutput, previous: prevOutput },
      income: { ...direction(curIncome, prevIncome, prevIncome > 0 || prevExpense > 0), current: Math.round(curIncome), previous: Math.round(prevIncome) },
      profit: {
        ...direction(curIncome - curExpense, prevIncome - prevExpense, prevIncome > 0 || prevExpense > 0),
        current: Math.round(curIncome - curExpense),
        previous: Math.round(prevIncome - prevExpense),
      },
    };

    // ── The percentile, computed from REAL grades of REAL farms. ─────────────
    // Same derivation for every farm — no special casing, no simulation.
    const perFarm = new Map<number, { spanDays: number; grade: RecordGrade; consistency: number }>();
    for (const f of new Set(allProdDates.map((p) => p.farmId))) {
      const rows = allProdDates.filter((p) => p.farmId === f);
      const days = new Set(rows.map((p) => ymd(new Date(p.date))));
      const monthsF = new Set(rows.map((p) => ymd(new Date(p.date)).slice(0, 7)));
      const times = rows.map((p) => new Date(p.date).getTime()).sort((a, b) => a - b);
      const first = times[0] ?? null;
      const last = times[times.length - 1] ?? null;
      if (first == null || last == null) continue;
      const span = Math.floor((last - first) / 86400000);
      const monthsEl = Math.max(1, Math.ceil((last - first) / (30 * 86400000)));
      const g = computeRecordGrade({
        daysWithProduction: days.size,
        recordSpanDays: span,
        recordMonths: monthsEl,
        monthsWithRecords: monthsF.size,
        expenses: sumType(txByFarm.filter((r) => r.farmId === f), "expense"),
        income: sumType(txByFarm.filter((r) => r.farmId === f), "income"),
        salesOrDeliveries:
          (salesCounts.find((s) => s.farmId === f)?._count ?? 0) +
          (deliveryCounts.find((d) => d.farmId === f)?._count ?? 0),
        hasOutput: allProdSums.some((s) => s.farmId === f),
      } as GradeInput);
      perFarm.set(f, { spanDays: span, grade: g, consistency: (g as any).progress?.consistency ?? 0 });
    }
    const gradeable = [...perFarm.entries()].filter(([, v]) => v.grade.graded);

    let percentile: { value: number; farmsCompared: number } | null = null;
    let percentileNote: string;
    if (!grade.graded) {
      percentileNote = `Your farm needs at least ${30} days of records before it can be ranked.`;
    } else if (gradeable.length < MIN_FARMS_FOR_PERCENTILE) {
      percentileNote = `Only ${gradeable.length} farm(s) have a full month of records — the farm-to-farm ranking unlocks at ${MIN_FARMS_FOR_PERCENTILE}.`;
    } else {
      const others = gradeable.filter(([id]) => id !== farmId);
      if (others.length === 0) {
        percentileNote = "No other farm has enough record history to rank against yet.";
      } else {
        const mine = perFarm.get(farmId)!;
        const beaten = others.filter(
          ([, v]) =>
            v.grade.stars < mine.grade.stars ||
            (v.grade.stars === mine.grade.stars && v.consistency < mine.consistency)
        ).length;
        percentile = { value: Math.round((beaten / others.length) * 100), farmsCompared: others.length };
        percentileNote = "";
      }
    }

    res.json({
      grade: {
        graded: grade.graded,
        stars: grade.stars,
        maxStars: (grade as any).maxStars ?? 5,
        progress: (grade as any).progress ?? null,
      },
      trends,
      percentile,
      percentileNote: percentileNote || null,
      windowDays: 30,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Farm health error:", error);
    res.status(500).json({ error: "Failed to compute farm health" });
  }
});

export default router;
