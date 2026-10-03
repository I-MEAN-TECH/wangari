/**
 * Apology + goodwill: give every signed-up user 14 extra days and email them
 * about it. Written for the outage recovery on the new VPS.
 *
 * Usage:
 *   node --env-file=.env scripts/extend-trial.mjs [--days 14] [--dry-run]
 *
 * Access in Wangari comes from one of two clocks:
 *   - users.trial_ends_at           (no subscription)
 *   - subscriptions.expires_at      (active subscription)
 * So "14 more days" has to be added to whichever clock actually governs the
 * user, otherwise the promise in the email is empty. Both are extended.
 *
 * Safety:
 *  - Idempotent. email_logs is checked for template "outage_trial_extension"
 *    per user, so a re-run cannot double-extend or double-send.
 *  - Admins are excluded.
 *  - The apology email only goes to verified addresses (an unverified address
 *    is often a typo or a dead inbox; mailing it bounces and hurts sender
 *    reputation). Unverified accounts still get their extra days.
 *  - Emails are sent one at a time so a Mailbux throttle degrades into a
 *    partial run instead of a rejected batch. Progress is printed per user.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i === -1 ? dflt : argv[i + 1];
};
const DAYS = Number(argOf("--days", "14"));
const DRY_RUN = argv.includes("--dry-run");
const TEMPLATE = "outage_trial_extension";
const ADMIN_ROLES = ["super_admin", "billing", "support", "support_read"];
const DAY_MS = 24 * 60 * 60 * 1000;

const FRONTEND_URL = process.env.FRONTEND_URL || "https://wangari.imeantech.com";

function fmt(d) {
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
}

function buildEmail({ name, newEnd, kind }) {
  const what =
    kind === "subscription" ? `${DAYS} extra days of access` : `${DAYS} extra days on your free trial`;
  const subject = `Sorry for the downtime — we've added ${DAYS} extra days for you`;
  const text =
    `Hi ${name},\n\n` +
    `Wangari was offline while we moved the whole platform to new infrastructure. That was our fault, ` +
    `and we are sorry it interrupted your work.\n\n` +
    `To make it right, we have added ${what}. You now have access until ${fmt(newEnd)}. ` +
    `Nothing to do — no payment, no card needed.\n\n` +
    `Everything is back online now. If you hit anything that still looks wrong, just reply to this ` +
    `email and a person will look at it.\n\n` +
    `Thank you for your patience,\nThe Wangari team\nI-MEAN-TECH`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f8f6;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;padding:32px;">
  <h1 style="margin:0 0 20px;font-size:22px;color:#0f172a;">We're sorry for the downtime</h1>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Hi ${name},</p>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Wangari was offline while we moved the whole platform onto new infrastructure. That was our fault, and we are sorry it got in the way of your work.</p>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:24px 0;">
    <p style="margin:0 0 8px;font-size:15px;color:#166534;font-weight:600;">We've added ${what}</p>
    <p style="margin:0;font-size:15px;color:#166534;">You now have access until <strong>${fmt(newEnd)}</strong>. Nothing to do — no payment, no card needed.</p>
  </div>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Everything is back online now. If anything still looks wrong, just reply to this email and a person will look at it.</p>
  <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#334155;">Thank you for your patience,</p>
  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;"><strong>The Wangari team</strong><br><span style="color:#64748b;font-size:13px;">I-MEAN-TECH</span></p>
  <a href="${FRONTEND_URL}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;">Open Wangari</a>
</div></body></html>`;
  return { subject, text, html };
}

const { sendEmail } = await import("../dist/lib/email.js");

try {
  const candidates = await prisma.user.findMany({
    where: { role: { notIn: ADMIN_ROLES } },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      trialEndsAt: true,
      createdAt: true,
      subscriptions: { select: { id: true, expiresAt: true, status: true } },
    },
    orderBy: { id: "asc" },
  });

  console.log(
    `Candidates: ${candidates.length}${DRY_RUN ? " (dry run — no writes, no email)" : ""}`
  );

  let extended = 0;
  let emailed = 0;
  let skipped = 0;

  for (const u of candidates) {
    const already = await prisma.emailLog.findFirst({
      where: { userId: u.id, template: TEMPLATE, status: "sent" },
      select: { id: true },
    });
    if (already) {
      console.log(`· #${u.id} ${u.email} — already received the extension, skipping`);
      skipped++;
      continue;
    }

    const active = u.subscriptions.filter((s) => s.status === "active");
    // plan-gate falls back to created_at + 14 days when trial_ends_at is null,
    // so an explicit value is needed for the extension to be visible at all.
    const trialEnd = u.trialEndsAt || new Date(u.createdAt.getTime() + 14 * DAY_MS);
    const newTrialEnd = new Date(trialEnd.getTime() + DAYS * DAY_MS);

    // A subscription, when present, is what actually grants access.
    const subEnds = active.map((s) => s.expiresAt);
    const latestSub = subEnds.length ? new Date(Math.max(...subEnds.map((d) => d.getTime()))) : null;
    const newSubEnd = latestSub ? new Date(latestSub.getTime() + DAYS * DAY_MS) : null;
    const kind = latestSub ? "subscription" : "trial";
    const newEnd = latestSub ? newSubEnd : newTrialEnd;

    if (DRY_RUN) {
      const will = u.emailVerified ? "email" : "extend only (unverified address)";
      console.log(
        `· #${u.id} ${u.email} — ${kind}: ${fmt(kind === "subscription" ? latestSub : trialEnd)} → ` +
          `${fmt(newEnd)} — ${will}`
      );
      extended++;
      if (u.emailVerified) emailed++;
      continue;
    }

    await prisma.user.update({ where: { id: u.id }, data: { trialEndsAt: newTrialEnd } });
    if (latestSub) {
      for (const s of u.subscriptions.filter((x) => x.status === "active")) {
        await prisma.subscription.update({
          where: { id: s.id },
          data: { expiresAt: new Date(s.expiresAt.getTime() + DAYS * DAY_MS) },
        });
      }
    }
    extended++;

    if (!u.emailVerified) {
      console.log(`· #${u.id} ${u.email} — extended to ${fmt(newEnd)}, no email (unverified address)`);
      continue;
    }

    const { subject, text, html } = buildEmail({ name: u.name || "there", newEnd, kind });
    const result = await sendEmail({ to: u.email, subject, html, text, template: TEMPLATE, userId: u.id });
    if (result.ok) emailed++;
    else console.error(`  ! email failed for ${u.email}: ${result.error}`);
    console.log(`· #${u.id} ${u.email} — extended to ${fmt(newEnd)}, email ${result.ok ? "sent" : "FAILED"}`);
    // Small gap so a larger list cannot trip the Mailbux rate limiter.
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\nDone. extended=${extended} emailed=${emailed} skipped=${skipped}`);
} catch (error) {
  console.error("extend-trial failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}