import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { planExpiredEmail } from "@/lib/email-templates";

// Fail CLOSED: an unset CRON_SECRET must refuse, not admit. The old
// `if (CRON_SECRET && ...)` skipped the whole check when the variable was
// missing, so a deploy that lost the secret left these routes open to anyone —
// and they send email to real farmers.
const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * GET /api/cron/check-subscriptions
 *
 * Run daily via cron job (e.g. Vercel Cron or external cron service).
 * Checks for expired subscriptions and sends warning emails.
 *
 * Set this in vercel.json or run via external cron:
 * "crons": [{ "path": "/api/cron/check-subscriptions", "schedule": "0 8 * * *" }]
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET) {
    console.error("[cron:check-subscriptions] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const renewUrl = `${process.env.NEXTAUTH_URL || "https://wangari.imeantech.com"}/pricing`;

  try {
    // 0. Warn users 3 days before trial expires
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const trialExpiringSoon = await prisma.user.findMany({
      where: {
        trialEndsAt: { gte: now, lte: threeDaysFromNow },
        subscriptions: { none: { status: { in: ["active", "pending"] } } },
      },
      select: { id: true, name: true, email: true, trialEndsAt: true },
    });

    let trialWarningCount = 0;
    for (const u of trialExpiringSoon) {
      if (!u.email || !u.trialEndsAt) continue;

      const alreadyWarned = await prisma.auditLog.findFirst({
        where: { userId: u.id, action: "trial_warning" },
      });
      if (alreadyWarned) continue;

      const daysLeft = Math.ceil((u.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const renewUrl = `${process.env.NEXTAUTH_URL || "https://wangari.imeantech.com"}/pricing`;

      await sendEmail({
        to: u.email,
        subject: `Your free trial ends in ${daysLeft} days — Wangari`,
        html: planExpiredEmail(u.name, "free trial", renewUrl),
      });

      await prisma.auditLog.create({
        data: { userId: u.id, action: "trial_warning", entityType: "trial" },
      });

      trialWarningCount++;
    }

    // 1. Find subscriptions that expired in the last 24 hours (haven't been warned yet)
    const recentlyExpired = await prisma.subscription.findMany({
      where: {
        status: "active",
        expiresAt: { lt: now },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    let warnedCount = 0;
    for (const sub of recentlyExpired) {
      if (!sub.user?.email) continue;

      // Mark as expired
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "expired" },
      });

      // Send expiry warning
      const result = await sendEmail({
        to: sub.user.email,
        subject: `Your ${sub.planName} plan has expired — Wangari`,
        html: planExpiredEmail(sub.user.name, sub.planName, renewUrl),
      });

      if (result.success) warnedCount++;
      console.log(`📧 Expiry email ${result.success ? "sent" : "failed"}: ${sub.user.email} (${sub.planName})`);
    }

    // 2. Warn users 3 days before subscription expiry
    const expiringSoon = await prisma.subscription.findMany({
      where: {
        status: "active",
        expiresAt: { gte: now, lte: threeDaysFromNow },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    let reminderCount = 0;
    for (const sub of expiringSoon) {
      if (!sub.user?.email) continue;

      // Check if we already sent a reminder (audit log)
      const alreadyReminded = await prisma.auditLog.findFirst({
        where: {
          userId: sub.user.id,
          action: "subscription_reminder",
          entityId: sub.id,
        },
      });

      if (alreadyReminded) continue;

      const daysLeft = Math.ceil((sub.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      // Reuse the expired template with adjusted text
      const result = await sendEmail({
        to: sub.user.email,
        subject: `Your ${sub.planName} plan expires in ${daysLeft} days — Wangari`,
        html: planExpiredEmail(sub.user.name, sub.planName, renewUrl),
      });

      if (result.success) {
        reminderCount++;
        // Log that we sent a reminder
        await prisma.auditLog.create({
          data: {
            userId: sub.user.id,
            action: "subscription_reminder",
            entityType: "subscription",
            entityId: sub.id,
            details: { daysLeft, planName: sub.planName },
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      trial_warnings: trialWarningCount,
      expired_warned: warnedCount,
      reminders_sent: reminderCount,
    });
  } catch (error) {
    console.error("Subscription check error:", error);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
