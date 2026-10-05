#!/usr/bin/env bash
#
# Wangari API — production update.
#
# Canonical copy: server/deploy/update.sh (tracked). Installed at
# /home/saasapp/app/deploy/update.sh (root-owned, untracked, survives deploys
# because `git pull` never touches a file the repository does not contain).
#
#   ./update.sh              build + verify + reload
#   ./update.sh --migrate    apply pending Prisma migrations first
#
# ── what replaced it, and why ───────────────────────────────────────────────
# The previous version ended with a bare
#     pm2 reload ecosystem.config.cjs --update-env
# run from a plain shell. That command does two dangerous things:
#
#   1. It copies the CALLER's environment into the process. A fresh ssh shell
#      has almost nothing in it, so PM2 dropped the variables the running
#      process had — JWT_SECRET, ADMIN_JWT_SECRET, CRON_SECRET — and every
#      deployment silently logged all users out. (It also cannot `source` the
#      .env to fix this: EMAIL_FROM=Wangari <noreply@imeantech.com> is
#      unquoted, so bash tries to execute it.)
#   2. `pm2 reload` does NOT re-read the `script` field, so a change to the
#      entrypoint is ignored and the old file keeps serving.
#
# It also ran `git reset --hard` (silently discarding real work), `npm ci
# --production` (which omits the devDependencies Prisma's CLI needs), and
# built wangari-next on the box even though the frontend ships from Vercel.
#
# See docs/DEPLOY-HARDENING.md.

set -euo pipefail

APP=/home/saasapp/app
DIST="$APP/server/dist"
MIGRATE=0

for arg in "$@"; do
  case "$arg" in
    --migrate) MIGRATE=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ "$(id -u)" -eq 0 ]; then
  echo "running as root; every build and PM2 command is delegated to saasapp"
  echo "(PM2's daemon and HOME belong to saasapp; a root PM2 is a second, invisible app)"
  echo
fi

# PM2 reads `script` relative to the working directory and inherits cwd, so the
# app directory matters as much as the command. PATH is pinned because sudo's
# secure_path does not include the saasapp bin directory.
as_app() {
  if [ "$(id -un)" = "saasapp" ]; then
    env PATH=/home/saasapp/bin:/usr/local/bin:/usr/bin:/bin HOME=/home/saasapp "$@"
  else
    sudo -u saasapp env PATH=/home/saasapp/bin:/usr/local/bin:/usr/bin:/bin HOME=/home/saasapp "$@"
  fi
}

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Pulling origin/main"
# --ff-only, not `reset --hard`: a diverged or dirty tree is a stop, not
# something to throw away without saying so.
as_app git -C "$APP" pull --ff-only origin main

cd "$APP/server"

# ── dependencies ────────────────────────────────────────────────────────────
# Only reinstalled when the manifests actually changed. `npm ci` wipes
# node_modules first, so a registry hiccup would leave the box unable to boot;
# an unnecessary reinstall is a gratuitous chance to find that out.
STAMP="$APP/server/node_modules/.wangari-deps-stamp"
want=$(cat package.json package-lock.json | sha256sum | cut -d' ' -f1)
have=$(cat "$STAMP" 2>/dev/null || echo none)
if [ "$want" != "$have" ]; then
  step "Installing dependencies (manifests changed)"
  # The stamp is written by the same saasapp process that installs, so it never
  # ends up root-owned inside node_modules.
  as_app sh -c "npm ci --no-audit --no-fund && printf '%s' '$want' > '$STAMP'"
else
  step "Dependencies unchanged, skipping install"
fi

if [ "$MIGRATE" -eq 1 ]; then
  step "Applying pending migrations"
  # Reads DATABASE_URL from the app-root .env itself; refuses to run without it.
  as_app node deploy/migrate-with-env.mjs
else
  step "Skipping migrations (pass --migrate to apply them)"
fi

# `generate` must precede the build: the Prisma client is generated, not
# checked in, and TypeScript fails without it.
step "Generating Prisma client"
as_app npx prisma generate

step "Building server"
# `tsc --noEmit` type-checks and emits nothing, so the build is not optional.
as_app npm run build

step "Verifying the build contains the shipped fixes"
# A green build does not mean the right code was emitted. This fails the
# deploy rather than the user. If a fix below was legitimately REMOVED, update
# this list deliberately — do not delete the gate.
as_app node deploy/verify-build.mjs "$DIST"

step "Reloading PM2 with the real environment"
# PM2_ACTION=start, not reload: start re-reads the app definition, so a change
# to `script` takes effect. reload-with-env.mjs aborts if JWT_SECRET or
# CRON_SECRET is absent rather than deploying a process without them.
as_app env PM2_ACTION=start node deploy/reload-with-env.mjs "$APP/.env"

step "Waiting for the API to answer"
ok=0
for _ in $(seq 1 30); do
  if [ "$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:8010/health 2>/dev/null)" = "200" ]; then
    ok=1
    break
  fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "API did not return 200 within 30s. Check: /home/saasapp/.pm2/logs/wangari-api-error.log" >&2
  exit 1
fi

as_app /home/saasapp/bin/pm2 save

printf '\n\033[1mUpdate complete.\033[0m %s\n' "$(as_app git -C "$APP" rev-parse --short HEAD)"