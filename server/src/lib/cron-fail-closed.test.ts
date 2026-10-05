import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Cron routes send farmers email, so an open one is a spam relay pointed at
 * your own customer list. The guard is supposed to refuse anyone without the
 * shared secret.
 *
 * The bug this exists to catch: `if (CRON_SECRET && ...)`. When CRON_SECRET is
 * unset — an unset env var, a fresh Vercel project, a deploy that dropped it —
 * the left side is "" which is falsy, so the whole check is skipped and the
 * route serves anyone. The route still LOOKS protected, which is what makes it
 * survive review.
 *
 * Failing closed is the only safe reading: an unset secret must refuse, not
 * admit. A cron that quietly stops running is a far smaller failure than a cron
 * anyone can trigger.
 */
const FAIL_OPEN = "if (CRON_SECRET && authHeader !==";

const serverCronDir = join(process.cwd(), "src", "routes");
const nextCronDir = join(process.cwd(), "..", "wangari-next", "src", "app", "api", "cron");

function guardLinesIn(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => l.includes("authHeader !=="))
    .map((l) => l.trim());
}

describe("cron routes refuse when the secret is unset", () => {
  const serverFiles = readdirSync(serverCronDir).filter((f) => f.startsWith("cron"));
  const nextFiles = readdirSync(nextCronDir).filter(
    (d) => readFileSync(join(nextCronDir, d, "route.ts"), "utf8").length > 0,
  );

  it("finds the cron routes in both API layers", () => {
    // If this fails the sweep below is vacuous, so assert the surface exists.
    expect(serverFiles.length).toBeGreaterThan(0);
    expect(nextFiles.length).toBeGreaterThan(0);
  });

  const cases: Array<[string, string]> = [];
  for (const f of serverFiles) {
    const content = readFileSync(join(serverCronDir, f), "utf8");
    guardLinesIn(content).forEach((line, i) =>
      cases.push([`server/src/routes/${f}#${i + 1}`, line]),
    );
  }
  for (const d of nextFiles) {
    const content = readFileSync(join(nextCronDir, d, "route.ts"), "utf8");
    guardLinesIn(content).forEach((line, i) =>
      cases.push([`wangari-next/src/app/api/cron/${d}#${i + 1}`, line]),
    );
  }

  it("there are guards to check", () => {
    expect(cases.length).toBeGreaterThanOrEqual(11);
  });

  it.each(cases)("%s fails closed", (_where, line) => {
    // The specific defect: truthiness on an unset secret skips the whole check.
    expect(line, "guard admits everyone when CRON_SECRET is unset").not.toContain(FAIL_OPEN);
    // Fails closed means an absent secret refuses. That is asserted by the
    // presence of an explicit !CRON_SECRET branch in the file, not by the
    // guard line itself, so the shape is checked below.
    expect(line).toMatch(/authHeader !== `Bearer \$\{CRON_SECRET\}`/);
  });

  it.each(cases)("%s refuses explicitly when the secret is missing", (_where, _line) => {
    const content = _where.startsWith("server/")
      ? readFileSync(join(process.cwd(), "src", "routes", _where.replace(/^server\/src\/routes\//, "").split("#")[0]), "utf8")
      : readFileSync(
          join(nextCronDir, _where.replace(/^wangari-next\/src\/app\/api\/cron\//, "").split("#")[0], "route.ts"),
          "utf8",
        );
    expect(
      content.includes("if (!CRON_SECRET) {"),
      "no explicit refusal for a missing CRON_SECRET — an unset secret would fall through",
    ).toBe(true);
  });
});