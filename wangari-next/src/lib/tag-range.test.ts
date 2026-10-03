import { describe, it, expect } from "vitest";
import {
  resolveTagRange,
  describeTagRange,
  isValidTagSegment,
  MAX_TAG_RANGE,
} from "./tag-range";

/**
 * These tests are the answer to "what if I have 500 animals?".
 *
 * The farmer records THREE numbers (first tag, last tag, head count) and Wangari
 * handles the rest. These tests prove that works exactly, at 15-digit
 * precision, without ever asking a farmer to type 500 numbers.
 */

describe("Tier 0 — no tags at all", () => {
  it("is the default and costs the farmer nothing", () => {
    const r = resolveTagRange({ tagFrom: null, tagTo: null, count: 500 });
    expect(r.span).toBe(0);
    expect(r.tags).toEqual([]);
    expect(r.consistent).toBe(true);
    expect(r.note).toBeNull();
  });
});

describe("Tier 1 — a tag range covers the whole herd", () => {
  it("covers 500 animals with two numbers", () => {
    const r = resolveTagRange({
      tagFrom: "141000100000001",
      tagTo: "141000100000500",
      count: 500,
    });
    expect(r.span).toBe(500);
    expect(r.consistent).toBe(true);
    expect(r.note).toBeNull();
    expect(r.tags).toHaveLength(500);
    expect(r.tags[0]).toBe("141000100000001");
    expect(r.tags[499]).toBe("141000100000500");
  });

  it("generates the tags in order with no gaps", () => {
    const r = resolveTagRange({ tagFrom: "1410001", tagTo: "1410010" });
    expect(r.tags).toEqual([
      "1410001", "1410002", "1410003", "1410004", "1410005",
      "1410006", "1410007", "1410008", "1410009", "1410010",
    ]);
  });

  it("handles a single animal as a one-tag range", () => {
    const r = resolveTagRange({ tagFrom: "1410007", tagTo: "1410007" });
    expect(r.span).toBe(1);
    expect(r.tags).toEqual(["1410007"]);
  });

  it("carries across a digit boundary without drift", () => {
    // 1410009 -> 1410011 crosses a tens boundary; naive Number maths can slip.
    const r = resolveTagRange({ tagFrom: "1410009", tagTo: "1410011" });
    expect(r.tags).toEqual(["1410009", "1410010", "1410011"]);
  });
});

describe("catching farmer mistakes (in plain language, not jargon)", () => {
  it("flags a range that does not match the head count", () => {
    const r = resolveTagRange({
      tagFrom: "1410001",
      tagTo: "1410010",
      count: 12,
    });
    expect(r.consistent).toBe(false);
    expect(r.note).toContain("tags cover 10");
    expect(r.note).toContain("Animals are 12");
  });

  it("flags the reverse mismatch too", () => {
    const r = resolveTagRange({
      tagFrom: "1410001",
      tagTo: "1410004",
      count: 40,
    });
    expect(r.consistent).toBe(false);
    expect(r.note).toContain("Animals are 40");
  });

  // CHANGED Oct 2026. This test used to assert that a lone `tagFrom` was an
  // error telling the farmer to "enter the first and last tag number". Driving
  // the real create-flock modal showed that is backwards: the ANITRAC keypad
  // DEFAULTS to single-tag mode and its button reads "Save tag" (singular), so
  // one tag with no range is the normal path, not a half-finished range. Under
  // the old rule a farmer who saved one tag was told they had none.
  //
  // The honest response to "1 tag against 10 head" is to say THAT, not to claim
  // the farmer forgot a field they were never asked for.
  it("treats a lone first tag as one tag and flags the head-count mismatch", () => {
    const r = resolveTagRange({ tagFrom: "1410001", tagTo: null, count: 10 });
    expect(r.span).toBe(1);
    expect(r.tags).toEqual(["1410001"]);
    expect(r.consistent).toBe(false);
    expect(r.note).toContain("Animals are 10");
    expect(r.note).not.toContain("first and last");
  });

  it("still asks for the first tag when only a last one is given", () => {
    // The mirror case is genuinely unusable: a range with no start.
    const r = resolveTagRange({ tagFrom: "", tagTo: "1410010", count: 10 });
    expect(r.span).toBe(0);
    expect(r.note).toContain("first and last");
  });

  it("explains when the end is before the start", () => {
    const r = resolveTagRange({ tagFrom: "1410010", tagTo: "1410001" });
    expect(r.span).toBe(0);
    expect(r.note).toContain("greater");
  });

  it("refuses an over-long number", () => {
    const r = resolveTagRange({ tagFrom: "1".repeat(16), tagTo: "1".repeat(16) });
    expect(r.span).toBe(0);
    expect(r.note).toContain("15");
  });

  it("caps a runaway range so a typo cannot melt the export", () => {
    const r = resolveTagRange({
      tagFrom: "141000100000001",
      tagTo: "141000199999999",
    });
    expect(r.span).toBe(0);
    expect(r.note).toContain(String(MAX_TAG_RANGE));
  });
});

