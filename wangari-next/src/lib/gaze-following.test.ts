/**
 * The behaviour the farmer actually asked for, proved end to end:
 *
 *   "if the word typed is on left the eyes should look left, and if it is
 *    on right the eyes should look right — it should follow the typing
 *    pace too and words"
 *
 * The individual pieces (caretGaze, TypingTracker, mergeGaze) are unit
 * tested elsewhere. What this file guards is that they are WIRED to each
 * other in the right order and that no layer in between undoes the
 * direction — which is precisely what was broken: mergeGaze is capable of
 * returning a negative x, but the state's own gaze was quietly winning,
 * so a word on the left produced a face looking right.
 *
 * No browser needed: the inputs to the chain are numbers, and the chain
 * itself is pure. Rendering is exercised separately by the build.
 */
import { describe, it, expect } from "vitest";
import { caretGaze } from "./caret-gaze";
import { mergeGaze } from "@/components/ai/wangari-avatar";

/**
 * A textarea as the /ai panel actually lays it out: the composer sits in a
 * max-w-3xl card, so roughly 420px of usable width at 16px, which is
 * about 52 characters across a line.
 */
const REAL_FIELD_WIDTH_PX = 420;
const REAL_FONT_PX = 16;

/** What the /ai page hands the avatar for a given caret position. */
function gazeForField(text: string, caret: number) {
  return caretGaze({
    selectionStart: caret,
    value: text,
    clientWidth: REAL_FIELD_WIDTH_PX,
    fontSize: REAL_FONT_PX,
  });
}

/** The state's own gaze while the farmer types, from STATES.typing. */
const TYPING_STATE_GAZE = { x: 0, y: 0.34 };

/** What the eye is finally asked to do. */
function eyeTarget(text: string, caret: number) {
  return mergeGaze(TYPING_STATE_GAZE, gazeForField(text, caret))!;
}

describe("following the words across a real field", () => {
  it("looks LEFT while the words are on the left of the box", () => {
    // "eggs" occupies the first few characters of a 52-wide line.
    const eye = eyeTarget("eggs", 4);
    expect(eye.x).toBeLessThan(-0.3);
  });

  it("looks RIGHT once the words reach the right of the box", () => {
    const text = "x".repeat(50);
    const eye = eyeTarget(text, 50);
    expect(eye.x).toBeGreaterThan(0.3);
  });

  it("travels left to right as the words cross the field", () => {
    // This is the actual claim: a monotonic sweep. Sampling a few points
    // and asserting each is further right than the last catches a curve
    // that is correct at its endpoints but broken in between.
    const marks = [2, 14, 26, 38, 50].map((c) => eyeTarget("x".repeat(52), c).x);
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i], `position ${i} should be further right than ${i - 1}`).toBeGreaterThan(
        marks[i - 1],
      );
    }
    expect(marks[0]).toBeLessThan(0);
    expect(marks[marks.length - 1]).toBeGreaterThan(0);
  });

  it("reaches both extremes of the field, not just the right one", () => {
    // The regression in one assertion: before the capacity fix, EVERY
    // caret position resolved to the right-hand side, because the
    // denominator was the text length and the caret is always at its end.
    const leftmost = eyeTarget("x".repeat(52), 0).x;
    const rightmost = eyeTarget("x".repeat(52), 51).x;
    expect(leftmost).toBeLessThan(-0.4);
    expect(rightmost).toBeGreaterThan(0.4);
    expect(Math.abs(leftmost)).toBeGreaterThan(0.35);
  });

  it("holds still through the middle of a line instead of twitching", () => {
    // Most keystrokes land mid-line. A face that twitches on every
    // character is the thing the dead zone exists to prevent.
    const mid = eyeTarget("x".repeat(52), 26).x;
    expect(Math.abs(mid)).toBeLessThan(0.05);
  });

  it("returns to centre when the farmer clears the box", () => {
    expect(gazeForField("", 0)).toBeUndefined();
  });
});

describe("following the words down a wrapped field", () => {
  it("looks down as the words move to a second line", () => {
    // The field holds ~52 characters a line, so 60 characters is a
    // short second line.
    const first = eyeTarget("x".repeat(60), 50);
    const second = eyeTarget("x".repeat(60), 55);
    expect(second.y).toBeGreaterThan(first.y);
  });

  it("looks left again at the start of the second line", () => {
    // A wrap must not leave her stranded at the right edge of line one:
    // she should sweep back across as the words restart on the left.
    const endOfLineOne = eyeTarget("x".repeat(60), 51);
    const startOfLineTwo = eyeTarget("x".repeat(60), 53);
    expect(endOfLineOne.x).toBeGreaterThan(0.3);
    expect(startOfLineTwo.x).toBeLessThan(-0.3);
  });
});

describe("the state's own gaze does not fight the caret", () => {
  it("keeps reading low while tracking sideways", () => {
    // typing rests the eyes LOW (y 0.34). Following the caret must move
    // x without flattening y, or she stops looking like she is reading.
    const eye = eyeTarget("eggs", 4);
    expect(eye.y).toBeCloseTo(TYPING_STATE_GAZE.y, 6);
  });

  it("lets the caret win on x in both directions", () => {
    expect(eyeTarget("eggs", 4).x).toBeLessThan(0);
    expect(eyeTarget("x".repeat(50), 50).x).toBeGreaterThan(0);
  });
});
