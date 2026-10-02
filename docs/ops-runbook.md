# Wangari — Operations Runbook (VPS)

> **Read this first** if you are a human or an AI agent asked to do anything on
> the Wangari VPS (`lewis@20.164.18.34`, hostname `sve`, Debian, user `lewis`,
> passwordless sudo available). Then read [architecture.md](architecture.md)
> for the full topology and [server/ecosystem.config.cjs](../server/ecosystem.config.cjs)
> for the PM2 definition.

## Golden rules

1. **Never `pm2 restart` on production.** Use `pm2 reload` — cluster workers
   recycle one at a time so the API never goes dark.
2. **Never edit files directly on the VPS.** All changes go through git
   (`main` branch → deploy). The VPS checkout at `/var/www/wangari` must stay
   clean; if it's dirty, stop and reconcile first.
3. **Never hardcode secrets in commands or logs.** They live in
   `/var/www/wangari/server/.env` and Vercel env vars.
4. **Health check after every change:** `curl -s localhost:3001/health` on the
   VPS, plus `https://api.wangari.imeantech.com/health` from outside.

## Standard backend deploy (the only approved way)

```bash
cd /var/www/wangari/server && git pull && npm run build && pm2 reload ecosystem.config.cjs --update-env
```

Then verify:

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/health   # expect 200
pm2 ls                                                                 # 2 online cluster workers
```

Frontend deploys itself: push to `main` → Vercel builds automatically.
Project root on Vercel is `wangari-next` (if a build says "No Next.js version
detected", the Vercel root-directory setting was reset — set it back to
`wangari-next`).

## Where everything lives

| Thing | Path / location |
|---|---|
| App checkout | `/var/www/wangari` (git, branch `main`) |
| Backend code | `/var/www/wangari/server` (Express, TypeScript → `dist/`) |
| Backend `.env` | `/var/www/wangari/server/.env` (incl. `JWT_SECRET`, `PAYSTACK_SECRET_KEY`, SMTP) |
| PM2 config | `/var/www/wangari/server/ecosystem.config.cjs` |
| PM2 process name | `wangari-api` (cluster, 2 workers, 400MB cap each) |
| PM2 logs | `/home/lewis/.pm2/logs/wangari-api-{out,error}.log` (pm2-logrotate installed) |
| Frontend | Vercel project `wangari` (team `lewis-ndungus-projects`), root dir `wangari-next` |
| nginx sites | `/etc/nginx/sites-available/wangari` (web) and `wangari-api` (API) |
| TLS certs | Let's Encrypt via certbot (`certbot certificates` to list) |
| Database | MariaDB on same box, Prisma ORM |
| Database access | `sudo mysql` on the VPS |

## Current production topology (as of 2026-09-30)

- **2 vCPU, 913 MB RAM + 2 GB swap** — swap is active and sized for builds.
- **PM2 cluster mode**: 2 × Node workers on port 3001 behind nginx.
  - Zero-downtime reloads, per-worker 400MB memory restart cap.
  - Boot persistence: systemd unit `pm2-lewis` (enabled). After a VPS reboot
    PM2 resurrects `wangari-api` automatically (`pm2 save` is current).
- **Measured capacity**: ~1,350 req/s at 100 concurrent (p95 ≈ 113ms).
  Comfortable for ~1,000+ daily active users. First scaling lever = VPS RAM.
- **Rate limiting**: Express `trust proxy 1`; nginx forwards `X-Real-IP` /
  `X-Forwarded-For` / `X-Forwarded-Proto`. Port 3001 is NOT reachable from
  the internet — only via nginx.
- **Domains**: `wangari.imeantech.com` (Vercel app),
  `api.wangari.imeantech.com` (primary API, used by frontend),
  `api.imeantech.com` (API alias, same cert).

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

## Known gaps / next moves (agreed roadmap)

> **The product vision lives in [vision.md](vision.md) (the belief) and
> [roadmap.md](roadmap.md) (V1 records → V2 AI/automation → V3 IoT + connections).
> Read both before changing what the product *is*; this section is only ops.**
> The honest current state and valuation is [valuation-audit.md](valuation-audit.md);
> the founder's money-and-pitch playbook is [founder-guide.md](founder-guide.md).

1. **Observability** — pm2-logrotate is in; add a lightweight metrics endpoint
   or Sentry performance for latency trends + worker restart counts, so growth
   is visible before it hurts.
2. **Database tuning** — MariaDB is on defaults; set innodb buffer pool size
   and enable the slow-query log as user count grows.
3. **Staging environment** — second PM2 app + `staging.api...` subdomain +
   separate DB, so deploys can be tested with real data isolation before
   hitting production.
4. **AI module** — `AI_API_KEY` is unset in `/var/www/wangari/server/.env`; AI
   features fail until a key (e.g. Gemini) is provided. Deliberately deferred.
5. **Credential rotation** — VPS password and Paystack live key were shared in
   chat during setup; rotate both (Paystack in dashboard, then update `.env`
   + Vercel env and redeploy).

## Common tasks

```bash
# Tail logs
pm2 logs wangari-api --lines 50

# Live CPU/RAM per worker
pm2 monit

# Check DB quickly
sudo mysql wangari_db -e "SELECT COUNT(*) FROM User;"

# Renew TLS manually (normally automatic)
sudo certbot renew --dry-run

# Restart after catastrophic failure only (drops traffic for ~2s)
pm2 reload ecosystem.config.cjs --update-env   # NOT restart
```

## If something is on fire

1. `pm2 ls` — are both workers online? If one is errored: `pm2 reload wangari-api`.
2. `pm2 logs wangari-api --err --lines 100` — read the actual error.
3. `curl localhost:3001/health` — is the app itself OK vs. nginx?
4. `free -h && uptime` — OOM or load spike?
5. Last resort rollback: `cd /var/www/wangari/server && git log --oneline -5`
   then `git checkout <last-good-sha> && npm run build && pm2 reload ecosystem.config.cjs`.
