/**
 * Wangari's caret gaze — regression tests for lib/caret-gaze.ts.
 *
 * The headline behaviour guarded here is that the gaze is normalised by
 * the FIELD, not by the length of the text. Normalising by text length
 * meant a short message and a long one both swept the full range, and
 * the words sitting on the left of the box sent her eyes right.
 */
import { describe, it, expect } from "vitest";
import { caretGazeFromOffset, caretGaze, FALLBACK_LINE_CHARS } from "./caret-gaze";

/** Characters that fit across one visible line in these tests. */
const LINE = 40;

/** Gaze for a caret `start` chars in, on a field that holds LINE per row. */
const at = (start: number, lineChars = LINE) =>
  caretGazeFromOffset(start, 10000, lineChars)!;

describe("caretGazeFromOffset", () => {
  it("returns undefined when nothing is typed", () => {
    expect(caretGazeFromOffset(0, 0)).toBeUndefined();
  });

  it("looks hard LEFT at the start of a line, not straight ahead", () => {
    // The regression this file exists for: words on the left of the box
    // must send her eyes to the left of the box.
    expect(at(0).x).toBeCloseTo(-0.5, 5);
  });

  it("looks hard RIGHT once the words reach the right edge of the line", () => {
    // The last column is one character short of the edge (39 of 40), so
    // she lands at 0.495 rather than exactly 0.5. Close enough to read
    // as "looking right", and the exact bound is asserted separately.
    expect(at(LINE - 1).x).toBeGreaterThan(0.45);
    expect(at(LINE - 1).x).toBeLessThanOrEqual(0.5);
  });

  it("travels further right the further right the words go", () => {
    expect(at(30).x).toBeGreaterThan(at(20).x);
    expect(at(20).x).toBeGreaterThan(at(10).x);
  });

  it("looks LEFT for a short word, where the old model looked RIGHT", () => {
    // THE regression, stated as a direction rather than a magnitude.
    // Five characters into a 40-character field sit at the far left, so
    // she must go left. The old length-normalised model returned
    // +0.5 here — hard right — because start/length was always 1.0
    // while typing. Sign flip is the fix; magnitude is incidental.
    expect(at(5).x).toBeLessThan(-0.3);

    // And the same sentence, longer, must travel further right than a
    // short one — otherwise she is pinned regardless of field width.
    expect(at(35).x).toBeGreaterThan(at(5).x + 0.5);
  });

  it("is centred in the middle of a line", () => {
    expect(at(LINE / 2).x).toBe(0);
  });

  it("keeps a dead zone around the centre so mid-line typing does not twitch her", () => {
    // Inside it she must not move AT ALL. A curve that merely shrinks
    // still fails here, so deleting the dead zone is caught.
    for (let column = 17; column <= 23; column++) {
      expect(at(column).x, `column ${column} is inside the dead zone`).toBe(0);
    }
  });

  it("is symmetric: equal distance from centre gives equal travel either way", () => {
    // An earlier one-sided version gave the left range a quarter of the
    // right, so a word on the left barely moved her at all.
    expect(Math.abs(at(LINE / 2 - 10).x)).toBeCloseTo(Math.abs(at(LINE / 2 + 10).x), 6);
    expect(Math.abs(at(LINE / 2 - 18).x)).toBeCloseTo(Math.abs(at(LINE / 2 + 18).x), 6);
  });

  it("moves smoothly within a line: no single character jumps more than 0.06", () => {
    let worst = 0;
    for (let column = 1; column < LINE; column++) {
      worst = Math.max(worst, Math.abs(at(column).x - at(column - 1).x));
    }
    expect(worst).toBeLessThan(0.06);
  });

  it("never looks further than half the radius from centre", () => {
    for (let column = 0; column < LINE; column++) {
      expect(Math.abs(at(column).x)).toBeLessThanOrEqual(0.5);
    }
  });

  it("clamps an out-of-range caret instead of throwing", () => {
    expect(caretGazeFromOffset(9999, 10000, LINE)!.x).toBeLessThanOrEqual(0.5);
    expect(caretGazeFromOffset(-5, 10000, LINE)!.x).toBeGreaterThanOrEqual(-0.5);
  });
});

describe("wrapped lines", () => {
  it("starts each new line at the left, so she sweeps back across on the wrap", () => {
    expect(at(LINE).x).toBeCloseTo(-0.5, 5);
    expect(at(LINE - 1).x).toBeGreaterThan(0.45);
  });

  it("looks further down for each additional line", () => {
    expect(at(LINE).y).toBeGreaterThan(0);
    expect(at(LINE * 2).y).toBeGreaterThan(at(LINE).y);
  });

  it("stops looking down after a couple of lines", () => {
    // A long note is not a reason to stare at the floor.
    expect(at(LINE * 9).y).toBe(at(LINE * 2).y);
  });

  it("is centred vertically on the first line", () => {
    expect(at(0).y).toBe(0);
  });
});

describe("caretGaze (DOM wrapper)", () => {
  it("reads the live caret", () => {
    const value = "x".repeat(50);
    expect(caretGaze({ selectionStart: 20, value })!.x).toBe(
      caretGazeFromOffset(20, 50, FALLBACK_LINE_CHARS)!.x,
    );
  });

  it("falls back to the end of the value when selectionStart is null", () => {
    // Some browsers report null for certain input types; guessing the end
    // is better than dropping the gaze.
    const value = "x".repeat(50);
    expect(caretGaze({ selectionStart: null, value })!.x).toBe(
      caretGazeFromOffset(value.length, value.length, FALLBACK_LINE_CHARS)!.x,
    );
  });

  it("returns undefined for an empty field", () => {
    expect(caretGaze({ selectionStart: 0, value: "" })).toBeUndefined();
  });

  it("uses the measured box width, so a wider field pushes the same words further left", () => {
    // Ten characters in a narrow field fill a third of the line; in a wide
    // one they are a sliver at the left. Same words, different position.
    const value = "x".repeat(200);
    const narrow = caretGaze({ selectionStart: 10, value, clientWidth: 200, fontSize: 16 })!;
    const wide = caretGaze({ selectionStart: 10, value, clientWidth: 800, fontSize: 16 })!;
    expect(Math.abs(wide.x)).toBeGreaterThan(Math.abs(narrow.x));
  });

  it("falls back to a phone-width line when the box has not been laid out", () => {
    // Server render and first paint have no measurement. Guessing a wide
    // line would park the eyes right and then swing them left.
    const value = "x".repeat(50);
    expect(caretGaze({ selectionStart: 0, value })!.x).toBe(-0.5);
  });
});
