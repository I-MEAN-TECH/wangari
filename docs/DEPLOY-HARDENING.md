# Hardening Deploy Guide — 2026-09-08

Four changes in this batch. Local builds pass (server tsc + Next.js build). DB steps must run on the VPS.

> ## The procedure that actually works (2026-10-06)
>
> Everything below this box describes an older layout. **Use this instead.**
>
> ```bash
> # from the repo root, after the change is committed and pushed
> ssh vps "sudo -u saasapp bash -c 'cd /home/saasapp/app && \
>   git pull --ff-only && \
>   cd server && npx prisma generate && npm run build && \
>   cd .. && node server/deploy/verify-build.mjs /home/saasapp/app/server/dist && \
>   PM2_ACTION=start node server/deploy/reload-with-env.mjs /home/saasapp/app/.env'"
>
> npx vercel deploy --prod --yes --scope lewis-ndungus-projects
> # ^ from the REPO ROOT, never from wangari-next/. --scope is required: without
> #   it the CLI can fail with `Error: Not authorized` while `vercel whoami` and
> #   `vercel project ls` both look fine, because its default scope is not the
> #   team that owns this project.
> ```
>
> Five things in there are not obvious, and each was learned the hard way.
>
> **1. `git pull` alone deploys nothing here.** For a while PM2 was running
> `/home/saasapp/app/dist/index.js` — an orphan directory, gitignored, built by
> a config file that existed only on the box. `git pull` could never refresh it,
> because it is not in the repository. Every API deploy for about a day reported
> success, served 200s, and changed nothing at runtime. `verify-build.mjs` exists
> because that failure is invisible from the outside: the health check passes
> either way. Run it on every deploy.
>
> **2. `tsc --noEmit` verifies a build you never ship.** It type-checks and
> emits nothing. The old procedure was exactly that, followed by a reload — so
> the thing that got verified and the thing that ran were different files.
> `npm run build` is what has to precede a reload.
>
> **3. `pm2 reload` does not re-read the app's `script` field.** It recycles the
> workers of an app PM2 already knows, from the definition PM2 already has. A
> changed entrypoint is ignored and the process keeps running the old file.
> `PM2_ACTION=start` re-reads it. If the entrypoint itself changed and `start`
> still will not move it, `pm2 delete <name>` then `start` — a brief gap, and
> then `pm2 save` so it survives a reboot.
>
> **4. Never reload with a bare `pm2 restart --update-env` from ssh.** PM2 copies
> the CALLER's environment, so a fresh shell hands it almost nothing and PM2
> then drops the variables the running process had. That is how `JWT_SECRET`,
> `ADMIN_JWT_SECRET` and `CRON_SECRET` disappeared from the live process.
> `reload-with-env.mjs` parses `/home/saasapp/app/.env` and refuses to reload if
> a required key is absent. Note the path: the file is at the app ROOT, not in
> `server/`, and `set -a; . ./.env` cannot read it because one value contains an
> unquoted space.
>
> **5. Use `/home/saasapp/app/deploy/update.sh`, not the command above.** It
> wraps the whole sequence (including `prisma generate`, `verify-build`, the
> env-preserving reload, a `/health` wait loop and `pm2 save`), and it refuses
> to reload if a required secret is missing. `./update.sh --migrate` applies
> pending Prisma migrations first; without the flag it only builds. Safe to run
> as root — every build and PM2 command is delegated to `saasapp`, because a
> root-owned PM2 is a second, invisible app.
>
> That script was rewritten on 2026-10-06. The version it replaced ended with a
> bare `pm2 reload ecosystem.config.cjs --update-env` and so silently stripped
> `JWT_SECRET`, `ADMIN_JWT_SECRET` and `CRON_SECRET` from the live process on
> every run — the exact failure described in point 4 above. It also ran
> `git reset --hard` (discarding real work) and `npm ci --production` (which
> omits the devDependencies Prisma's CLI needs). The original is kept beside it
> as `deploy/update.sh~`; **do not restore it.**
>
> Canonical copy: `server/deploy/update.sh` (tracked). The installed one lives
> outside the repository and is root-owned, so no amount of `git pull` will ever
> update it — that is exactly why the broken version survived every deploy.
>
> Current paths: app `/home/saasapp/app`, PM2 app name `wangari-api`,
> script `server/dist/index.js`, env `/home/saasapp/app/.env`, logs
> `/home/saasapp/.pm2/logs/`. The references to `/var/www/wangari`,
> `npx tsx src/index.ts` and `wangari-server` further down are all stale.

> **2026-10-04 — timezone is UTC, and must stay UTC.**
> The PostgreSQL server this app shares with another tenant is configured
> `Europe/Berlin`. Roughly 50 columns here are `timestamp without time zone`
> with a `CURRENT_TIMESTAMP` default, so under that setting a database-default
> write stored Berlin local time in a column the app reads as UTC — a silent
> two-hour error. Prisma computes timestamps client-side and sends UTC, so
> nothing written through Prisma was ever affected; the default was a trap for
> any path that did not supply a value.
>
> Production was fixed with `ALTER DATABASE saas_db SET timezone TO 'UTC'` —
> deliberately scoped to that one database, because the same server also serves
> the SVE solar tenant and a cluster-wide change would alter its behaviour.
> `20261004103000_force_utc_on_built_databases` makes every future database built
> from this chain set its own UTC default, so a rebuild cannot inherit Berlin.
>
> If you ever add raw SQL that inserts without a timestamp, confirm it first:
> ```sql
> SHOW timezone;              -- must say UTC
> ```

## 1. Crash safety (code only — nothing to run)
- `unhandledRejection` → logged, process keeps serving
- `uncaughtException` → logged, clean exit(1); PM2 restarts
- PM2 already restarts on crash. Optionally after deploy: `pm2 restart wangari-server --update-env` and confirm `↺` resets.

## 2. ZKTeco device secrets (schema change)
Every existing device gets a `device_secret` column. The push endpoint now **requires** it — devices that don't send it will be rejected (401).

VPS steps:
```bash
cd /var/www/wangari/server
npx prisma generate
# give existing devices a secret (run once):
sudo -u postgres psql -d wangari_db -c "UPDATE zkteco_devices SET device_secret = encode(gen_random_bytes(24), 'hex') WHERE device_secret IS NULL OR device_secret = '';"
```
Then in the Wangari UI, open each device's row to view its secret and configure it on the physical device (ADMS "device password" / snSecret field depends on model).

New devices registered via `POST /api/zkteco/devices` get a secret auto-generated and returned once in the response.

## 3. Migrations (one-time baseline)
The repo now has `server/prisma/migrations/20260908140521_init` reflecting the current schema. Tell Prisma the live DB already matches:

```bash
cd /var/www/wangari/server
npm run db:deploy        # applies 20260908140521_init — will no-op after resolve
npm run db:baseline      # marks 20260908140521_init as applied without running it
```
Order matters: run `deploy` first (it creates `_prisma_migrations` table), and if it errors on existing tables, run `baseline` then `deploy` again to confirm clean state.

> **2026-10-04:** every migration directory was renamed from an unpadded ordinal
> (`0_init`, `1_add_plans`, … `19_phone_pin_attempts`) to a real `YYYYMMDDHHMMSS`
> commit timestamp. Prisma sorts migrations lexicographically, so the old names
> applied in the order `0, 10, 11, … 19, 1, 2026…, 2` — two inversions — and
> `migrate deploy` against a **fresh** database failed. The new timestamps are the
> actual git commit times and reproduce the order already recorded in the live
> `_prisma_migrations` ledger, so no schema change results. Always create new
> migrations with `prisma migrate dev --name <change>`, which timestamps them.

All future schema changes: edit `server/prisma/schema.prisma` → `npx prisma migrate dev --name <change>` locally, commit the migration folder, `npm run db:deploy` on the VPS. Never `db push` again (kept only as an escape hatch).

The frontend schema (`wangari-next/prisma/schema.prisma`) is now a byte-copy of the server one — regenerate it after any server schema change (`cp server/prisma/schema.prisma wangari-next/prisma/schema.prisma`).

## 4. Money-mutation audit trail (code only)
Every create/update/delete on **transactions**, **sales**, **invoices** — plus **subscription activations** from the Paystack webhook — now writes an `audit_log` row:
`action` (e.g. `sale.payment`), entity type/id, before/after amounts, actor userId, farmId.
Audit failures never break the business operation (fire-and-forget with error logging). Visible on the existing `/audit` page.

---

# Required backend environment variables — full reference

> **2026-09-18 incident:** the VPS `/var/www/wangari/server/.env` was found truncated
> (19 lines; SMTP, ADMIN_JWT_SECRET, CRON_SECRET and more missing). The API crash-looped
> with `ADMIN_JWT_SECRET must be set in production`. The watchdog now checks env
> integrity every 5 minutes — but keep this list current when you add keys.

## How env loading works on the VPS

- The app does **NOT** use dotenv. It runs under PM2 (`npx tsx src/index.ts`) and reads
  `process.env` only.
- The canonical file is `/var/www/wangari/server/.env` (chmod 600). **Every deploy must
  run `pm2 restart wangari-server --update-env`** after changing it — a plain restart
  does not reload the file because nothing parses it into the process.
- Wait — correction: PM2 does not parse `.env` at all. The values reach the process
  because the restart command is run from a shell that sourced them, OR via
  `pm2 restart --update-env` picking up the caller's environment. **The reliable
  procedure is the one below.**

## The required keys (checked by the watchdog every 5 minutes)

| Key | Why | If missing |
|---|---|---|
| `PORT` | API listen port (3001) | process defaults to 3001 |
| `NODE_ENV` | must be `production` in prod | admin auth refuses to boot without ADMIN_JWT_SECRET |
| `DATABASE_URL` | Postgres connection | DB checks and every query fail |
| `JWT_SECRET` | farmer/user tokens | auth breaks; rotation logs everyone out |
| `ADMIN_JWT_SECRET` | waadmin tokens — SEPARATE secret | **API refuses to start** (hard fail) |
| `FRONTEND_URL` | CORS + links in emails | browser calls blocked by CORS |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | verification codes, advisories, alerts | "No email provider configured" |
| `SMTP_SECURE` | `false` = 587 STARTTLS, `true` = 465 | defaults to false |
| `CRON_SECRET` | shared secret with Vercel Cron | cron jobs 401 silently |
| `GOOGLE_CLIENT_ID` | Google sign-in | Google login fails |
| `ADMIN_ALERT_EMAIL` | watchdog + admin alerts | alerts default to admin@imeantech.com |

Optional but recommended: `SENTRY_DSN` (error tracking), `NEXT_PUBLIC_POSTHOG_KEY` +
`NEXT_PUBLIC_POSTHOG_HOST` (backend errors → waadmin dashboard), `OPENWEATHER_API_KEY`,
`PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY`, `EMAIL_FROM`, `RESEND_API_KEY` (email
fallback), `AI_*` / `OLLAMA_URL` (assistant).

Full annotated template: `server/.env.example`.

## Env change procedure (VPS)

```bash
ssh lewis@20.164.18.34
cd /var/www/wangari/server
nano .env                      # edit
# sanity: no empty required values, file > 600 bytes
grep -cE '^[A-Z_]+=..' .env    # should print 19+
chmod 600 .env
# reload: easiest reliable path is re-source + restart
set -a; . ./.env; set +a
pm2 restart wangari-server --update-env
sleep 5 && curl -s localhost:3001/health
```

## Watchdog (installed in crontab, every 5 minutes)

`scripts/uptime-watch.mjs` checks:
1. `.env` integrity — readable, ≥600 bytes, every required key non-empty
2. PM2 crash-loop — more than 3 restarts of `wangari-server` in 10 minutes
3. API `/health` responds healthy
4. Database answers a real query

On first failure it emails `ADMIN_ALERT_EMAIL` (using SMTP creds from `.env`, or the
last-known-good baseline in `logs/.env-watchdog-baseline.json` if `.env` itself is the
broken thing), and sends a recovery email when everything is green again.

Test it manually: `cd /var/www/wangari/server && node scripts/uptime-watch.mjs`

> This watchdog runs ON the VPS — it cannot report total VPS loss. Pair it with a free
> external monitor (UptimeRobot, 5-min HTTP check on /health) for that.

