import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { JWT_SECRET } from "./auth.js";

/**
 * Plan-tier gate for farm modules.
 *
 * The /api/trial/status endpoint computes moduleAccess for the sidebar, but
 * that's only cosmetic — a Starter user could call Growth APIs directly. This
 * middleware enforces the same rules on the server, per request:
 *
 *   - Growth / Enterprise     → everything unlocked
 *   - Starter                 → livestock, crops, sales, finances + always-included
 *   - Free Core (no sub)      → _always modules only (dashboard, finances, inventory, deliveries)
 *
 * It decodes the JWT itself (routers apply authMiddleware internally, so
 * req.user isn't populated yet when a global gate would run). Results are
 * cached per-user for 30s so the extra queries stay cheap.
 *
 * Workers: gated on the farm owner's plan (module access is a farm-level
 * concept — a Starter farm's workers get Starter modules).
 */

// The single table of "which module belongs to which plan hub". routes/trial.ts
// imports this rather than keeping a copy: two copies drift, and a drifted
// padlock is a farmer staring at a locked screen they were told they had.
export const MODULE_HUB_MAP: Record<string, string> = {
  production: "livestock",
  vaccinations: "livestock",
  livestock: "livestock",
  animals: "livestock",
  hives: "livestock",
  flocks: "livestock",
  breeding: "livestock",
  "health-records": "livestock",
  "cold-chain": "livestock",
  crops: "crops",
  plots: "crops",
  profitability: "crops",
  finances: "_always",
  transactions: "_always",
  deliveries: "_always",
  inventory: "_always",
  dashboard: "_always",
  weather: "_always",
  settings: "_always",
  learn: "_always",
  insurance: "finances",
  sales: "sales",
  customers: "sales",
  invoices: "sales",
  documents: "sales",
  "market-prices": "sales",
  "farm-record": "sales",
  kiamis: "sales",
  workers: "team",
  attendance: "team",
  coop: "team",
  loans: "team",
  reports: "team",
};

// URL prefix → module key. Longer prefixes first so overlaps resolve correctly.
const ROUTE_MODULE: [string, string][] = [
  ["/api/production", "production"],
  ["/api/vaccinations", "vaccinations"],
  ["/api/health-records", "health-records"],
  ["/api/breeding", "breeding"],
  ["/api/flocks", "flocks"],
  ["/api/animals", "animals"],
  ["/api/hives", "hives"],
  ["/api/cold-chain", "cold-chain"],
  ["/api/profitability", "profitability"],
  ["/api/crops", "crops"],
  ["/api/plots", "crops"],
  ["/api/scouting", "crops"],
  ["/api/input-vouchers", "crops"],
  ["/api/farm-loans", "finances"],
  ["/api/insurance", "insurance"],
  ["/api/reconciliation", "finances"],
  ["/api/cash-flow", "finances"],
  ["/api/savings", "finances"],
  ["/api/assets", "finances"],
  ["/api/sales", "sales"],
  ["/api/customers", "customers"],
  ["/api/invoices", "invoices"],
  ["/api/quotes", "invoices"],
  ["/api/deliveries", "deliveries"],
  ["/api/documents", "documents"],
  ["/api/market-prices", "market-prices"],
  ["/api/farm-record", "farm-record"],
  ["/api/kiamis", "kiamis"],
  ["/api/transactions", "transactions"],
  ["/api/workers", "workers"],
  ["/api/attendance", "attendance"],
  ["/api/zkteco", "attendance"],
  ["/api/worker", "attendance"],
  ["/api/coop", "coop"],
  ["/api/inventory", "inventory"],
  ["/api/dashboard", "dashboard"],
];

interface PlanContext {
  ok: boolean;
  allowed: boolean;
  reason: "subscription" | "free_core" | "unauthorized";
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
    select: { selectedHubs: true },
  });
  if (!user) return { ctx: { ok: false, allowed: false, reason: "unauthorized" }, hubs: [] };

  const now = new Date();

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
  if (!activeSub) {
    // Perpetual Free Core tier: No active subscription.
    // Core features (_always) stay open; all other modules are locked.
    ctx = { ok: true, allowed: false, reason: "free_core" };
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

// Exported for the plan-gate regression test: this pure function is the single
// rule, and both the 403s and the AI's refusals are derived from it.
export function moduleAllowed(ctx: PlanContext, hubs: string[], module: string): boolean {
  // Unauthorized identity: nothing is open, regardless of plan shape.
  // An "ok: false" ctx means resolveContext couldn't load the user (deleted
  // account, dormant worker) — the request must fail closed.
  if (!ctx.ok) return false;
  // Free-core: no active subscription. _always modules stay open (finances,
  // inventory, dashboard, deliveries, etc.). Everything else is locked — prompts upgrade.
  if (ctx.reason === "free_core" || !ctx.planId) {
    const hub = MODULE_HUB_MAP[module] || "_always";
    return hub === "_always";
  }
  if (ctx.reason !== "subscription" || !ctx.planId) return false;
  const isGrowthOrEnterprise = /growth|enterprise/.test(ctx.planId);
  if (isGrowthOrEnterprise) return true;
  const isStarter = /starter/.test(ctx.planId);
  const hub = MODULE_HUB_MAP[module] || "_always";
  if (hub === "_always") return true;

  // Starter: mixed farming (all livestock, crops, sales, finances, inventory).
  // Team / workers, attendance, coop, loans, reports are GROWTH ONLY.
  if (hub === "team" || module === "workers" || module === "attendance" || module === "coop" || module === "loans" || module === "reports") {
    return false;
  }
  return isStarter;
}

/**
 * May this user open `module`?
 *
 * Exported so the AI agent obeys the SAME rules as the screens rather than a
 * second copy. Two copies of the plan rules drift apart, and the farmer is the
 * one who finds out — as "the AI said it saved my chickens and the module is
 * empty".
 */
export async function isModuleAllowed(userId: number, module: string): Promise<boolean> {
  const { ctx, hubs } = await resolveContext({
    userId,
    role: "farm_owner",
    email: "",
  } as Identity);
  return moduleAllowed(ctx, hubs, module);
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
          ctx.reason === "free_core"
            ? `The ${module} module requires a subscription. Your finances and inventory stay free — subscribe to unlock the rest.`
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
