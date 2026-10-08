-- Join-code expiry for co-op groups.
--
-- The chair can now give a group code a lifespan (30 days, a season, or
-- "never"). NULL keeps the previous behaviour, so every existing group's code
-- remains valid until a chair deliberately sets an expiry.
ALTER TABLE "coop_groups" ADD COLUMN "join_code_expires_at" TIMESTAMP(3);
