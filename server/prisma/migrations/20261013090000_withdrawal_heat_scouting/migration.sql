-- Farmer-requested gaps (docs/farmer-requested-gaps.md) — A6, A4/A3 and B3.
-- All three are columns on tables that already exist. Strictly additive: every
-- new column is nullable, so no existing row changes shape and no existing query
-- breaks. A farmer who never touches these fields sees nothing new.

-- ── A6: the milk-withdrawal window after a treatment ───────────────────────
-- The one field whose absence turns a health record into a food-safety and
-- payment risk. Selling milk inside a withdrawal window gets a consignment
-- rejected (or worse, accepted and then traced back), and the farmer has no way
-- to see that they were inside it. Stored as the date the farmer was given —
-- never derived from a guessed drug half-life, because the vet's or the label's
-- number is the authority and ours would be a fiction presented as a fact.
ALTER TABLE "health_records" ADD COLUMN "withdrawal_until" DATE;
ALTER TABLE "health_records" ADD COLUMN "withdrawal_note" TEXT;

-- Partial index: the query this exists for is "which animals are in withdrawal
-- TODAY", which is a tiny slice of a table that grows forever. Indexing only the
-- non-null rows keeps it small and keeps the planner on it.
CREATE INDEX "health_records_withdrawal_until_idx"
  ON "health_records"("farm_id", "withdrawal_until")
  WHERE "withdrawal_until" IS NOT NULL;

-- ── A4/A3: heat, and the dry-off date ──────────────────────────────────────
-- `mating_date` becomes nullable so a heat observed BEFORE any service can live
-- on the same timeline. It is null for exactly one reason — no service has
-- happened yet — and the 21-day cycle from that date is what a farmer acts on.
ALTER TABLE "breeding_records" ALTER COLUMN "mating_date" DROP NOT NULL;

ALTER TABLE "breeding_records" ADD COLUMN "heat_observed_at" DATE;
ALTER TABLE "breeding_records" ADD COLUMN "heat_signs" TEXT;
-- When milking stopped ahead of the next calving. Days-in-milk and the dry
-- period are what a dairy farmer manages by, and neither is derivable from a
-- calving date alone.
ALTER TABLE "breeding_records" ADD COLUMN "dry_off_date" DATE;

CREATE INDEX "breeding_records_heat_observed_at_idx" ON "breeding_records"("farm_id", "heat_observed_at");

-- ── B3: structured pest scouting ───────────────────────────────────────────
-- "Severity: high" is a feeling. "14 of 50 plants infested" is a fact a farmer
-- can act on, compare with last week, and show a buyer. The two counts are what
-- make an incidence percentage computable without a second table.
ALTER TABLE "crop_health" ADD COLUMN "sample_size" INTEGER;
ALTER TABLE "crop_health" ADD COLUMN "affected_count" INTEGER;
-- larva | adult | egg | egg_mass — coffee berry borer and fall armyworm are
-- treated differently at different stages.
ALTER TABLE "crop_health" ADD COLUMN "pest_stage" TEXT;
-- A scouting record with no follow-up date is a diary entry. This is the loop.
ALTER TABLE "crop_health" ADD COLUMN "follow_up_on" DATE;

CREATE INDEX "crop_health_follow_up_on_idx" ON "crop_health"("farm_id", "follow_up_on");
