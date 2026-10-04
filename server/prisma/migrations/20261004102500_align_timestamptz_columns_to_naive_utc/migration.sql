-- Bring the last two stray timestamptz columns in line with the rest of the schema.
--
-- 118 of the 120 timestamp columns in this database are `timestamp without time
-- zone`. Only these two were `timestamp with time zone`, because they were
-- created by `db push` from a datamodel that declared them as Timestamptz while
-- every other DateTime in schema.prisma maps to TIMESTAMP(3).
--
-- Left alone, the next `prisma migrate dev` would generate an ALTER TYPE to
-- convert them. PostgreSQL performs that conversion by rendering the instant in
-- the *session* timezone, so with this database previously set to Europe/Berlin
-- it would have silently shifted every value forward by two hours. The database
-- timezone is now UTC, which makes the conversion exact, and that ordering
-- matters: fixing the timezone first is what made this safe to do.
--
-- Both columns are already stored as genuine UTC instants (Prisma computes
-- timestamps client-side and writes UTC), so rendering them under UTC reproduces
-- the same wall-clock value. No data changes meaning.
--
-- Guarded on the current type, so on a freshly built database -- where these
-- columns are already TIMESTAMP(3) from this same migration chain's baseline --
-- the whole thing is a no-op.
DO $$
DECLARE
    col RECORD;
BEGIN
    FOR col IN
        SELECT * FROM (VALUES
            ('public', 'users',           'last_mfa_nudged_at'),
            ('public', 'synced_writes',  'created_at')
        ) AS t(schema_name, table_name, column_name)
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema  = col.schema_name
              AND table_name    = col.table_name
              AND column_name   = col.column_name
              AND data_type     = 'timestamp with time zone'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I.%I ALTER COLUMN %I TYPE TIMESTAMP(3) USING %I AT TIME ZONE ''UTC''',
                col.schema_name, col.table_name, col.column_name, col.column_name
            );
        END IF;
    END LOOP;
END
$$;
