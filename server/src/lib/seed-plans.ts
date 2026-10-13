import { prisma } from "../db.js";

/**
 * Seed the plans table — the pricing source of truth.
 * Runs on server boot: creates missing plans, refreshes amounts from the
 * current defaults ONLY if the plan row doesn't exist yet. Once a plan row
 * exists, the DB wins — code changes never silently overwrite pricing.
 */
const DEFAULT_PLANS = [
  { id: "starter_monthly",  name: "Starter Monthly",      description: "Starter plan - KES 1,500/month",                               amount:  150000, days:  30, sortOrder: 1 },
  { id: "starter_annual",   name: "Starter Annual",       description: "Starter plan - KES 8,040/year (save 33% · 4 months free)",     amount:  804000, days: 365, sortOrder: 2 },
  { id: "growth_monthly",   name: "Growth Monthly",       description: "Growth plan - KES 4,500/month",                                amount:  450000, days:  30, sortOrder: 3 },
  { id: "growth_annual",    name: "Growth Annual",        description: "Growth plan - KES 24,120/year (save 33% · 4 months free)",     amount: 2412000, days: 365, sortOrder: 4 },
  // Seasonal harvest passes — one M-Pesa payment, no monthly reminders.
  { id: "growth_60day",     name: "Growth 60-Day Pass",   description: "Growth plan - KES 9,000 for 60 days (harvest season pass)",    amount:  900000, days:  60, sortOrder: 5 },
  { id: "growth_120day",    name: "Growth 120-Day Pass",  description: "Growth plan - KES 16,000 for 120 days (harvest + sales pass)", amount: 1600000, days: 120, sortOrder: 6 },
];

export async function seedPlans() {
  try {
    for (const plan of DEFAULT_PLANS) {
      await prisma.plan.upsert({
        where: { id: plan.id },
        update: {}, // DB row wins — never overwrite admin-edited pricing
        create: plan,
      });
    }
    console.log("✓ Plans seeded");
  } catch (err) {
    // Don't crash the server if seeding fails (e.g. migration not applied yet)
    console.error("Plan seeding failed:", err instanceof Error ? err.message : err);
  }
}
