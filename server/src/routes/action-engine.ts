import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  MIN_DAYS_TO_GRADE,
  WINDOW_DAYS,
  CONSISTENCY_TARGET,
} from "../lib/record-grade.js";
import { weatherActions, type ForecastDay } from "../lib/weather-rules.js";

/**
 * Action Engine — turns the farm's own data into a prioritized list of
 * decisions with one-click links. This is the layer between "recording
 * things" and "managing the farm": no new data entry, only answers.
 *
 * Every rule reads ONLY existing models (Flock, DailyProduction, Crop,
 * CropApplication, Breeding, Inventory, Credit, Invoice, Sale, WorkerTask,
 * Vaccination) so it works for every farm that already records.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

interface Action {
  id: string;
  priority: "critical" | "high" | "medium" | "info";
  icon: string;
  title: string;
  detail: string;
  moneyImpact?: string;
  href: string;
  cta: string;
}

// GET /api/dashboard/actions
router.get("/actions", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const actions: Action[] = [];

    const [
      flocks, crops, recentProd, lowStock, overdueCredits, unpaidInvoices,
      openTasks, pendingBreedings, recentApplications, todayProd,
      prodInWindow, prodOldest, prodNewest, recentMoney,
    ] = await Promise.all([
      prisma.flock.findMany({ where: { farmId, status: "active" }, select: { id: true, name: true, currentCount: true, type: true, category: true, createdAt: true } }),
      prisma.crop.findMany({ where: { farmId, status: "active" }, select: { id: true, name: true, cropType: true, plantingDate: true, expectedHarvest: true } }),
      prisma.dailyProduction.findMany({ where: { farmId, date: { gte: weekAgo } }, orderBy: { date: "asc" } }),
      prisma.inventory.findMany({ where: { farmId }, select: { id: true, itemName: true, quantity: true, unit: true, reorderLevel: true, category: true } }),
      prisma.credit.findMany({ where: { farmId, status: { in: ["pending", "partial"] } }, include: { customer: { select: { name: true } } } }),
      prisma.invoice.findMany({ where: { farmId, paymentStatus: { in: ["pending", "partial"] } }, select: { id: true, invoiceNumber: true, totalAmount: true, amountPaid: true, dueDate: true, customer: { select: { name: true } } } }),
      prisma.workerTask.findMany({ where: { farmId, isCompleted: false }, include: { worker: { select: { name: true } } } }),
      prisma.breeding.findMany({ where: { farmId, status: "confirmed", expectedBirth: { not: null } }, include: { flock: { select: { name: true } } } }),
      prisma.cropApplication.findMany({ where: { farmId, type: "pesticide" }, orderBy: { date: "desc" }, take: 30, include: { crop: { select: { name: true } } } }),
      prisma.dailyProduction.findMany({ where: { farmId, date: today } }),
      // For the record-completeness nudges: how far back does the record go,
      // and has any money moved through the farm in the last 90 days?
      prisma.dailyProduction.findMany({
        where: { farmId, date: { gte: weekAgo } },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
      prisma.dailyProduction.findMany({
        where: { farmId },
        orderBy: { date: "asc" },
        select: { date: true },
        take: 1,
      }),
      prisma.dailyProduction.findMany({
        where: { farmId },
        orderBy: { date: "desc" },
        select: { date: true },
        take: 1,
      }),
      prisma.transaction.findMany({
        where: { farmId, type: { in: ["income", "expense"] }, date: { gte: new Date(now.getTime() - WINDOW_DAYS * 86400000) } },
        select: { type: true },
      }),
    ]);

    const recentProdAll = prodInWindow;
    const prodFirstDate = prodOldest[0]?.date ?? null;
    const prodLastDate = prodNewest[0]?.date ?? null;
    const recentIncome = recentMoney.filter((t: any) => t.type === "income");
    const recentExpense = recentMoney.filter((t: any) => t.type === "expense");

    // ─── 1. CRITICAL: money owed to the farm ─────────────────
    const nowMs = now.getTime();
    for (const c of overdueCredits) {
      const outstanding = Number(c.amountOwed) - Number(c.amountPaid);
      if (outstanding <= 0) continue;
      const overdue = c.dueDate && c.dueDate.getTime() < nowMs;
      const days = c.dueDate ? Math.floor((nowMs - c.dueDate.getTime()) / 86400000) : 0;
      actions.push({
        id: `credit-${c.id}`,
        priority: overdue ? "critical" : "high",
        icon: "HandCoins",
        title: `${c.customer?.name || "Customer"} owes KES ${outstanding.toLocaleString()}`,
        detail: overdue ? `Overdue by ${days} days — credit given on sale. Follow up today; the longer it runs, the harder the collection.` : `Credit outstanding. Due ${c.dueDate?.toLocaleDateString("en-KE") ?? "soon"}.`,
        moneyImpact: `+KES ${outstanding.toLocaleString()} recoverable`,
        href: "/finances",
        cta: "Record payment",
      });
    }
    for (const inv of unpaidInvoices) {
      const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid);
      if (outstanding <= 0) continue;
      const overdue = inv.dueDate && inv.dueDate.getTime() < nowMs;
      actions.push({
        id: `invoice-${inv.id}`,
        priority: overdue ? "critical" : "medium",
        icon: "FileWarning",
        title: `Invoice ${inv.invoiceNumber} unpaid — KES ${outstanding.toLocaleString()}`,
        detail: `${inv.customer?.name || "Customer"}${overdue ? " — past the due date. Send a reminder with the invoice link." : ""}`,
        moneyImpact: `+KES ${outstanding.toLocaleString()}`,
        href: "/invoices",
        cta: "View invoice",
      });
    }

    // ─── 2. Production drop detection (7d vs prior 7d per flock) ──
    const priorWeek = new Date(today.getTime() - 14 * 86400000);
    const byFlock = new Map<number, { thisWeek: number; lastWeek: number; lastDate: Date }>();
    for (const f of flocks) byFlock.set(f.id, { thisWeek: 0, lastWeek: 0, lastDate: new Date(0) });
    // "Output" is species-aware: eggs for poultry, litres for dairy, kg of
    // weight gain for meat animals. Mixing eggs+milk on one number made the
    // drop detector meaningless for cattle-only or mixed farms.
    const METRIC_BY_SPECIES: Record<string, "eggs" | "milk" | "weight"> = {
      layers: "eggs", kienyeji: "eggs", broilers: "weight",
      cattle_dairy: "milk", cattle_beef: "weight",
      goats: "weight", sheep: "weight", pigs: "weight", rabbits: "weight",
      fish: "weight", bees: "weight",
    };
    const metricOf = (flockType?: string | null): "eggs" | "milk" | "weight" =>
      METRIC_BY_SPECIES[flockType || ""] ?? (flocks.find(f => f.type === flockType)?.category === "poultry" ? "eggs" : "weight");
    const outputOf = (p: { eggsCollected?: any; milkCollected?: any; weightGain?: any }, m: "eggs" | "milk" | "weight"): number =>
      m === "eggs" ? Number(p.eggsCollected || 0) : m === "milk" ? Number(p.milkCollected || 0) : Number(p.weightGain || 0);
    for (const p of recentProd) {
      const e = byFlock.get(p.flockId);
      if (!e) continue;
      const f = flocks.find(x => x.id === p.flockId);
      if (p.date >= weekAgo) e.thisWeek += outputOf(p, metricOf(f?.type));
      e.lastDate = p.date > e.lastDate ? p.date : e.lastDate;
    }
    for (const f of flocks) {
      const e = byFlock.get(f.id)!;
      const gapDays = Math.floor((today.getTime() - e.lastDate.getTime()) / 86400000);
      if (e.lastDate.getTime() > 0 && gapDays >= 3) {
        actions.push({
          id: `gap-${f.id}`,
          priority: gapDays >= 5 ? "high" : "medium",
          icon: "CalendarX",
          title: `No production recorded for ${f.name} in ${gapDays} days`,
          detail: "Missing records make every other alert blind. Log even a zero day — zeros are data.",
          href: "/production",
          cta: "Record output",
        });
      }
      const drop = e.lastWeek > 0 ? (e.lastWeek - e.thisWeek) / e.lastWeek : 0;
      if (e.thisWeek > 0 && drop >= 0.15) {
        actions.push({
          id: `drop-${f.id}`,
          priority: drop >= 0.3 ? "high" : "medium",
          icon: "TrendingDown",
          title: `${f.name} output down ${Math.round(drop * 100)}% this week`,
          detail: `From ~${Math.round(e.lastWeek / 7)}/day to ~${Math.round(e.thisWeek / 7)}/day. Common causes: feed change, water shortage, heat stress, or disease onset. Check feed stock and water first.`,
          moneyImpact: `~KES ${Math.round(((e.lastWeek - e.thisWeek) / 7) * 15).toLocaleString()}/week at risk`,
          href: "/flocks",
          cta: "Investigate flock",
        });
      }
    }

    // ─── 3. Feed stock-out forecast ─────────────────────────
    const dailyFeed = recentProd.reduce((s, p) => s + Number(p.feedUsed || 0), 0) / 7;
    for (const item of lowStock) {
      const isFeed = item.category === "feed" || /feed/i.test(item.itemName);
      const qty = Number(item.quantity);
      const reorder = Number(item.reorderLevel || 0);
      if (isFeed && dailyFeed > 0 && qty > 0) {
        const daysLeft = Math.floor(qty / dailyFeed);
        if (daysLeft <= 7) {
          actions.push({
            id: `feedout-${item.id}`,
            priority: daysLeft <= 3 ? "critical" : "high",
            icon: "Wheat",
            title: `Feed runs out in ~${daysLeft} day${daysLeft === 1 ? "" : "s"} (${item.itemName})`,
            detail: `At current consumption (~${Math.round(dailyFeed)}kg/day across the farm). A day without feed costs more than a week of price shopping.`,
            moneyImpact: "Production stops when feed does",
            href: "/inventory",
            cta: "Restock feed",
          });
          continue;
        }
      }
      if (reorder > 0 && qty <= reorder) {
        actions.push({
          id: `stock-${item.id}`,
          priority: "medium",
          icon: "Package",
          title: `Reorder ${item.itemName} — ${qty}${item.unit === "kg" ? "kg" : " " + item.unit} left`,
          detail: `At or below the reorder level of ${reorder}.`,
          href: "/inventory",
          cta: "Open inventory",
        });
      }
    }

    // ─── 4. Vaccination & breeding windows ──────────────────
    const nextWeekDate = new Date(today.getTime() + 7 * 86400000);
    const upcomingVax = await prisma.vaccination.findMany({
      // A Vaccination belongs to a FLOCK, and a flock belongs to a farm. There is
      // no farmId column on Vaccination, so filtering on it throws a Prisma
      // validation error and takes the whole action list down with it. This ran
      // broken in production until the error log was read; a green test suite
      // did not catch it because no test reached this query.
      where: {
        flock: { farmId },
        status: "scheduled",
        scheduledDate: { gte: today, lte: nextWeekDate },
      },
      include: { flock: { select: { name: true } } },
      take: 5,
    });
    for (const v of upcomingVax) {
      const days = Math.ceil((v.scheduledDate.getTime() - today.getTime()) / 86400000);
      actions.push({
        id: `vax-${v.id}`,
        priority: days <= 2 ? "high" : "medium",
        icon: "Syringe",
        title: `${v.vaccineName} for ${v.flock?.name || "flock"} ${days === 0 ? "is TODAY" : days === 1 ? "is tomorrow" : `in ${days} days`}`,
        detail: "Vaccination windows exist because timing IS the protection. Late vaccines are half vaccines.",
        href: "/vaccinations",
        cta: "Confirm schedule",
      });
    }
    for (const b of pendingBreedings) {
      if (!b.expectedBirth) continue;
      const days = Math.ceil((b.expectedBirth.getTime() - now.getTime()) / 86400000);
      if (days <= 7 && days >= -2) {
        actions.push({
          id: `kindle-${b.id}`,
          priority: days <= 2 ? "high" : "medium",
          icon: "Baby",
          title: `${b.flock?.name || "Flock"}: birth expected ${days <= 0 ? "NOW" : "in " + days + " day(s)"} (${b.damName || "dam"})`,
          detail: "Prepare the nesting box, extra bedding and warmth today. Check twice daily once birth starts.",
          href: "/flocks",
          cta: "Prepare farrowing",
        });
      }
    }

    // ─── 5. PHI (pre-harvest interval) safety check ─────────
    for (const app of recentApplications) {
      // Common Kenya label PHIs: 7-14 days. Use 14 as the safe default and
      // flag anything harvested-sold too early via the crop's harvest action.
      const daysSince = Math.floor((now.getTime() - app.date.getTime()) / 86400000);
      if (daysSince >= 0 && daysSince < 14) {
        const phiRemaining = 14 - daysSince;
        actions.push({
          id: `phi-${app.id}`,
          priority: "info",
          icon: "ShieldAlert",
          title: `PHI active on ${app.crop?.name}: ${phiRemaining} day${phiRemaining === 1 ? "" : "s"} after ${app.productName}`,
          detail: "Sprayed produce cannot be sold before the pre-harvest interval lapses — buyers test and reject. Log the exact label PHI next spray for a precise date.",
          href: "/crops",
          cta: "View crop",
        });
        break; // one PHI notice is enough
      }
    }

    // ─── 6. Harvest readiness ───────────────────────────────
    for (const c of crops) {
      if (c.expectedHarvest && c.expectedHarvest.getTime() - now.getTime() < 7 * 86400000 && c.expectedHarvest >= today) {
        const days = Math.ceil((c.expectedHarvest.getTime() - today.getTime()) / 86400000);
        actions.push({
          id: `harvest-${c.id}`,
          priority: days <= 2 ? "high" : "medium",
          icon: "Wheat",
          title: `${c.name} harvest in ${days === 0 ? "days" : days + " day(s)"} — plan buyers NOW`,
          detail: "Line up buyers before harvest, not after. A crop with a buyer on day 0 sells 20-40% above a crop that starts looking for one.",
          moneyImpact: "Price timing window",
          href: "/crops",
          cta: "Plan the sale",
        });
      }
    }

    // ─── 7. Zero-day check (nothing recorded today) ─────────
    if (flocks.length > 0 && todayProd.length === 0 && now.getHours() >= 12) {
      actions.push({
        id: `zero-day-${today.getTime()}`,
        priority: "medium",
        icon: "ClipboardList",
        title: "Today's output not yet recorded",
        detail: "It takes 30 seconds and keeps every trend and alert on this page truthful.",
        href: "/production",
        cta: "Record today",
      });
    }

    // ─── 8. Record-completeness nudges (the bankable-farm grade) ──────────
    // The farm-record report (see lib/record-grade.ts) is the proof layer: a
    // farmer takes it to a lender when they need one. The grade is made of
    // things the farmer controls, so each missing piece is turned here into a
    // single, concrete, 30-second action. This is the loop that matters:
    // records → grade → a conversation with a lender. Without these nudges the
    // grade is a score nobody chases; with them it is a habit.
    {
      const activityDays = new Set(
        recentProdAll.map((p) => new Date(p.date).toISOString().slice(0, 10))
      ).size;
      const recordSpanDays = prodFirstDate && prodLastDate
        ? Math.floor((prodLastDate.getTime() - prodFirstDate.getTime()) / 86400000) + 1
        : 0;
      const graded = recordSpanDays >= MIN_DAYS_TO_GRADE;

      if (flocks.length > 0 && recentIncome.length === 0 && recentExpense.length === 0) {
        actions.push({
          id: "record-money",
          priority: "high",
          icon: "Banknote",
          title: "Start recording your daily work",
          detail: "Everything you earn and spend gets written down here. That record is what you show a bank or SACCO when you need a loan.",
          href: "/farm-record",
          cta: "View my record",
        });
      } else if (!graded) {
        const remaining = MIN_DAYS_TO_GRADE - recordSpanDays;
        actions.push({
          id: "record-start",
          priority: "medium",
          icon: "CalendarCheck",
          title: `Record every day — ${remaining} to go`,
          detail: "Once you have three months of records you earn a record grade. That is the document that helps you get a loan.",
          href: "/farm-record",
          cta: "View my record",
        });
      } else if (activityDays < Math.floor(WINDOW_DAYS * CONSISTENCY_TARGET)) {
        actions.push({
          id: "record-consistency",
          priority: "medium",
          icon: "CalendarCheck",
          title: `You recorded ${activityDays} of ${WINDOW_DAYS} days`,
          detail: "Past 70% of days, your record starts proving itself on its own. It takes about 30 seconds a day.",
          href: "/farm-record",
          cta: "View my record",
        });
      }
    }

    // ─── 9. Stale open tasks ────────────────────────────────
    const staleTasks = openTasks.filter((t: any) => t.createdAt && (now.getTime() - new Date(t.createdAt).getTime()) > 3 * 86400000);
    if (staleTasks.length > 0) {
      actions.push({
        id: "stale-tasks",
        priority: "medium",
        icon: "ListTodo",
        title: `${staleTasks.length} task${staleTasks.length === 1 ? "" : "s"} open 3+ days`,
        detail: staleTasks.slice(0, 2).map((t: any) => `"${t.title}"${t.worker ? ` (${t.worker.name})` : ""}`).join(", ") + (staleTasks.length > 2 ? ` +${staleTasks.length - 2} more` : ""),
        href: "/worker",
        cta: "Review tasks",
      });
    }

    // ─── 10. Weather → action rules (gap-analysis row 4) ────────────────────
    // Wangari has always fetched a 7-day forecast and displayed it as icons. An
    // icon is not a decision. These rules turn the same forecast into something
    // to DO, reusing the WeatherCache the daily cron already writes, so this
    // costs no extra API call and no new farmer data entry.
    //
    // Skipped when there is no cached forecast: better a silent rule than a rule
    // that fires on empty data and tells a farmer to act on nothing.
    const cachedForecast = await prisma.weatherCache.findFirst({
      where: { farmId },
      orderBy: { date: "desc" },
      select: { forecastJson: true, date: true },
    });

    let forecast: ForecastDay[] | null = null;
    if (cachedForecast?.forecastJson) {
      const raw = cachedForecast.forecastJson;
      const daily =
        raw && typeof raw === "object" && "daily" in raw
          ? (raw as any).daily
          : Array.isArray(raw)
            ? (raw as any[])
            : null;
      if (Array.isArray(daily)) {
        forecast = daily
          .map((d: any) => ({
            date: String(d?.date ?? d?.time ?? ""),
            tempMax: Number(d?.temperature_2m_max ?? d?.tempMax),
            tempMin: Number(d?.temperature_2m_min ?? d?.tempMin),
            rain: Number(d?.precipitation_sum ?? d?.rain ?? 0),
          }))
          .filter((d) => d.date && Number.isFinite(d.tempMax) && Number.isFinite(d.rain));
      }
    }

    for (const w of weatherActions(forecast, today)) {
      actions.push({
        id: w.id,
        priority: w.priority,
        // CloudSun is deliberately generic: the rule text already says what to
        // do, and the icon only has to say "this is about weather".
        icon: "CloudSun",
        title: w.title,
        detail: w.detail,
        href: w.href,
        cta: w.cta,
      });
    }

    // Sort: critical first, then high, medium, info; cap at 12
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, info: 3 };
    actions.sort((a, b) => order[a.priority] - order[b.priority]);
    res.json({ actions: actions.slice(0, 12), generatedAt: now.toISOString() });
  } catch (error) {
    console.error("Action engine error:", error);
    res.status(500).json({ error: "Failed to compute actions" });
  }
});

export default router;
