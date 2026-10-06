-- M2 — AnimalMovement ledger (ANITRAC §20: animal traceability and tracking).
--
-- Every off-farm / between-premises movement of a tagged animal: from, to,
-- date, reason, and the county movement permit reference when one exists.
-- The traceability chain for a buyer or county officer is built from these
-- rows on demand — never pre-computed, matching how tag ranges expand only
-- when the list is actually asked for.
--
-- Both premises ends are required (a movement with one end is a guess) but
-- everything else is optional: recording a movement must never be blocked on
-- paperwork the farmer may not have been given.
CREATE TABLE "animal_movements" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "animal_id" INTEGER NOT NULL,
    "from_premises" TEXT NOT NULL,
    "to_premises" TEXT NOT NULL,
    "moved_at" DATE NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'transfer',
    "permit_ref" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "animal_movements_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "animal_movements_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "animal_movements_farm_id_moved_at_idx" ON "animal_movements"("farm_id", "moved_at");
CREATE INDEX "animal_movements_animal_id_idx" ON "animal_movements"("animal_id");
