import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { JWT_SECRET } from "./auth.js";
import { trialEndDate } from "../lib/config.js";

/**
 * Plan-tier gate for farm modules.
 *
 * The /api/trial/status endpoint computes moduleAccess for the sidebar, but
 * that's only cosmetic — a Starter user could call Growth APIs directly. This
 * middleware enforces the same rules on the server, per request:
 *
 *   - Trial (active)          → everything unlocked (evaluation)
 *   - Growth / Enterprise     → everything unlocked
 *   - Starter                 → chosen hubs' modules + always-included ones
 *   - No sub + trial expired  → 403
 *
 * It decodes the JWT itself (routers apply authMiddleware internally, so
 * req.user isn't populated yet when a global gate would run). Results are
 * cached per-user for 30s so the extra queries stay cheap.
 *
 * Workers: gated on the farm owner's plan (module access is a farm-level
 * concept — a Starter farm's workers get Starter modules).
 */

// Mirrors MODULE_HUB_MAP in routes/trial.ts — keep in sync.
const MODULE_HUB_MAP: Record<string, string> = {
  production: "livestock",
  vaccinations: "livestock",
  livestock: "livestock",
  flocks: "livestock",
  breeding: "livestock",
  crops: "crops",
  profitability: "crops",
  finances: "_always",
  transactions: "finances",
  sales: "sales",
  customers: "sales",
  invoices: "sales",
  deliveries: "sales",
  documents: "sales",
  workers: "team",
  attendance: "team",
  inventory: "_always",
  dashboard: "_always",
};

// URL prefix → module key. Longer prefixes first so overlaps resolve correctly.
const ROUTE_MODULE: [string, string][] = [
  ["/api/production", "production"],
  ["/api/vaccinations", "vaccinations"],
  ["/api/breeding", "breeding"],
  ["/api/flocks", "flocks"],
  ["/api/profitability", "profitability"],
  ["/api/crops", "crops"],
  ["/api/sales", "sales"],
  ["/api/customers", "customers"],
  ["/api/invoices", "invoices"],
  ["/api/quotes", "invoices"],
  ["/api/deliveries", "deliveries"],
  ["/api/documents", "documents"],
  ["/api/transactions", "transactions"],
  ["/api/workers", "workers"],
  ["/api/attendance", "attendance"],
  ["/api/zkteco", "attendance"],
  ["/api/worker", "attendance"],
  ["/api/inventory", "inventory"],
  ["/api/dashboard", "dashboard"],
];

interface PlanContext {
  ok: boolean;
  allowed: boolean;
  reason: "trial" | "subscription" | "no-access" | "unauthorized";
  planId?: string;
  module?: string;
}

interface Identity {
  userId: number;
  workerId?: number;
  farmId?: number | null;
}

const ctxCache = new Map<number, { ctx: PlanContext; hubs: string[]; at: number }>();
const CACHE_TTL_MS = 30_000;

function cached(userId: number): { ctx: PlanContext; hubs: string[] } | null {
  const hit = ctxCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ctx: hit.ctx, hubs: hit.hubs };
  return null;
}

async function resolveContext(identity: Identity): Promise<{ ctx: PlanContext; hubs: string[] }> {
  // Workers are gated on the farm owner's plan.
  let userId = identity.userId;
  if (identity.workerId) {
    const w = await prisma.worker.findUnique({
      where: { id: identity.workerId },
      select: { status: true, farmId: true },
    });
    if (!w || w.status !== "active") {
      return { ctx: { ok: false, allowed: false, reason: "unauthorized" }, hubs: [] };
    }
    const farm = await prisma.farm.findUnique({ where: { id: w.farmId }, select: { ownerId: true } });
    if (!farm) return { ctx: { ok: false, allowed: false, reason: "unauthorized" }, hubs: [] };
    userId = farm.ownerId;
  }

  const hit = cached(userId);
  if (hit) return hit;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialEndsAt: true, createdAt: true, selectedHubs: true },
  });
  if (!user) return { ctx: { ok: false, allowed: false, reason: "unauthorized" }, hubs: [] };

  const now = new Date();
  const trialEndsAt = user.trialEndsAt || (user.createdAt ? trialEndDate(user.createdAt) : null);
  const trialActive = trialEndsAt ? now < trialEndsAt : false;

  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: "active", expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
  });

  let hubs: string[] = [];
  try {
    const parsed = user.selectedHubs ? JSON.parse(user.selectedHubs) : [];
    if (Array.isArray(parsed)) hubs = parsed.map(String);
  } catch {
    hubs = [];
  }

  let ctx: PlanContext;
  if (trialActive) {
    ctx = { ok: true, allowed: true, reason: "trial" };
  } else if (!activeSub) {
    ctx = { ok: true, allowed: false, reason: "no-access" };
  } else {
    ctx = { ok: true, allowed: false, reason: "subscription", planId: (activeSub.plan || "").toLowerCase() };
  }

  ctxCache.set(userId, { ctx, hubs, at: Date.now() });
  if (ctxCache.size > 2000) {
    const first = ctxCache.keys().next().value;
    if (first !== undefined) ctxCache.delete(first);
  }
  return { ctx, hubs };
}

function moduleAllowed(ctx: PlanContext, hubs: string[], module: string): boolean {
  if (ctx.reason === "trial") return true;
  if (ctx.reason !== "subscription" || !ctx.planId) return false;
  const isGrowthOrEnterprise = /growth|enterprise/.test(ctx.planId);
  if (isGrowthOrEnterprise) return true;
  const isStarter = /starter/.test(ctx.planId);
  const hub = MODULE_HUB_MAP[module] || "_always";
  if (hub === "_always") return true;
  // Starter: chosen hubs only. Workers/team is a Growth+ feature even if
  // somehow selected as a hub.
  return isStarter && hub !== "team" && hubs.includes(hub);
}

export function planGate(req: Request, res: Response, next: NextFunction) {
  const url = req.originalUrl || req.url || "";
  // Public endpoints that happen to share a gated prefix (customer quote
  // responses, email click tracking) are never plan-gated.
  if (url.startsWith("/api/quotes-public") || url.startsWith("/api/track")) return next();
  const module = ROUTE_MODULE.find(([p]) => url.startsWith(p))?.[1];
  if (!module) return next(); // not a gated route

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let identity: Identity;
  try {
    identity = jwt.verify(token, JWT_SECRET) as Identity;
    if (!identity || (!identity.userId && !identity.workerId)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } catch {
    // Let the router's authMiddleware produce the canonical 401.
    return next();
  }

  resolveContext(identity)
    .then(({ ctx, hubs }) => {
      if (!ctx.ok) return res.status(401).json({ error: "Unauthorized" });
      if (moduleAllowed(ctx, hubs, module)) return next();
      return res.status(403).json({
        error:
          ctx.reason === "no-access"
            ? "Your trial has expired. Please subscribe to continue using Wangari."
            : `The ${module} module is not included in your current plan${ctx.planId ? ` (${ctx.planId.replace(/_/g, " ")})` : ""}. Upgrade to unlock it.`,
        moduleLocked: true,
        module,
        upgradeRequired: true,
      });
    })
    .catch((err) => {
      console.error("Plan gate error:", err);
      // Fail open on infra errors so a DB hiccup never locks paying farmers
      // out of their data; authMiddleware still ran/will run.
      next();
    });
}
