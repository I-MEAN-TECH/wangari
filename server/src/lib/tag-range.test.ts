import { describe, it, expect } from "vitest";

/**
 * Tag ranges, server side.
 *
 * This file exists because it is the twin of the client helper, and the two
 * had already drifted into the same bug: a lone `tagFrom` with no `tagTo` was
 * treated as an unfinished range and returned `span: 0`.
 *
 * On the client that made the summary row say "Optional. Skip if your animals
 * are not tagged" right after a farmer saved one. HERE it is worse: this is the
 * function behind the ANITRAC traceability export. A flock with one tagged
 * animal exported a list of zero tags — so a county officer or buyer asking
 * "show me the tags on this herd" is told the herd is untagged when it is not.
 * A traceability record that is wrong in the untagged direction is worse than
 * one that is merely missing.
 *
 * The ANITRAC keypad defaults to single-tag mode and its button reads "Save
 * tag" (singular), so one tag with no range is the normal path, not an edge
 * case. These tests exist so the two helpers cannot drift apart again.
 */

import { resolveTagRange, ANITRAC_MAX_DIGITS, MAX_TAG_RANGE } from "./tag-range.js";

const TAG = "141234567890123";

describe("a single tag is a valid range of one", () => {
  it("counts a lone tag as one tag", () => {
    const r = resolveTagRange(TAG, "");
    expect(r.span).toBe(1);
    expect(r.tags).toEqual([TAG]);
  });

  it("accepts null and undefined as 'no range end'", () => {
    expect(resolveTagRange(TAG, null).span).toBe(1);
    expect(resolveTagRange(TAG, undefined).span).toBe(1);
  });

  it("stays consistent when the flock really is one animal", () => {
    const r = resolveTagRange(TAG, "", 1);
    expect(r.consistent).toBe(true);
    expect(r.note).toBeNull();
  });

  it("still exports the tag even when the head count disagrees", () => {
    // The mismatch must be REPORTED, not used to suppress the tag. Losing the
    // tag from the export is the failure mode these tests exist to prevent.
    const r = resolveTagRange(TAG, "", 50);
    expect(r.span).toBe(1);
    expect(r.tags).toEqual([TAG]);
    expect(r.consistent).toBe(false);
    expect(r.note).toMatch(/50/);
  });

  it("does not tell a farmer to enter a last tag they were never asked for", () => {
    expect(resolveTagRange(TAG, "", null).note).toBeNull();
    expect(resolveTagRange(TAG, "", 50).note).not.toMatch(/first and last/i);
  });
});

describe("still honest about genuinely broken input", () => {
  it("reports nothing when there are no tags at all", () => {
    expect(resolveTagRange(null, null).span).toBe(0);
    expect(resolveTagRange("", "").span).toBe(0);
  });

  it("still refuses a range with no start", () => {
    const r = resolveTagRange("", TAG);
    expect(r.span).toBe(0);
    expect(r.note).toMatch(/first and last/i);
  });

  it("still refuses an end that is before the start", () => {
    const r = resolveTagRange("1410010", "1410001");
    expect(r.span).toBe(0);
    expect(r.note).toMatch(/greater/i);
  });

  it("still applies the digit limit to a lone tag", () => {
    const r = resolveTagRange("1".repeat(ANITRAC_MAX_DIGITS + 1), "");
    expect(r.span).toBe(0);
    expect(r.note).toMatch(new RegExp(`${ANITRAC_MAX_DIGITS} digits`));
  });

  it("still applies the digit limit to a range", () => {
    expect(resolveTagRange("1410001", "9".repeat(ANITRAC_MAX_DIGITS + 1)).span).toBe(0);
  });
});

describe("a real range is unaffected", () => {
  it("still covers 500 animals with two numbers", () => {
    const r = resolveTagRange("141000100000001", "141000100000500", 500);
    expect(r.span).toBe(500);
    expect(r.consistent).toBe(true);
    expect(r.tags).toHaveLength(500);
    expect(r.tags[499]).toBe("141000100000500");
  });

  it("still guards against a mistyped enormous range", () => {
    const r = resolveTagRange("1410001", "1419999");
    expect(r.span).toBe(0);
    expect(r.note).toMatch(new RegExp(String(MAX_TAG_RANGE)));
  });

  it("still flags a range that disagrees with the head count", () => {
    const r = resolveTagRange("1410001", "1410010", 40);
    expect(r.consistent).toBe(false);
    expect(r.note).toContain("Animals are 40");
  });

  it("handles two tags with no head count stated", () => {
    const r = resolveTagRange("1410001", "1410002");
    expect(r.span).toBe(2);
    expect(r.consistent).toBe(true);
  });
});