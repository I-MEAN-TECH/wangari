# Agent / Operator Instructions

**Before doing anything on the Wangari VPS or its deployment, read:**

1. [docs/ops-runbook.md](docs/ops-runbook.md) — golden rules, deploy command, where everything lives, incident playbook
2. [docs/architecture.md](docs/architecture.md) — topology, domains, access-control layers

Non-negotiables:

- Backend deploys: `cd /home/saasapp/app && bash deploy/update.sh` (add `--migrate` only when `prisma/schema.prisma` gained a migration) — **never a hand-run `pm2 restart`/`pm2 start`**. Note the script itself uses `PM2_ACTION=start`, which restarts both workers together for a second or two; see [DEPLOY-HARDENING.md](docs/DEPLOY-HARDENING.md) for why that beats a rolling reload here. A manual incident reload is `pm2 reload wangari-api`.
- All changes through git on `main`; never edit files directly on the VPS.
- After any backend change: `curl -s localhost:8010/health` must return 200.
- The trial-status payload must include `status: "active"` for active subscriptions — the frontend paywall UI keys on it.
- Secrets live in `/home/saasapp/app/.env` (VPS) and Vercel project env vars — never in git, never in chat logs.
- Frontend deploys: `npx vercel deploy --prod --yes --scope lewis-ndungus-projects` from the repo root (without `--scope` it can fail with `Not authorized`).

Known open items are listed at the end of the runbook (observability, MariaDB tuning, staging env, AI key, credential rotation) — check there before assuming something is "missing by accident".
