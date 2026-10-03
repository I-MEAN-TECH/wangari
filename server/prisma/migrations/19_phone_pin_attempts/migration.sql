-- Failed PIN attempts, one row per phone number.
--
-- The lockout counter used to be a Map in the route module. Under pm2 cluster
-- mode each worker had its own, so consecutive guesses at one account never
-- accumulated and the lockout never fired. One shared row fixes that.
CREATE TABLE IF NOT EXISTS "phone_pin_attempts" (
    "phone"       TEXT        NOT NULL,
    "count"       INTEGER     NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_pin_attempts_pkey" PRIMARY KEY ("phone")
);