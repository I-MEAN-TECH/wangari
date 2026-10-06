import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { firstRecordAt } from "../lib/first-record.js";
import { buildRevenueSeries } from "../lib/revenue-series.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, requireOwner);

// GET /api/dashboard
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    // Five months back from the current one = the last six calendar months.
    const sixMonthsStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const nextWeek = new Date(today.getTime() + 7 * 86400000);

    // Get farm info
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { name: true },
    });

    // Fetch flocks first (needed for vaccination query)
    const flocks = await prisma.flock.findMany({
      where: { farmId, status: "active" },
      select: {
        id: true,
        name: true,
        currentCount: true,
        initialCount: true,
        mortality: true,
        type: true,
      },
    });

    const flockIds = flocks.map((f) => f.id);

    const [
      todayProd,
      weekProd,
      monthIncome,
      monthExpense,
      recentTx,
      feedInventory,
      allInventory,
      upcomingVax,
      earliestRecord,
      halfYearTx,
    ] = await Promise.all([
      // Today's production per flock
      prisma.dailyProduction.findMany({
        where: { farmId, date: today },
      }),

      // Last 7 days production (for FCR, HDP trends)
      prisma.dailyProduction.findMany({
        where: { farmId, date: { gte: weekAgo } },
        orderBy: { date: "asc" },
      }),

      // Monthly income
      prisma.transaction.aggregate({
        where: { farmId, type: "income", date: { gte: monthStart } },
        _sum: { amount: true },
      }),

      // Monthly expenses
      prisma.transaction.aggregate({
        where: { farmId, type: "expense", date: { gte: monthStart } },
        _sum: { amount: true },
      }),

      // Recent transactions
      prisma.transaction.findMany({
        where: { farmId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Feed inventory (items with category "feed" or name containing "feed")
      prisma.inventory.findMany({
        where: {
          farmId,
          OR: [
            { category: { contains: "feed", mode: "insensitive" } },
            { itemName: { contains: "feed", mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          itemName: true,
          quantity: true,
          unit: true,
          reorderLevel: true,
          unitCost: true,
        },
      }),

      // All inventory for low stock alerts
      prisma.inventory.findMany({
        where: { farmId },
        select: {
          id: true,
          itemName: true,
          quantity: true,
          unit: true,
          reorderLevel: true,
          category: true,
        },
      }),

      // Upcoming vaccinations
      prisma.vaccination.findMany({
        where: {
          flockId: { in: flockIds },
          status: "pending",
          scheduledDate: { gte: today, lte: nextWeek },
        },
        orderBy: { scheduledDate: "asc" },
        take: 5,
        include: { flock: { select: { name: true } } },
      }).catch(() => []),

      // ── Has this farmer recorded ANYTHING yet? ──────────────────────────
      // The onboarding gate and the zero-state dashboard both need an honest
      // answer to "has this farm started?". The query itself now lives in
      // lib/first-record.ts so the activation funnel verifies "first record"
      // against exactly the same rows — two definitions of the same word would
      // eventually disagree, and the dashboard would be the one that is wrong.
      firstRecordAt(farmId),

      // Six months of ledger rows for the Revenue Overview chart — bucketed
      // by lib/revenue-series.ts, keyed YYYY-MM so the device's month labels
      // can never disagree with these sums.
      prisma.transaction.findMany({
        where: { farmId, date: { gte: sixMonthsStart } },
        select: { date: true, type: true, amount: true },
      }),
    ]);

    const firstRecord: string | null = earliestRecord ?? null;
    const revenueSeries = buildRevenueSeries(halfYearTx);

    // ─── Calculate Total Birds ──────────────────────────────
    const totalBirds = flocks.reduce((s, f) => s + f.currentCount, 0);
    const totalInitialBirds = flocks.reduce((s, f) => s + f.initialCount, 0);
    const totalMortality = flocks.reduce((s, f) => s + f.mortality, 0);

    // ─── Today's Production ─────────────────────────────────
    const eggsToday = todayProd.reduce((s, p) => s + p.eggsCollected, 0);
    const mortalityToday = todayProd.reduce((s, p) => s + p.mortality, 0);
    const feedUsedToday = todayProd.reduce(
      (s, p) => s + Number(p.feedUsed || 0),
      0
    );

    // ─── Hen-Day Production % ───────────────────────────────
    // HDP = (eggs collected today / total birds) × 100
    const henDayProduction = totalBirds > 0
      ? Number(((eggsToday / totalBirds) * 100).toFixed(1))
      : 0;

    // ─── Feed Conversion Ratio (FCR) ────────────────────────
    // FCR = total feed used (kg) / total eggs collected
    // Lower is better. Good: 1.8-2.2, Bad: >2.5
    const weekFeedUsed = weekProd.reduce(
      (s, p) => s + Number(p.feedUsed || 0),
      0
    );
    const weekEggs = weekProd.reduce((s, p) => s + p.eggsCollected, 0);
    const fcr = weekEggs > 0
      ? Number((weekFeedUsed / weekEggs).toFixed(2))
      : 0;

    // ─── Feed Consumption Per Bird ──────────────────────────
    // grams per bird per day
    const feedPerBird = totalBirds > 0
      ? Number(((feedUsedToday / totalBirds) * 1000).toFixed(0))
      : 0;

    // ─── Feed Stock ─────────────────────────────────────────
    const totalFeedStock = feedInventory.reduce(
      (s, item) => s + Number(item.quantity),
      0
    );
    const feedItems = feedInventory.map((item) => ({
      name: item.itemName,
      quantity: Number(item.quantity),
      unit: item.unit,
      reorderLevel: item.reorderLevel,
      unitCost: Number(item.unitCost),
      daysLeft:
        feedUsedToday > 0
          ? Math.round(Number(item.quantity) / (feedUsedToday / (feedInventory.length || 1)))
          : null,
    }));

    // ─── Cost Per Egg ───────────────────────────────────────
    const monthlyExpenses = Number(monthExpense._sum.amount || 0);
    const monthEggs = weekProd.length > 0
      ? weekProd.reduce((s, p) => s + p.eggsCollected, 0) * 4 // rough monthly estimate
      : 0;
    const costPerEgg = monthEggs > 0
      ? Number((monthlyExpenses / monthEggs).toFixed(2))
      : 0;

    // ─── Mortality Rate % ──────────────────────────────────
    const mortalityRate = totalInitialBirds > 0
      ? Number(((totalMortality / totalInitialBirds) * 100).toFixed(1))
      : 0;

    // ─── Mortality Alerts (per flock) ──────────────────────
    const mortalityAlerts = flocks
      .filter((f) => f.initialCount > 0 && (f.mortality / f.initialCount) * 100 > 3)
      .map((f) => ({
        flockName: f.name,
        mortalityRate: Number(((f.mortality / f.initialCount) * 100).toFixed(1)),
        totalMortality: f.mortality,
      }));

    // ─── Low Stock Alerts ──────────────────────────────────
    const stockAlerts = allInventory
      .filter((item) => item.reorderLevel > 0 && Number(item.quantity) <= item.reorderLevel)
      .map((item) => ({
        itemName: item.itemName,
        currentStock: Number(item.quantity),
        unit: item.unit,
        reorderLevel: item.reorderLevel,
      }));

    // ─── Vaccination Alerts ────────────────────────────────
    const vaccinationAlerts = upcomingVax.map((v: any) => ({
      flockName: v.flock?.name || "Unknown",
      vaccineName: v.vaccineName || v.type || "Vaccination",
      dueDate: v.scheduledDate?.toISOString() || new Date().toISOString(),
    }));

    // ─── Production Trend (for chart) ──────────────────────
    const recentProduction = weekProd.map((p) => ({
      date: p.date,
      eggsCollected: p.eggsCollected,
      mortality: p.mortality,
      feedUsed: Number(p.feedUsed),
    }));

    // ─── HDP Trend (last 7 days) ──────────────────────────
    const hdps = weekProd.map((p) => {
      // Find the flock's bird count for that day (approximate)
      const dayBirds = totalBirds || 1;
      return {
        date: p.date,
        hdp: Number(((p.eggsCollected / dayBirds) * 100).toFixed(1)),
      };
    });

    // ─── Weather ───────────────────────────────────────────
    const weather = {
      temperature: 24,
      humidity: 65,
      windSpeed: 12,
      condition: "Partly Cloudy",
      icon: "cloud" as const,
    };

    res.json({
      // Farm info
      farmName: farm?.name || "Your Farm",

      // Earliest real activity on this farm, or null if nothing is recorded
      // yet. Drives the first-run experience — a farmer who has recorded one
      // delivery is no longer a "new" farmer, even with no animals set up.
      firstRecordAt: firstRecord,

      // Flock overview
      totalFlocks: flocks.length,
      totalBirds,
      flocks: flocks.map((f) => ({
        id: f.id,
        name: f.name,
        totalBirds: f.currentCount,
        type: f.type,
      })),

      // ─── Farmer-First Metrics ────────────────────────────
      eggsToday,
      mortalityToday,
      henDayProduction, // %
      fcr, // Feed Conversion Ratio
      feedPerBird, // grams/bird/day
      mortalityRate, // %
      costPerEgg, // KES
      feedStock: totalFeedStock, // bags/kg
      feedItems,

      // Financials
      monthlyRevenue: Number(monthIncome._sum.amount || 0),
      monthlyExpenses,
      // Last six months of income vs expenses (Revenue Overview chart).
      revenueSeries,

      // Data
      recentTransactions: recentTx,
      recentProduction,
      hdps, // HDP trend for chart

      // Alerts
      mortalityAlerts,
      stockAlerts,
      vaccinationAlerts,

      // Weather
      weather,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

export default router;
