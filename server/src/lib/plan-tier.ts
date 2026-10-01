import { prisma } from "../db.js";

/**
 * Central plan validation + tier helpers.
 *
 * The promo-plan incident (Oct 2026) showed plan strings can drift from the
 * real plans table — a subscription pointing at a stale/unknown plan id
 * silently got the wrong module access. Every code path that WRITES a plan
 * string into a subscription or promo must validate through here first.
 */

export type PlanTier = "starter" | "growth" | "enterprise" | "unknown";

export interface PlanInfo {
  id: string;
  name: string;
  amount: number; // pesewas
  days: number;
  active: boolean;
  tier: PlanTier;
}

export function tierOf(planId: string): PlanTier {
  const id = (planId || "").toLowerCase();
  if (/starter/.test(id)) return "starter";
  if (/enterprise/.test(id)) return "enterprise";
  if (/growth/.test(id)) return "growth";
  return "unknown";
}

export function isGrowthOrAbove(planId: string): boolean {
  const t = tierOf(planId);
  return t === "growth" || t === "enterprise";
}

/** Look a plan up in the DB (any row, active or not) with fallback known ids. */
export async function findPlan(planId: string): Promise<PlanInfo | null> {
  const id = String(planId || "").trim().toLowerCase();
  if (!id) return null;
  const row = await prisma.plan.findUnique({ where: { id } });
  if (row) {
    return { id: row.id, name: row.name, amount: row.amount, days: row.days, active: row.active, tier: tierOf(row.id) };
  }
  // Known legacy ids get sensible defaults so old data still resolves.
  const LEGACY: Record<string, { name: string; amount: number; days: number }> = {
    starter_monthly: { name: "Starter Monthly", amount: 150000, days: 30 },
    starter_annual: { name: "Starter Annual", amount: 1200000, days: 365 },
    growth_monthly: { name: "Growth Monthly", amount: 450000, days: 30 },
    growth_annual: { name: "Growth Annual", amount: 3600000, days: 365 },
  };
  const f = LEGACY[id];
  if (f) return { id, ...f, active: true, tier: tierOf(id) };
  return null;
}

/** Strict: the plan must exist AND be active — use for new purchases/grants. */
export async function requireActivePlan(planId: string): Promise<PlanInfo> {
  const plan = await findPlan(planId);
  if (!plan) {
    throw new PlanValidationError(`Unknown plan "${planId}"`);
  }
  if (!plan.active) {
    throw new PlanValidationError(`Plan "${plan.name}" is currently disabled`);
  }
  return plan;
}

export class PlanValidationError extends Error {
  status = 400;
}

/** Build the canonical "(sponsored)" style display name from a plan row. */
export function sponsoredName(plan: PlanInfo): string {
  return `${plan.name} (sponsored)`;
}
