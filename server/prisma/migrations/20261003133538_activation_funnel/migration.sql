-- Activation funnel: signup -> onboarding -> first record -> day-7 return.
--
-- One row per user per stage per UTC day. The unique constraint is the whole
-- design: the client pings on every app open, and without it 40 opens in one
-- afternoon would read as 40 days of returning. It also makes the whole
-- endpoint idempotent, so a retry on a flaky rural connection costs nothing.
CREATE TABLE IF NOT EXISTS "activation_events" (
    "id"         SERIAL PRIMARY KEY,
    "user_id"    INTEGER NOT NULL,
    "stage"      TEXT   NOT NULL,
    "day"        TEXT   NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_events_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "activation_events_user_id_stage_day_key"
    ON "activation_events" ("user_id", "stage", "day");

CREATE INDEX IF NOT EXISTS "activation_events_stage_idx"
    ON "activation_events" ("stage");