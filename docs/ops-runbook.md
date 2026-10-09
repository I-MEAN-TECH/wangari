# Wangari — Operations Runbook (VPS)

> **Read this first** if you are a human or an AI agent asked to do anything on
> the Wangari VPS. Then read [architecture.md](architecture.md) for the full
> topology and `server/ecosystem.config.cjs` for the PM2 definition.
>
> **Access:** the SSH alias `vps` lands you as **root** on the app host
> (`vmi3524773`, 169.58.215.146, **Ubuntu 24.04**). The app itself runs as the
> **`saasapp`** user. *(This file previously described a different host —
> hostname `sve`, Debian, user `lewis`, `/var/www/wangari`, port 3001,
> MariaDB. All of that was stale; everything below was re-verified against
> the live box on 2026-10-06.)*

## Golden rules

1. **Never `pm2 restart` (or a bare `pm2 start`) by hand on production.**
   Use the approved script. Read this carefully, because what it does is NOT
   what this rule used to claim: `deploy/update.sh` runs `PM2_ACTION=start`,
   which re-reads the app definition — so a changed entrypoint takes effect —
   but restarts **both workers together**, giving a brief gap of a second or two
   rather than a rolling one-at-a-time recycle. That trade-off is deliberate
   and is argued in [DEPLOY-HARDENING.md](DEPLOY-HARDENING.md) (point 3): bare
   `pm2 reload` does not re-read `script`, which is how the box once served an
   orphan build forever while every deploy "succeeded". The script waits for
   `/health` to return 200 before it reports success, so the gap is bounded and
   verified. **Manual** intervention — `pm2 reload wangari-api` in the incident
   playbook below — does recycle workers one at a time; still never restart by
   hand.
2. **Never edit files directly on the VPS.** All changes go through git
   (`main` branch → deploy). The checkout at `/home/saasapp/app` must stay
   clean; if it's dirty, stop and reconcile first.
3. **Never hardcode secrets in commands or logs.** They live in
   `/home/saasapp/app/.env` and Vercel env vars.
4. **Health check after every change:**
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:8010/health` →
   expect **200**, plus `https://api.wangari.imeantech.com/health` from
   outside.

## Standard deploys

### Backend (VPS) — the only approved way

```bash
ssh vps
cd /home/saasapp/app && bash deploy/update.sh            # code-only change
cd /home/saasapp/app && bash deploy/update.sh --migrate  # ONLY when prisma schema.prisma changed
```

The script pulls, builds, reloads the PM2 cluster one worker at a time, runs
`pm2 save`, then waits for the API to answer. It ends with
`Update complete. <sha>` — confirm that sha is the one you meant to ship.

Then verify:

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:8010/health   # expect 200
pm2 ls                                    # 2 online cluster workers (as saasapp)
```

Gotchas confirmed the hard way:

- If `git pull` refuses because of "detected dubious ownership", run it as
  `git -c safe.directory=/home/saasapp/app ...` (the script handles this; a
  manual pull must too).
- **Untracked probe files block the pull.** Probe scripts are copied to the
  VPS for live checks — `rm` them before pulling if git complains.

### Frontend (Vercel)

```bash
# from the REPO ROOT (not wangari-next/) — this is the working invocation
npx vercel deploy --prod --yes --scope lewis-ndungus-projects
```

**`--scope` is required.** Without it the deploy can fail with the unhelpful
`Error: Not authorized` even when you are signed in: the CLI's default scope
may not be the team that owns `wangari`. `vercel whoami` still prints a user
and `vercel project ls` still lists the project, which makes the message look
like an account problem rather than a scope one. Diagnose in that order:
`vercel whoami`, then `vercel teams ls`, then `vercel project ls`, then rerun
with `--scope <team-slug>`.

The repo root uploads the whole tree, so `.vercelignore` must stay in place
(a 95 MB scratch file once blew the 100 MB upload limit). Build output
confirms with `▲ Aliased https://wangari.imeantech.com`.

## Where everything lives

| Thing | Path / location |
|---|---|
| App checkout | `/home/saasapp/app` (git, branch `main`, owned by `saasapp`) |
| Deploy script | `/home/saasapp/app/deploy/update.sh [--migrate]` |
| Backend code | `/home/saasapp/app/server` (Express, TypeScript → `dist/`) |
| Backend `.env` | `/home/saasapp/app/.env` (JWT_SECRET, DATABASE_URL, PAYSTACK keys, SMTP, …) |
| PM2 process | `wangari-api`, cluster mode, 2 workers, **PORT=8010**, runs as `saasapp` |
| PM2 logs | `/home/saasapp/.pm2/logs/wangari-api-{out,error}.log` (pm2 must run as `saasapp` to see them) |
| Frontend | Vercel project `wangari`; production https://wangari.imeantech.com |
| nginx | vhost `api.wangari.imeantech.com` → upstream `wangari_api` → `127.0.0.1:8010`. Other sites on this box (`saas`, `solar` — sveenergy) are **not ours, do not touch** |
| TLS certs | Let's Encrypt via certbot (`certbot certificates` to list) |
| Database | **PostgreSQL** on the same box: `127.0.0.1:5432`, db `saas_db`, user `saas_app` |
| Database access | `psql` with `DATABASE_URL` from the app `.env` (see recipe below) |

Quick DB query (never echoes the password):

```bash
ssh vps 'cd /home/saasapp/app && U=$(grep -m1 "^DATABASE_URL=" .env | sed "s/^DATABASE_URL=//" | sed "s/?schema=.*//") && psql "$U" -t -A -c "SELECT count(*) FROM users;"'
```

