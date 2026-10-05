#!/usr/bin/env node
/**
 * PROVE, against the LIVE server, that the super-admin AI health and IP
 * endpoints return real data — not merely a 401 from the guard.
 *
 * Every admin endpoint check so far has been "unauthenticated request gets
 * 401", which proves the guard works and nothing else. The interesting
 * failure is a router that mounts, authenticates, and then serves an empty
 * payload or throws — which a 401 cannot detect, because the request never
 * reaches the handler.
 *
 * ── how it authenticates, and why that is the least-privilege option ──────
 * There is no API key for this, and one should not be added just to make a
 * probe easier. So the probe signs a real admin token with the app's own
 * ADMIN_JWT_SECRET, for an EXISTING super_admin, using that user's current
 * tokenVersion so `requireAdmin`'s revocation check passes honestly rather
 * than being worked around.
 *
 * Guardrails, because a probe that needs super-admin really should be
 * paranoid about it:
 *   - expiresIn is 90 SECONDS, not the 4h the login path uses;
 *   - only GET requests are issued, against a fixed allowlist;
 *   - the secret is read from the app-root .env and never printed;
 *   - no row is created, changed or deleted.
 *
 * Run it on the box. It signs locally and calls the public API, so it proves
 * the deployed bundle — not a local import — is serving the data.
 *
 * Usage: node probe-admin-live.mjs [baseUrl]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..", "..");
const envPath = resolve(appRoot, ".env");
const BASE = process.argv[2] || "https://api.wangari.imeantech.com";

// Same first-'='-only parsing as every other helper in this directory. Do not
// let bash near this file: EMAIL_FROM has an unquoted space.
const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  let v = t.slice(eq + 1).trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1);
  }
  env[t.slice(0, eq).trim()] = v;
}

const secret = env.ADMIN_JWT_SECRET;
if (!secret) {
  console.error("ADMIN_JWT_SECRET missing from .env. Refusing to probe.");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

const failures = [];
try {
  const admin = await prisma.user.findFirst({
    where: { role: "super_admin" },
    select: { id: true, name: true, role: true, tokenVersion: true },
    orderBy: { id: "asc" },
  });
  if (!admin) {
    console.error("No super_admin exists. Refusing to probe.");
    process.exit(1);
  }

  const token = jwt.sign(
    { adminId: admin.id, role: admin.role, name: admin.name, type: "admin", tv: admin.tokenVersion || 0 },
    secret,
    { expiresIn: "90s" },
  );

  console.log(`super_admin #${admin.id} (${admin.name}), tokenVersion ${admin.tokenVersion || 0}, 90s expiry\n`);

  // GET only. Each expectation states what a real payload must contain, so an
  // empty object fails instead of passing as "200 and shaped right".
  const checks = [
    {
      path: "/api/admin/ai/health",
      label: "AI health",
      assert: (b) => {
        const probs = [];
        if (!Array.isArray(b.candidates)) probs.push("candidates not an array");
        if (!Array.isArray(b.models)) probs.push("models not an array");
        if (!b.usage) probs.push("usage missing");
        if (b.pid == null) probs.push("pid missing (per-worker view)");
        return probs;
      },
      show: (b) =>
        `candidates=${JSON.stringify(b.candidates)} models=${(b.models || []).length} ` +
        `sidelined=${(b.models || []).filter((m) => m.sidelinedForMs > 0).length} ` +
        `usage.requests=${b.usage?.requests ?? "n/a"} fallbackTaken=${b.usage?.fallbackTaken ?? "n/a"} ` +
        `pid=${b.pid}`,
    },
    {
      path: "/api/admin/ip",
      label: "IP rules",
      assert: (b) => (Array.isArray(b.rules) ? [] : ["rules not an array"]),
      show: (b) => `rules=${(b.rules || []).length} youAre=${b.youAre ?? "n/a"}`,
    },
    {
      path: "/api/admin/ip/preview",
      label: "IP preview (dry-run POST, no write)",
      method: "POST",
      body: { ip: "203.0.113.7", pattern: "203.0.113.0/24" },
      assert: (b) => (b && typeof b === "object" ? [] : ["not an object"]),
      show: (b) => JSON.stringify(b).slice(0, 160),
    },
  ];

  for (const c of checks) {
    const method = c.method || "GET";
    const res = await fetch(BASE + c.path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(c.body) } : {}),
    });

    const text = await res.text();
    if (res.status !== 200) {
      console.log(`FAIL  ${c.label.padEnd(22)} ${res.status} ${text.slice(0, 140)}`);
      failures.push(`${c.label} -> ${res.status}`);
      continue;
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      console.log(`FAIL  ${c.label.padEnd(22)} 200 but not JSON: ${text.slice(0, 120)}`);
      failures.push(`${c.label} -> not JSON`);
      continue;
    }

    const probs = c.assert(body);
    if (probs.length) {
      console.log(`FAIL  ${c.label.padEnd(22)} 200 but ${probs.join("; ")}`);
      failures.push(`${c.label} -> ${probs.join("; ")}`);
    } else {
      console.log(`OK    ${c.label.padEnd(22)} ${c.show(body)}`);
    }
  }
} catch (e) {
  console.error(`FAILED: ${e.message}`);
  failures.push(e.message);
} finally {
  await prisma.$disconnect();
}

if (failures.length) {
  console.error("\nLive admin endpoints are NOT healthy:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("\nLive admin endpoints are serving real data.");