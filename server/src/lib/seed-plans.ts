import { prisma } from "../db.js";

/**
 * Seed the plans table — the pricing source of truth.
 * Runs on server boot: creates missing plans, refreshes amounts from the
 * current defaults ONLY if the plan row doesn't exist yet. Once a plan row
 * exists, the DB wins — code changes never silently overwrite pricing.
 */
const DEFAULT_PLANS = [
  { id: "starter_monthly",  name: "Starter Monthly",      description: "Starter plan - KES 950/month",                                amount:   95000, days:  30, sortOrder: 1 },
  { id: "starter_annual",   name: "Starter Annual",       description: "Starter plan - KES 7,600/year (save 33% · 4 months free)",    amount:  760000, days: 365, sortOrder: 2 },
  { id: "starter_season",   name: "Starter Season Pass",  description: "Starter plan - KES 2,400 for 90 days (season pass)",          amount:  240000, days:  90, sortOrder: 3 },
  { id: "growth_monthly",   name: "Growth Monthly",       description: "Growth plan - KES 2,900/month",                               amount:  290000, days:  30, sortOrder: 4 },
  { id: "growth_annual",    name: "Growth Annual",        description: "Growth plan - KES 23,200/year (save 33% · 4 months free)",   amount: 2320000, days: 365, sortOrder: 5 },
  { id: "growth_season",    name: "Growth Season Pass",   description: "Growth plan - KES 7,500 for 90 days (season pass)",           amount:  750000, days:  90, sortOrder: 6 },
  { id: "growth_60day",     name: "Growth 60-Day Pass",   description: "Growth plan - KES 5,200 for 60 days (harvest season pass)",   amount:  520000, days:  60, sortOrder: 7 },
  { id: "growth_120day",    name: "Growth 120-Day Pass",  description: "Growth plan - KES 9,800 for 120 days (harvest + sales pass)", amount:  980000, days: 120, sortOrder: 8 },
];

export async function seedPlans() {
  try {
    for (const plan of DEFAULT_PLANS) {
      await prisma.plan.upsert({
        where: { id: plan.id },
        update: {
          name: plan.name,
          description: plan.description,
          amount: plan.amount,
          days: plan.days,
          sortOrder: plan.sortOrder,
        },
        create: plan,
      });
    }
    console.log("✓ Plans seeded");
  } catch (err) {
    // Don't crash the server if seeding fails (e.g. migration not applied yet)
    console.error("Plan seeding failed:", err instanceof Error ? err.message : err);
  }
}
