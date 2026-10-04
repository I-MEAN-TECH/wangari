-- Make the database this chain builds default to UTC, not the server's timezone.
--
-- The production fix for the two-hour timestamp bug was applied as
-- `ALTER DATABASE saas_db SET timezone TO 'UTC'`. That statement names one
-- database, so it travels with that database and not with this migration chain.
-- A rebuilt database therefore inherited the host's Europe/Berlin and came back
-- with the same defect: `timestamp` columns defaulting to CURRENT_TIMESTAMP
-- would have stored Berlin local time as if it were UTC.
--
-- Verified: a database built from the chain before this migration answered
-- `now()` with 12:22:24+02 while production answered 10:22:25+00 for the same
-- instant. The two differed by exactly the server offset.
--
-- current_database() cannot be used directly in ALTER DATABASE, which needs a
-- literal name, so it is interpolated through format(). Setting it again on a
-- database that is already UTC is a harmless no-op, which keeps this safe on
-- production.
--
-- This affects only the database being migrated. It does not change the
-- cluster-wide default, so other tenants sharing this PostgreSQL server keep
-- whatever behaviour they already have.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;
