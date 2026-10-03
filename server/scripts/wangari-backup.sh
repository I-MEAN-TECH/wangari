#!/bin/bash
# Nightly encrypted logical backup of the Wangari database.
#
# Adapted from the old VPS (/home/lewis/wangari-backups/wangari-backup.sh) for
# the new host: same encryption scheme and the SAME passphrase file, so every
# backup taken on the old box still decrypts with /home/saasapp/.wangari-backup-key.
#
#   pg_dump | gzip | openssl aes-256-cbc -pbkdf2
#
# Every run verifies its own output by decrypting and measuring it — a backup
# that cannot be read back is not a backup.
set -uo pipefail

APP_DIR="/home/saasapp/app"
BACKUP_DIR="/home/saasapp/backups/wangari"
KEY_FILE="/home/saasapp/.wangari-backup-key"
LOG_FILE="/home/saasapp/backups/cron.log"
RETENTION_DAYS=14

# cron may hand us an unreadable cwd (/root when invoked as another user),
# which makes the `find` at the end print a spurious permission error.
cd /home/saasapp || exit 1

STAMP=$(date -u +%Y%m%d-%H%M)
FILE="$BACKUP_DIR/wangari-$STAMP.sql.gz.enc"

log() { echo "[$(date -u '+%a %b %e %H:%M:%S UTC %Y')] $*"; }

log "START Wangari backup"

if [ ! -f "$KEY_FILE" ]; then
  log "FAIL missing key file $KEY_FILE"
  exit 1
fi
if [ ! -r "$APP_DIR/.env" ]; then
  log "FAIL cannot read $APP_DIR/.env"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# .env has an unquoted value containing spaces (EMAIL_FROM), so it cannot be
# sourced with `set -a; . .env` — that is a syntax error. Pull out just the
# one variable we need instead.
DB_URL=$(grep -m1 '^DATABASE_URL=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"'"'"' \r')
if [ -z "$DB_URL" ]; then
  log "FAIL DATABASE_URL not found in .env"
  exit 1
fi

# Prisma appends "?schema=public", which libpq rejects with
# "invalid URI query parameter: schema". pg_dump is libpq, so drop the query.
DB_URL="${DB_URL%%\?*}"

KEY=$(cat "$KEY_FILE")

if ! pg_dump "$DB_URL" --no-owner --no-privileges | gzip | \
     openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$KEY" -out "$FILE"; then
  log "FAIL pg_dump/encrypt failed"
  rm -f "$FILE"
  exit 1
fi

# Verify by reading it back, exactly as the old script did.
DUMP_BYTES=$(openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$KEY" -in "$FILE" 2>/dev/null | gunzip 2>/dev/null | wc -c)
if [ "$DUMP_BYTES" -lt 10000 ]; then
  log "FAIL verification produced only $DUMP_BYTES bytes — treating as corrupt"
  exit 1
fi

SIZE=$(du -h "$FILE" | cut -f1)
log "OK $FILE ($SIZE, $DUMP_BYTES bytes raw)"

find "$BACKUP_DIR" -name 'wangari-*.sql.gz.enc' -mtime +$RETENTION_DAYS -delete
log "END"