describe("describeTagRange", () => {
  it("reads out the block for a printed list", () => {
    const r = resolveTagRange({ tagFrom: "1410001", tagTo: "1410050" });
    expect(describeTagRange(r, "1410001", "1410050")).toBe(
      "Tags 50: 1410001 to 1410050"
    );
  });

  it("says so plainly when there are none", () => {
    const r = resolveTagRange({ tagFrom: null, tagTo: null });
    expect(describeTagRange(r, null, null)).toBe("No tags yet");
  });
});

describe("isValidTagSegment", () => {
  it("accepts digits within the length limit", () => {
    expect(isValidTagSegment("141")).toBe(true);
    expect(isValidTagSegment("141000100000001")).toBe(true);
  });
  it("rejects empty, over-long and non-numeric input", () => {
    expect(isValidTagSegment("")).toBe(false);
    expect(isValidTagSegment(null)).toBe(false);
    expect(isValidTagSegment("1".repeat(16))).toBe(false);
  });
});
/**
 * Tier 1b — a SINGLE tag, entered exactly.
 *
 * Found by driving the real create-flock modal with a real login. The ANITRAC
 * keypad defaults to single-tag mode and its primary button reads "Save tag"
 * (singular) — so entering one tag is the *common* path, not an edge case.
 *
 * But `resolveTagRange` treated a lone `tagFrom` with no `tagTo` as a broken
 * range and returned `span: 0`. The summary row above the keypad reads its
 * "do you have tags?" state from `span > 0`, so after successfully saving a
 * tag the farmer was shown:
 *
 *     ANITRAC tags
 *     Optional. Skip if your animals are not tagged.
 *
 * One tag saved, and the app told them they had none. They would reasonably
 * enter it again, and a traceability record that disagrees with itself about
 * whether tagging happened is worth nothing at exactly the moment it matters.
 */
describe("Tier 1b — a single tag is a valid range of one", () => {
  const TAG = "141234567890123";

  it("counts a lone tag as one tag", () => {
    const r = resolveTagRange({ tagFrom: TAG, tagTo: "" });
    expect(r.span).toBe(1);
    expect(r.tags).toEqual([TAG]);
  });

  it("does not nag the farmer to enter a last tag they do not need", () => {
    const r = resolveTagRange({ tagFrom: TAG, tagTo: "" });
    expect(r.note).toBeNull();
    expect(r.consistent).toBe(true);
  });

  it("stays consistent when the flock really is one animal", () => {
    const r = resolveTagRange({ tagFrom: TAG, tagTo: "", count: 1 });
    expect(r.consistent).toBe(true);
    expect(r.note).toBeNull();
  });

  it("still catches a genuine mismatch against a larger flock", () => {
    // 1 tag against 50 head is a real inconsistency worth a plain-language
    // note — this is the mistyped-range warning, and one tag is not exempt.
    const r = resolveTagRange({ tagFrom: TAG, tagTo: "", count: 50 });
    expect(r.span).toBe(1);
    expect(r.consistent).toBe(false);
    expect(r.note).toMatch(/1/);
  });

  it("treats a missing tagTo the same as an empty one", () => {
    expect(resolveTagRange({ tagFrom: TAG }).span).toBe(1);
    expect(resolveTagRange({ tagFrom: TAG, tagTo: null }).span).toBe(1);
  });

  it("still applies the 15-digit limit to a lone tag", () => {
    const r = resolveTagRange({ tagFrom: "1".repeat(16), tagTo: "" });
    expect(r.span).toBe(0);
    expect(r.note).toMatch(/15 digits/);
  });

  it("still reports nothing when there are genuinely no tags", () => {
    expect(resolveTagRange({ tagFrom: "", tagTo: "", count: 50 }).span).toBe(0);
    expect(resolveTagRange({ tagFrom: null, tagTo: null }).span).toBe(0);
  });

  it("describes a single tag in plain language, not as an empty range", () => {
    expect(describeTagRange(resolveTagRange({ tagFrom: TAG, tagTo: "" }), TAG, "")).toContain(TAG);
  });
});
