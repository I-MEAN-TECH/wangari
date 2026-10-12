import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Registering an ANITRAC tag and changing a group's head count used to be two
 * disconnected screens.
 *
 * The failure this pins shut: a cattle farmer with ONE cow buys a second. She
 * registers its tag — and that is the screen she is on — but the tag route
 * only ever wrote an `Animal` row. The flock's `currentCount` stayed at 1. So
 * the traceability list said two cows and the herd screen said one, and
 * nothing anywhere said so. It surfaces the day a buyer or a county officer
 * asks for the register.
 *
 * The other half of the rule matters just as much: the tag route must NOT
 * move the count by default. A farmer tagging a herd of twelve he already
 * counted is adding detail on top of a number that is already right, and
 * silently adding twelve would corrupt the very thing the previous paragraph
 * was about. So there are two honest modes and the caller has to say which.
 *
 * These read the route source, matching how flock-herd-routes.test.ts holds
 * invariants that `tsc` cannot see and no unit test reaches.
 */

const serverSrc = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts: string[]): string {
  try {
    return readFileSync(join(serverSrc, ...parts), "utf8");
  } catch {
    return "";
  }
}

const src = read("routes", "animals.ts");

/** The source of the POST / handler that creates animals. */
function createBlock(): string {
  const start = src.indexOf('router.post("/",');
  const end = src.indexOf("router.patch(\"/:id\"");
  return start > -1 && end > start ? src.slice(start, end) : "";
}

const block = createBlock();

describe("registering a tag can also record a new animal", () => {
  it("found the create route in the source", () => {
    // A silent empty read would make every assertion below vacuous.
    expect(src.length).toBeGreaterThan(0);
    expect(block.length).toBeGreaterThan(500);
  });

  it("offers an explicit opt-in rather than assuming", () => {
    expect(block).toMatch(/addToFlock/);
    // Default is OFF: a tag is detail on top of an existing count.
    expect(block).toMatch(/req\.body\?\.addToFlock === true/);
  });

  it("refuses the opt-in when no group was named", () => {
    // There would be nowhere to move the count, so the request is confused.
    expect(block).toMatch(/Pick the group this animal belongs to/);
  });

  it("validates the reason against the closed herd-reason set", () => {
    expect(block).toMatch(/isHerdReason\(reason\)/);
    expect(block).toMatch(/HERD_REASONS/);
  });

  it("writes the count and the animal in ONE transaction", () => {
    // Two client calls are not atomic, and an offline device replays them
    // separately — a dropped signal would leave a second cow registered with
    // the herd still totalling one.
    expect(block).toMatch(/prisma\.\$transaction/);
    expect(block).toMatch(/flockMovement\.create/);
    expect(block).toMatch(/flock\.update/);
  });

  it("records the delta that actually landed, after clamping", () => {
    // Same rule as POST /:id/count: the ledger must reconcile with the count
    // it sits beside, so the recorded delta is the post-clamp one.
    expect(block).toMatch(/delta:\s*countAfter\s*-\s*countBefore/);
  });

  it("uses the shared clamping arithmetic rather than its own", () => {
    // A locally-written increment would drift from every other herd write.
    expect(block).toMatch(/applyDelta\(countBefore,\s*n\)/);
  });

  it("moves the count by the number of FRESH tags, not the range width", () => {
    // A range where some tags are already registered must not inflate the
    // herd by the width of the range.
    expect(block).toMatch(/moveCountFor\(tx,\s*fresh\.length\)/);
  });

  it("carries a count summary back to the caller", () => {
    // Otherwise the screen cannot show the farmer the number it just wrote.
    expect(block).toMatch(/currentCount:\s*countMove\.countAfter/);
  });
});

describe("a tag without the opt-in never touches the count", () => {
  it("the single-tag path only moves the count inside moveCountFor", () => {
    // moveCountFor returns early unless addToFlock was set, so the plain
    // registration path stays exactly as additive as it was before.
    expect(block).toMatch(/if \(!addToFlock \|\| n <= 0 \|\| shared\.flockId == null\) return null/);
  });

  it("the count move is opt-in for the range path too", () => {
    expect(block).toMatch(/return moveCountFor\(tx, fresh\.length\)/);
  });
});

describe("the farmer is told which of the two happened", () => {
  const panel = read(
    "..",
    "..",
    "wangari-next",
    "src",
    "components",
    "flocks",
    "FlockAnimalsPanel.tsx"
  );

  it("the panel asks, rather than assuming a tag is a new animal", () => {
    expect(panel).toContain("Is this a new animal?");
    expect(panel).toContain("Yes — I bought or bred it");
    expect(panel).toContain("No — already counted");
  });

  it("sends addToFlock only on the new-animal branch, and only with a group", () => {
    expect(panel).toMatch(/isNewAnimal && flockId \? \{ addToFlock: true, reason: "purchase" \}/);
  });

  it("says what will happen to the head count before the farmer commits", () => {
    expect(panel).toMatch(/head count will go up by one/);
    expect(panel).toMatch(/head count stays as it is/);
  });

  it("tells the farmer the two records now agree", () => {
    // The whole point: the tag list and the herd screen stop disagreeing.
    expect(panel).toMatch(/tag list and the herd screen agree/);
  });

  it("offers the question only when there is a group to add to", () => {
    expect(panel).toMatch(/\{flockId \? \(/);
  });
});
