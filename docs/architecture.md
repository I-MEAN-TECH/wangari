# Wangari — Production Architecture

**Stack:** Next.js (Vercel, `wangari-next/`) → Express API (VPS, `server/`) → MariaDB (same VPS), fronted by nginx with Let's Encrypt TLS.

> **Operators & AI agents:** start with [ops-runbook.md](ops-runbook.md) — it has the golden rules, the deploy command, credentials locations, and the agreed roadmap. This file is the topology reference.
>
> **Why the product exists (read before changing what it is):** [vision.md](vision.md) is the brand constitution, and [roadmap.md](roadmap.md) is the long vision — V1 records, V2 AI/automation, V3 IoT + third-party connections. For the honest current state and valuation, see [valuation-audit.md](valuation-audit.md).

```
                        ┌────────────────────────────┐
  Users ── HTTPS ──────►│  Vercel (global edge CDN)  │
                        │  wangari.imeantech.com     │
                        │  Next.js UI + API routes   │
                        │  (paystack init/verify,    │
                        │   crons, webhooks)         │
                        └─────────────┬──────────────┘
                                      │ HTTPS (JWT)
                                      ▼
                        ┌────────────────────────────┐
                        │  VPS 20.164.18.34 (sve)    │
                        │  nginx :443 (TLS, ACME)    │
                        │   ├─ api.wangari.imeantech.com ─┐
                        │   └─ api.imeantech.com         │
                        │              │ proxy            │
                        │              ▼                  │
                        │  PM2 cluster (2 × Node)         │
                        │  wangari-api :3001              │
                        │  - zero-downtime reloads        │
                        │  - 400MB/worker memory cap      │
                        │   └─ MariaDB (same box)         │
                        └─────────────────────────────────┘
```

## Domain map

| Hostname | Serves | Where |
|---|---|---|
| `wangari.imeantech.com` | Next.js app | Vercel |
| `api.wangari.imeantech.com` | Express API (primary, used by frontend) | VPS :3001 via nginx |
| `api.imeantech.com` | Same API (alias) | VPS :3001 via nginx |

## Access control (defense in depth)

1. **Express `authMiddleware`** (`server/src/middleware/auth.ts`) — every route requires a valid JWT; token-version revocation; expired-trial + no-subscription → 403 on all routes except auth/trial/paystack/subscriptions. **Worker tokens inherit their farm owner's access state** (closed lockout bypass).
2. **Next.js `AccessGate`** (`wangari-next/src/components/access-gate.tsx`) — layout-level route gate: locked accounts can only reach `/dashboard` and `/subscription`.
3. **Worker lockout screen** — workers of a locked farm see a clean "Farm Access Paused" overlay, driven by the 403 `trialExpired` signal.

## Operations

- **Deploy backend:** `cd /var/www/wangari/server && git pull && npm run build && pm2 reload ecosystem.config.cjs --update-env`
- **Zero downtime:** `pm2 reload` recycles workers one at a time; never `pm2 restart` in production (it drops the port).
- **Secrets:** `/var/www/wangari/server/.env` on the VPS; Vercel env vars in the dashboard. Never committed.
- **Logs:** PM2 with `pm2-logrotate` (installed); Sentry for errors.
- **Capacity (measured):** ~1,400 req/s single-worker at p95 57ms; cluster mode doubles it. Comfortable for ~1,000+ DAU; first upgrade lever is VPS RAM, not code.

## Runbook quick reference

```bash
pm2 status                     # worker states
pm2 logs wangari-api           # tail logs
pm2 monit                      # live CPU/RAM per worker
curl localhost:3001/health     # liveness
sudo certbot renew --dry-run   # TLS renewal check
```
