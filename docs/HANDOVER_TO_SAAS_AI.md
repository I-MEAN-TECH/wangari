# HANDOVER — Deploying a NEW backend to a SHARED production VPS

You are deploying a second application to a server that **already runs a live
payments system**. Read this entire message before running any command.

---

## 1. DO THIS FIRST

```bash
ssh root@169.58.215.146
cat /home/AI_DEPLOYMENT_CONTRACT.md
```

That file on the server is the authoritative spec — tenant map, exact commands,
systemd unit, checklist. **Read it fully before touching anything.** This page is
the briefing; that file is the contract.

If you cannot SSH, stop and say so. Do not attempt blind changes.

---

## 2. THE ONE THING THAT MATTERS MOST

There are two apps on this host:

| | **EXISTING — SVE Energy** | **YOURS — deploy today** |
|---|---|---|
| What | Solar investment platform | SaaS product backend |
| Status | **LIVE, handles real M-Pesa money** | not deployed yet |
| Path | `/home/solarproject_system` | `/home/saasapp/app` |
| DB | `solar_invest` (user `solar_user`) | `saas_db` (user `saas_app`) |
| Port | `127.0.0.1:8000` | `127.0.0.1:8010` |
| Redis DB | `1` | **`2`** |
| Service | `gunicorn`, `daphne` | `saas-backend` |

A careless command can break live payment processing. **Never** run `git`,
`migrate`, `manage.py`, `systemctl restart gunicorn|daphne`, or edit any config
file belonging to the existing app. Your files, your ports, your database.

Ten prohibitions are listed in the contract. Read them.

---

## 3. ALREADY RESERVED FOR YOU

Do not change these — they are enforced.

- **Memory 3 GB hard cap** (`MemoryMax=3G`). Exceed it and the kernel kills
  *your* app, not the other. Sized for `--workers 3`.
- **CPU 150%** (`CPUQuota=150%`).
- **Ports 8010** (app), 8011 (ASGI/WebSocket if you need it).
- **Directory** `/home/saasapp/app`, owner `saasapp`, mode `0750`.
- **Database** `saas_db`, role `saas_app`, connection limit 20.
- **Redis DB index 2.**

Also ready: `/home/saasapp/app/saas-backend.service.template` — a valid systemd
unit with the caps already filled in. Copy it, change one line, use it.

---

## 4. BEFORE YOU START — PROVE THE BOX IS HEALTHY

```bash
systemctl is-active nginx gunicorn daphne postgresql@16-main redis-server
curl -sS -o /dev/null -w '%{http_code}\n' https://api.sveenergy.co.ke/api/health/
```

All six services must say `active` and health must return `200`. **If anything is
unhealthy, STOP and report it. Do not attempt to fix the existing app yourself.**
Include this output in your final report so the owner has a before/after.

---

## 5. THE FIVE GOTCHAS ON THIS SPECIFIC HOST

Each of these is a real problem that already happened here. Do not rediscover them.

1. **`X-Forwarded-Proto $scheme` is mandatory in nginx.** Without it a Django app
   with `SECURE_SSL_REDIRECT=True` returns a 301 loop and every health check fails
   silently. This cost real debugging time already.
2. **`pythonjsonlogger` must be in `requirements.txt`** if your `settings.py`
   defines a JSON log formatter. It was missing in the existing app — it only
   worked because someone pip-installed it by hand. A clean deploy crashes
   without it. Do not repeat this.
3. **Never use `sudo` or `su` for postgres.** Use this exact form:
   ```bash
   setpriv --reuid=postgres --regid=postgres --init-groups psql -c "..."
   ```
4. **If you restart Postgres, the first request per web worker returns 500**
   (`SSL connection has been closed unexpectedly`) from stale pooled connections
   (`CONN_MAX_AGE=600`). Fix by restarting **only your own** service:
   `systemctl restart saas-backend`. Never restart the other app's services.
   Then re-check several times — the error is intermittent.
5. **Rotate the DB password before use.** The `saas_app` role currently has the
   placeholder `CHANGE_ME_BEFORE_USE`. Set a real one and use it in your `.env`.

---

## 6. MINIMUM `.env`

```ini
DEBUG=False
SECRET_KEY=<python3 -c "import secrets;print(secrets.token_urlsafe(64))">
PRODUCTION=True
ALLOWED_HOSTS=<your-domain>,127.0.0.1,localhost

DATABASE_NAME=saas_db
DATABASE_USER=saas_app
DATABASE_PASSWORD=<the one you rotated above>
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432

REDIS_URL=redis://127.0.0.1:6379/2      # DB 2, NOT 1

CORS_ALLOWED_ORIGINS=https://<your-frontend-domain>
CSRF_TRUSTED_ORIGINS=https://<your-frontend-domain>
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

File mode `0600`, owner `saasapp`.

---

## 7. VERIFY BEFORE YOU CLAIM DONE

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8010/          # yours
curl -sS -o /dev/null -w '%{http_code}\n' https://api.sveenergy.co.ke/api/health/
curl -sS -o /dev/null -w '%{http_code}\n' https://api.sveenergy.co.ke/api/projects/
systemctl show saas-backend -p MemoryMax      # must be 3221225472, NOT infinity
```

All must pass. Run the request checks **several times** — connection-pool issues
are intermittent and one green response proves nothing.

---

## 8. REPORT BACK

State plainly: what you deployed, your final verification output (including the
pre-deploy health check from step 4), the resources you were allocated, and
anything you could not finish. If anything failed, say so — do not paper over it.

---

## 9. IF SOMETHING BREAKS

1. Stop. Do not retry destructive commands.
2. Do not repair the existing app. Out of scope for you.
3. Roll back only your own work:
   `systemctl stop saas-backend && systemctl disable saas-backend`
4. Report exact commands run and their output.

---

**Contract prepared 2026-10-03.** The existing app was verified healthy at
handover: `/api/health/` 200 `healthy`, `database: ok`, `cache: ok`, all services
`active`, 15/15 consecutive project requests 200.