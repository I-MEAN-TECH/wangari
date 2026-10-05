-- IP access control, for the System Health page.
--
-- Created by hand rather than through `prisma migrate dev`, because that
-- command needs a shadow database and this table has to be applied to a live
-- VPS where we would rather not create one mid-incident. The statement is the
-- same one Prisma generates for the model in schema.prisma; keeping the
-- migration and the schema in step is what makes the next `migrate dev` a
-- no-op instead of a surprise.
--
-- `pattern` is not UNIQUE. Two operators adding the same range is a harmless
-- race, and a unique index would turn it into a 500 on the save instead of a
-- duplicate row an operator can delete.
--
-- IF NOT EXISTS throughout, for the reason given in the registry migration: this
-- chain has already been applied to live databases that drifted, and a
-- migration that fails halfway leaves the service down.
--
-- TIMESTAMP rather than TIMESTAMPTZ because every other column in this schema
-- is naive UTC (see 20261004102500), and being the single exception would mean
-- this one column silently shifts by a timezone offset.

CREATE TABLE IF NOT EXISTS "ip_rules" (
    "id"         SERIAL       NOT NULL,
    "pattern"    TEXT         NOT NULL,
    "action"     TEXT         NOT NULL DEFAULT 'block',
    "note"       TEXT,
    "added_by"   TEXT,
    "hit_count"  INTEGER      NOT NULL DEFAULT 0,
    "last_hit_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ip_rules_action_idx" ON "ip_rules" ("action");