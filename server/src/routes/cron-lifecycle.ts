import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { sendEmail } from "../lib/email.js";

/**
 * GET /api/cron/lifecycle-reminders — iCow-style nudges from records
 * farmers already have. Zero extra data entry, high behavior change:
 *
 *   - Vaccinations due within 7 days (pending) → "boost them before the
 *     window closes" reminder
 *   - Breedings: expected birth within 7 days → calving/farrowing kit
 *     checklist nudge
 *   - Crops planted 21–35 days ago (maize/beans etc.) → top-dressing window
 *   - Crops with expectedHarvest within 7 days → harvest-prep nudge (labour,
 *     crates, market, and — where relevant — PHI check)
 *
 * Each reminder becomes a farm-scoped in-app announcement (deduped per day)
 * and a consolidated email per farm owner. Triggered daily via Vercel Cron.
 */

const router = Router();

interface Reminder {
  icon: string;
  title: string;
  detail: string;
}

function reminderEmailHtml(userName: string, farmName: string, reminders: Reminder[], appUrl: string): string {
  const rows = reminders.slice(0, 12).map((r) => `
    <tr>
      <td style="padding:10px 14px;background-color:#f0fdf4;border-radius:8px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:16px;width:28px;vertical-align:top;">${r.icon}</td>
          <td>
            <p style="margin:0;font-size:13px;font-weight:700;color:#166534;">${r.title}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#334155;">${r.detail}</p>
          </td>
        </tr></table>
      </td>
    </tr>
    <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#166534;padding:24px 32px;text-align:center;">
          <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">🌿 Wangari</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 4px;font-size:20px;color:#334155;">This week on your farm, ${userName} ⏰</h2>
          <p style="margin:0 0 20px;font-size:13px;color:#64748b;">${farmName} · ${reminders.length} thing${reminders.length === 1 ? "" : "s"} need your attention</p>
          <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          <div style="text-align:center;margin-top:24px;">
            <a href="${appUrl}/dashboard" style="display:inline-block;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">Open Dashboard →</a>
          </div>
          <p style="margin:20px 0 0;font-size:11px;color:#64748b;text-align:center;">
            These reminders come from your own records — vaccinations, breedings and plantings you logged in Wangari.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#64748b;">© ${new Date().getFullYear()} Wangari · imeantech.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Crops where top-dressing at ~3–5 weeks is the standard practice
const TOPDRESS_CROPS = ["maize", "beans", "sorghum", "millet"];

router.get("/lifecycle-reminders", async (req: Request, res: Response) => {
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
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const appUrl = process.env.FRONTEND_URL || "https://wangari.imeantech.com";

  try {
    const farms = await prisma.farm.findMany({
      where: { owner: { emailVerified: { not: null } } },
      select: { id: true, name: true, owner: { select: { name: true, email: true } } },
      take: 500,
    });

    let farmsReminded = 0;
    let totalReminders = 0;
    const errors: string[] = [];

    for (const farm of farms) {
      const ownerEmail = farm.owner?.email;
      if (!ownerEmail) continue;

      const reminders: Reminder[] = [];

      // 1. Vaccinations due within 7 days (pending)
      const vax = await prisma.vaccination.findMany({
        where: { status: "pending", scheduledDate: { gte: now, lte: in7 }, flock: { farmId: farm.id } },
        select: { vaccineName: true, scheduledDate: true, flock: { select: { name: true } } },
        take: 5,
      });
      for (const v of vax) {
        const days = Math.max(0, Math.ceil((new Date(v.scheduledDate).getTime() - now.getTime()) / 86400000));
        reminders.push({
          icon: "💉",
          title: `${v.vaccineName} due ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`} — ${v.flock.name}`,
          detail: "Vaccinating on time is cheaper than treating. Confirm it done in Wangari after the vet visit.",
        });
      }

      // 2. Births expected within 7 days
      const births = await prisma.breeding.findMany({
        where: { farmId: farm.id, status: { in: ["pending", "confirmed"] }, expectedBirth: { gte: now, lte: in7 } },
        select: { damName: true, expectedBirth: true, method: true },
        take: 5,
      });
      for (const b of births) {
        const days = Math.max(0, Math.ceil((new Date(b.expectedBirth as Date).getTime() - now.getTime()) / 86400000));
        reminders.push({
          icon: "🐄",
          title: `${b.damName || "Your animal"} is due to give birth ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
          detail: "Prepare the maternity pen, clean dry bedding, iodine for the navel, and colostrum within the first 6 hours.",
        });
      }

      // 3. Top-dressing window (planted 21–35 days ago, annual crops)
      const monthAgo = new Date(now.getTime() - 21 * 86400000);
      const fiveWeeksAgo = new Date(now.getTime() - 35 * 86400000);
      const crops = await prisma.crop.findMany({
        where: {
          farmId: farm.id, status: "active",
          plantingDate: { gte: fiveWeeksAgo, lte: monthAgo },
          cropType: { in: TOPDRESS_CROPS },
        },
        select: { name: true, cropType: true, plantingDate: true },
        take: 5,
      });
      for (const c of crops) {
        reminders.push({
          icon: "🌱",
          title: `Top-dress ${c.name} this week`,
          detail: `Planted ~4 weeks ago — the ${c.cropType} is at the ideal stage for CAN top-dressing, right before or just after a rain.`,
        });
      }

      // 4. Harvest prep (expectedHarvest within 7 days)
      const harvests = await prisma.crop.findMany({
        where: { farmId: farm.id, status: "active", expectedHarvest: { gte: now, lte: in7 } },
        select: { name: true, expectedHarvest: true },
        take: 5,
      });
      for (const c of harvests) {
        const days = Math.max(0, Math.ceil((new Date(c.expectedHarvest as Date).getTime() - now.getTime()) / 86400000));
        reminders.push({
          icon: "🌾",
          title: `${c.name} harvest expected ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
          detail: "Line up labour, crates and a buyer now — a ready market at harvest time is worth 10–20% more.",
        });
      }

      if (!reminders.length) continue;
      totalReminders += reminders.length;

      try {
        // Consolidated email
        await sendEmail({
          to: ownerEmail,
          subject: `⏰ ${reminders.length} farm reminder${reminders.length === 1 ? "" : "s"} — things due this week`,
          html: reminderEmailHtml(farm.owner?.name || "Farmer", farm.name, reminders, appUrl),
          template: "oneoff",
        });

        // In-app notification (deduped per day)
        const marker = `[lifecycle ${now.toISOString().slice(0, 10)}]`;
        const exists = await prisma.announcement.findFirst({ where: { farmId: farm.id, message: { contains: marker } } });
        if (!exists) {
          const first = reminders[0];
          await prisma.announcement.create({
            data: {
              farmId: farm.id,
              active: true,
              message: `⏰ ${marker} ${reminders.length} reminder${reminders.length === 1 ? "" : "s"} this week — e.g. ${first.title}. Check the dashboard.`,
              link: "/dashboard",
            },
          });
        }
        farmsReminded++;
      } catch (e: any) {
        errors.push(`${ownerEmail}: ${e?.message || "unknown"}`);
      }
    }

    res.json({ ok: true, farmsScanned: farms.length, farmsReminded, totalReminders, errors: errors.slice(0, 10) });
  } catch (error: any) {
    console.error("Lifecycle reminders error:", error);
    res.status(500).json({ error: "Lifecycle reminders failed", detail: error?.message });
  }
});

export default router;
