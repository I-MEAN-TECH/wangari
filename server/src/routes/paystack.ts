import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { auditMoneyMutation } from "../lib/audit.js";
import { getPlan } from "../lib/plans.js";
import { requireActivePlan, findPlan } from "../lib/plan-tier.js";
import { sendEmail, emailTemplates } from "../lib/email.js";

const router = Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_API = "https://api.paystack.co";

// POST /api/paystack - Initialize transaction
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    let { email, plan, callback_url, phone } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
    if (!email) email = user?.email;
    if (!phone) phone = user?.phone;

    if (!email || !plan) {
      return res.status(400).json({ error: "Email and plan are required" });
    }

    const planConfig = await getPlan(plan);
    if (!planConfig) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    // Hard-validate the purchased plan against the plans table (active only).
    try {
      await requireActivePlan(plan);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    // Optional promo code: validate now so the user sees errors early; the
    // actual redemption + attribution happens in the webhook on payment.
    const promoInput = String(req.body?.promoCode || "").trim().toUpperCase();
    let promo: any = null;
    if (promoInput) {
      promo = await prisma.promoCode.findUnique({ where: { code: promoInput } });
      if (!promo || !promo.active) return res.status(400).json({ error: "Invalid or expired promo code" });
      if (promo.expiresAt && promo.expiresAt < new Date()) return res.status(400).json({ error: "This promo code has expired" });
      if (promo.maxRedemptions && promo.timesRedeemed >= promo.maxRedemptions) {
        return res.status(400).json({ error: "This promo code has been fully redeemed" });
      }
      // Plan-locked promos only apply to their plan (exact id match).
      if (promo.planId && promo.planId !== plan) {
        return res.status(400).json({ error: "This promo code only applies to a different plan" });
      }
    }

    const payload: any = {
      email,
      amount: planConfig.amount,
      currency: "KES",
      channels: ["card", "mobile_money"],
      callback_url: callback_url || `https://wangari.imeantech.com/subscription?payment=success`,
      metadata: {
        purpose: "subscription",
        userId,
        plan,
        plan_name: planConfig.name,
        ...(promo ? { promoCode: promo.code } : {}),
      },
    };

    if (phone) {
      payload.phone = phone;
    }

    const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as any;

    if (!data.status) {
      return res.status(400).json({ error: data.message || "Payment initialization failed" });
    }

    return res.json({
      status: true,
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
    });
  } catch (error) {
    console.error("Paystack error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/paystack/webhook — server-to-server payment confirmation (no auth; signature-verified)
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    // Verify event origin via HMAC SHA512 of the raw request body (Paystack docs).
    const signature = req.headers["x-paystack-signature"] as string | undefined;
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const expected = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");

    if (!signature || signature !== expected) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString("utf8")) : req.body;
    const eventType = event?.event;

    if (eventType === "charge.success") {
      const data = event?.data || {};
      const reference = data.reference;
      const paidAmount = Number(data.amount || 0); // Paystack amounts are in the currency's minor unit (cents).

      // Two payload shapes are supported:
      // 1. Express initialize (this file): metadata.userId + metadata.plan
      // 2. Vercel Next.js webhook contract: metadata.purpose === "subscription" + customer.email
      const userId = data?.metadata?.userId;
      let plan = data?.metadata?.plan;

      // If no userId in metadata, resolve the user by customer email (Vercel-webhook contract).
      if (!userId && data?.metadata?.purpose === "subscription") {
        const email = String(data?.customer?.email || "").toLowerCase();
        const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
        if (user) {
          const planConfig = plan ? await getPlan(plan) : null;
          if (plan) {
            const pRow = await findPlan(plan);
            if (!pRow || !pRow.active) {
              console.error(`Paystack webhook: refusing to activate subscription on invalid/disabled plan "${plan}" (${reference})`);
              return res.status(400).json({ error: "Invalid plan in payment metadata" });
            }
          }
          // Activate now (Express flow has no trial-start deferral)
          const startsAt = new Date();
          const expiresAt = new Date(startsAt.getTime() + (planConfig?.days || 30) * 24 * 60 * 60 * 1000);
          const existing = reference ? await prisma.subscription.findFirst({ where: { reference } }) : null;
          if (!existing) {
            await prisma.subscription.create({
              data: {
                userId: user.id,
                plan: plan || "starter_monthly",
                planName: planConfig?.name || plan || "Starter",
                amount: paidAmount / 100,
                status: "active",
                reference,
                startsAt,
                expiresAt,
              },
            });
          }
          return res.json({ received: true });
        }
      }

      if (!userId || !plan) {
        return res.json({ received: true }); // no-op, can't activate without metadata
      }

      const planConfig = await getPlan(plan);
      if (!planConfig) {
        return res.json({ received: true });
      }
      // Webhook must not activate a subscription on a stale/unknown plan —
      // reject and log loudly instead of silently granting wrong-tier access.
      const planRow = await findPlan(plan);
      if (!planRow || !planRow.active) {
        console.error(`Paystack webhook: refusing to activate subscription on invalid/disabled plan "${plan}" (${reference})`);
        return res.status(400).json({ error: "Invalid plan in payment metadata" });
      }

      const amountKes = paidAmount / 100;
      if (amountKes !== planConfig.amount / 100) {
        console.error(`Paystack webhook amount mismatch for ${reference}: paid ${amountKes}, expected ${planConfig.amount / 100}`);
        return res.status(400).json({ error: "Amount mismatch" });
      }

      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + planConfig.days * 24 * 60 * 60 * 1000);

      // Idempotent: reference is not unique in the schema, so find-first then create/update.
      const existing = reference
        ? await prisma.subscription.findFirst({ where: { reference } })
        : null;

      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: { status: "active", planName: planConfig.name, expiresAt },
        });
      } else {
        await prisma.subscription.create({
          data: {
            userId: Number(userId),
            plan,
            planName: planConfig.name,
            amount: planConfig.amount / 100,
            status: "active",
            reference,
            startsAt,
            expiresAt,
          },
        });
      }
      auditMoneyMutation({
        userId: Number(userId),
        farmId: null,
        action: "subscription.activate",
        entityType: "Subscription",
        entityId: existing?.id || null,
        details: { plan, reference, amountKes: planConfig.amount / 100, expiresAt: expiresAt.toISOString() },
      });

      // Email receipt (logged to email_logs; failure never blocks the webhook).
      try {
        const subUser = await prisma.user.findUnique({ where: { id: Number(userId) }, select: { email: true } });
        if (subUser?.email) {
          const tpl = emailTemplates.receipt(planConfig.amount / 100, planConfig.name, expiresAt);
          await sendEmail({ to: subUser.email, subject: tpl.subject, html: tpl.html, template: "receipt", userId: Number(userId) });
        }
      } catch (mailErr) {
        console.warn("receipt email failed:", mailErr);
      }

      // Promo attribution: record the redemption and bump the counter.
      const promoCode = data?.metadata?.promoCode;
      if (promoCode) {
        const promo = await prisma.promoCode.findUnique({ where: { code: String(promoCode).toUpperCase() } });
        if (promo && promo.active && (!promo.maxRedemptions || promo.timesRedeemed < promo.maxRedemptions)) {
          const discountKes =
            promo.discountType === "percent"
              ? Math.round((planConfig.amount / 100) * ((promo.value ?? 0) / 100))
              : Math.min(promo.value ?? 0, planConfig.amount / 100);
          await prisma.promoRedemption.create({
            data: { promoCodeId: promo.id, userId: Number(userId), reference, discountKes },
          });
          await prisma.promoCode.update({
            where: { id: promo.id },
            data: { timesRedeemed: { increment: 1 } },
          });
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Paystack webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// GET /api/paystack/verify?reference=xxx - Verify transaction (auth required)
router.get("/verify", authMiddleware, async (req: Request, res: Response) => {
  try {
    const reference = req.query.reference as string;
    if (!reference) {
      return res.status(400).json({ error: "Reference is required" });
    }

    const response = await fetch(`${PAYSTACK_API}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });

    const data = (await response.json()) as any;

    if (!data.status) {
      return res.status(400).json({ error: "Verification failed" });
    }

    return res.json({
      status: true,
      data: {
        reference: data.data.reference,
        amount: data.data.amount,
        currency: data.data.currency,
        status: data.data.status,
        customer: data.data.customer,
        metadata: data.data.metadata,
      },
    });
  } catch (error) {
    console.error("Paystack verify error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
