import { TRIAL_DAYS, trialEndDate } from "../lib/config.js";
import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { MODULE_HUB_MAP as GATED_HUB_MAP } from "../middleware/plan-gate.js";

const router = Router();

// The gated modules come straight from the table the 403s are enforced from —
// one map, so the padlock and the server can never disagree. The rest are nav
// entries that no plan restriction applies to.
const MODULE_HUB_MAP: Record<string, string> = {
  ...GATED_HUB_MAP,
  "feed-calculator": "_always",
  weather: "_always",
  reports: "_always",
  settings: "_always",
};

// GET /api/trial/status
router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        trialStartsAt: true,
        trialEndsAt: true,
        selectedHubs: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();

    const activeSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: "active",
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "desc" },
    });

    const pendingSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: "pending",
      },
      orderBy: { startsAt: "asc" },
    });

    let trialStatus: "active" | "expired" | "no_trial" = "no_trial";
    let trialDaysLeft = 0;
    let trialEndsAt: string | null = null;

    // Resolve the canonical trial end date
    let resolvedTrialEndsAt: Date | null = user.trialEndsAt;

    // If trialEndsAt was never persisted, calculate from createdAt and LOCK it in the DB
    if (!resolvedTrialEndsAt && user.createdAt) {
      resolvedTrialEndsAt = trialEndDate(user.createdAt);
      // Persist so subsequent calls return a stable, unchanging end date
      await prisma.user.update({
        where: { id: user.id },
        data: {
          trialStartsAt: user.createdAt,
          trialEndsAt: resolvedTrialEndsAt,
        },
      });
    }

    if (resolvedTrialEndsAt) {
      if (now < resolvedTrialEndsAt) {
        trialStatus = "active";
        trialDaysLeft = Math.ceil((resolvedTrialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        trialEndsAt = resolvedTrialEndsAt.toISOString();
      } else {
        trialStatus = "expired";
      }
    }

    let hasAccess = false;
    let accessReason: string = "none";

    if (activeSub) {
      hasAccess = true;
      accessReason = "subscription";
    } else if (trialStatus === "active") {
      hasAccess = true;
      accessReason = "trial";
    }

    const selectedHubs: string[] = user.selectedHubs
      ? JSON.parse(user.selectedHubs)
      : [];

    // Plan-tier gating:
    //  - Workers management is a Growth/Enterprise feature.
    //  - Starter = 1 hub of choice (its modules + the always-included ones).
    //  - Growth/Enterprise = all hubs.
    // Trial users keep full access so they can evaluate everything.
    const planId = (activeSub?.plan || "").toLowerCase();
    const isGrowthOrEnterprise = /growth|enterprise/.test(planId);
    const isStarter = /starter/.test(planId) && hasAccess;

    const moduleAccess: Record<string, boolean> = {};
    for (const [module, hub] of Object.entries(MODULE_HUB_MAP)) {
      // Hard lock: no active subscription AND no trial time left = EVERY module
      // is locked (padlock in the sidebar, server APIs already 403 via auth
      // middleware). Nothing is exempt — not even "_always" modules.
      if (!hasAccess) {
        moduleAccess[module] = false;
        continue;
      }
      if (module === "workers") {
        moduleAccess[module] = trialStatus === "active" || (activeSub != null && isGrowthOrEnterprise);
      } else if (hub === "_always" || (activeSub != null && isGrowthOrEnterprise)) {
        moduleAccess[module] = true;
      } else if (isStarter) {
        // Starter: allow modules belonging to the user's chosen hub(s) only.
        // An empty list means the choice was never finished, so it must not
        // lock everything — see moduleAllowed() in middleware/plan-gate.ts,
        // which must agree with this or the sidebar padlocks lie.
        moduleAccess[module] =
          selectedHubs.length === 0 ? hub !== "team" : selectedHubs.includes(hub);
      } else if (hasAccess) {
        moduleAccess[module] = true;
      } else {
        moduleAccess[module] = false;
      }
    }

    const subscription = activeSub
      ? {
          status: "active",
          plan: activeSub.plan,
          planName: activeSub.planName,
          expiresAt: activeSub.expiresAt.toISOString(),
          daysLeft: Math.ceil((activeSub.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        }
      : pendingSub
        ? {
            plan: pendingSub.plan,
            planName: pendingSub.planName,
            startsAt: pendingSub.startsAt.toISOString(),
            status: "pending_start",
          }
        : null;

    return res.json({
      trial: {
        status: trialStatus,
        daysLeft: trialDaysLeft,
        endsAt: trialEndsAt,
      },
      subscription,
      hasAccess,
      locked: !hasAccess,
      accessReason,
      selectedHubs,
      modules: moduleAccess,
    });
  } catch (error) {
    console.error("Trial status error:", error);
    return res.status(500).json({ error: "Failed to get trial status" });
  }
});

export default router;
