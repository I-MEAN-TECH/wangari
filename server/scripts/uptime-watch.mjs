/**
 * Uptime watchdog — runs ON the VPS via cron every 5 minutes.
 *
 * Detects (and emails admin@imeantech.com about):
 *   - API process down or not responding on /health
 *   - Database unreachable (real query, not just a TCP ping)
 *   - Crash-looping: PM2 restart count spiking (more than 3 restarts in
 *     10 minutes — PM2 masks crashes by "restarting", so /health alone
 *     can look fine between restarts)
 *   - .env integrity: file unreadable, suspiciously small, or missing/empty
 *     required keys (truncation/damage — this exact failure took production
 *     down silently on 2026-09-18, so it now pages within 5 minutes)
 *   - Recovery (so you know the alert can be ignored)
 *
 * Env-baseline: on every healthy run the watchdog saves the SMTP creds from
 * .env to logs/.env-watchdog-baseline.json — so if .env breaks, the alert
 * email can STILL be sent using the last-known-good values.
 *
 * Note: this runs on the VPS itself, so it cannot detect total VPS loss
 * (if the box is dead, so is the watchdog). For that, add a free external
 * monitor (UptimeRobot / cron-job.org, 5-min checks) pointing at
 * https://api.wangari.imeantech.com/health — one-time 2-minute setup.
 *
 * Install on the VPS (every 5 minutes):
 *   cron: "*" + "/5 * * * *"  →  cd /var/www/wangari/server && node scripts/uptime-watch.mjs >> logs/uptime.log 2>&1
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";

const ROOT = new URL("..", import.meta.url).pathname;

function env(key, fallback = "") {
  if (process.env[key]) return process.env[key];
  try {
    const match = readFileSync(`${ROOT}.env`, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim() : fallback;
  } catch {
    return fallback;
  }
}

const API_URL = env("API_SELF_URL", "http://localhost:3001");
// The PM2 process name changed when the app moved to the shared VPS (the old
// box ran it as "wangari-server"; ecosystem.config.cjs now names it
// "wangari-api"). Hard-coding the old name made this check fail forever.
const PM2_PROCESS_NAME = process.env.PM2_PROCESS_NAME || "wangari-api";
const ALERT_EMAIL = env("ADMIN_ALERT_EMAIL", "admin@imeantech.com");
const STATE_FILE = "/tmp/wangari-uptime-state.json";
const BASELINE_FILE = new URL("../logs/.env-watchdog-baseline.json", import.meta.url).pathname;

/** Crash-loop thresholds: more than this many PM2 restarts in the window alerts. */
const RESTART_WINDOW_MS = 10 * 60 * 1000;
const RESTART_MAX_IN_WINDOW = 3;

/** Keys that MUST exist with non-empty values for production to work. */
const REQUIRED_ENV_KEYS = [
  "PORT", "NODE_ENV", "DATABASE_URL", "JWT_SECRET", "ADMIN_JWT_SECRET",
  "FRONTEND_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS",
  "CRON_SECRET", "GOOGLE_CLIENT_ID",
];
/** Below this size the .env is certainly truncated (full file ≈ 1.3KB). */
const MIN_ENV_BYTES = 600;

function parseEnvFile() {
  const raw = readFileSync(`${ROOT}.env`, "utf8");
  const parsed = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) parsed[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
  return { raw, parsed };
}

function checkEnvIntegrity() {
  let raw, parsed;
  try {
    ({ raw, parsed } = parseEnvFile());
  } catch (e) {
    return { ok: false, detail: `Cannot read .env: ${e?.message || e}`, parsed: {} };
  }
  if (Buffer.byteLength(raw, "utf8") < MIN_ENV_BYTES) {
    return { ok: false, detail: `.env is only ${Buffer.byteLength(raw, "utf8")} bytes (expected ≥${MIN_ENV_BYTES}) — likely truncated`, parsed };
  }
  const missing = REQUIRED_ENV_KEYS.filter((k) => !parsed[k]);
  if (missing.length > 0) {
    return { ok: false, detail: `Missing/empty required keys: ${missing.join(", ")}`, parsed };
  }
  return { ok: true, detail: `${Object.keys(parsed).length} keys, all required present`, parsed };
}

