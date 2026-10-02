import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { computeRecordGrade, WINDOW_DAYS, type GradeInput } from "../lib/record-grade.js";

/**
 * Farm Record — the proof layer.
 *
 * ── What this is ───────────────────────────────────────────────────────────
 * A loan officer at a Kenyan bank, AFC or SACCO assessing a farmer without
 * collateral looks for an OPERATIONAL HISTORY in four categories (research,
 * Oct 2026): task/activity records, input & procurement records, harvest &
 * yield, and market linkage — a named buyer who pays. Spread over multiple
 * seasons, not one good week.
 *
 * This endpoint assembles exactly those four from data the farmer already
 * records in Wangari, and nothing else. It is deliberately NOT a credit score
 * and NOT a loan decision: Wangari is the proof, the lender is the decision.
 *
 * ── The three promises this route makes ───────────────────────────────────
 * 1. FARMER-INITIATED ONLY. Nothing is ever sent anywhere. This is a read
 *    endpoint behind the farmer's own auth; the farmer presses the button and
 *    chooses who sees the result. No data is sold, no lender ever gets a feed
 *    (belief rule 8).
 * 2. NO SMOOTHED NUMBERS. Missing days are reported as missing days, and the
 *    report is explicit that early records are still growing. A report that
 *    flattered an empty farm would poison the one asset we have — a farmer's
 *    word that our numbers are true.
 * 3. GENDER-NEUTRAL. Nothing in the calculation depends on the farmer's sex,
 *    age, land size, or whether they hold a title deed. Only their own
 *    recording counts. Research is clear that women are locked out of credit
 *    for reasons that have nothing to do with how well they farm.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

const DAY = 86400000;
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
/** Whole months between two dates, inclusive of the first. min 0. */
const monthsBetween = (from: Date, to: Date): number => {
  if (!from || !to) return 0;
  const a = new Date(from), b = new Date(to);
  if (b < a) return 0;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months) + 1; // +1: a record started today is month 1
};
/** Inclusive day count between two dates. */
const daysBetween = (from: Date, to: Date): number => {
  if (!from || !to) return 0;
  const a = startOfDay(from), b = startOfDay(to);
  if (b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / DAY) + 1;
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// GET /api/farm-record
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const userId = req.user!.userId;
    if (!farmId || !userId) return res.status(403).json({ error: "No farm owner scope on this session" });
    const now = new Date();
    const today = startOfDay(now);
    const windowStart = new Date(today.getTime() - (WINDOW_DAYS - 1) * DAY);

    const [
      farm,
      owner,
      production,
      harvests,
      expenseTx,
      incomeTx,
      sales,
      deliveries,
      applications,
      attendance,
      flocks,
      crops,
      livestock,
    ] = await Promise.all([
      prisma.farm.findUnique({ where: { id: farmId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } }),
      prisma.dailyProduction.findMany({ where: { farmId }, orderBy: { date: "asc" }, select: { date: true, eggsCollected: true, milkCollected: true, weightGain: true, feedUsed: true, mortality: true, flockId: true } }),
      prisma.cropHarvest.findMany({ where: { farmId }, orderBy: { date: "asc" }, select: { date: true, quantityKg: true, soldQuantity: true, salePrice: true } }),
      prisma.transaction.findMany({ where: { farmId, type: "expense" }, orderBy: { date: "asc" }, select: { amount: true, date: true, category: true } }),
      prisma.transaction.findMany({ where: { farmId, type: "income" }, orderBy: { date: "asc" }, select: { amount: true, date: true, category: true } }),
      prisma.sale.findMany({ where: { farmId }, orderBy: { saleDate: "asc" }, select: { totalAmount: true, amountPaid: true, saleDate: true, paymentStatus: true } }),
      prisma.delivery.findMany({ where: { farmId }, orderBy: { date: "asc" }, select: { date: true, quantity: true, unit: true, buyer: true, expectedPay: true, paidAmount: true, status: true } }),
      prisma.cropApplication.findMany({ where: { farmId }, orderBy: { date: "asc" }, select: { date: true, cost: true, type: true, productName: true } }),
      prisma.attendance.findMany({ where: { farmId }, orderBy: { date: "asc" }, select: { date: true, workerId: true, status: true } }),
      prisma.flock.findMany({ where: { farmId }, select: { id: true, name: true, type: true, currentCount: true, status: true } }),
      prisma.crop.findMany({ where: { farmId }, select: { id: true, name: true, cropType: true, areaAcres: true, status: true } }),
      prisma.animal.count({ where: { farmId, status: "active" } }),
    ]);

    const inWindow = (d: Date) => d >= windowStart && d <= today;

    // ── History: the first and last day the farmer recorded anything ─────────
    const allDates: Date[] = [
      ...production.map((p) => p.date),
      ...harvests.map((h) => h.date),
      ...expenseTx.map((t) => t.date),
      ...incomeTx.map((t) => t.date),
      ...sales.map((s) => s.saleDate),
      ...deliveries.map((d) => d.date),
    ];
    const firstDate = allDates.length ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : null;
    const lastDate = allDates.length ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : null;
    const recordSpanDays = firstDate && lastDate ? daysBetween(firstDate, lastDate) : 0;
    const recordMonths = firstDate && lastDate ? monthsBetween(firstDate, lastDate) : 0;

    // ── Output totals (any of the three production measures, or a harvest) ──
    const eggs = production.reduce((s, p) => s + (p.eggsCollected || 0), 0);
    const milk = production.reduce((s, p) => s + Number(p.milkCollected || 0), 0);
    const weight = production.reduce((s, p) => s + Number(p.weightGain || 0), 0);
    const harvestKg = harvests.reduce((s, h) => s + Number(h.quantityKg || 0), 0);
    const mortality = production.reduce((s, p) => s + (p.mortality || 0), 0);
    const hasOutput = eggs > 0 || milk > 0 || weight > 0 || harvestKg > 0;

    // ── The 4 evidence categories ───────────────────────────────────────────
    // 1. ACTIVITY — distinct days with any production or harvest record.
    const activityDays = new Set<string>();
    for (const p of production) activityDays.add(ymd(new Date(p.date)));
    for (const h of harvests) activityDays.add(ymd(new Date(h.date)));
    const daysWithProduction = activityDays.size;

    // 2. INPUTS — money spent, plus input purchase/application records.
    const expenses = expenseTx.reduce((s, t) => s + Number(t.amount || 0), 0);
    const windowExpenses = expenseTx.filter((t) => inWindow(new Date(t.date))).reduce((s, t) => s + Number(t.amount || 0), 0);
    const inputApplicationCost = applications.reduce((s, a) => s + Number(a.cost || 0), 0);
    const inputRecords = expenseTx.length + applications.length;

    // 3. MARKET LINKAGE — a named buyer who pays. Money alone is not proof.
    const salesOrDeliveries = sales.length + deliveries.length;
    const income = incomeTx.reduce((s, t) => s + Number(t.amount || 0), 0);
    const windowIncome = incomeTx.filter((t) => inWindow(new Date(t.date))).reduce((s, t) => s + Number(t.amount || 0), 0);
    const buyers = new Set<string>();
    for (const d of deliveries) if (d.buyer) buyers.add(d.buyer);
    const saleRevenue = sales.reduce((s, x) => s + Number(x.totalAmount || 0), 0);
    const deliveryExpected = deliveries.reduce((s, d) => s + Number(d.expectedPay || 0), 0);
    const deliveryPaid = deliveries.reduce((s, d) => s + Number(d.paidAmount || 0), 0);
    const deliveryOwed = deliveries
      .filter((d) => d.status !== "paid")
      .reduce((s, d) => s + Math.max(0, Number(d.expectedPay || 0) - Number(d.paidAmount || 0)), 0);

    // 4. LABOUR / SCALE — a farm that employs people and keeps records.
    const workerDays = new Set(attendance.map((a) => ymd(new Date(a.date)))).size;
    const activeFlocks = flocks.filter((f) => f.status === "active");
    const headCount = activeFlocks.reduce((s, f) => s + (f.currentCount || 0), 0);
    const totalArea = crops.reduce((s, c) => s + Number(c.areaAcres || 0), 0);

    // ── Monthly series: the "this record is growing" proof ──────────────────
    const monthly: Record<string, { days: number; income: number; expense: number; output: number }> = {};
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bump = (k: string) => {
      if (!monthly[k]) monthly[k] = { days: 0, income: 0, expense: 0, output: 0 };
      return monthly[k];
    };
    for (const d of activityDays) bump(d.slice(0, 7)).days += 1;
    for (const t of incomeTx) bump(monthKey(new Date(t.date))).income += Number(t.amount || 0);
    for (const t of expenseTx) bump(monthKey(new Date(t.date))).expense += Number(t.amount || 0);
    for (const p of production) {
      const k = monthKey(new Date(p.date));
      bump(k).output += (p.eggsCollected || 0) + Number(p.milkCollected || 0);
    }
    const monthKeys = Object.keys(monthly).sort();
    const recentMonths = monthKeys.slice(-6).map((k) => ({
      month: k,
      daysRecorded: monthly[k].days,
      income: Math.round(monthly[k].income),
      expense: Math.round(monthly[k].expense),
    }));

    // Growth: is the record itself getting better? (the honest early signal)
    const half = Math.floor(monthKeys.length / 2);
    const earlyAvg = monthKeys.slice(0, half).length
      ? monthKeys.slice(0, half).reduce((s, k) => s + monthly[k].days, 0) / half : 0;
    const lateAvg = monthKeys.length - half > 0
      ? monthKeys.slice(half).reduce((s, k) => s + monthly[k].days, 0) / (monthKeys.length - half) : 0;
    const recordingImproving = earlyAvg > 0 ? lateAvg > earlyAvg : false;

    // ── Top product: the single most-produced thing, for a one-line card ────
    const products: Array<{ label: string; icon: string; amount: number; unit: string }> = [];
    if (eggs > 0) products.push({ label: "Mayai", icon: "🥚", amount: eggs, unit: "yake" });
    if (milk > 0) products.push({ label: "Maziwa", icon: "🥛", amount: Math.round(milk), unit: "lita" });
    if (harvestKg > 0) products.push({ label: "Mazaa ya bustani", icon: "🌾", amount: Math.round(harvestKg), unit: "kg" });
    if (weight > 0) products.push({ label: "Uzito wa mazaa", icon: "🐄", amount: Math.round(weight), unit: "kg" });
    const topProduct = products.sort((a, b) => b.amount - a.amount)[0] ?? null;

    // ── The grade: pure, tested, no new tables ──────────────────────────────
    const gradeInput: GradeInput = {
      daysWithProduction,
      recordSpanDays,
      recordMonths,
      expenses: windowExpenses,
      income: windowIncome,
      salesOrDeliveries,
      hasOutput,
    };
    const grade = computeRecordGrade(gradeInput);

    res.json({
      farm: {
        name: farm?.name ?? "Shamba",
        code: farm?.code ?? null,
        county: farm?.county ?? null,
        location: farm?.location ?? null,
        farmType: farm?.farmType ?? null,
        owner: owner?.name ?? null,
      },
      period: {
        firstRecord: firstDate ? ymd(firstDate) : null,
        lastRecord: lastDate ? ymd(lastDate) : null,
        recordSpanDays,
        recordMonths,
        /** Honest framing: banks want multiple seasons. Say plainly where we are. */
        seasonsNote: recordMonths < 3
          ? `Mwezi ${recordMonths} kati ya miezi 3. Rekodi inaingia.`
          : `Miezi ${recordMonths} ya rekodi. Inaendelea kukua.`,
      },
      evidence: {
        activity: { daysRecorded: daysWithProduction, windowDays: WINDOW_DAYS },
        inputs: {
          totalExpense: Math.round(expenses),
          windowExpense: Math.round(windowExpenses),
          records: inputRecords,
          applications: applications.length,
          inputApplicationCost: Math.round(inputApplicationCost),
        },
        output: { eggs, milk: Math.round(milk), weightKg: Math.round(weight), harvestKg: Math.round(harvestKg), mortality },
        market: {
          sales: sales.length,
          deliveries: deliveries.length,
          buyers: [...buyers],
          totalIncome: Math.round(income),
          windowIncome: Math.round(windowIncome),
          saleRevenue: Math.round(saleRevenue),
          deliveryExpected: Math.round(deliveryExpected),
          deliveryPaid: Math.round(deliveryPaid),
          deliveryOwed: Math.round(deliveryOwed),
        },
        labour: { daysWithAttendance: workerDays, records: attendance.length },
      },
      scale: {
        flocks: activeFlocks.length,
        headCount,
        crops: crops.length,
        totalAreaAcres: Math.round(totalArea * 100) / 100,
        taggedAnimals: livestock,
      },
      trend: {
        recentMonths,
        recordingImproving,
        earlyAvgDays: Math.round(earlyAvg * 10) / 10,
        lateAvgDays: Math.round(lateAvg * 10) / 10,
      },
      topProduct,
      grade,
      generatedAt: now.toISOString(),
      disclosure:
        "Hii ripoti inatokana na rekodi ulizoandika mwenyewe. Wangari hamuamuzi kukopesha. " +
        "Inaonyesha kazi yako, si ahadi ya kupewa mkopo.",
    });
  } catch (error) {
    console.error("Farm record error:", error);
    res.status(500).json({ error: "Failed to build farm record" });
  }
});

export default router;
