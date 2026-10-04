/**
 * Wangari's gaze composition — regression tests for mergeGaze.
 *
 * mergeGaze is what lets the caret steer her sideways while a state keeps
 * its own look. Getting this wrong is silent: she would either stop
 * following the caret, or lose the downward read that makes `typing` read
 * as reading, and nothing would throw.
 */
import { describe, it, expect } from "vitest";
import { mergeGaze } from "./wangari-avatar";

/** The `typing` state's own gaze: eyes low, following the text being written. */
const TYPING = { x: 0, y: 0.34 };
/** The `working` state's own gaze: a deliberate sideways focus. */
const WORKING = { x: 0.22, y: 0.18 };

describe("mergeGaze", () => {
  it("returns undefined when there is neither a state nor a live gaze", () => {
    expect(mergeGaze(undefined, undefined)).toBeUndefined();
  });

  it("falls back to the state's own gaze when there is no caret", () => {
    expect(mergeGaze(TYPING, undefined)).toEqual(TYPING);
  });

  it("uses the caret alone when a state has no gaze of its own", () => {
    expect(mergeGaze(undefined, { x: 0.3, y: 0 })).toEqual({ x: 0.3, y: 0 });
  });

  it("keeps the state's vertical look while the caret moves her sideways", () => {
    // This is the whole point: while typing she still reads LOW, and only
    // the horizontal axis follows the caret.
    for (const x of [-0.11, 0, 0.11, 0.45]) {
      expect(mergeGaze(TYPING, { x, y: 0 })!.y).toBe(TYPING.y);
    }
  });

  it("follows the caret horizontally once it is strong enough", () => {
    expect(mergeGaze(TYPING, { x: 0.45, y: 0 })!.x).toBe(0.45);
    expect(mergeGaze(TYPING, { x: 0.45, y: 0 })!.x).toBeGreaterThan(
      mergeGaze(TYPING, { x: 0, y: 0 })!.x,
    );
  });

  it("lets a state's deliberate sideways look win over a weak caret", () => {
    // A caret near the start says very little; working's own glance means
    // more, so it must not be dragged to centre by the caret.
    expect(mergeGaze(WORKING, { x: 0.113, y: 0 })!.x).toBe(WORKING.x);
  });

  it("never pushes an eye past the rim, however extreme the caret", () => {
    expect(mergeGaze(TYPING, { x: 99, y: 0 })!.x).toBeLessThanOrEqual(0.85);
    expect(mergeGaze(TYPING, { x: -99, y: 99 })!.y).toBeLessThanOrEqual(0.85);
    expect(mergeGaze(WORKING, { x: -99, y: -99 })!.x).toBeGreaterThanOrEqual(-0.85);
  });
});