/**
 * Crash-loop detection via `pm2 jlist` (global CLI — the pm2 npm package is
 * not installed locally). Compares the restart counter against the value
 * recorded last run; every increase is a restart event. More than
 * RESTART_MAX_IN_WINDOW within the window → fail.
 */
async function checkRestartLoop() {
  let restarts, pmUptime;
  try {
    const { execFile } = await import("child_process");
    const out = await new Promise((resolve, reject) => {
      execFile("pm2", ["jlist"], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
        err ? reject(err) : resolve(stdout)
      );
    });
    const procs = JSON.parse(out);
    const proc = procs.find((p) => p.name === PM2_PROCESS_NAME);
    if (!proc) {
      return {
        ok: false,
        detail: `PM2 process ${PM2_PROCESS_NAME} not found (have: ${procs.map((p) => p.name).join(", ") || "none"})`,
        restarts: 0,
      };
    }
    restarts = proc.pm2_env?.restart_time ?? 0;
    pmUptime = proc.pm2_env?.pm_uptime ?? 0;
  } catch (e) {
    return { ok: false, detail: `Cannot reach PM2: ${e?.message || e}`, restarts: 0 };
  }

  const state = readState();
  const prevRestarts = state.lastRestarts ?? restarts;
  const events = state.restartEvents ?? [];
  const now = Date.now();

  if (restarts > prevRestarts) {
    // (re)record each new restart event
    for (let i = prevRestarts; i < restarts; i++) events.push(now);
  }
  // drop events older than the window
  const recent = events.filter((t) => now - t < RESTART_WINDOW_MS);

  return {
    ok: recent.length <= RESTART_MAX_IN_WINDOW,
    detail: recent.length > RESTART_MAX_IN_WINDOW
      ? `Crash-loop: ${recent.length} PM2 restarts in ${RESTART_WINDOW_MS / 60000} min (current count ${restarts}, up since ${pmUptime ? new Date(pmUptime).toISOString() : "?"})`
      : `${restarts} total restarts; ${recent.length} in last ${RESTART_WINDOW_MS / 60000} min`,
    restarts,
    recentCount: recent.length,
  };
}

/** Last-known-good copy of alert-critical env values, for alerting when .env is broken. */
function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeBaseline(parsed) {
  try {
    mkdirSync(new URL("../logs", import.meta.url).pathname, { recursive: true });
    const keep = {};
    for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "EMAIL_FROM", "ADMIN_ALERT_EMAIL"]) {
      if (parsed[k]) keep[k] = parsed[k];
    }
    writeFileSync(BASELINE_FILE, JSON.stringify(keep, null, 2), { mode: 0o600 });
  } catch {
    // non-fatal
  }
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { down: false };
  }
}

async function writeState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // non-fatal
  }
}

function failEmail(checks) {
  const rows = checks
    .map((c) => `<tr><td style="padding:8px 14px;background:#fef2f2;border-radius:8px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#dc2626;">${c.name}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#334155;">${c.detail}</p></td></tr>
      <tr><td style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>`)
    .join("");
  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <tr><td style="background:#dc2626;padding:20px 32px;text-align:center;">
      <span style="font-size:20px;font-weight:700;color:#fff;">🚨 Wangari API — problem detected</span></td></tr>
    <tr><td style="padding:28px 32px;">
      <p style="margin:0 0 14px;font-size:14px;color:#334155;">Checks failed at ${new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })} (EAT):</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <p style="margin:16px 0 0;font-size:12px;color:#64748b;">PM2 auto-restarts the API, but if this repeats, SSH in and check <code>pm2 logs wangari-server</code>. You'll get a recovery email when it's back.</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

function recoverEmail() {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <tr><td style="background:#16a34a;padding:20px 32px;text-align:center;">
      <span style="font-size:20px;font-weight:700;color:#fff;">✅ Wangari API — recovered</span></td></tr>
    <tr><td style="padding:28px 32px;">
      <p style="margin:0;font-size:14px;color:#334155;">The API and database are responding again as of ${new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })} (EAT). No action needed.</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

