-- Scale fix for ANITRAC: a range, not a row per animal.
--
-- THE PROBLEM: Kenya does require every cow/sheep/goat to carry an ANITRAC
-- tag, but a farmer with 500 head must not type 500 numbers — and NTV's own
-- reporting names "cost and logistics of tagging and data entry for smallholder
-- farmers" as the barrier. Recording one row per animal does not survive 500.
--
-- THE FIX: a flock stores the tag RANGE it was issued (first..last) plus a
-- count. That is three numbers for five hundred animals. The individual tag
-- numbers are GENERATED on demand when a traceability list is needed, so we
-- never store 500 rows we would only read once.
--
-- The `animals` table is deliberately kept for the small number of animals that
-- genuinely need individual identity (sick, insured, pedigree, being sold, or
-- anything a single decision hinges on). Those remain one row each.
--
-- Also adds hive-level records for beekeeping: bees are never recorded
-- individually (a colony is tens of thousands of bees), and no beekeeper tags
-- them. A hive is the management unit, exactly as a flock is for poultry.

ALTER TABLE "flocks" ADD COLUMN "tag_from" TEXT;
ALTER TABLE "flocks" ADD COLUMN "tag_to" TEXT;
ALTER TABLE "flocks" ADD COLUMN "tagged_count" INTEGER;
ALTER TABLE "flocks" ADD COLUMN "tagged_on" TIMESTAMP(3);

-- ─── Beekeeping: the hive is the unit, not the bee ───────────────────────
CREATE TABLE "hives" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "hive_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "queen_year" INTEGER,
    "queen_status" TEXT,
    "frames" INTEGER,
    "location" TEXT,
    "established_on" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hives_farm_id_name_key" ON "hives"("farm_id", "name");
CREATE INDEX "hives_farm_id_status_idx" ON "hives"("farm_id", "status");

ALTER TABLE "hives" ADD CONSTRAINT "hives_farm_id_fkey"
    FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One inspection row per hive inspection: what the beekeeper actually looks at.
CREATE TABLE "hive_inspections" (
    "id" SERIAL NOT NULL,
    "hive_id" INTEGER NOT NULL,
    "inspected_at" TIMESTAMP(3) NOT NULL,
    "brood_frames" INTEGER,
    "stores_frames" INTEGER,
    "queen_seen" BOOLEAN,
    "queen_cells" INTEGER,
    "varroa_count" INTEGER,
    "honey_kg" DECIMAL(10,2),
    "action_taken" TEXT,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hive_inspections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hive_inspections_hive_id_idx" ON "hive_inspections"("hive_id");

ALTER TABLE "hive_inspections" ADD CONSTRAINT "hive_inspections_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;