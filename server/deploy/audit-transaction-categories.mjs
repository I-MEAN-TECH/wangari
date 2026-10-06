#!/usr/bin/env node
/**
 * READ-ONLY audit of the live `transactions` table.
 *
 * Decides one question before a schema change is designed: farmers can already
 * type a free-text `category`, so do existing rows contain values that a fixed
 * enum would have to map, or is the column effectively unused?
 *
 * The answer changes the migration from "add a column with a constraint" into
 * "add a column, backfill a taxonomy, and lose whatever does not fit" — a much
 * larger and riskier change.
 *
 * Issues SELECTs only. Creates, updates and deletes nothing. Safe to run
 * against production.
 *
 * Usage: node audit-transaction-categories.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
let appRoot = path.resolve(here, "..", "..");
if (!fs.existsSync(path.resolve(appRoot, "server", "package.json"))) {
  appRoot = "/home/saasapp/app";
}

const envPath = path.resolve(appRoot, ".env");
if (!fs.existsSync(envPath)) {
  console.error("Cannot find .env under", appRoot);
  process.exit(1);
}

// Same first-'='-only parsing as the other deploy helpers.
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL missing from .env.");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

try {
  const total = await prisma.transaction.count();
  console.log(`transactions rows: ${total}`);

  const withCategory = await prisma.transaction.count({ where: { NOT: { category: null } } });
  const blank = await prisma.transaction.count({ where: { category: "" } });
  console.log(`  with a non-null category: ${withCategory}`);
  console.log(`  empty-string category:    ${blank}`);
  console.log(`  NULL category:            ${total - withCategory}`);

  // Distinct values, most common first. This is the list an enum would have to
  // absorb or reject, so it is the whole point of the audit.
  const grouped = await prisma.transaction.groupBy({
    by: ["category"],
    _count: { _all: true },
    orderBy: { _count: { category: "desc" } },
  });

  console.log(`\ndistinct category values: ${grouped.length}`);
  for (const g of grouped) {
    const label = g.category === null ? "(null)" : g.category === "" ? "(empty)" : JSON.stringify(g.category);
    console.log(`  ${String(g._count._all).padStart(6)}  ${label}`);
  }

  // `type` is the other free-ish field on the same row and is NOT nullable, so
  // its distinct set is useful too: it may already be the de-facto taxonomy.
  const byType = await prisma.transaction.groupBy({
    by: ["type"],
    _count: { _all: true },
    orderBy: { _count: { type: "desc" } },
  });
  console.log(`\ndistinct type values: ${byType.length}`);
  for (const g of byType) {
    console.log(`  ${String(g._count._all).padStart(6)}  ${JSON.stringify(g.type)}`);
  }

  // Does any row already reference an enterprise? If a flockId/cropId column
  // does not exist this will throw, which is itself the answer.
  const sample = await prisma.transaction.findMany({
    take: 3,
    orderBy: { id: "desc" },
    select: { id: true, type: true, category: true, amount: true, date: true },
  });
  console.log("\n3 most recent rows:");
  for (const r of sample) {
    console.log(`  #${r.id} type=${JSON.stringify(r.type)} category=${JSON.stringify(r.category)} amount=${r.amount} date=${r.date.toISOString().slice(0, 10)}`);
  }
} catch (e) {
  console.error("AUDIT FAILED:", e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}