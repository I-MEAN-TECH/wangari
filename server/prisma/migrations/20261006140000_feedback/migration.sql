-- The feedback table: the first way Wangari can ask a farmer a question.
--
-- Hand-written with IF NOT EXISTS for the same reason as the M1 migration and
-- 20261006090000_ip_access_control: `migrate dev` wants a shadow database, and
-- this has to apply to a live VPS without one. Prisma's own generated DDL for
-- this model is reproduced exactly (verified with `prisma migrate diff`), so
-- the next `migrate dev` sees no drift.
--
-- ---------------------------------------------------------------------------
-- Why farm_id and user_id are NULLABLE
-- ---------------------------------------------------------------------------
--
-- The public link is filled in mostly by people who are not users yet, and at
-- an expo booth that is nearly everyone. `NOT NULL` would mean the form could
-- only ever collect opinions from the handful of accounts that already exist —
-- which is precisely the sample least able to tell us why everyone else never
-- signed up.
--
-- ON DELETE SET NULL for both, so deleting an account does not delete what that
-- person told us. Their words are the data we are trying to keep.
--
-- ---------------------------------------------------------------------------
-- Why the tag columns are NOT NULL DEFAULT '[]'
-- ---------------------------------------------------------------------------
--
-- An empty array is a real answer ("I rated it and chose nothing else"), so it
-- is not the same thing as NULL, and the aggregation should never have to
-- distinguish the two.

CREATE TABLE IF NOT EXISTS "feedback" (
    "id"         SERIAL       NOT NULL,
    "farm_id"    INTEGER,
    "user_id"    INTEGER,
    "source"     TEXT         NOT NULL,
    "rating"     INTEGER,
    "best"       JSONB        NOT NULL DEFAULT '[]',
    "improve"    JSONB        NOT NULL DEFAULT '[]',
    "species"    JSONB        NOT NULL DEFAULT '[]',
    "comment"    TEXT,
    "phone"      TEXT,
    "ip_hash"    TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "feedback_created_at_idx"
  ON "feedback" ("created_at");

CREATE INDEX IF NOT EXISTS "feedback_source_created_at_idx"
  ON "feedback" ("source", "created_at");

-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so both foreign keys are
-- guarded by a catalogue check. Same guarantee, longer route.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_farm_id_fkey'
  ) THEN
    ALTER TABLE "feedback"
      ADD CONSTRAINT "feedback_farm_id_fkey"
      FOREIGN KEY ("farm_id") REFERENCES "farms"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_user_id_fkey'
  ) THEN
    ALTER TABLE "feedback"
      ADD CONSTRAINT "feedback_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
