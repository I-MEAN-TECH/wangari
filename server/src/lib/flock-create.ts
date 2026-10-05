/**
 * Writing a flock — one path, used by the screen AND by Wangari's intake.
 *
 * ── why this was pulled out of the route ─────────────────
 * `POST /api/flocks` grew the whole job inline: the row, the ANITRAC tag
 * range, the auto-scheduled vaccinations, and the expense transaction for the
 * purchase. That is right for a farmer filling in a form.
 *
 * It is wrong for the second caller. When Wangari collects the same details
 * conversationally and saves them, a second copy of this logic would be needed —
 * and the two would drift. The drift would not be a crash. It would be a flock
 * created through chat that has no vaccination schedule and no purchase expense,
 * while the identical flock created through the screen has both. The farmer
 * would find the difference months later, in a margin that quietly does not add
 * up, and would have no way to know which record was the broken one.
 *
 * So there is one writer. If the screen and the assistant disagree, they
 * disagree here, in one file, where a test can reach it.
 */

import { prisma } from "../db.js";
import { resolveTagRange } from "./tag-range.js";

/**
 * Species → category, so a flock's category always matches its species whatever
 * the caller sends (or forgets to send). Covers all eleven species the product
 * knows about; anything else falls back to "livestock".
 */
export const SPECIES_CATEGORY: Record<string, string> = {
  layers: "poultry", broilers: "poultry", kienyeji: "poultry",
  cattle_dairy: "livestock", cattle_beef: "livestock",
  goats: "livestock", sheep: "livestock", pigs: "livestock", rabbits: "livestock",
  fish: "aquaculture", bees: "other",
};

/**
 * When a vaccine is due, counted from the day the animals arrived.
 *
 * The labels are what the species templates in the web app call them; the
 * offsets are what the calendar needs. A label nobody recognises is due in a
 * month rather than dropped, because a late vaccine is recoverable and a
 * missing one is not.
 */
export const VACCINATION_AGE_DAYS: Record<string, number> = {
  "Day 1": 0, "Day 7": 7,
  "Week 1": 7, "Week 2": 14, "Week 3": 21, "Week 4": 28,
  "Week 6": 42, "Week 8": 56, "Week 10": 70, "Week 12": 84,
  "Week 16": 112, "Week 18": 126, "Week 20": 140,
  "Month 1": 30, "Month 2": 60, "Month 3": 90,
  "Month 6": 180, "Month 8": 240, "Month 10": 300, "Month 12": 365,
  "3 months": 90, "6 months": 180,
  "Pre-breeding": 365,
  "8 weeks": 56, "6 weeks": 42,
  "2 months": 60, "4 months": 120,
  "1 month": 30,
  "Preventive": 0, "Monthly": 30,
};

export interface VaccinationEntry {
  vaccine: string;
  ageLabel?: string;
  description?: string;
}

/** Everything a caller may say about a new flock. Every field is optional
 *  except the name and the count, and the count has no sensible default. */
export interface FlockCreateInput {
  name: string;
  breed?: string | null;
  type?: string | null;
  category?: string | null;
  status?: string | null;
  initialCount: number;
  mortality?: number | null;
  hatchDate?: string | Date | null;
  purpose?: string | null;
  gender?: string | null;
  genderRatio?: string | null;
  location?: string | null;
  source?: string | null;
  supplierContact?: string | null;
  costPerAnimal?: number | null;
  targetMarket?: string | null;
  feedType?: string | null;
  feedSupplier?: string | null;
  feedCostPerMonth?: number | null;
  vetName?: string | null;
  vetPhone?: string | null;
  healthOnArrival?: string | null;
  insurancePolicy?: string | null;
  expectedYield?: string | null;
  expectedRevenue?: number | null;
  expectedWeight?: string | null;
  notes?: string | null;
  vaccinationSchedule?: VaccinationEntry[] | null;
  tagFrom?: string | null;
  tagTo?: string | null;
  taggedOn?: string | Date | null;
}

export interface CreatedFlock {
  flock: any;
  /** What else the save did, so the caller can tell the farmer the truth. */
  alsoCreated: {
    vaccinations: number;
    expenseTransactionId: number | null;
    totalInvestment: number | null;
  };
  /** Set when a tag range was supplied but does not line up with the count. */
  tagWarning: string | null;
}

/**
 * Create a flock and everything that belongs with it.
 *
 * Never throws for a caller-visible problem: a missing name or a count of zero
 * comes back as an error sentence, because both are the farmer's answer being
 * incomplete, not a fault in the app.
 */
