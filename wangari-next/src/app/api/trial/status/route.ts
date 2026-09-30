import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decodeToken } from "@/lib/jwt";

// All available modules and which hub they belong to
const MODULE_HUB_MAP: Record<string, string> = {
  livestock: "poultry",
  production: "poultry",
  vaccinations: "poultry",
  crops: "crops",
  finances: "_always", // money tracking is included in every plan
  sales: "sales",
  customers: "sales",
  invoices: "sales",
  workers: "team", // gated to Growth/Enterprise plans (see below)
  attendance: "team",
  inventory: "_always", // always included
  dashboard: "_always",
  "feed-calculator": "_always",
  weather: "_always",
  reports: "_always",
  settings: "_always",
};

/**
 * GET /api/trial/status
 *
 * Returns the user's trial status, active subscription, and which modules they can access.
 */
export async function GET(req: Request) {
  try {
    const payload = decodeToken(req.headers.get("authorization"));
    if (!payload?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        trialStartsAt: true,
        trialEndsAt: true,
        selectedHubs: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();

    // Get active subscription
    const activeSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: "active",
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "desc" },
    });

    // Check if there's a pending subscription (subscribed during trial, starts later)
    const pendingSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: "pending",
      },
      orderBy: { startsAt: "asc" },
    });

    // Determine trial status
    let trialStatus: "active" | "expired" | "no_trial" = "no_trial";
    let trialDaysLeft = 0;
    let trialEndsAt: string | null = null;

    if (user.trialEndsAt) {
      if (now < user.trialEndsAt) {
        trialStatus = "active";
        trialDaysLeft = Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        trialEndsAt = user.trialEndsAt.toISOString();
      } else {
        trialStatus = "expired";
      }
    }

    // Determine access level
    let hasAccess = false;
    let accessReason: string = "none";

    if (activeSub) {
      hasAccess = true;
      accessReason = "subscription";
    } else if (trialStatus === "active") {
      hasAccess = true;
      accessReason = "trial";
    }
    // NOTE: a "pending" subscription means payment is not confirmed yet —
    // it must not grant access by itself (matches the hardened Express route).

    // Parse selected hubs (corrupted value must not 500 every request)
    let selectedHubs: string[] = [];
    try {
      selectedHubs = user.selectedHubs ? JSON.parse(user.selectedHubs) : [];
      if (!Array.isArray(selectedHubs)) selectedHubs = [];
    } catch {
      selectedHubs = [];
    }

    // Build module access map
    // Plan-tier gating:
    //  - Workers management is a Growth/Enterprise feature.
    //  - Starter = 1 hub of choice (its modules + always-included ones).
    //  - Growth/Enterprise = all hubs.
    // Trial users keep full access so they can evaluate everything.
    const planId = (activeSub?.plan || "").toLowerCase();
    const isGrowthOrEnterprise = /growth|enterprise/.test(planId);
    const isStarter = /starter/.test(planId) && hasAccess;

    const moduleAccess: Record<string, boolean> = {};
    for (const [module, hub] of Object.entries(MODULE_HUB_MAP)) {
      // Hard lock: no active subscription AND no trial time left = EVERY module
      // is locked (padlock in the sidebar). Mirrors the Express route.
      if (!hasAccess) {
        moduleAccess[module] = false;
        continue;
      }
      if (module === "workers") {
        moduleAccess[module] = trialStatus === "active" || (activeSub != null && isGrowthOrEnterprise);
      } else if (hub === "_always" || (activeSub != null && isGrowthOrEnterprise)) {
        moduleAccess[module] = true;
      } else if (isStarter) {
        moduleAccess[module] = selectedHubs.includes(hub);
      } else if (hasAccess && selectedHubs.includes(hub)) {
        moduleAccess[module] = true;
      } else if (hasAccess && accessReason === "subscription") {
        // Subscription gives access to all modules based on plan
        moduleAccess[module] = true;
      } else {
        moduleAccess[module] = false;
      }
    }

    // Subscription details
    const subscription = activeSub
      ? {
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

    return NextResponse.json({
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
    return NextResponse.json({ error: "Failed to get trial status" }, { status: 500 });
  }
}
