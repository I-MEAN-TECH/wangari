import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { sendEmail } from "../lib/email.js";

/**
 * GET /api/cron/farm-digest
 *
 * Daily farmer email digest — the "out-of-app notifications" layer.
 * Runs on the VPS (where the database lives) and is called daily by Vercel
 * Cron through an authenticated fetch. Gathers per farm:
 *  - PHI expiry alerts (safe-to-harvest countdown after pesticide sprays)
 *  - Harvest season reminders / expected-harvest dates
 *  - Acidic soil warnings from the latest soil test per crop
 *  - Low-stock items
 *  - Vaccinations due in the next 3 days
 *
 * Protect with CRON_SECRET as a Bearer token.
 */

const router = Router();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseSeason(season: string): { startMonth: number; endMonth: number } | null {
  const m = season.match(/([A-Za-z]{3,})\s*[-–to]+\s*([A-Za-z]{3,})/);
  if (!m) return null;
  const start = MONTHS.findIndex((mo) => mo.toLowerCase() === m[1].slice(0, 3).toLowerCase());
  const end = MONTHS.findIndex((mo) => mo.toLowerCase() === m[2].slice(0, 3).toLowerCase());
  if (start < 0 || end < 0) return null;
  return { startMonth: start, endMonth: end };
}

interface DigestAlert {
  icon: string;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "info" | "success";
}

