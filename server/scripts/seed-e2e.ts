/**
 * Seeds one throwaway farmer account for end-to-end UI testing.
 *
 * Deliberately NOT the production seed: this creates a single user, one farm,
 * and nothing else. An empty farm is the state that matters — it is the state
 * every new farmer is actually in, and the only state in which the create-flock
 * modal and the first-run experience can be tested honestly.
 *
 * Run against the tunneled test database only. It refuses to touch a database
 * whose name is not wangari_test, because the cost of being wrong here is a
 * farmer's real farm.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "e2e@wangari.test";
const PASSWORD = "Wangari123!";

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("wangari_test")) {
    throw new Error(
      `Refusing to seed. DATABASE_URL must point at wangari_test, got: ${url.replace(/:[^:@]*@/, ":***@")}`
    );
  }

  const password = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password },
    create: {
      name: "Test Farmer",
      email: EMAIL,
      password,
      role: "farm_owner",
      emailVerified: new Date(),
      // A live trial, so nothing is blocked by planGate while we drive the UI.
      trialStartsAt: new Date(),
      trialEndsAt: new Date(Date.now() + 365 * 86_400_000),
    },
  });

  let farm = await prisma.farm.findFirst({ where: { ownerId: user.id } });
  if (!farm) {
    farm = await prisma.farm.create({
      data: { name: "Test Farmer's Farm", ownerId: user.id, code: "E2ETEST", farmType: "poultry" },
    });
    await prisma.farmMember.create({
      data: { userId: user.id, farmId: farm.id, role: "farm_owner" },
    });
  }

  // Already claimed, so the onboarding gate does not intercept every screen
  // under test. The gate has its own 19 tests.
  await prisma.farm.update({ where: { id: farm.id }, data: { claimedAt: new Date() } });

  const flocks = await prisma.flock.count({ where: { farmId: farm.id } });

  console.log(
    JSON.stringify(
      { email: EMAIL, password: PASSWORD, userId: user.id, farmId: farm.id, existingFlocks: flocks },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());