Table names are snake_case plural (`users`, `farms`, `daily_production`,
`transactions`, `animal_movements`, …) — Prisma field `@map`s, not the model
names.

## Current production topology (re-verified 2026-10-06)

- **PM2 cluster mode**: 2 × Node workers on `127.0.0.1:8010`, behind nginx.
  Zero-downtime reloads, `pm2 save` runs on every deploy.
  **⚠ There is currently NO boot persistence** (no systemd unit, no lingering
  user service, no cron) — after a host reboot the API stays down until
  someone runs `deploy/update.sh` or `pm2 resurrect` as `saasapp`. See open
  items below.
- **Rate limiting**: Express `trust proxy 1`; nginx forwards
  `X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Proto`. Port 8010 binds
  loopback only — not reachable from the internet.
- **Domains**: `wangari.imeantech.com` (Vercel app),
  `api.wangari.imeantech.com` (primary API, used by the frontend),
  `api.imeantech.com` (API alias, same cert).
- The box also serves unrelated sites (`sveenergy`); keep clear of them.

## Access control model (do not break this)

Three layers; the server is the real enforcement:

1. **Express `authMiddleware`** — every route requires a valid JWT; expired
   trial + no active subscription → 403 `trialExpired` on all routes except
   auth / trial / paystack / subscriptions (so users can always pay/unlock).
   **Worker tokens inherit their farm owner's access state.**
2. **Next.js `AccessGate`** — locked accounts can only navigate to
   `/dashboard` and `/subscription`; everything else redirects.
3. **Worker lockout screen** — workers of a locked farm get a clean
   "Farm Access Paused" overlay (no raw errors).

The trial-status payload MUST include `status: "active"` on active
subscriptions — the frontend banner keys on it. Regression here shows a false
"trial expired" paywall to paying users (this bug happened; see git history).

## Live probes (run after deploys that touch these areas)

```bash
ssh vps "node /home/saasapp/app/server/deploy/probe-revenue-series.mjs"   # dashboard revenue series
ssh vps "node /home/saasapp/app/server/deploy/probe-m2-m4-live.mjs"       # compliance + pride layer
```

Both exit 0 on success and print one `OK` line per check.

## Known gaps / next moves

> **The product vision lives in [vision.md](vision.md) (the belief) and
> [roadmap.md](roadmap.md) (V1 records → V2 AI/automation → V3 IoT +
> connections). Read both before changing what the product *is*; this
> section is only ops.** Honest current state: [valuation-audit.md](valuation-audit.md);
> founder playbook: [founder-guide.md](founder-guide.md).

1. **⚠ PM2 boot persistence** — nothing resurrects the API after a host
   reboot (verified 6 Oct: no systemd unit for root or `saasapp`, no
   linger, no cron). Needs `pm2 startup` registered for the `saasapp` user
   and `pm2 save` kept current (the deploy script already saves).
2. **Observability** — ✅ basic metrics shipped: `GET /metrics` on the API
   returns per-worker uptime/bootAt, memory and request counts by outcome
   class (aggregates only — no URLs/tenants, pinned by test). `bootAt`
   moving between scrapes = a worker restart. Still open: **alerting** —
   nobody is paged; wire the metrics (or Sentry via `SENTRY_DSN`, which
   `initSentry()` already supports) to something that notifies.
3. **PostgreSQL tuning** — `saas_db` is on defaults; as usage grows set
   `shared_buffers`/`work_mem`, enable `pg_stat_statements` and the slow
   query log. *(This item used to say "MariaDB / innodb buffer pool" — the
   database is Postgres.)*
4. **Staging environment** — second PM2 app + `staging.api...` subdomain +
   separate DB, so deploys can be tested with real-data isolation before
   hitting production.
5. **AI module** — `AI_API_KEY` unset in `/home/saasapp/app/.env`; AI
   features fail until a key is provided. Deliberately deferred.
6. **Credential rotation** — the VPS password and Paystack live key were
   shared in chat during setup; rotate both (Paystack in dashboard, then
   update `.env` + Vercel env and redeploy).
7. **AGENTS.md is stale too** — it still quotes the old
   `/var/www/wangari` + port 3001 deploy line; this runbook is the source
   of truth until AGENTS.md is regenerated.

## Common tasks

```bash
# Tail logs (direct file read — works as root, no user switch needed)
ssh vps "tail -n 50 /home/saasapp/.pm2/logs/wangari-api-out.log"
ssh vps "tail -n 100 /home/saasapp/.pm2/logs/wangari-api-error.log"

# Live CPU/RAM for the app's processes
ssh vps "ps -u saasapp -o pid,%mem,%cpu,etime,cmd --sort=-%cpu | head -10"

# Health from outside
curl -s https://api.wangari.imeantech.com/health

# Per-worker process metrics (uptime, memory, request/error counts)
curl -s http://localhost:8010/metrics

# Renew TLS manually (normally automatic)
ssh vps "certbot renew --dry-run"
```

## If something is on fire

1. `pm2 ls` (run as the `saasapp` owner) — are both workers online? If one
   is errored: `pm2 reload wangari-api` — **never restart**.
2. Read the error log
   `/home/saasapp/.pm2/logs/wangari-api-error.log` — the actual error.
3. `curl localhost:8010/health` — is the app itself OK vs. nginx?
4. `free -h && uptime` — OOM or load spike?
5. Last resort rollback: `cd /home/saasapp/app && git log --oneline -5`,
   then `git checkout <last-good-sha> && bash deploy/update.sh` (the script
   rebuilds and reloads cleanly).
