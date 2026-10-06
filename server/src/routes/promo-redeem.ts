import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireActivePlan, sponsoredName, type PlanInfo } from "../lib/plan-tier.js";
import { sendEmail } from "../lib/email.js";

/**
 * Farmer-side promo code redemption.
 *
 * Sponsorship/partnership codes with freeMonths grant subscription time
 * directly — no Paystack, no card. The farmer enters the code on the
 * subscription page and is subscribed instantly. Per-user single redemption
 * prevents one farmer from burning a sponsorship code twice.
 */
const router = Router();

// POST /api/promos/redeem  { code }
router.post("/redeem", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Login required" });

  // Resolve the user from the JWT (same secret/middleware as other routes).
  let userId: number;
  let farmId: number | null = null;
  try {
    const jwt = (await import("jsonwebtoken")).default;
    const { JWT_SECRET } = await import("../middleware/auth.js");
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    userId = decoded.userId;
    farmId = decoded.farmId ?? null;
  } catch {
    return res.status(401).json({ error: "Session expired — login again" });
  }

  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Enter a code" });

    const promo = await prisma.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.active) return res.status(400).json({ error: "Invalid or expired code" });
    if (promo.expiresAt && promo.expiresAt < new Date()) return res.status(400).json({ error: "This code has expired" });
    if (promo.maxRedemptions && promo.timesRedeemed >= promo.maxRedemptions) {
      return res.status(400).json({ error: "This code has been fully redeemed" });
    }

    // Only sponsorship/partnership codes grant time directly. Discount/credit
    // codes apply at Paystack checkout instead.
    if (!promo.freeMonths || !["sponsorship", "partnership"].includes(promo.type)) {
      return res.status(400).json({ error: "This code applies at checkout — enter it during payment instead" });
    }

    // Plan-restricted codes grant time on THEIR plan, not a hard-coded one.
    // Validated against the live plans table — a promo pointing at a deleted
    // or disabled plan cannot grant access (no silent fallback).
    const targetPlanId = promo.planId || "growth_monthly";
    let plan: PlanInfo;
    try {
      plan = await requireActivePlan(targetPlanId);
    } catch (e: any) {
      return res.status(400).json({ error: `This code is misconfigured (${e.message}). Contact support.` });
    }

    // One redemption of this code per user.
    const already = await prisma.promoRedemption.findFirst({
      where: { promoCodeId: promo.id, userId },
    });
    if (already) {
      return res.status(400).json({ error: "You have already used this code" });
    }

    const now = new Date();
    // Extend from an existing active subscription if there is one.
    const current = await prisma.subscription.findFirst({
      where: { userId, status: "active", expiresAt: { gt: now } },
      orderBy: { expiresAt: "desc" },
    });
    const startsAt = current ? current.expiresAt : now;
    const expiresAt = new Date(startsAt.getTime() + promo.freeMonths * 30 * 86400000);

    await prisma.subscription.create({
      data: {
        userId,
        plan: plan.id,
        planName: sponsoredName(plan),
        amount: 0,
        status: "active",
        reference: `PROMO-${promo.code}-${userId}-${Date.now()}`,
        startsAt,
        expiresAt,
      },
    });

    await prisma.promoRedemption.create({
      data: { promoCodeId: promo.id, userId, reference: `PROMO-${promo.code}`, discountKes: 0 },
    });
    await prisma.promoCode.update({
      where: { id: promo.id },
      data: { timesRedeemed: { increment: 1 } },
    });

    // Notify the farmer by email.
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: `🌿 Your sponsored Wangari subscription is active`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;"><h2 style="color:#166534;">Welcome, ${user.name || "Farmer"}! 🌿</h2><p>Your code <strong>${promo.code}</strong> has been applied${promo.partnerName ? ` (sponsor: ${promo.partnerName})` : ""}.</p><p style="font-size:18px;"><strong>${promo.freeMonths} month${promo.freeMonths === 1 ? "" : "s"} of free access</strong> until <strong>${expiresAt.toLocaleDateString("en-KE")}</strong>.</p><p>Happy farming!</p></div>`,
          template: "oneoff",
          userId,
        });
      }
    } catch (e) {
      console.warn("promo redemption email failed:", e);
    }

    res.json({
      ok: true,
      months: promo.freeMonths,
      sponsor: promo.partnerName,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Promo redeem error:", error);
    res.status(500).json({ error: "Could not redeem the code" });
  }
});

export default router;
