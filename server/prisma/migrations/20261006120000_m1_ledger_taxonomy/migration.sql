-- M1 — the accountant layer, part 1 of 2: the columns.
--
-- Why this is hand-written rather than `prisma migrate dev`: the same reason as
-- 20261006090000_ip_access_control. `migrate dev` wants a shadow database, and
-- this has to apply to a live VPS without one. The statements below are what
-- Prisma generates for the models in schema.prisma, so the next `migrate dev`
-- sees no drift.
--
-- Everything is ADD, nothing is DROP or REWRITE. `transactions` holds 17 rows
-- of live test data and `farms` holds 8; both must survive untouched.
--
-- ---------------------------------------------------------------------------
-- What is being added and why
-- ---------------------------------------------------------------------------
--
-- `transactions.category` is free text and stays exactly as the farmer wrote
-- it. We are NOT normalising it in place, because the farmer's own words are
-- data we do not get to overwrite. Instead two derived columns sit beside it:
--
--   cost_bucket      — for expense rows, one of the CostBucket values in
--                      server/src/lib/ledger-taxonomy.ts
--   enterprise_kind  — for income rows, one of the EnterpriseKind values
--
-- Both stay NULLABLE. A row written between this migration and the backfill
-- script has no classification yet, and a query that assumed NOT NULL would
-- start returning 500s on a live money screen.
--
-- `flock_id` / `crop_id` are the explicit enterprise attribution. Until now
-- the only way to attach a transaction to a flock was substring-matching the
-- flock's *name* against `category` and `description` (profitability.ts). A
-- flock called "Layers" made every row mentioning the word "layers" belong to
-- it. A reference cannot be fooled that way.
--
-- `farms.area_value` / `area_unit` are here because every per-unit metric the
-- farmer will be shown (cost per egg, cost per litre, cost per acre) needs a
-- denominator, and KIAMIS derives subsidy quantities from declared acreage.
--
-- ---------------------------------------------------------------------------
-- IF NOT EXISTS throughout
-- ---------------------------------------------------------------------------
--
-- This chain has already been applied to live databases that drifted, and a
-- migration that fails halfway leaves the service down. Re-running this file
-- must be a no-op, not an error.
--
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so the two foreign keys are
-- wrapped in DO blocks that check pg_constraint first. That is the same
-- guarantee by a longer route.

-- ─── farms: the denominator ────────────────────────────────────────────────
ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "area_value" DECIMAL(10,2);
ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "area_unit"  TEXT;

-- ─── transactions: classification ──────────────────────────────────────────
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cost_bucket"     TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "enterprise_kind" TEXT;

-- ─── transactions: attribution ─────────────────────────────────────────────
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "flock_id" INTEGER;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "crop_id"  INTEGER;

-- ─── indexes, matching the @@index declarations in schema.prisma ───────────
-- These are the two that a profitability query will use on every request, plus
-- the two the attribution joins need.
CREATE INDEX IF NOT EXISTS "transactions_farm_id_cost_bucket_idx"
  ON "transactions" ("farm_id", "cost_bucket");
CREATE INDEX IF NOT EXISTS "transactions_farm_id_enterprise_kind_idx"
  ON "transactions" ("farm_id", "enterprise_kind");
CREATE INDEX IF NOT EXISTS "transactions_farm_id_flock_id_idx"
  ON "transactions" ("farm_id", "flock_id");
CREATE INDEX IF NOT EXISTS "transactions_farm_id_crop_id_idx"
  ON "transactions" ("farm_id", "crop_id");

-- ─── foreign keys ──────────────────────────────────────────────────────────
-- Both relations are optional in the schema, so Prisma's convention is
-- ON DELETE SET NULL: deleting a flock must not delete the money that was
-- spent on it. The expense stays and becomes unattributed, which is the
-- honest outcome — the farmer really did spend that money.
--
-- ON DELETE SET NULL is also why this migration is safe on live data: no
-- existing row can violate it, since every existing row has NULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_flock_id_fkey'
  ) THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_flock_id_fkey"
      FOREIGN KEY ("flock_id") REFERENCES "flocks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_crop_id_fkey'
  ) THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_crop_id_fkey"
      FOREIGN KEY ("crop_id") REFERENCES "crops"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
