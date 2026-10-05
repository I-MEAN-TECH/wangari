#!/usr/bin/env node
/**
 * Print the full AI health payload from the live API, especially the usage
 * object and sidelining state, since a summary probe passes when
 * `usage.requests` is `n/a` — which is not a real count.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..", "..");
const envPath = resolve(appRoot, ".env");

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
if (!secret) { console.error("ADMIN_JWT_SECRET missing"); process.exit(1); }

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

try {
  const a = await prisma.user.findFirst({
    where: { role: "super_admin" },
    select: { id: true, name: true, role: true, tokenVersion: true },
    orderBy: { id: "asc" },
  });
  if (!a) { console.error("No super_admin exists"); process.exit(1); }

  const jwt = (await import("jsonwebtoken")).default;
  const token = jwt.sign(
    { adminId: a.id, role: a.role, name: a.name, type: "admin", tv: a.tokenVersion || 0 },
    secret,
    { expiresIn: "60s" },
  );

  const res = await fetch("https://api.wangari.imeantech.com/api/admin/ai/health", {
    headers: { Authorization: "Bearer " + token },
  });

  if (res.status !== 200) {
    console.error(`HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const b = await res.json();
  console.log(`HTTP ${res.status}  pid=${b.pid}  candidates=${JSON.stringify(b.candidates)}`);
  console.log("");
  console.log("--- models ---");
  for (const m of b.models || []) {
    console.log(JSON.stringify({ name: m.model, state: m.state, reason: m.reason, sidelinedForMs: m.sidelinedForMs }));
  }
  console.log("");
  console.log("--- usage ---");
  console.log(JSON.stringify(b.usage, null, 2));
  console.log("");
  console.log(`fallbacks: ${(b.fallbacks || []).length} (newest first, capped at 50)`);
  console.log("recent records in this call:", (b.usage?.recent?.length ?? b.recent?.length ?? "n/a"));
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}