async function main() {
  const checks = [];

  // 0. .env integrity (FIRST — the 2026-09-18 silent-truncation outage)
  const envCheck = checkEnvIntegrity();
  checks.push({ name: ".env integrity", ok: envCheck.ok, detail: envCheck.detail });

  // If .env is damaged, restore alert-critical values from the last-known-good
  // baseline so the alert email below can actually be sent.
  if (!envCheck.ok) {
    const base = readBaseline();
    for (const [k, v] of Object.entries(base)) {
      if (!process.env[k]) process.env[k] = v;
    }
  } else {
    await writeBaseline(envCheck.parsed);
  }

  // 1. API health
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(8000) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.status === "ok") checks.push({ name: "API /health", ok: true });
    else checks.push({ name: "API /health", ok: false, detail: `HTTP ${res.status} — responded but unhealthy` });
  } catch (e) {
    checks.push({ name: "API /health", ok: false, detail: `No response: ${e?.message || e}` });
  }

  // 2. Crash-loop detection (restarts > 3 in 10 min)
  const restartCheck = await checkRestartLoop();
  checks.push({ name: "PM2 restart loop", ok: restartCheck.ok, detail: restartCheck.detail });

  // 3. Database (real query — uses the env values we just verified)
  try {
    process.env.DATABASE_URL = process.env.DATABASE_URL || env("DATABASE_URL");
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    checks.push({ name: "Database", ok: true });
  } catch (e) {
    checks.push({ name: "Database", ok: false, detail: e?.message || String(e) });
  }

  const failed = checks.filter((c) => !c.ok);
  const state = readState();

  // persist restart bookkeeping with whichever outcome
  const nextState = {
    down: failed.length > 0 ? true : false,
    since: failed.length > 0 ? (state.down ? state.since : new Date().toISOString()) : undefined,
    lastRestarts: restartCheck.restarts ?? state.lastRestarts,
    restartEvents: restartCheck.restarts !== undefined
      ? (restartCheck.ok ? [] : (state.restartEvents ?? []))
      : state.restartEvents,
  };
  if (failed.length === 0) {
    nextState.down = false;
    nextState.since = undefined;
  }
  writeState(nextState);

  if (failed.length > 0 && !state.down) {
    // First failure — alert.
    console.log(`[uptime] DOWN — ${failed.map((f) => f.name).join(", ")}`);
    await sendAlert(failEmail(checks), `🚨 Wangari API problem — ${failed[0].name} failed`);
  } else if (failed.length === 0 && state.down) {
    // Recovery.
    const mins = state.since ? Math.round((Date.now() - new Date(state.since).getTime()) / 60000) : "?";
    console.log(`[uptime] RECOVERED after ~${mins} min`);
    await sendAlert(recoverEmail(), "✅ Wangari API recovered");
  } else {
    console.log(`[uptime] ${failed.length ? "still down" : "all ok"}`);
  }
}

/**
 * Ensure the alert emailer has SMTP creds. Under cron, process.env lacks the
 * .env values — and email.js reads them from process.env. Load from the file
 * first, falling back to the last-known-good baseline (use when .env is the
 * broken thing).
 */
function primeAlertEmailEnv() {
  const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "EMAIL_FROM", "RESEND_API_KEY"];
  for (const k of keys) {
    if (!process.env[k]) process.env[k] = env(k) || readBaseline()[k] || "";
  }
}

async function sendAlert(html, subject) {
  primeAlertEmailEnv();
  try {
    const { sendEmail } = await import("../dist/lib/email.js");
    await sendEmail({ to: ALERT_EMAIL, subject, html, template: "oneoff" });
    console.log("[uptime] alert email sent");
  } catch (e) {
    console.error("[uptime] alert email failed:", e?.message);
  }
}

main().catch((e) => {
  console.error("[uptime] watchdog error:", e?.message);
  process.exit(1);
});
