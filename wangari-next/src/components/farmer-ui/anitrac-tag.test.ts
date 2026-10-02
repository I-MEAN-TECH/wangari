import { describe, it, expect } from "vitest";
import {
  validateTag,
  expandTagRange,
  ANITRAC_PREFIX,
  ANITRAC_MAX_DIGITS,
} from "./anitrac-tag";

/**
 * ANITRAC tag rules.
 *
 * Kenya's 2026 rollout: a unique identification number of not more than 15
 * digits, starting with the 141 country prefix. These tests lock in the two
 * behaviours that protect a farmer's data:
 *   1. We never silently accept a bad tag as "good".
 *   2. Range expansion can never mass-insert rows by accident.
 */

const FULL = "141000100000001"; // 15 digits, 141 prefix — a valid tag

describe("validateTag", () => {
  it("accepts a well-formed 15-digit 141 tag as good", () => {
    const r = validateTag(FULL);
    expect(r.ok).toBe(true);
    expect(r.tone).toBe("good");
  });

  it("rejects an empty tag", () => {
    const r = validateTag("");
    expect(r.ok).toBe(false);
    expect(r.tone).toBe("bad");
  });

  it("rejects non-digit characters — a farmer may tap a stray letter", () => {
    const r = validateTag("141ABC");
    expect(r.ok).toBe(false);
    expect(r.tone).toBe("bad");
  });

  it("rejects a tag longer than 15 digits", () => {
    const r = validateTag("1".repeat(16));
    expect(r.ok).toBe(false);
    expect(r.tone).toBe("bad");
  });

  it("allows a short tag but warns instead of blocking", () => {
    // A farmer mid-entry has 5 digits; we must not scold them.
    const r = validateTag("14100");
    expect(r.ok).toBe(true);
    expect(r.tone).toBe("warn");
  });

  it("warns when a full-length tag does not start with 141", () => {
    const r = validateTag("840000100000001");
    expect(r.ok).toBe(true);
    expect(r.tone).toBe("warn");
  });

  it("exports the documented Kenyan constants", () => {
    expect(ANITRAC_PREFIX).toBe("141");
    expect(ANITRAC_MAX_DIGITS).toBe(15);
  });
});

describe("expandTagRange", () => {
  it("expands an inclusive range", () => {
    const { tags } = expandTagRange("1410001", "1410005");
    expect(tags).toEqual([
      "1410001",
      "1410002",
      "1410003",
      "1410004",
      "1410005",
    ]);
  });

  it("expands a single-tag range to one entry", () => {
    const { tags } = expandTagRange("1410001", "1410001");
    expect(tags).toEqual(["1410001"]);
  });

  it("strips non-digits before expanding", () => {
    const { tags } = expandTagRange("141-0001", "141 0003");
    expect(tags).toEqual(["1410001", "1410002", "1410003"]);
  });

  it("refuses when the end is before the start", () => {
    const { tags, error } = expandTagRange("1410005", "1410001");
    expect(tags).toEqual([]);
    expect(error).toBeTruthy();
  });

  it("refuses equal start and end in a multi-expected range", () => {
    // Equal values are valid (one tag) — guard the real risk instead:
    const { tags } = expandTagRange("1410001", "1410001");
    expect(tags).toHaveLength(1);
  });

  it("caps a huge range so a typo cannot insert thousands of rows", () => {
    const { tags, error } = expandTagRange("1410001", "1419999", 500);
    expect(tags).toEqual([]);
    expect(error).toContain("500");
  });

  it("handles full 15-digit tags without precision loss", () => {
    // This is exactly why the implementation uses BigInt: these values exceed
    // Number.MAX_SAFE_INTEGER, and a naive `Number(start) + i` would drift.
    const { tags } = expandTagRange(
      "141000100000001",
      "141000100000004"
    );
    expect(tags).toEqual([
      "141000100000001",
      "141000100000002",
      "141000100000003",
      "141000100000004",
    ]);
  });

  it("errors when an endpoint is missing", () => {
    expect(expandTagRange("", "1410005").error).toBeTruthy();
    expect(expandTagRange("1410001", undefined).error).toBeTruthy();
  });
});
