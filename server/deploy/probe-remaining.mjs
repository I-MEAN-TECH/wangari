/**
 * Read-only inventory of what the remaining gated features would stand on.
 * Run ON THE VPS: node /home/saasapp/app/server/deploy/probe-remaining.mjs
 * Exit 0 = ran; output is data for the build-state decision, not a pass/fail gate.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("/home/saasapp/app/server/node_modules/@prisma/client");

const ENV_FILE = "/home/saasapp/app/.env";
function envValue(key) {
  const line = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in ${ENV_FILE}`);
  return line.slice(key.length + 1).replace(/^\s*"/, "").replace(/"\s*$/, "").trim();
}

const prisma = new PrismaClient({ datasources: { db: { url: envValue("DATABASE_URL") } } });

try {
  const total = await prisma.flock.count();
  const withHatch = await prisma.flock.count({ where: { hatchDate: { not: null } } });
  const hatchByType = await prisma.flock.groupBy({
    by: ["type"],
    _count: true,
    where: { hatchDate: { not: null } },
  });
  const animals = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM animals");
  const tagged = await prisma.$queryRawUnsafe(
    "SELECT count(*)::int AS n FROM flocks WHERE tag_from IS NOT NULL"
  );
  const marketPrices = await prisma.$queryRawUnsafe(
    "SELECT count(*)::int AS n FROM market_prices"
  );
  const sample = await prisma.flock.findMany({
    where: { hatchDate: { not: null } },
    take: 3,
    select: { id: true, name: true, type: true, hatchDate: true, currentCount: true },
  });
  console.log(JSON.stringify({
    flocks: total,
    withHatchDate: withHatch,
    hatchByType,
    animalRows: animals[0].n,
    taggedFlocks: tagged[0].n,
    marketPriceRows: marketPrices[0].n,
    sample,
  }, null, 1));
} finally {
  await prisma.$disconnect();
}