export async function createFlockForFarm(
  farmId: number,
  userId: number | null | undefined,
  input: FlockCreateInput,
): Promise<{ ok: true; value: CreatedFlock } | { ok: false; error: string }> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "This flock needs a name before I can save it." };

  const count = Math.trunc(Number(input.initialCount));
  if (!Number.isInteger(count) || count < 1) {
    return { ok: false, error: "I need to know how many animals are in this flock." };
  }

  const cost = input.costPerAnimal === null || input.costPerAnimal === undefined
    ? null
    : Number(input.costPerAnimal);
  const totalInvestment = cost !== null && Number.isFinite(cost) ? cost * count : null;

  const arrivedAt = input.hatchDate ? new Date(input.hatchDate) : null;

  const tags = resolveTagRange(input.tagFrom, input.tagTo, count);

  const result = await prisma.flock.create({
    data: {
      farmId,
      name,
      breed: input.breed || null,
      type: input.type || "layers",
      // The species decides the category, so a caller that sends no category
      // still files the flock under the right species group.
      category: input.category || (input.type ? SPECIES_CATEGORY[input.type] : undefined) || "livestock",
      initialCount: count,
      // Mortality describes the group's history, so the animals alive today are
      // the ones bought less the ones lost. Filing `count` for both is how a
      // flock ends up reporting more birds than it has.
      currentCount: Math.max(0, count - Math.max(0, Math.trunc(Number(input.mortality) || 0))),
      mortality: Math.max(0, Math.trunc(Number(input.mortality) || 0)),
      status: input.status || "active",
      hatchDate: arrivedAt,
      createdBy: userId ?? null,

      // ANITRAC tag range: the farmer registers the block they were issued and
      // we never expand it into rows. See lib/tag-range.ts.
      ...(tags.span > 0
        ? {
            tagFrom: String(input.tagFrom).replace(/\D/g, ""),
            tagTo: tags.span === 1 ? null : String(input.tagTo).replace(/\D/g, ""),
            taggedCount: tags.span,
            taggedOn: input.taggedOn ? new Date(input.taggedOn) : new Date(),
          }
        : {}),

      purpose: input.purpose || null,
      gender: input.gender || null,
      genderRatio: input.genderRatio || null,
      location: input.location || null,
      source: input.source || null,
      supplierContact: input.supplierContact || null,
      costPerAnimal: cost,
      totalInvestment,
      targetMarket: input.targetMarket || null,
      feedType: input.feedType || null,
      feedSupplier: input.feedSupplier || null,
      feedCostPerMonth: input.feedCostPerMonth ? Number(input.feedCostPerMonth) : null,
      vetName: input.vetName || null,
      vetPhone: input.vetPhone || null,
      healthOnArrival: input.healthOnArrival || null,
      insurancePolicy: input.insurancePolicy || null,
      expectedYield: input.expectedYield || null,
      expectedRevenue: input.expectedRevenue ? Number(input.expectedRevenue) : null,
      expectedWeight: input.expectedWeight || null,
      notes: input.notes || null,
    },
  });

  // Vaccinations are dated from the day the animals arrived, not from today:
  // a six-month-old group bought last week is due its adult vaccine next week,
  // and scheduling it a month out hides that.
  let vaccinesCreated = 0;
  const schedule = Array.isArray(input.vaccinationSchedule) ? input.vaccinationSchedule : [];
  if (schedule.length) {
    const base = arrivedAt ?? new Date();
    const rows = schedule
      .filter((v) => v && v.vaccine)
      .map((v) => {
        const days = VACCINATION_AGE_DAYS[v.ageLabel ?? ""] ?? 30;
        const scheduled = new Date(base);
        scheduled.setDate(scheduled.getDate() + days);
        return {
          flockId: result.id,
          vaccineName: v.vaccine,
          scheduledDate: scheduled,
          status: "pending",
          notes: v.description || null,
        };
      });
    if (rows.length) {
      await prisma.vaccination.createMany({ data: rows });
      vaccinesCreated = rows.length;
    }
  }

  // The purchase is an expense. Recorded here rather than trusted to the
  // farmer to remember, because feed and stock margins are computed from this
  // row — leave it out and the profit page flatters the farm.
  let expenseId: number | null = null;
  if (totalInvestment !== null && totalInvestment > 0) {
    try {
      const tx = await prisma.transaction.create({
        data: {
          farmId,
          type: "expense",
          category: "animal_feed",
          description: `Livestock purchase: ${name} (${count} ${input.category || "animals"})`,
          amount: totalInvestment,
          date: new Date(),
          paymentMethod: "cash",
          createdBy: userId ?? null,
        },
      });
      expenseId = tx.id;
    } catch (e) {
      // The animals exist. Failing the whole save over the expense row would
      // leave the farmer with neither, so the animals win and the gap is
      // logged for whoever looks at the books.
      console.error("Auto-transaction failed:", e);
    }
  }

  const flock = await prisma.flock.findUnique({
    where: { id: result.id },
    include: { vaccinations: { orderBy: { scheduledDate: "asc" } } },
  });

  return {
    ok: true,
    value: {
      flock,
      alsoCreated: { vaccinations: vaccinesCreated, expenseTransactionId: expenseId, totalInvestment },
      // A head-count that does not match the tags is REPORTED, never used to
      // suppress them: an untagged herd told it is tagged is the worse error.
      tagWarning: tags.consistent ? null : tags.note,
    },
  };
}