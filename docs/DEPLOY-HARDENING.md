# Hardening Deploy Guide — 2026-09-08

Four changes in this batch. Local builds pass (server tsc + Next.js build). DB steps must run on the VPS.

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

