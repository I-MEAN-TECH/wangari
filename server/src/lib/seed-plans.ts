import { prisma } from "../db.js";

/**
 * Seed the plans table — the pricing source of truth.
 *
 * Runs on server boot. The rule is: **the DB wins**. Code only creates
 * missing rows; existing rows are never overwritten, so admin edits
 * (renames, price changes, seasonal promos set directly in the admin
 * console) survive deploys.
 *
 * If a new plan id is added to DEFAULT_PLANS, the next boot creates the
 * row with the code defaults — that's the one case code wins, because
 * there is no admin row yet to preserve.
 */
const DEFAULT_PLANS = [
  { id: "starter_monthly",  name: "Starter Monthly",      description: "Starter plan - KES 950/month",                                amount:   95000, days:  30, sortOrder: 1, active: true },
  { id: "starter_annual",   name: "Starter Annual",       description: "Starter plan - KES 7,600/year (save 33% · 4 months free)",    amount:  760000, days: 365, sortOrder: 2, active: true },
  { id: "starter_season",   name: "Starter Season Pass",  description: "Starter plan - KES 2,400 for 90 days (season pass)",          amount:  240000, days:  90, sortOrder: 3, active: true },
  { id: "growth_monthly",   name: "Growth Monthly",       description: "Growth plan - KES 2,900/month",                               amount:  290000, days:  30, sortOrder: 4, active: true },
  { id: "growth_annual",    name: "Growth Annual",        description: "Growth plan - KES 23,200/year (save 33% · 4 months free)",   amount: 2320000, days: 365, sortOrder: 5, active: true },
  { id: "growth_season",    name: "Growth Season Pass",   description: "Growth plan - KES 7,500 for 90 days (season pass)",           amount:  750000, days:  90, sortOrder: 6, active: true },
  { id: "growth_60day",     name: "Growth 60-Day Pass",   description: "Growth plan - KES 5,200 for 60 days (harvest season pass)",   amount:  520000, days:  60, sortOrder: 7, active: true },
  { id: "growth_120day",    name: "Growth 120-Day Pass",  description: "Growth plan - KES 9,800 for 120 days (harvest + sales pass)", amount:  980000, days: 120, sortOrder: 8, active: true },
];

export async function seedPlans() {
  try {
    for (const plan of DEFAULT_PLANS) {
      // createOnly: if the plan already exists, do nothing. Admin edits win.
      // If the plan id is new (e.g. a fresh season pass), the row is created
      // with the code defaults — no way to skip it, the row is needed.
      const existing = await prisma.plan.findUnique({ where: { id: plan.id }, select: { id: true } });
      if (existing) continue;
      await prisma.plan.create({ data: plan });
      console.log(`✓ Plans seeded new: ${plan.id}`);
    }
    console.log("✓ Plans seed complete");
  } catch (err) {
    // Don't crash the server if seeding fails (e.g. migration not applied yet)
    console.error("Plan seeding failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * One-time boot migration: drop the 14-day "trial" window from every user
 * who does not currently have an active subscription. The product moved to
 * a perpetual "Core" free tier; any signup that landed before this change
 * got `trialEndsAt = now + 14d` written into the user row, and that value
 * was the only thing that distinguished "free trial" from "free core". The
 * operator is re-issuing promos for the people who need paid time, so old
 * trial starts carry no meaning anymore.
 *
 * Idempotent: the WHERE matches users with a non-null trialEndsAt AND no
 * live subscription. After the first successful run, the count is 0 and
 * every subsequent boot is a no-op.
 *
 * Leaves existing `Subscription` rows untouched — those are the canonical
 * record of what the user paid / was sponsored for, and the operator
 * issues new promos by inserting new Subscription rows, not by mutating
 * this User field.
 */
export async function migrateFreeCoreOnBoot(): Promise<void> {
  try {
    const now = new Date();
    // Find candidate users: anyone with a non-null trialEndsAt and no
    // currently-active subscription. We fetch ids first so the update is
    // a single bulk query.
    const candidates = await prisma.user.findMany({
      where: {
        trialEndsAt: { not: null },
        subscriptions: {
          none: { status: "active", expiresAt: { gt: now } },
        },
      },
      select: { id: true },
    });
    if (candidates.length === 0) {
      console.log("✓ Free-core migration: no users to update (idempotent)");
      return;
    }
    const result = await prisma.user.updateMany({
      where: { id: { in: candidates.map((u) => u.id) } },
      data: { trialEndsAt: null, trialStartsAt: null },
    });
    console.log(`✓ Free-core migration: cleared trialEndsAt for ${result.count} user(s)`);
  } catch (err) {
    // Don't crash the server if the migration fails (e.g. column not yet
    // present in an older DB) — first-time error gets logged and the boot
    // continues. The cron-free path leaves the user on free-core regardless
    // of trialEndsAt anyway.
    console.error("Free-core migration failed:", err instanceof Error ? err.message : err);
  }
}
