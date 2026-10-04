/**
 * Where Wangari looks while the farmer types.
 *
 * The idea is that she reads along with you: as your words move right
 * across the box, her eyes move right with them. That is what makes the
 * typing state feel like she is following your words rather than idling
 * beside them.
 *
 * ── the bug this file exists to fix ──────────────────────
 * The first version normalised the caret by the LENGTH OF THE TEXT:
 *
 *     offset = selectionStart / length
 *
 * which looks right on paper and is wrong in the box. While you type the
 * caret is always at the end, so `selectionStart / length` is always
 * 1.0 — her eyes were pinned hard right no matter what you wrote. Typing
 * one letter and typing a whole paragraph produced the identical sweep.
 * The words were sitting on the left of the field and she was staring
 * off the right edge of it.
 *
 * What she should track is where the words actually ARE, which means the
 * denominator has to be the FIELD, not the sentence: roughly how many
 * characters fit across one line of the input. Then a short message sits
 * at the left of the box and she looks left; a long one fills the box and
 * she tracks right as the words travel.
 *
 * Everything here is pure and DOM-free apart from the one measurement it
 * reads, so the behaviour can be reasoned about (and tested) without a
 * browser.
 */

/** How far the eyes may travel while tracking, in radius fractions. */
const MAX_TRAVEL = 0.5;

/**
 * Below this the caret is treated as centred.
 *
 * Without a dead zone she twitches on every keystroke — the difference
 * between a caret two characters in and three is invisible to the farmer
 * but is a large jump to a spring-driven eye.
 */
const DEAD_ZONE = 0.16;

/** How far she looks down per extra line of wrapped text. */
const LINE_DROP = 0.2;

/** She never looks further down than this; a long note is not a reason to stare at the floor. */
const MAX_LINES_DOWN = 2;

/**
 * Fallback line width, in characters, when the field has not been laid
 * out yet (server render, or a test that passes no measurement).
 *
 * Roughly a phone-width line of a 16px sans face, which is the smallest
 * screen we actually care about.
 */
export const FALLBACK_LINE_CHARS = 32;

/**
 * How much of the available travel a given offset actually earns.
 *
 * Symmetric, deliberately: the farmer's words sit left or right of the
 * centre and her eyes have to go there either way. An earlier one-sided
 * version compressed the left range to a quarter of the right, which
 * meant a word on the left barely moved her at all — it looked like a
 * bug rather than a look.
 *
 * The dead zone still means she holds perfectly still through the middle
 * of a line, which is where most keystrokes land.
 *
 * smoothstep rather than a plain square: a square pushes the very first
 * movement after the dead zone to a visible jump, which is the twitch we
 * are avoiding.
 */
function shaped(offset: number): number {
  const mag = Math.abs(offset);
  if (mag <= DEAD_ZONE) return 0;
  const beyond = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
  const eased = beyond * beyond * (3 - 2 * beyond); /* smoothstep */
  return Math.sign(offset) * eased * MAX_TRAVEL;
}

/**
 * Turn a caret position into a gaze bias.
 *
 * @param selectionStart caret offset within the text
 * @param length         total length of the text
 * @param lineChars      how many characters fit across one visible line.
 *                       This is the denominator that matters — see the
 *                       note at the top of the file.
 * @returns x in -0.5..0.5 and a small positive y once the text wraps,
 *          or undefined when there is nothing typed yet (the caller
 *          should fall back to the state's own gaze).
 */
export function caretGazeFromOffset(
  selectionStart: number,
  length: number,
  lineChars: number = FALLBACK_LINE_CHARS,
): { x: number; y: number } | undefined {
  if (length <= 0) return undefined;

  const start = Math.max(0, Math.min(length, selectionStart));
  const perLine = Math.max(1, lineChars);

  // Where we are on the current line, and how many lines down we are.
  const line = Math.floor(start / perLine);
  const column = start - line * perLine;

  const across = (column / perLine) * 2 - 1;
  const down = Math.min(line, MAX_LINES_DOWN) * LINE_DROP;

  return { x: shaped(across), y: down };
}

/**
 * DOM wrapper. Reads the live caret from a textarea or input, and
 * measures the box so the gaze means "where the words are on screen"
 * rather than "how far through the sentence we are".
 *
 * Character width is estimated from the computed font size rather than
 * measured per glyph. A proportional face averages roughly half an em
 * across running text; being a few percent out only shifts where the
 * very edge of a long line lands, and it costs one layout read instead
 * of one per glyph.
 */
export function caretGaze(el: {
  selectionStart: number | null;
  value: string;
  clientWidth?: number;
  fontSize?: number;
}): { x: number; y: number } | undefined {
  const start = el.selectionStart ?? el.value.length;
  const width = el.clientWidth ?? 0;
  const fontSize = el.fontSize ?? 16;

  const avgCharWidth = fontSize * 0.5;
  const lineChars =
    width > 0 && avgCharWidth > 0 ? Math.max(1, width / avgCharWidth) : FALLBACK_LINE_CHARS;

  return caretGazeFromOffset(start, el.value.length, lineChars);
}
