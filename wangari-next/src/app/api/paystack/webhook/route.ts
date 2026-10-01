import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHmac } from "crypto";
import { sendEmail } from "@/lib/email";
import { subscriptionConfirmedEmail } from "@/lib/email-templates";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";

// Plan durations in days
const PLAN_DURATIONS: Record<string, number> = {
  starter_monthly: 30,
  starter_annual: 365,
  growth_monthly: 30,
  growth_annual: 365,
};

/**
 * POST /api/paystack/webhook
 *
 * Paystack sends events here when payments succeed.
 * We verify the signature, save the subscription, and send confirmation email.
 *
 * Set this URL in Paystack Dashboard → Settings → Webhook URL:
 * https://wangari.imeantech.com/api/paystack/webhook
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    // Verify webhook signature — REQUIRED, never skip (a missing header must not bypass)
    if (!PAYSTACK_SECRET || !signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const hash = createHmac("sha512", PAYSTACK_SECRET)
      .update(body)
      .digest("hex");
    if (hash !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);
    const { event: eventType, data } = event;

    // Only handle successful charges
    if (eventType !== "charge.success") {
      return NextResponse.json({ received: true });
    }

    const { metadata, amount, reference, customer } = data;

    // ── Subscription payment ────────────────────────────────
    if (metadata?.purpose === "subscription" && metadata?.plan) {
      const planKey = metadata.plan;
      const planName = metadata.plan_name || planKey;
      const amountKes = amount / 100;
      const durationDays = PLAN_DURATIONS[planKey] || 30;

      // Reject plans that don't exist in the plans table (or are disabled) —
      // activating a subscription on a ghost plan silently breaks gating.
      const planRow = await prisma.plan.findUnique({ where: { id: planKey } });
      if (!planRow || !planRow.active) {
        console.error(`Webhook: refusing to activate subscription on invalid/disabled plan "${planKey}" (${reference})`);
        return NextResponse.json({ received: true });
      }

      // Find user by email
      const email = customer?.email;
      if (!email) {
        console.error("Webhook: No customer email for subscription");
        return NextResponse.json({ received: true });
      }

      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) {
        console.error("Webhook: User not found for email:", email);
        return NextResponse.json({ received: true });
      }

      const now = new Date();

      // If user is still in trial, subscription starts after trial ends
      let startsAt = now;
      if (user.trialEndsAt && now < user.trialEndsAt) {
        startsAt = user.trialEndsAt;
      }
      const expiresAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

      // Save subscription — idempotent: skip if this reference was already processed
      const existing = await prisma.subscription.findFirst({ where: { reference } });
      if (!existing) {
        await prisma.subscription.create({
          data: {
            userId: user.id,
            plan: planKey,
            planName,
            amount: amountKes,
            status: startsAt > now ? "pending" : "active",
            reference,
            startsAt,
            expiresAt,
          },
        });
      }

      console.log(`✅ Webhook: Subscription saved — ${planName} for user ${user.id}, starts ${startsAt.toISOString()}, expires ${expiresAt.toISOString()}`);

      // Send confirmation email
      const expiresFormatted = expiresAt.toLocaleDateString("en-KE", {
        timeZone: "Africa/Nairobi",
        dateStyle: "long",
      });

      await sendEmail({
        to: user.email,
        subject: `${planName} activated — Wangari`,
        html: subscriptionConfirmedEmail(
          user.name,
          planName,
          expiresFormatted,
          `${process.env.NEXTAUTH_URL || "https://wangari.imeantech.com"}/dashboard`
        ),
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    // Return 200 to prevent Paystack from retrying on parse errors
    return NextResponse.json({ received: true });
  }
}

/**
 * GET /api/paystack/webhook — health check
 */
export async function GET() {
  return NextResponse.json({ status: "ok", message: "Paystack webhook endpoint active" });
}