function digestEmailHtml(userName: string, farmName: string, alerts: DigestAlert[], dashboardUrl: string): string {
  const toneColors: Record<DigestAlert["tone"], string> = {
    danger: "#dc2626", warning: "#d97706", info: "#2563eb", success: "#16a34a",
  };
  const toneBg: Record<DigestAlert["tone"], string> = {
    danger: "#fef2f2", warning: "#fffbeb", info: "#eff6ff", success: "#f0fdf4",
  };

  const alertRows = alerts.length === 0
    ? `<p style="margin:0;font-size:14px;color:#64748b;">Nothing needs your attention today — your farm is running smoothly. 🌱</p>`
    : alerts.slice(0, 12).map((a) => `
      <tr>
        <td style="padding:10px 14px;background-color:${toneBg[a.tone]};border-radius:8px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:16px;width:28px;vertical-align:top;">${a.icon}</td>
            <td>
              <p style="margin:0;font-size:13px;font-weight:700;color:${toneColors[a.tone]};">${a.title}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#334155;">${a.detail}</p>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>`).join("");

  const today = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

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
          <h2 style="margin:0 0 4px;font-size:20px;color:#334155;">Good morning, ${userName} 👋</h2>
          <p style="margin:0 0 20px;font-size:13px;color:#64748b;">${farmName} · ${today}</p>
          <table width="100%" cellpadding="0" cellspacing="0">${alertRows}</table>
          <div style="text-align:center;margin-top:24px;">
            <a href="${dashboardUrl}" style="display:inline-block;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">Open Dashboard →</a>
          </div>
          <p style="margin:20px 0 0;font-size:11px;color:#64748b;text-align:center;">
            You receive this daily summary because you have a Wangari farm account.<br/>Turn it off anytime in Settings → Notifications.
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

router.get("/farm-digest", async (req: Request, res: Response) => {
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
  const threeDaysAhead = new Date(now.getTime() + 3 * 86400000);

  try {
    const farms = await prisma.farm.findMany({
      select: {
        id: true,
        name: true,
        owner: { select: { name: true, email: true } },
      },
    });

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const farm of farms) {
      try {
        if (!farm.owner?.email) { skipped++; continue; }

        const [crops, inventory, vaccinations] = await Promise.all([
          prisma.crop.findMany({
            where: { farmId: farm.id },
            include: {
              applications: { orderBy: { date: "desc" } },
              soilTests: { orderBy: { date: "desc" }, take: 1 },
            },
          }),
          prisma.inventory.findMany({
            where: { farmId: farm.id },
            select: { itemName: true, quantity: true, unit: true, reorderLevel: true },
          }),
          prisma.vaccination.findMany({
            where: {
              status: "pending",
              scheduledDate: { gte: now, lte: threeDaysAhead },
              flock: { farmId: farm.id },
            },
            include: { flock: { select: { name: true } } },
          }),
        ]);

        const alerts: DigestAlert[] = [];

        // ── PHI (pre-harvest interval) alerts ──
        for (const crop of crops) {
          for (const app of crop.applications) {
            if (app.type !== "Pesticide" || !app.phiDays || Number(app.phiDays) <= 0) continue;
            const safeDate = new Date(app.date);
            safeDate.setDate(safeDate.getDate() + Number(app.phiDays));
            const daysLeft = Math.ceil((safeDate.getTime() - now.getTime()) / 86400000);
            if (daysLeft > 60) continue;
            if (daysLeft <= 0) {
              alerts.push({
                icon: "✅",
                title: `Safe to harvest: ${crop.name}`,
                detail: `${app.productName} PHI has elapsed — the crop is safe to harvest from today.`,
                tone: "success",
              });
            } else if (daysLeft <= 3) {
              alerts.push({
                icon: "⏳",
                title: `PHI ending soon: ${crop.name}`,
                detail: `${app.productName} — safe to harvest in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${safeDate.toLocaleDateString("en-KE")}).`,
                tone: "warning",
              });
            }
          }
        }

        // ── Harvest reminders ──
        for (const crop of crops) {
          if (crop.expectedHarvest && crop.status === "active") {
            const daysLeft = Math.ceil((new Date(crop.expectedHarvest).getTime() - now.getTime()) / 86400000);
            if (daysLeft >= 0 && daysLeft <= 3) {
              alerts.push({
                icon: "🌾",
                title: `Harvest time: ${crop.name}`,
                detail: daysLeft === 0 ? "Expected harvest is today." : `Expected harvest in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
                tone: "info",
              });
            }
          }
          if (crop.harvestSeason) {
            const s = parseSeason(crop.harvestSeason);
            if (s) {
              const month = now.getMonth();
              const inSeason = s.startMonth <= s.endMonth ? month >= s.startMonth && month <= s.endMonth : month >= s.startMonth || month <= s.endMonth;
              if (inSeason) {
                alerts.push({
                  icon: "🗓️",
                  title: `Season open: ${crop.name}`,
                  detail: `Harvest season (${crop.harvestSeason}) is on — schedule picking labour and buyers.`,
                  tone: "info",
                });
              }
            }
          }
          // ── Acidic soil warning ──
          const latestTest = crop.soilTests?.[0];
          if (latestTest?.ph && Number(latestTest.ph) < 5.2) {
            alerts.push({
              icon: "🧪",
              title: `Acidic soil: ${crop.name}`,
              detail: `Latest soil test shows pH ${Number(latestTest.ph)} (below 5.2) — lime application recommended.`,
              tone: "warning",
            });
          }
        }

        // ── Low stock ──
        for (const item of inventory) {
          if (item.reorderLevel > 0 && Number(item.quantity) <= item.reorderLevel) {
            alerts.push({
              icon: "📦",
              title: `Low stock: ${item.itemName}`,
              detail: `${Number(item.quantity)} ${item.unit} remaining (reorder at ${item.reorderLevel}).`,
              tone: "danger",
            });
          }
        }

        // ── Vaccinations due ──
        for (const v of vaccinations) {
          alerts.push({
            icon: "💉",
            title: `Vaccination due: ${v.flock?.name || "Flock"}`,
            detail: `${v.vaccineName || "Vaccination"} scheduled for ${new Date(v.scheduledDate).toLocaleDateString("en-KE")}.`,
            tone: "warning",
          });
        }

        // Skip silent farms
        if (alerts.length === 0) { skipped++; continue; }

        const result = await sendEmail({
          to: farm.owner.email,
          subject: `🌿 Wangari daily digest — ${alerts.length} item${alerts.length === 1 ? "" : "s"} need${alerts.length === 1 ? "s" : ""} your attention`,
          html: digestEmailHtml(farm.owner.name || "Farmer", farm.name, alerts, dashboardUrl),
          template: "oneoff",
        });

        if (result.ok) sent++;
        else { skipped++; errors.push(`${farm.name}: ${result.error || "send failed"}`); }
      } catch (farmErr: any) {
        errors.push(`${farm.name}: ${farmErr?.message || "unknown"}`);
      }
    }

    res.json({ ok: true, farms: farms.length, sent, skipped, errors: errors.slice(0, 10) });
  } catch (error: any) {
    console.error("Farm digest error:", error);
    res.status(500).json({ error: "Digest failed", detail: error?.message });
  }
});

/**
 * GET /api/cron/dmarc-check
 *
 * Weekly email-authentication health check for imeantech.com. Verifies the
 * SPF, DKIM and DMARC DNS records are still published and sane — if any
 * record goes missing or malformed (e.g. DNS accidental deletion, provider
 * change), alerts the admin by email. Called weekly by Vercel Cron via the
 * same authenticated pattern as farm-digest.
 */
const DOMAIN = "imeantech.com";
const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || "admin@imeantech.com";
const resolver = new (require("dns").promises.Resolver)();

async function txtRecords(name: string): Promise<string[]> {
  try {
    const records = await resolver.resolveTxt(name);
    return records.map((chunks: string[]) => chunks.join(""));
  } catch {
    return [];
  }
}

router.get("/dmarc-check", async (req: Request, res: Response) => {
  const CRON_SECRET = process.env.CRON_SECRET || "";
  const authHeader = req.headers.authorization || "";
  if (!CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const problems: string[] = [];
  const ok: string[] = [];

  // SPF: domain TXT must include v=spf1
  const spf = (await txtRecords(DOMAIN)).find((r) => r.toLowerCase().startsWith("v=spf1"));
  if (!spf) problems.push("SPF record missing for " + DOMAIN);
  else ok.push("SPF: " + spf);

  // DMARC: _dmarc TXT must be v=DMARC1
  const dmarc = (await txtRecords("_dmarc." + DOMAIN)).find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) problems.push("DMARC record missing for _dmarc." + DOMAIN);
  else ok.push("DMARC: " + dmarc);

  // DKIM: check all known Mailbux selectors — at least one must resolve.
  const selectors = ["v1-ed25519-20260904", "v1-rsa-20260904", "default", "mailbux", "k1", "s1", "s2", "selector1", "selector2", "mdkim"];
  let dkimFound: string | null = null;
  for (const sel of selectors) {
    const rec = (await txtRecords(sel + "._domainkey." + DOMAIN)).find((r) => r.toLowerCase().includes("v=dkim1") || r.includes("p="));
    if (rec) { dkimFound = sel; ok.push(`DKIM: selector "${sel}" published`); break; }
  }
  if (!dkimFound) problems.push("No DKIM key published for any known selector of " + DOMAIN);

  if (problems.length > 0) {
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: "⚠️ Wangari email authentication problem — action needed",
        html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px;"><h2 style="color:#dc2626;">Email authentication problem detected</h2><p>Weekly check of ${DOMAIN} found problems that may push farmers' verification codes into spam or get mail rejected:</p><ul>${problems.map((p) => `<li style="color:#b91c1c;margin:8px 0;">${p}</li>`).join("")}</ul><p style="color:#64748b;font-size:13px;">Healthy records found (for reference):</p><ul>${ok.map((o) => `<li style="color:#16a34a;font-size:13px;">${o}</li>`).join("")}</ul><p style="color:#64748b;font-size:13px;">Fix DNS records at your registrar, then wait for TTL to expire. Verification codes will keep sending in the meantime.</p></div>`,
        text: `Wangari email auth problems:\n${problems.join("\n")}\n\nHealthy:\n${ok.join("\n")}`,
        template: "oneoff",
      });
    } catch (e) {
      console.error("DMARC alert email failed:", e);
    }
  }

  res.json({ ok: problems.length === 0, domain: DOMAIN, problems, healthy: ok, checkedAt: new Date().toISOString() });
});

export default router;

/**
 * GET /api/cron/mfa-nudge
 *
 * Weekly security nudge — emails verified users who have NOT enabled
 * authenticator-app 2FA, with a one-click setup link. Idempotent per user
 * via lastMfaNudgedAt so nobody gets spammed. Runs Mondays by Vercel Cron.
 */
const NUDGE_COOLDOWN_MS = 7 * 86400000; // one email per user per week max

function mfaNudgeEmailHtml(userName: string, setupUrl: string): string {
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
          <h2 style="margin:0 0 8px;font-size:20px;color:#334155;">Secure your farm account, ${userName} 🔐</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6;">
            Your Wangari account holds your farm's crops, flocks, finances and records.
            Adding <strong>two-factor authentication</strong> takes one minute and keeps it safe even
            if someone learns your password.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:8px;margin:0 0 20px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;font-size:13px;color:#166534;font-weight:700;">How it works</p>
              <p style="margin:6px 0 0;font-size:13px;color:#334155;line-height:1.6;">
                1️⃣ Open the link below and scan the QR code with any authenticator app<br/>
                2️⃣ Enter the 6-digit code it shows to confirm<br/>
                3️⃣ From then on, sign in with password + that code
              </p>
            </td></tr>
          </table>
          <div style="text-align:center;">
            <a href="${setupUrl}" style="display:inline-block;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">Set up two-factor now →</a>
          </div>
          <p style="margin:20px 0 0;font-size:11px;color:#64748b;text-align:center;">
            Works with Google Authenticator, Authy, 1Password and any TOTP app.<br/>
            You receive this reminder weekly because two-factor is off. It stops automatically once you enable it.
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

router.get("/mfa-nudge", async (req: Request, res: Response) => {
  const CRON_SECRET = process.env.CRON_SECRET || "";
  const authHeader = req.headers.authorization || "";
  if (!CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const appUrl = `${process.env.FRONTEND_URL || "https://wangari.imeantech.com"}/settings?tab=security`;
  const cooldownAgo = new Date(Date.now() - NUDGE_COOLDOWN_MS);

  try {
    // Verified users with a password (Google-only accounts can't use TOTP),
    // 2FA not enabled, not nudged within the past week.
    const users = await prisma.user.findMany({
      where: {
        emailVerified: { not: null },
        password: { not: null },
        totpEnabledAt: null,
        OR: [
          { lastMfaNudgedAt: null },
          { lastMfaNudgedAt: { lt: cooldownAgo } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 200,
    });

    let sent = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        const result = await sendEmail({
          to: user.email,
          subject: `🔐 One minute to protect your Wangari farm account`,
          html: mfaNudgeEmailHtml(user.name || "Farmer", appUrl),
          template: "oneoff",
        });
        if (result.ok) {
          sent++;
          await prisma.user.update({ where: { id: user.id }, data: { lastMfaNudgedAt: new Date() } });
        } else {
          errors.push(`${user.email}: ${result.error || "send failed"}`);
        }
      } catch (e: any) {
        errors.push(`${user.email}: ${e?.message || "unknown"}`);
      }
    }

    res.json({ ok: true, eligible: users.length, sent, errors: errors.slice(0, 10) });
  } catch (error: any) {
    console.error("MFA nudge error:", error);
    res.status(500).json({ error: "MFA nudge failed", detail: error?.message });
  }
});

// ═════════════════════════════════════════════════════════════════════
// GET /api/cron/quote-expiry — daily quote hygiene
//
//  1. Auto-marks sent quotes past their valid-until date as "expired"
//     (so they can't be accepted and stop cluttering the sent filter).
//  2. Emails each farm owner a nudge listing quotes that expire within
//     the next 3 days — a chance to follow up before the customer goes cold.
//
// Triggered daily via Vercel Cron → Next.js proxy (same pattern as farm-digest).
// ═════════════════════════════════════════════════════════════════════

interface ExpiringQuote {
  quoteNumber: string;
  totalAmount: any;
  customerName: string | null;
  validUntil: Date;
}

function quoteExpiryEmailHtml(userName: string, farmName: string, expiring: ExpiringQuote[], quotesUrl: string): string {
  const rows = expiring.map((q) => {
    const days = Math.max(0, Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000));
    const dayLabel = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    return `
      <tr>
        <td style="padding:10px 14px;background-color:#fffbeb;border-radius:8px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <p style="margin:0;font-size:13px;font-weight:700;color:#92400e;">${q.quoteNumber} — ${q.customerName || "Walk-in customer"}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#334155;">KES ${Number(q.totalAmount).toLocaleString()} · expires ${dayLabel} (${new Date(q.validUntil).toLocaleDateString("en-KE", { day: "numeric", month: "short" })})</p>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
  }).join("");

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
          <h2 style="margin:0 0 4px;font-size:20px;color:#334155;">Quotes expiring soon, ${userName} ⏳</h2>
          <p style="margin:0 0 20px;font-size:13px;color:#64748b;">${farmName} · ${expiring.length} quote${expiring.length === 1 ? "" : "s"} expire${expiring.length === 1 ? "s" : ""} in the next 3 days</p>
          <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Follow up with the customer now — a quick call or WhatsApp message before the quote expires is often all it takes to close the deal.</p>
          <div style="text-align:center;margin-top:24px;">
            <a href="${quotesUrl}" style="display:inline-block;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">Open Quotes →</a>
          </div>
          <p style="margin:20px 0 0;font-size:11px;color:#64748b;text-align:center;">
            You receive this because you have quotes with upcoming expiry dates.<br/>Expired quotes are marked automatically so you never chase a dead deal.
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

router.get("/quote-expiry", async (req: Request, res: Response) => {
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
  const threeDaysAhead = new Date(now.getTime() + 3 * 86400000);
  const quotesUrl = `${process.env.FRONTEND_URL || "https://wangari.imeantech.com"}/quotes`;

  try {
    // 1. Expire: every sent quote whose validity window has closed.
    const expired = await prisma.quote.updateMany({
      where: { status: "sent", validUntil: { lt: now, not: null } },
      data: { status: "expired", updatedAt: now },
    });

    // 2. Nudge: group quotes expiring in the next 3 days by farm, email each owner.
    const expiring = await prisma.quote.findMany({
      where: { status: "sent", validUntil: { gte: now, lte: threeDaysAhead } },
      select: {
        farmId: true, quoteNumber: true, totalAmount: true, validUntil: true,
        customer: { select: { name: true } },
        farm: { select: { name: true, owner: { select: { name: true, email: true } } } },
      },
      orderBy: { validUntil: "asc" },
    });

    const byFarm = new Map<number, { ownerName: string; ownerEmail: string; farmName: string; quotes: ExpiringQuote[] }>();
    for (const q of expiring) {
      const owner = q.farm.owner;
      if (!owner?.email) continue;
      if (!byFarm.has(q.farmId)) {
        byFarm.set(q.farmId, { ownerName: owner.name || "Farmer", ownerEmail: owner.email, farmName: q.farm.name, quotes: [] });
      }
      byFarm.get(q.farmId)!.quotes.push({
        quoteNumber: q.quoteNumber,
        totalAmount: q.totalAmount,
        customerName: q.customer?.name || null,
        validUntil: q.validUntil as Date,
      });
    }

    let sent = 0;
    const errors: string[] = [];
    for (const { ownerName, ownerEmail, farmName, quotes } of byFarm.values()) {
      try {
        const result = await sendEmail({
          to: ownerEmail,
          subject: `⏳ ${quotes.length} quote${quotes.length === 1 ? "" : "s"} expiring soon — Wangari`,
          html: quoteExpiryEmailHtml(ownerName, farmName, quotes, quotesUrl),
          template: "oneoff",
        });
        if (result.ok) sent++;
        else errors.push(`${ownerEmail}: ${result.error || "send failed"}`);
      } catch (e: any) {
        errors.push(`${ownerEmail}: ${e?.message || "unknown"}`);
      }
    }

    res.json({ ok: true, expiredCount: expired.count, farmsNudged: sent, expiringQuotes: expiring.length, errors: errors.slice(0, 10) });
  } catch (error: any) {
    console.error("Quote expiry cron error:", error);
    res.status(500).json({ error: "Quote expiry failed", detail: error?.message });
  }
});
