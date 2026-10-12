-- A sub-group inside one flock ("the original 300" vs "the 200 bought in
-- October") for a farmer who wants ONE flock but still wants to tell its
-- history apart internally. Strictly additive: flock_batches is a new table,
-- and animals.batch_id is nullable, so every existing flock/animal row is
-- unaffected until a farmer opts into batches.
CREATE TABLE "flock_batches" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "flock_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "current_count" INTEGER NOT NULL,
    "acquired_on" DATE,
    "source_flock_name" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flock_batches_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "flock_batches" ADD CONSTRAINT "flock_batches_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flock_batches" ADD CONSTRAINT "flock_batches_flock_id_fkey" FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "flock_batches_farm_id_idx" ON "flock_batches"("farm_id");
CREATE INDEX "flock_batches_flock_id_idx" ON "flock_batches"("flock_id");

ALTER TABLE "animals" ADD COLUMN "batch_id" INTEGER;
ALTER TABLE "animals" ADD CONSTRAINT "animals_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "flock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "animals_batch_id_idx" ON "animals"("batch_id");
