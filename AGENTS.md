# Agent / Operator Instructions

**Before doing anything on the Wangari VPS or its deployment, read:**

1. [docs/ops-runbook.md](docs/ops-runbook.md) — golden rules, deploy command, where everything lives, incident playbook
2. [docs/architecture.md](docs/architecture.md) — topology, domains, access-control layers

Non-negotiables:

- Backend deploys: `cd /var/www/wangari/server && git pull && npm run build && pm2 reload ecosystem.config.cjs --update-env` — **never `pm2 restart`** (zero-downtime cluster).
- All changes through git on `main`; never edit files directly on the VPS.
- After any backend change: `curl -s localhost:3001/health` must return 200.
- The trial-status payload must include `status: "active"` for active subscriptions — the frontend paywall UI keys on it.
- Secrets live in `/var/www/wangari/server/.env` (VPS) and Vercel project env vars — never in git, never in chat logs.

Known open items are listed at the end of the runbook (observability, MariaDB tuning, staging env, AI key, credential rotation) — check there before assuming something is "missing by accident".
