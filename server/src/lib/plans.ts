import { prisma } from "../db.js";

export interface PlanConfig {
  id: string;
  name: string;
  description: string | null;
  amount: number; // pesewas
  days: number;
}

// Compile-time fallback ONLY used when the DB has no plans (fresh deploys
// before seeding). Once seeded, the DB is the single source of truth.
const FALLBACK: Record<string, PlanConfig> = {
  starter_monthly: { id: "starter_monthly", name: "Starter Monthly", description: "Starter plan - KES 950/month", amount: 95000, days: 30 },
  starter_annual: { id: "starter_annual", name: "Starter Annual", description: "Starter plan - KES 7,600/year (save 33% · 4 months free)", amount: 760000, days: 365 },
  starter_season: { id: "starter_season", name: "Starter Season Pass", description: "Starter plan - KES 2,400 for 90 days (season pass)", amount: 240000, days: 90 },
  growth_monthly: { id: "growth_monthly", name: "Growth Monthly", description: "Growth plan - KES 2,900/month", amount: 290000, days: 30 },
  growth_annual: { id: "growth_annual", name: "Growth Annual", description: "Growth plan - KES 23,200/year (save 33% · 4 months free)", amount: 2320000, days: 365 },
  growth_season: { id: "growth_season", name: "Growth Season Pass", description: "Growth plan - KES 7,500 for 90 days (season pass)", amount: 750000, days: 90 },
  enterprise_monthly: { id: "enterprise_monthly", name: "Enterprise Monthly", description: "Enterprise plan - KES 12,000/month", amount: 1200000, days: 30 },
  enterprise_annual: { id: "enterprise_annual", name: "Enterprise Annual", description: "Enterprise plan - KES 96,000/year", amount: 9600000, days: 365 },
};

export async function getPlan(planId: string): Promise<PlanConfig | null> {
  try {
    const row = await prisma.plan.findFirst({ where: { id: planId, active: true } });
    if (row) {
      return { id: row.id, name: row.name, description: row.description, amount: row.amount, days: row.days };
    }
  } catch (err) {
    console.error("Plan lookup failed, using fallback:", err instanceof Error ? err.message : err);
  }
  return FALLBACK[planId] || null;
}

export async function getActivePlans(): Promise<PlanConfig[]> {
  try {
    const rows = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    if (rows.length > 0) {
      return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, amount: r.amount, days: r.days }));
    }
  } catch (err) {
    console.error("Plan list failed, using fallback:", err instanceof Error ? err.message : err);
  }
  return Object.values(FALLBACK);
}
