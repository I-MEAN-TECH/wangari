-- The AI model registry behind the super-admin AI module.
--
-- Two things here are load-bearing and easy to get wrong:
--
-- 1. PARTIAL UNIQUE INDEXES, not application checks. `WHERE role = 'primary'`
--    means the uniqueness only applies to primary rows, so one primary and one
--    fallback can coexist. Enforcing this in application code races: two admins
--    clicking Activate at once both read "no primary exists", both write, and
--    the result is two live primaries — which halves throughput and is
--    invisible until a farmer wonders why everyone else got an answer faster.
--    The database is the only place that can actually refuse.
--
-- 2. IF NOT EXISTS throughout, because this chain has already been applied to
--    live databases that drifted (see 20261004093500). A migration that fails
--    halfway leaves the service down.

CREATE TABLE IF NOT EXISTS "ai_models" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "label" TEXT,
    "role" TEXT NOT NULL DEFAULT 'candidate',
    "api_key_enc" TEXT,
    "base_url" TEXT,
    "cost_in_per_m" DOUBLE PRECISION,
    "cost_out_per_m" DOUBLE PRECISION,
    "is_free" BOOLEAN NOT NULL DEFAULT true,
    "context_length" INTEGER,
    "probe_state" TEXT NOT NULL DEFAULT 'untested',
    "probe_reason" TEXT,
    "probed_at" TIMESTAMP(3),
    "probe_ms" INTEGER,
    "last_latency_ms" INTEGER,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "searches_per_turn" INTEGER,
    "rate_limit_window_ms" INTEGER,
    "max_steps" INTEGER,
    "allow_paid_models" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- One primary. One fallback. Both enforced by the database, not by a SELECT
-- followed by an INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_one_primary"
    ON "ai_models" ("role") WHERE "role" = 'primary';

CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_one_fallback"
    ON "ai_models" ("role") WHERE "role" = 'fallback';

CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_provider_model_key"
    ON "ai_models" ("provider", "model");

CREATE INDEX IF NOT EXISTS "ai_models_role_idx" ON "ai_models" ("role");

-- ai_settings is a single row. Enforcing that here means a second insert fails
-- loudly instead of silently creating row 2, where reads would pick one at
-- random and the operator would see settings that do not take effect.
INSERT INTO "ai_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
