-- Gap closures, October 2026. See docs/gap-analysis.md rows 0, 4, 5, 11-15, 17.
--
-- Six new tables plus three columns on `users` for phone+PIN sign-in.
-- All additive: no existing column is dropped, renamed or retyped, so this
-- migration cannot lose a farmer's data. The only behaviour change is that
-- `users.phone_pin` may now be populated.

-- ─── Phone + PIN sign-in (gap-analysis row 0, GAP 1) ──────────────────────────
-- The whole point of the column is that it can be NULL: a phone-only account
-- has no email and no password, and an email account has no PIN.
ALTER TABLE "users" ADD COLUMN "phone_pin" TEXT;
ALTER TABLE "users" ADD COLUMN "phone_verified_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "auth_method" TEXT;

-- ─── Per-animal health log (row 5) ───────────────────────────────────────────
CREATE TABLE "health_records" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "flock_id" INTEGER,
    "animal_id" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'observation',
    "condition" TEXT NOT NULL,
    "action" TEXT,
    "vet_name" TEXT,
    "observed_at" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATE,
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_records_pkey" PRIMARY KEY ("id")
);

-- ─── Index-insurance policy register (row 13) ────────────────────────────────
CREATE TABLE "insurance_policies" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "flock_id" INTEGER,
    "insurer" TEXT NOT NULL,
    "policy_number" TEXT NOT NULL,
    "product_type" TEXT NOT NULL DEFAULT 'index',
    "units_covered" INTEGER,
    "sum_insured" DECIMAL(14,2),
    "premium_paid" DECIMAL(12,2),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "trigger_metric" TEXT,
    "trigger_value" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- ─── Market price benchmark (row 14) ─────────────────────────────────────────
CREATE TABLE "market_prices" (
    "id" SERIAL NOT NULL,
    "commodity" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "region" TEXT,
    "price_kes" DECIMAL(10,2) NOT NULL,
    "source" TEXT,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id")
);

-- ─── Cold chain readings (row 15) ────────────────────────────────────────────
CREATE TABLE "cold_chain_events" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temp_c" DECIMAL(5,2) NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'coldroom',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cold_chain_events_pkey" PRIMARY KEY ("id")
);

-- ─── Co-op / group mode (rows 11 + 17) ───────────────────────────────────────
CREATE TABLE "coop_groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "chair_user_id" INTEGER NOT NULL,
    "county" TEXT,
    "join_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coop_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coop_memberships" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coop_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coop_invites" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "invited_by_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "coop_invites_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX "health_records_farm_id_observed_at_idx" ON "health_records"("farm_id", "observed_at");
CREATE INDEX "health_records_animal_id_idx" ON "health_records"("animal_id");
CREATE INDEX "health_records_flock_id_idx" ON "health_records"("flock_id");
CREATE INDEX "health_records_farm_id_condition_idx" ON "health_records"("farm_id", "condition");

CREATE INDEX "insurance_policies_farm_id_status_idx" ON "insurance_policies"("farm_id", "status");
CREATE INDEX "insurance_policies_end_date_idx" ON "insurance_policies"("end_date");

CREATE INDEX "market_prices_commodity_region_effective_date_idx" ON "market_prices"("commodity", "region", "effective_date");

CREATE INDEX "cold_chain_events_batch_id_recorded_at_idx" ON "cold_chain_events"("batch_id", "recorded_at");

CREATE UNIQUE INDEX "coop_groups_join_code_key" ON "coop_groups"("join_code");
CREATE INDEX "coop_groups_chair_user_id_idx" ON "coop_groups"("chair_user_id");

CREATE UNIQUE INDEX "coop_memberships_group_id_farm_id_key" ON "coop_memberships"("group_id", "farm_id");
CREATE INDEX "coop_memberships_group_id_idx" ON "coop_memberships"("group_id");

CREATE UNIQUE INDEX "coop_invites_code_key" ON "coop_invites"("code");
CREATE INDEX "coop_invites_group_id_status_idx" ON "coop_invites"("group_id", "status");
CREATE INDEX "coop_invites_phone_idx" ON "coop_invites"("phone");

-- ─── Foreign keys ────────────────────────────────────────────────────────────
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_flock_id_fkey" FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_flock_id_fkey" FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cold_chain_events" ADD CONSTRAINT "cold_chain_events_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cold_chain_events" ADD CONSTRAINT "cold_chain_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "post_harvest_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coop_groups" ADD CONSTRAINT "coop_groups_chair_user_id_fkey" FOREIGN KEY ("chair_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coop_memberships" ADD CONSTRAINT "coop_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "coop_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coop_memberships" ADD CONSTRAINT "coop_memberships_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coop_invites" ADD CONSTRAINT "coop_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "coop_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coop_invites" ADD CONSTRAINT "coop_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;