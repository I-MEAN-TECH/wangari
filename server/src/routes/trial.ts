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

    // The legacy 14-day "trial" is no longer granted to new signups; a
    // user who still has `trialEndsAt` set is someone who signed up before
    // the Free Core cutover. We keep reading the field so the banner can
    // show their remaining days (small, shrinking set), but plan-tier
    // decisions (hasAccess, moduleAccess) only look at activeSub below.
    const resolvedTrialEndsAt: Date | null = user.trialEndsAt ?? null;
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
    let tier: "subscription" | "free_core" = "free_core";
    let accessReason: string = "free_core";

    if (activeSub) {
      hasAccess = true;
      tier = "subscription";
      accessReason = "subscription";
    } else {
      tier = "free_core";
      hasAccess = true;
      accessReason = "free_core";
    }

    const selectedHubs: string[] = user.selectedHubs
      ? JSON.parse(user.selectedHubs)
      : [];

    const planId = (activeSub?.plan || "").toLowerCase();
    const isGrowthOrEnterprise = /growth|enterprise/.test(planId);
    const isStarter = /starter/.test(planId) && hasAccess;

    const moduleAccess: Record<string, boolean> = {};
    for (const [module, hub] of Object.entries(MODULE_HUB_MAP)) {
      if (tier === "free_core") {
        // Free Core: _always modules open, all other modules locked
        moduleAccess[module] = hub === "_always";
        continue;
      }
      // Paid subscription path:
      if (module === "workers" || module === "attendance" || module === "coop" || module === "loans" || module === "reports") {
        moduleAccess[module] = isGrowthOrEnterprise;
      } else if (hub === "_always" || isGrowthOrEnterprise) {
        moduleAccess[module] = true;
      } else if (isStarter) {
        moduleAccess[module] = true; // Starter gets all mixed farming hubs
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
      tier,
      locked: false,
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
