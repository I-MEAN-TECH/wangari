import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decodeToken } from "@/lib/jwt";

// All available modules and which hub they belong to
const MODULE_HUB_MAP: Record<string, string> = {
  livestock: "livestock",
  production: "livestock",
  vaccinations: "livestock",
  flocks: "livestock",
  animals: "livestock",
  breeding: "livestock",
  "health-records": "livestock",
  health: "livestock",
  "cold-chain": "livestock",
  crops: "crops",
  plots: "crops",
  planner: "crops",
  profitability: "crops",
  finances: "_always",
  transactions: "_always",
  deliveries: "_always",
  inventory: "_always",
  dashboard: "_always",
  weather: "_always",
  settings: "_always",
  learn: "_always",
  library: "_always",
  insurance: "finances",
  money: "finances",
  sales: "sales",
  customers: "sales",
  invoices: "sales",
  quotes: "sales",
  documents: "sales",
  "market-prices": "sales",
  "farm-record": "sales",
  kiamis: "sales",
  workers: "team",
  attendance: "team",
  coop: "team",
  loans: "team",
  reports: "team",
  "feed-calculator": "_always",
  ai: "_always",
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
    let hasAccess = true;
    let tier: "subscription" | "free_core" = "free_core";
    let accessReason = "free_core";

    if (activeSub) {
      hasAccess = true;
      tier = "subscription";
      accessReason = "subscription";
    } else {
      tier = "free_core";
      hasAccess = true;
      accessReason = "free_core";
    }

    // Parse selected hubs (corrupted value must not 500 every request)
    let selectedHubs: string[] = [];
    try {
      selectedHubs = user.selectedHubs ? JSON.parse(user.selectedHubs) : [];
      if (!Array.isArray(selectedHubs)) selectedHubs = [];
    } catch {
      selectedHubs = [];
    }

    // Build module access map
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

    // Subscription details
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

    return NextResponse.json({
      tier,
      status: activeSub ? "active" : "free_core",
      trial: {
        status: trialStatus,
        daysLeft: trialDaysLeft,
        endsAt: trialEndsAt,
      },
      subscription,
      hasAccess,
      locked: false,
      accessReason,
      selectedHubs,
      modules: moduleAccess,
    });
  } catch (error) {
    console.error("Trial status error:", error);
    return NextResponse.json({ error: "Failed to get trial status" }, { status: 500 });
  }
}
