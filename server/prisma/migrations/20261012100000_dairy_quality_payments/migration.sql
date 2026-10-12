-- Farmer-requested gaps (docs/farmer-requested-gaps.md §6 items 1, 2 and 5) —
-- all three are columns on tables that already exist. Strictly additive: every
-- column is nullable or defaulted, so no existing row changes shape and no
-- existing query breaks. A farmer who never touches these fields sees nothing.

-- ── A1: milk quality on a co-op delivery ────────────────────────────────────
-- The QBMP parameters exactly as a co-op slip shows them, plus who graded the
-- sample (the co-op's own analyser vs the farmer's record of it). Never
-- asserted — storage only, because band pricing is the co-op's term.
ALTER TABLE "deliveries" ADD COLUMN "fat_pct"        DECIMAL(5,2);
ALTER TABLE "deliveries" ADD COLUMN "snf_pct"        DECIMAL(5,2);
ALTER TABLE "deliveries" ADD COLUMN "density"        DECIMAL(5,3);
ALTER TABLE "deliveries" ADD COLUMN "added_water_pct" DECIMAL(5,2);
ALTER TABLE "deliveries" ADD COLUMN "tpc"            INTEGER;
ALTER TABLE "deliveries" ADD COLUMN "graded_by"      TEXT;

-- ── C1: when the money should have arrived ─────────────────────────────────
-- "Unpaid for three months" is only expressible with a date to measure from.
-- Null = the buyer promised no date, so no arrears clock and no fake guilt.
ALTER TABLE "deliveries" ADD COLUMN "pay_by" DATE;

-- ── C1: who a deduction is deducted for ─────────────────────────────────────
-- The co-op deducts for itself, for an agrovet, and for the farmer's own SACCO
-- loan. Without a creditor, the statement cannot tell the farmer which of
-- those three took their money — and that distinction is the argument.
ALTER TABLE "delivery_deductions" ADD COLUMN "creditor" TEXT;

-- ── A2: per-cow milk yield — its own table, not a nullable column ─────────
-- A nullable `animal_id` on daily_production was tried and reverted: that
-- table's unique key is (flock_id, date) and the daily ritual upserts against
-- it. Widening the key with a nullable column would stop guarding the
-- flock-level rows entirely — PostgreSQL treats NULLs as distinct in a unique
-- index, so every flock upsert would start INSERTing duplicates rather than
-- updating. Every column here is NOT NULL or defaulted, so the key holds.
-- The flock total stays the single daily fact; this is detail on top of it.
CREATE TABLE "animal_production" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "animal_id" INTEGER NOT NULL,
    "flock_id" INTEGER,
    "date" DATE NOT NULL,
    "session" TEXT NOT NULL DEFAULT 'full_day',
    "milk_litres" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "recorded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_production_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "animal_production" ADD CONSTRAINT "animal_production_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "animal_production" ADD CONSTRAINT "animal_production_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "animal_production" ADD CONSTRAINT "animal_production_flock_id_fkey" FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One row per cow per day per milking: a re-entry corrects the morning figure
-- instead of adding a second one.
CREATE UNIQUE INDEX "animal_production_animal_id_date_session_key" ON "animal_production"("animal_id", "date", "session");
CREATE INDEX "animal_production_farm_id_date_idx" ON "animal_production"("farm_id", "date");
CREATE INDEX "animal_production_flock_id_date_idx" ON "animal_production"("flock_id", "date");

-- ── A5/A3 groundwork: a calf is an Animal with a mother ────────────────────
-- damId turns the breeding record's offspringAlive count into actual animals,
-- so calf rearing and calf mortality become recordable without a new model.
ALTER TABLE "animals" ADD COLUMN "dam_id" INTEGER;
ALTER TABLE "animals" ADD CONSTRAINT "animals_dam_id_fkey"
  FOREIGN KEY ("dam_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "animals_dam_id_idx" ON "animals"("dam_id");
