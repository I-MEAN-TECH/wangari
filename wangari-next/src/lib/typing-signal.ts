/**
 * Two signals the avatar reacts to while the farmer types:
 *
 *   pace            0 = deliberate, 1 = racing
 *   completedWord   true when this keystroke finished a word
 *
 * Kept pure and DOM-free so the behaviour can be reasoned about and tested
 * without a browser. Time is injected rather than read from a clock, which
 * is what makes it testable at all.
 *
 * This is a class rather than a plain object because the previous
 * keystroke time has to travel with the signal; hiding it in an underscore
 * field on a plain object was the version I wrote first and it read badly.
 */

/** Chars/sec at which she is considered to be racing. */
const FAST_CPS = 3.5;
/** Below this the farmer is being deliberate rather than struggling. */
const SLOW_CPS = 0.6;

/** How long a keystroke's pace reading takes to fade back to neutral. */
export const PACE_DECAY_MS = 900;

/** A gap this long is a pause in conversation, not slow typing. */
export const PAUSE_MS = 1500;

export interface TypingSignal {
  /** 0 = deliberate, 1 = racing. */
  pace: number;
  /** Chars per second over the last interval; 0 after a pause. */
  charsPerSecond: number;
  /**
   * True when this change finished a word.
   *
   * Part of the returned signal rather than only a tracker field: an
   * earlier version exposed it only as `tracker.completedWord`, which
   * meant `edit().completedWord` was `undefined` instead of `false` and
   * a falsy check happened to work by accident. One way to read it, and
   * it is always a boolean.
   */
  completedWord: boolean;
}

const NEUTRAL: TypingSignal = { pace: 0, charsPerSecond: 0, completedWord: false };

export class TypingTracker {
  private lastAt: number | null = null;
  private lastText = "";
  /**
   * The pace produced by the last real gap between keystrokes.
   *
   * Stored rather than recomputed. `paceAt` previously fed "time since
   * the last keystroke" back in as if it were the inter-keystroke gap,
   * which meant a farmer typing steadily at one character per second
   * read as RACING the moment `paceAt` was called — the two quantities
   * are not the same and conflating them inverted the whole signal.
   */
  private lastPace = 0;

  /**
   * True only for the most recent change, and readable after the fact.
   *
   * The returned `TypingSignal.completedWord` is the value to use; this
   * field exists so a caller that only holds the tracker can still read
   * the last outcome.
   */
  completedWord = false;

  /**
   * Record a keystroke.
   *
   * @param now  timestamp from performance.now()
   * @param text the textarea value AFTER this keystroke
   */
  keystroke(now: number, text: string): TypingSignal {
    const gap = this.lastAt === null ? 400 : now - this.lastAt;

    // A word finished when a space or newline landed at the caret. The
    // appended slice is used rather than the whole text, so editing an
    // earlier word does not re-fire the pulse for a word already done.
    const added = text.length >= this.lastText.length ? text.slice(this.lastText.length) : "";
    const completedWord = /[\s\n]$/.test(added);

    // Every number the caller sees comes from the one guarded path, so a
    // pause reads as zero chars/sec and not merely as zero pace.
    const signal = this.signalFrom(gap);

    this.lastAt = now;
    this.lastText = text;
    this.lastPace = signal.pace;
    this.completedWord = completedWord;

    return { ...signal, completedWord };
  }

  /**
   * A change that was not a single keystroke — a paste, a cut, an undo,
   * or the arrow keys moving the caret to fix an earlier word.
   *
   * Records the new text so the next keystroke measures against it, but
   * reads as neutral: a pasted sentence is not the farmer racing, and
   * moving the caret must not fire a completed-word pulse.
   */
  edit(text: string): TypingSignal {
    this.lastText = text;
    this.lastAt = null; /* no recent keystroke, so no pace to fade from */
    this.lastPace = 0;
    this.completedWord = false;
    return { ...NEUTRAL };
  }

  /**
   * Length of the text as of the last change.
   *
   * Exposed so the caller can tell a single keystroke from a paste, an
   * undo or an arrow-key move: only the former should be read as
   * typing speed. Without this the only way to tell was to keep a
   * second copy of the previous value in the component, which is the
   * kind of duplicated state that drifts.
   */
  get textLength(): number {
    return this.lastText.length;
  }

  /**
   * The current pace, faded by however long it has been since the last
   * keystroke. Without this she stays in whatever mood the last key left
   * her in, long after the farmer has stopped typing.
   */
  paceAt(now: number): number {
    if (this.lastAt === null) return 0;
    const elapsed = now - this.lastAt;
    if (elapsed >= PACE_DECAY_MS) return 0;
    // Fade the last real reading, do not re-derive one from the fade.
    return this.lastPace * (1 - elapsed / PACE_DECAY_MS);
  }

  private signalFrom(gapMs: number): TypingSignal {
    // A pause is not slow typing. Return neutral so she settles instead of
    // sitting in a permanently drowsy sway.
    if (!Number.isFinite(gapMs) || gapMs <= 0 || gapMs > PAUSE_MS) {
      return { ...NEUTRAL };
    }
    const cps = 1000 / gapMs;
    const pace = Math.max(0, Math.min(1, (cps - SLOW_CPS) / (FAST_CPS - SLOW_CPS)));
    return { pace, charsPerSecond: cps, completedWord: false };
  }

  reset() {
    this.lastAt = null;
    this.lastText = "";
    this.lastPace = 0;
    this.completedWord = false;
  }
}