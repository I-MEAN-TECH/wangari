-- Reconcile schema that never got a migration.
--
-- Four things exist in `schema.prisma` and in production, but no migration ever
-- created them: they were applied with `prisma db push`, which edits the
-- database directly and writes nothing into the migration history. So a fresh
-- `migrate deploy` built a schema the running code could not actually work
-- with:
--
--   * synced_writes          - the offline-write idempotency ledger. Without
--                               the table, middleware/idempotency.ts throws on
--                               every write it guards, and the offline queue
--                               has nowhere to store replayed responses.
--   * verification_codes.attempts - the failed-verify counter auth.ts burns a
--                               code against after 5 tries. Without it the
--                               brute-force limit never engages.
--   * promo_codes.free_months - sponsorship/partnership codes granting N free
--                               months. Without it promo-redeem.ts reads
--                               undefined and no sponsorship code works.
--   * users.last_mfa_nudged_at - the per-user cooldown behind the weekly MFA
--                               reminder, which would otherwise re-nudge
--                               everyone every single run.
--
-- Every statement is guarded so this migration is a no-op on a database that
-- already has these objects (production), and a real fix on a fresh one.
-- `migrate deploy` runs against both, so unguarded DDL here would fail
-- against production with "column already exists".

-- Offline write idempotency ledger.
CREATE TABLE IF NOT EXISTS "synced_writes" (
    "id" SERIAL NOT NULL,
    "client_id" TEXT NOT NULL,
    "response_body" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL DEFAULT 500,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synced_writes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "synced_writes_user_id_idx"
    ON "synced_writes"("user_id");

-- client_id is the idempotency key, so uniqueness is what makes a replayed
-- offline write collapse onto the original row instead of duplicating it.
--
-- Production carries this as a real UNIQUE constraint, because that is what
-- `db push` created when the table first appeared. Prisma's own @unique
-- renders as a bare unique index instead, which enforces exactly the same
-- thing. PostgreSQL will not let a constraint and an index share a name, so
-- build the constraint directly (backed by its own index) rather than creating
-- the index first and colliding with it.
--
-- Guarded on the constraint's absence, so on production this whole block is
-- skipped and the existing constraint is left untouched.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'synced_writes'::regclass AND contype = 'u'
    ) THEN
        ALTER TABLE "synced_writes"
            ADD CONSTRAINT "synced_writes_client_id_key" UNIQUE ("client_id");
    END IF;
END
$$;

-- Failed verification attempts; the code burns at 5.
ALTER TABLE "verification_codes"
    ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- Sponsorship/partnership codes grant N free months on redemption.
ALTER TABLE "promo_codes"
    ADD COLUMN IF NOT EXISTS "free_months" INTEGER;

-- Weekly MFA reminder cooldown. NULL means "never nudged".
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "last_mfa_nudged_at" TIMESTAMP(3);

-- gen_random_bytes() ships in pgcrypto. Production has the extension installed
-- (the restored database carried it), but a brand new database does not, so the
-- default below would fail with "function gen_random_bytes(integer) does not
-- exist". pgcrypto is a trusted extension, so the database owner can install it.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- New ZKTeco devices get a device_secret from the database default, so a
-- device registered without an explicit secret still authenticates. Production
-- carries this default (pgcrypto's gen_random_bytes); only the migration
-- history was missing it. IF NOT EXISTS is meaningless for a default, so guard
-- on the current default instead.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'zkteco_devices'
          AND column_name = 'device_secret'
          AND column_default IS NULL
    ) THEN
        EXECUTE 'ALTER TABLE "zkteco_devices" ALTER COLUMN "device_secret" '
             || 'SET DEFAULT encode(gen_random_bytes(24), ''hex'')';
    END IF;
END
$$;
