/**
 * Seeds one flock carrying a SINGLE ANITRAC tag (no range end).
 *
 * Exists to verify the summary row that sits above the ANITRAC keypad. Before
 * the fix, `resolveTagRange` returned span 0 for a lone tag, so this flock
 * rendered as "Optional. Skip if your animals are not tagged" — the app
 * denying a tag that was genuinely recorded.
 *
 * Refuses to run against anything but the test database.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("wangari_test")) {
    throw new Error(
      `Refusing to seed. DATABASE_URL must point at wangari_test, got: ${url.replace(/:[^:@]*@/, ":***@")}`
    );
  }

  const farm = await prisma.farm.findFirst({ orderBy: { id: "asc" } });
  if (!farm) throw new Error("No farm found — run seed-e2e.ts first.");

  // Delete any previous run's flock so re-running is idempotent.
  await prisma.flock.deleteMany({ where: { farmId: farm.id, name: "E2E Single Tag Flock" } });

  const flock = await prisma.flock.create({
    data: {
      name: "E2E Single Tag Flock",
      category: "poultry",
      breed: "ISA Brown",
      initialCount: 1,
      currentCount: 1,
      costPerAnimal: 350,
      totalInvestment: 350,
      tagFrom: "141001410000225",
      tagTo: "", // ← the whole point: one tag, no range end
      farmId: farm.id,
    },
  });

  console.log(JSON.stringify({ flockId: flock.id, name: flock.name, tagFrom: flock.tagFrom, tagTo: flock.tagTo }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());