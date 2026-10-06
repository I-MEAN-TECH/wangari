#!/usr/bin/env bash
# Throwaway-database proof that the M1 migration applies — and is idempotent.
#
# Run ON THE VPS, as root, from anywhere:
#   bash verify-m1-migration.sh
#
# It touches ONLY the scratch database `wangari_migcheck`. `wangari_db` is
# never opened for writing; its URL is read solely to borrow the credentials,
# and the scratch URL is printed redacted so nothing lands in a log.
#
# Why this exists: `prisma migrate diff` proves the SQL *matches* what Prisma
# would generate. It does not prove Postgres *accepts* it. The one thing that
# can only fail at execution time is the pair of `DO $$ ... $$` blocks adding
# the foreign keys, since Postgres has no `ADD CONSTRAINT IF NOT EXISTS` — and
# that is exactly the code a review would wave through.

set -uo pipefail

APP=/home/saasapp/app/server
ENV_FILE=/home/saasapp/app/.env
DB=wangari_migcheck
MIGRATION=20261006120000_m1_ledger_taxonomy

cd "$APP" || { echo "FATAL: cannot cd $APP"; exit 1; }

# The env file lives at the repo root, not in server/ — the deploy layout split
# them. Read it explicitly rather than relying on prisma's dotenv discovery,
# which would silently find nothing and fall back to a default localhost URL.
if [ ! -f "$ENV_FILE" ]; then echo "FATAL: $ENV_FILE not found"; exit 1; fi
URL=$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | head -1 | tr -d '"' | tr -d '\r')
if [ -z "$URL" ]; then echo "FATAL: no DATABASE_URL in $ENV_FILE"; exit 1; fi

# Derive the database name from the URL rather than hardcoding it. It was NOT
# wangari_db on this host — the live database is saas_db — and a hardcoded
# guard against the wrong name is a guard that either never fires or always
# fires. Take the last path segment, before any query string.
PROD_DB=$(printf '%s' "$URL" | sed -E 's#^[a-zA-Z]+://[^/]*/##; s#\?.*$##')
if [ -z "$PROD_DB" ]; then echo "FATAL: could not parse a database name out of DATABASE_URL"; exit 1; fi
echo "production database on this host: $PROD_DB"

SCRATCH=$(printf '%s' "$URL" | sed "s#/$PROD_DB#/$DB#")
if [ "$SCRATCH" = "$URL" ]; then
  echo "FATAL: scratch URL identical to the production URL; refusing"; exit 1
fi
case "$SCRATCH" in
  *"/$DB"*) : ;;
  *) echo "FATAL: scratch URL does not end in /$DB; refusing"; exit 1 ;;
esac
echo "scratch database to be created and dropped: $DB"
echo "scratch url (redacted): $(printf '%s' "$SCRATCH" | sed 's#://[^@]*@#://***@#')"
echo

# The app's own role, taken from the URL — the scratch database has to be
# usable by it, or `prisma migrate deploy` fails on `permission denied for
# schema public` (Postgres 15+ no longer grants that to PUBLIC).
APP_USER=$(printf '%s' "$URL" | sed -E 's#^[a-zA-Z]+://([^:/]+)[:/].*#\1#')
if [ -z "$APP_USER" ]; then echo "FATAL: could not parse a role out of DATABASE_URL"; exit 1; fi
echo "application role: $APP_USER"

echo "=== setup: recreate scratch database ==="
su postgres -c "psql -tAc \"DROP DATABASE IF EXISTS $DB\"" >/dev/null
su postgres -c "psql -tAc \"CREATE DATABASE $DB OWNER $APP_USER\"" >/dev/null
# pgcrypto/uuid extensions and the public schema both need to be usable.
su postgres -c "psql -d $DB -tAc \"ALTER SCHEMA public OWNER TO $APP_USER\"" >/dev/null
su postgres -c "psql -d $DB -tAc \"GRANT ALL ON SCHEMA public TO $APP_USER\"" >/dev/null
echo "created $DB owned by $APP_USER"
echo

echo "=== RUN 1: whole migration chain on an empty database ==="
DATABASE_URL="$SCRATCH" npx prisma migrate deploy 2>&1 | tail -20
RUN1=${PIPESTATUS[0]}
echo "RUN1_EXIT=$RUN1"
echo

echo "=== RUN 2: the same chain again (chain-level idempotency) ==="
DATABASE_URL="$SCRATCH" npx prisma migrate deploy 2>&1 | tail -8
RUN2=${PIPESTATUS[0]}
echo "RUN2_EXIT=$RUN2"
echo

echo "=== RUN 3: re-apply OUR migration.sql directly (statement-level idempotency) ==="
echo "    This is the run that exercises the DO \$\$ guarded foreign keys."
# Redirect as root and pipe to psql on stdin: the postgres OS user cannot
# traverse /home/saasapp, so `psql -f` on that path fails with EACCES.
su postgres -c "psql -d $DB -v ON_ERROR_STOP=1" < "$(pwd)/prisma/migrations/$MIGRATION/migration.sql" 2>&1 | tail -12
RUN3=${PIPESTATUS[0]}
echo "RUN3_EXIT=$RUN3"
echo

echo "=== transactions columns ==="
su postgres -c "psql -d $DB -tAc \"SELECT column_name || ' | ' || data_type || ' | nullable=' || is_nullable FROM information_schema.columns WHERE table_name='transactions' AND column_name IN ('cost_bucket','enterprise_kind','flock_id','crop_id') ORDER BY column_name\""
echo "=== farms columns ==="
su postgres -c "psql -d $DB -tAc \"SELECT column_name || ' | ' || data_type FROM information_schema.columns WHERE table_name='farms' AND column_name IN ('area_value','area_unit') ORDER BY column_name\""
echo "=== indexes added ==="
su postgres -c "psql -d $DB -tAc \"SELECT indexname FROM pg_indexes WHERE tablename='transactions' AND indexname LIKE 'transactions_farm_id_%' ORDER BY indexname\""
echo "=== foreign keys (confdeltype n = SET NULL) ==="
su postgres -c "psql -d $DB -tAc \"SELECT conname || ' | confdeltype=' || confdeltype::text FROM pg_constraint WHERE conname IN ('transactions_flock_id_fkey','transactions_crop_id_fkey') ORDER BY conname\""
echo "=== the migration is recorded as applied ==="
su postgres -c "psql -d $DB -tAc \"SELECT migration_name || ' | ' || finished_at FROM _prisma_migrations WHERE migration_name LIKE '%m1_ledger_taxonomy%'\""
echo

echo "=== cleanup ==="
su postgres -c "psql -tAc \"DROP DATABASE IF EXISTS $DB\"" >/dev/null && echo "scratch database dropped"
echo
echo "DONE RUN1=$RUN1 RUN2=$RUN2 RUN3=$RUN3"
