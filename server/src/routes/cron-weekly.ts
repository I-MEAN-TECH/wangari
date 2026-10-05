import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { sendEmail } from "../lib/email.js";

/**
 * GET /api/cron/weekly-report — every Monday morning.
 *
 * The Action Engine's findings, summarized per farm and delivered as email:
 *   - Money owed to the farm (overdue credit + unpaid invoices)
 *   - Last week's production totals + trend vs the week before
 *   - Feed stock-out forecasts
 *   - Health windows (vaccinations, births) due this week
 *   - Harvest readiness + PHI safety
 *   - Top actions for the week (linked from the Action Engine)
 *
 * Protected with CRON_SECRET as a Bearer token (same pattern as farm-digest).
 */

const router = Router();

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Weekly report email ─────────────────────────────────
function weeklyReportHtml(
  userName: string,
  farmName: string,
  weekLabel: string,
  data: {
    owed: { name: string; amount: number; overdue: boolean }[];
    owedTotal: number;
    production: { label: string; value: string; change: number | null }[];
    feedAlerts: { name: string; daysLeft: number }[];
    healthWindows: { title: string; when: string }[];
    harvestReady: { name: string; days: number }[];
    topActions: { title: string; cta: string; href: string }[];
  },
  dashboardUrl: string
): string {
  const sectionCard = (title: string, color: string, rows: string) => `
    <div style="margin:0 0 14px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${color};">${title}</p>
      ${rows || `<p style="margin:0;font-size:13px;color:#94a3b8;">Nothing this week.</p>`}
    </div>`;

  const moneyRows = data.owed.length
    ? data.owed.slice(0, 5).map(o => `
      <p style="margin:0 0 4px;font-size:13px;color:#334155;">
        <span style="font-weight:700;color:${o.overdue ? "#dc2626" : "#0f172a"};">KES ${o.amount.toLocaleString()}</span>
        from ${o.name}${o.overdue ? ' <span style="color:#dc2626;font-weight:700;">(overdue)</span>' : ""}
      </p>`).join("") + (data.owedTotal > 0 ? `<p style="margin:6px 0 0;font-size:13px;font-weight:800;color:#0f172a;">Total recoverable: KES ${data.owedTotal.toLocaleString()}</p>` : "")
    : "";

  const prodRows = data.production.map(p => `
    <p style="margin:0 0 4px;font-size:13px;color:#334155;">
      <span style="font-weight:700;">${p.value}</span> ${p.label}
      ${p.change !== null ? `<span style="color:${p.change >= 0 ? "#16a34a" : "#dc2626"};font-weight:700;"> (${p.change >= 0 ? "+" : ""}${p.change}%)</span>` : ""}
    </p>`).join("");

  const feedRows = data.feedAlerts.map(f => `
    <p style="margin:0 0 4px;font-size:13px;color:${f.daysLeft <= 3 ? "#dc2626" : "#d97706"};font-weight:600;">
      ${f.name} — ~${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"} left
    </p>`).join("");

  const healthRows = data.healthWindows.map(h => `
    <p style="margin:0 0 4px;font-size:13px;color:#334155;">${h.title} — <span style="font-weight:600;">${h.when}</span></p>`).join("");

  const harvestRows = data.harvestReady.map(h => `
    <p style="margin:0 0 4px;font-size:13px;color:#334155;">${h.name} — <span style="font-weight:600;">${h.days === 0 ? "this week!" : `in ${h.days} day(s)`}</span></p>`).join("");

  const actionRows = data.topActions.map(a => `
    <p style="margin:0 0 6px;font-size:13px;color:#0f172a;">
      <span style="color:#166534;font-weight:800;">→</span> ${a.title}
    </p>`).join("");

  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;">
    <div style="border-bottom:2px solid #166534;padding-bottom:12px;margin-bottom:18px;">
      <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:2px;color:#166534;text-transform:uppercase;">Wangari · Weekly Farm Report</p>
      <h1 style="margin:6px 0 2px;font-size:20px;color:#0f172a;">${farmName}</h1>
      <p style="margin:0;font-size:12px;color:#64748b;">${weekLabel} · generated for ${userName}</p>
    </div>

    ${sectionCard("💰 Money owed to you", "#dc2626", moneyRows)}
    ${sectionCard("📊 Last week's production", "#166534", prodRows)}
    ${sectionCard("🌾 Feed runway", "#d97706", feedRows)}
    ${sectionCard("🩺 Health windows", "#2563eb", healthRows)}
    ${sectionCard("🧺 Harvest readiness", "#d97706", harvestRows)}
    ${sectionCard("✅ Decisions for this week", "#166534", actionRows)}

    <div style="margin-top:18px;text-align:center;">
      <a href="${dashboardUrl}" style="display:inline-block;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;padding:12px 28px;border-radius:10px;">Open your dashboard</a>
    </div>

    <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
      You receive this weekly summary because you have a Wangari farm account.
    </p>
  </div>`;
}

// GET /api/cron/weekly-report
router.get("/weekly-report", async (req: Request, res: Response) => {
  // Fail CLOSED: an unset CRON_SECRET must refuse, not admit. The old
  // `if (CRON_SECRET && ...)` skipped the whole check when the variable was
  // missing, so a deploy that lost the secret left these routes open to anyone —
  // and they send email to real farmers.
  const CRON_SECRET = process.env.CRON_SECRET || "";
  const authHeader = req.headers.authorization || "";
  if (!CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();
  const dashboardUrl = `${process.env.FRONTEND_URL || "https://wangari.imeantech.com"}/dashboard`;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000);
  const nextWeek = new Date(today.getTime() + 7 * 86400000);
  const weekLabel = `Week of ${weekAgo.toLocaleDateString("en-KE", { day: "numeric", month: "short" })} – ${now.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}`;

  try {
    const farms = await prisma.farm.findMany({
      select: { id: true, name: true, owner: { select: { name: true, email: true } } },
    });

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const farm of farms) {
      try {
        if (!farm.owner?.email) { skipped++; continue; }

        const [
          credits, invoices, prodLast, prodPrior, inventory, vaccinations,
          breedings, crops,
        ] = await Promise.all([
          prisma.credit.findMany({
            where: { farmId: farm.id, status: { in: ["pending", "partial"] } },
            include: { customer: { select: { name: true } } },
          }),
          prisma.invoice.findMany({
            where: { farmId: farm.id, paymentStatus: { in: ["pending", "partial"] } },
            include: { customer: { select: { name: true } } },
          }),
          prisma.dailyProduction.findMany({ where: { farmId: farm.id, date: { gte: weekAgo } } }),
          prisma.dailyProduction.findMany({ where: { farmId: farm.id, date: { gte: twoWeeksAgo, lt: weekAgo } } }),
          prisma.inventory.findMany({ where: { farmId: farm.id } }),
          prisma.vaccination.findMany({
            where: { status: "pending", scheduledDate: { gte: today, lte: nextWeek }, flock: { farmId: farm.id } },
            include: { flock: { select: { name: true } } },
          }),
          prisma.breeding.findMany({
            where: { farmId: farm.id, status: "confirmed", expectedBirth: { not: null, gte: new Date(now.getTime() - 2 * 86400000), lte: nextWeek } },
            include: { flock: { select: { name: true } } },
          }),
          prisma.crop.findMany({
            where: { farmId: farm.id, status: "active", expectedHarvest: { not: null, gte: today, lte: nextWeek } },
          }),
        ]);

        // Money owed
        const owed: { name: string; amount: number; overdue: boolean }[] = [];
        for (const c of credits) {
          const out = Number(c.amountOwed) - Number(c.amountPaid);
          if (out > 0) owed.push({ name: c.customer?.name || "Customer", amount: out, overdue: !!c.dueDate && c.dueDate < now });
        }
        for (const i of invoices) {
          const out = Number(i.totalAmount) - Number(i.amountPaid);
          if (out > 0) owed.push({ name: `Invoice ${i.invoiceNumber} (${i.customer?.name || "customer"})`, amount: out, overdue: !!i.dueDate && i.dueDate < now });
        }
        const owedTotal = owed.reduce((s, o) => s + o.amount, 0);

        // Production totals + trend
        const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
        const eggsThis = sum(prodLast, "eggsCollected"), eggsPrior = sum(prodPrior, "eggsCollected");
        const milkThis = sum(prodLast, "milkCollected"), milkPrior = sum(prodPrior, "milkCollected");
        const production: { label: string; value: string; change: number | null }[] = [];
        if (eggsThis > 0 || eggsPrior > 0) production.push({
          label: "eggs collected",
          value: eggsThis.toLocaleString(),
          change: eggsPrior > 0 ? Math.round(((eggsThis - eggsPrior) / eggsPrior) * 100) : null,
        });
        if (milkThis > 0 || milkPrior > 0) production.push({
          label: "litres milked",
          value: milkThis.toLocaleString(),
          change: milkPrior > 0 ? Math.round(((milkThis - milkPrior) / milkPrior) * 100) : null,
        });

        // Feed runway
        const dailyFeed = prodLast.reduce((s, r) => s + Number(r.feedUsed || 0), 0) / 7;
        const feedAlerts = inventory
          .filter(it => (it.category === "feed" || /feed/i.test(it.itemName)) && Number(it.quantity) > 0 && dailyFeed > 0)
          .map(it => ({ name: it.itemName, daysLeft: Math.floor(Number(it.quantity) / dailyFeed) }))
          .filter(f => f.daysLeft <= 14)
          .sort((a, b) => a.daysLeft - b.daysLeft);

        // Health windows
        const healthWindows = [
          ...vaccinations.map(v => ({ title: `${v.vaccineName} — ${v.flock?.name || "flock"}`, when: v.scheduledDate.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" }) })),
          ...breedings.map(b => ({ title: `Birth expected — ${b.flock?.name || "flock"} (${b.damName || "dam"})`, when: b.expectedBirth!.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" }) })),
        ];

        // Harvest readiness
        const harvestReady = crops.map(c => ({
          name: c.name,
          days: Math.ceil((c.expectedHarvest!.getTime() - today.getTime()) / 86400000),
        }));

        // Skip farms with literally nothing to report
        const hasAnything = owed.length || production.length || feedAlerts.length || healthWindows.length || harvestReady.length;
        if (!hasAnything) { skipped++; continue; }

        const html = weeklyReportHtml(farm.owner.name || "Farmer", farm.name, weekLabel, {
          owed, owedTotal, production, feedAlerts, healthWindows, harvestReady,
          topActions: [
            ...(owedTotal > 0 ? [{ title: `Collect KES ${owedTotal.toLocaleString()} in outstanding credit`, cta: "", href: "" }] : []),
            ...(feedAlerts.slice(0, 2).map(f => ({ title: `Restock ${f.name} before it runs out (~${f.daysLeft} days)`, cta: "", href: "" }))),
            ...(harvestReady.slice(0, 2).map(h => ({ title: `Line up buyers for ${h.name} (harvest ${h.days <= 2 ? "now" : "this week"})`, cta: "", href: "" }))),
          ],
        }, dashboardUrl);

        await sendEmail({
          to: farm.owner.email,
          subject: `📊 Weekly Farm Report — ${farm.name} · ${weekLabel}`,
          html,
          template: "oneoff",
        });
        sent++;
      } catch (e: any) {
        errors.push(`${farm.name}: ${e?.message || "unknown"}`);
      }
    }

    res.json({ ok: true, sent, skipped, errors });
  } catch (error: any) {
    console.error("Weekly report cron error:", error);
    res.status(500).json({ error: "Weekly report failed" });
  }
});

export default router;
