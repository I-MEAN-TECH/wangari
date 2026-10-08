-- The herd ledger — why a group's head count changed.
--
-- Flock.current_count was a single number overwritten in place, so there was no
-- answer to "I had 40, now I have 33 — where did seven go?". This table holds a
-- signed delta per change (purchase, birth, transfer between this farm's own
-- groups, merge, sale, death) beside the count, never instead of it.
--
-- A group-to-group transfer writes two rows — one on each flock, with opposite
-- deltas — so both sides of the same event agree. counterparty_flock_id is a
-- plain integer with no foreign key on purpose: the other group may later be
-- merged away or deleted, and the ledger row must survive that intact.
CREATE TABLE "flock_movements" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "flock_id" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "counterparty_flock_id" INTEGER,
    "counterparty_name" TEXT,
    "count_before" INTEGER NOT NULL,
    "count_after" INTEGER NOT NULL,
    "moved_at" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flock_movements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "flock_movements" ADD CONSTRAINT "flock_movements_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flock_movements" ADD CONSTRAINT "flock_movements_flock_id_fkey" FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "flock_movements_farm_id_moved_at_idx" ON "flock_movements"("farm_id", "moved_at");
CREATE INDEX "flock_movements_flock_id_idx" ON "flock_movements"("flock_id");
