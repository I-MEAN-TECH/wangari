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

describe("catching farmer mistakes (in Swahili, not jargon)", () => {
  it("flags a range that does not match the head count", () => {
    const r = resolveTagRange({
      tagFrom: "1410001",
      tagTo: "1410010",
      count: 12,
    });
    expect(r.consistent).toBe(false);
    expect(r.note).toContain("alama ziko 10");
    expect(r.note).toContain("Wanyama ni 12");
  });

  it("flags the reverse mismatch too", () => {
    const r = resolveTagRange({
      tagFrom: "1410001",
      tagTo: "1410004",
      count: 40,
    });
    expect(r.consistent).toBe(false);
    expect(r.note).toContain("Wanyama ni 40");
  });

  it("asks for both ends when only one is given", () => {
    const r = resolveTagRange({ tagFrom: "1410001", tagTo: null, count: 10 });
    expect(r.span).toBe(0);
    expect(r.note).toContain("kwanza");
  });

  it("explains when the end is before the start", () => {
    const r = resolveTagRange({ tagFrom: "1410010", tagTo: "1410001" });
    expect(r.span).toBe(0);
    expect(r.note).toContain("kubwa");
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
      "Alama 50: 1410001 hadi 1410050"
    );
  });

  it("says so plainly when there are none", () => {
    const r = resolveTagRange({ tagFrom: null, tagTo: null });
    expect(describeTagRange(r, null, null)).toBe("Hakuna alama bado");
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