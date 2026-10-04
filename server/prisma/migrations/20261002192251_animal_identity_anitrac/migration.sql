-- Animal identity / ANITRAC traceability.
--
-- Kenya rolled out ANITRAC (Animal Identification and Traceability System) in
-- July 2026: every cattle, sheep and goat carries a 15-digit number beginning
-- with the 141 country prefix (visual tag left ear, RFID right ear).
--
-- This is a purely ADDITIVE change so that existing flock-based production
-- keeps working untouched. Flock.currentCount remains the daily source of
-- truth; an Animal row is optional detail that a farmer sets up ONCE and then
-- only ever views. The farmer never manages animals individually day to day.
CREATE TABLE "animals" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "flock_id" INTEGER,
    "tag_number" TEXT NOT NULL,
    "species" TEXT,
    "breed" TEXT,
    "sex" TEXT,
    "birth_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- One tag number per farm: a farmer cannot register the same ear tag twice.
CREATE UNIQUE INDEX "animals_farm_id_tag_number_key" ON "animals"("farm_id", "tag_number");
CREATE INDEX "animals_farm_id_status_idx" ON "animals"("farm_id", "status");
CREATE INDEX "animals_flock_id_idx" ON "animals"("flock_id");

ALTER TABLE "animals" ADD CONSTRAINT "animals_farm_id_fkey"
    FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "animals" ADD CONSTRAINT "animals_flock_id_fkey"
    FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A vaccination may optionally target ONE specific animal instead of the whole
-- flock. Null = flock-level (all existing behaviour preserved).
ALTER TABLE "vaccinations" ADD COLUMN "animal_id" INTEGER;

CREATE INDEX "vaccinations_animal_id_idx" ON "vaccinations"("animal_id");

ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_animal_id_fkey"
    FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
