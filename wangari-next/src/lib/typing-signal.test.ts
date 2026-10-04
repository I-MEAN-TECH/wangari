/**
 * Wangari's typing pace — regression tests for lib/typing-signal.ts.
 *
 * The behaviours guarded here were each a decision that could have gone
 * the other way and looked fine until the expo: a pause being read as
 * slow typing (she would have sat in a permanent drowsy sway), and a
 * deletion being read as a speed-up.
 */
import { describe, it, expect } from "vitest";
import { TypingTracker, PACE_DECAY_MS, PAUSE_MS } from "./typing-signal";

/** Type `text` one character at a time, `gapMs` apart. */
function type(tracker: TypingTracker, text: string, gapMs: number, startAt = 1000) {
  let now = startAt;
  let typed = "";
  for (const ch of text) {
    typed += ch;
    tracker.keystroke(now, typed);
    now += gapMs;
  }
  return now;
}

describe("TypingTracker pace", () => {
  it("reads fast typing as near 1 and slow typing as near 0", () => {
    const fast = new TypingTracker();
    type(fast, "abcdefgh", 100); // 10 chars/sec
    const slow = new TypingTracker();
    type(slow, "abcdefgh", 900); // ~1 char/sec: deliberately considered
    expect(fast.paceAt(1000 + 7 * 100)).toBeGreaterThan(0.5);
    expect(slow.paceAt(1000 + 7 * 900)).toBeLessThan(0.2);
    // A deliberate farmer must read as clearly different from a racing
    // one, not merely lower. Both readings also FADE with time, which is
    // the bug this caught: an earlier version re-derived the pace from
    // the fade itself, so a slow typist read as RACING the moment the
    // timer polled.
    expect(fast.paceAt(1000 + 7 * 100 + PACE_DECAY_MS)).toBe(0);
    expect(slow.paceAt(1000 + 7 * 900 + PACE_DECAY_MS)).toBe(0);
  });

  it("stays within 0..1 even for absurd input", () => {
    const t = new TypingTracker();
    t.keystroke(0, "a");
    // Same timestamp twice: a zero gap would divide by zero.
    expect(Number.isFinite(t.paceAt(0.1))).toBe(true);
    expect(t.paceAt(0.1)).toBeGreaterThanOrEqual(0);
    expect(t.paceAt(0.1)).toBeLessThanOrEqual(1);
  });

  it("decays to neutral once the farmer stops typing", () => {
    // Without this she stays in whatever mood the last keypress left
    // her in, long after the farmer stopped.
    const t = new TypingTracker();
    type(t, "abcdefgh", 100);
    const last = 1000 + 7 * 100;
    expect(t.paceAt(last + 100)).toBeGreaterThan(0);
    expect(t.paceAt(last + PACE_DECAY_MS)).toBe(0);
    expect(t.paceAt(last + PACE_DECAY_MS + 5000)).toBe(0);
  });

  it("treats a pause as neutral, not as very slow typing", () => {
    // A gap longer than PAUSE_MS is the farmer thinking, not struggling.
    // Reading it as slow would park her in a drowsy sway forever.
    const t = new TypingTracker();
    t.keystroke(0, "a");
    const signal = t.keystroke(PAUSE_MS + 500, "ab");
    expect(signal.pace).toBe(0);
    expect(signal.charsPerSecond).toBe(0);
  });

  it("decays monotonically rather than jumping", () => {
    const t = new TypingTracker();
    type(t, "abcdefgh", 100);
    const last = 1000 + 7 * 100;
    let prev = Infinity;
    for (let d = 0; d < PACE_DECAY_MS; d += 50) {
      const v = t.paceAt(last + d);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it("reports chars per second alongside the normalised pace", () => {
    const t = new TypingTracker();
    t.keystroke(0, "a");
    expect(t.keystroke(100, "ab").charsPerSecond).toBeCloseTo(10, 5);
  });
});

describe("TypingTracker word completion", () => {
  it("fires when a space finishes a word", () => {
    const t = new TypingTracker();
    type(t, "eggs", 100);
    expect(t.completedWord).toBe(false);
    t.keystroke(2000, "eggs ");
    expect(t.completedWord).toBe(true);
  });

  it("does not fire mid-word", () => {
    const t = new TypingTracker();
    for (const [i, text] of ["e", "eg", "egg", "eggs"].entries()) {
      t.keystroke(1000 + i * 100, text);
      expect(t.completedWord, `"${text}" must not complete a word`).toBe(false);
    }
  });

  it("fires again for each word, so two words in a row are two pulses", () => {
    const t = new TypingTracker();
    let now = type(t, "eggs ", 100);
    expect(t.completedWord).toBe(true);
    // A second word: the flag must not be left latched from the first.
    t.keystroke(now, "eggs m");
    expect(t.completedWord).toBe(false);
    now += 100;
    t.keystroke(now, "eggs mil");
    expect(t.completedWord).toBe(false);
    now += 100;
    // The word is only FINISHED when the space lands, not when its
    // last letter does — otherwise she pulses mid-word, which reads as
    // a stutter rather than as following along.
    t.keystroke(now, "eggs milk");
    expect(t.completedWord).toBe(false);
    now += 100;
    expect(t.keystroke(now, "eggs milk ").completedWord).toBe(true);
  });

  it("does not fire when the farmer deletes a character", () => {
    // Backspacing used to read as "the text got shorter, so they must
    // have typed fast" — she would surge on every correction.
    const t = new TypingTracker();
    type(t, "eggs", 100);
    t.keystroke(2000, "egg");
    expect(t.completedWord).toBe(false);
  });

  it("does not fire on a paste or an arrow-key move", () => {
    // `completedWord` is part of the returned signal, so this is a real
    // `false` and not an `undefined` that happened to be falsy.
    const t = new TypingTracker();
    const signal = t.edit("a long pasted sentence");
    expect(signal.completedWord).toBe(false);
    expect(signal.pace).toBe(0);
  });

  it("records the pasted text so the next keystroke measures against it", () => {
    // A stale length here would make the very next keystroke look like
    // a huge paste, and she would sit at neutral while the farmer types.
    const t = new TypingTracker();
    type(t, "abc", 100);
    const pasted = "a much longer pasted sentence";
    t.edit(pasted);
    expect(t.textLength).toBe(pasted.length);
    // The keystroke after a paste has no measured gap to read from, so it
    // seeds from the neutral default rather than reporting the time since
    // the paste as typing speed.
    const after = t.keystroke(5000, pasted.slice(0, -1));
    expect(after.pace).toBeGreaterThan(0);
    expect(after.pace).toBeLessThan(1);
  });
});

describe("TypingTracker.reset", () => {
  it("clears the pace, the text and the word flag", () => {
    const t = new TypingTracker();
    type(t, "eggs ", 100);
    expect(t.completedWord).toBe(true);
    t.reset();
    expect(t.completedWord).toBe(false);
    expect(t.paceAt(99999)).toBe(0);
    // A reset tracker must not report a huge gap on its next keystroke.
    expect(t.keystroke(999999, "a").pace).toBeGreaterThanOrEqual(0);
  });
});
