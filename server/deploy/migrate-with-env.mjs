#!/usr/bin/env node
/**
 * Run `prisma migrate deploy` against the LIVE database, with DATABASE_URL
 * taken from the app-root .env.
 *
 * ── why this exists rather than a one-liner ───────────────────────────────
 * Two things about this server conspire to break the obvious command:
 *
 *   1. The .env lives at the APP ROOT, not at server/.env. Prisma loads the
 *      file relative to the schema and the working directory, so running from
 *      server/ finds nothing and P1012 says DATABASE_URL is missing — which
 *      reads like a broken database rather than a file in the wrong place.
 *
 *   2. `set -a; . ./.env` also fails, because one line is
 *      EMAIL_FROM=Wangari <noreply@imeantech.com> — unquoted, with a space,
 *      so the shell tries to run it as a command. It has been masking the
 *      first problem for a while.
 *
 * So the file is parsed here, on the first `=` only, which is the convention
 * the file already follows and the only one that survives a value containing
 * an equals sign.
 *
 * Refuses to run if DATABASE_URL is absent rather than deploying against
 * nothing: a migration applied to the wrong database is worse than a migration
 * not applied.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// server/deploy -> server -> app root
const appRoot = resolve(here, "..", "..");
const envPath = resolve(appRoot, ".env");

if (!existsSync(envPath)) {
  console.error(`No .env at ${envPath}. Refusing to migrate.`);
  process.exit(1);
}

const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq).trim();
  // Everything after the FIRST '='. A value containing '=' (a password, a
  // base64 blob, a query string) is otherwise truncated.
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env. Refusing to migrate.");
  process.exit(1);
}

const schema = resolve(appRoot, "server", "prisma", "schema.prisma");
const result = spawnSync(
  "npx",
  ["prisma", "migrate", "deploy", "--schema", schema],
  {
    cwd: appRoot,
    // Only DATABASE_URL is forwarded. Passing the whole parsed file into the
    // child would quietly change unrelated runtime behaviour for every other
    // command that later sources this same file.
    env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);