/**
 * Tag ranges — how Wangari handles 500 animals without 500 taps.
 *
 * THE REALITY: Kenya requires every cow, sheep and goat to carry an ANITRAC
 * tag, but a farmer with 500 head is not going to type 500 numbers. NTV's own
 * reporting names "cost and logistics of tagging and data entry for smallholder
 * farmers" as the barrier to rollout.
 *
 * THE MODEL: a farmer receives a block of tags (the vet or extension team tags
 * a herd in one campaign). They record the RANGE once — first tag, last tag,
 * how many — three numbers for the whole herd. Wangari generates the individual
 * numbers on demand, only when someone actually asks for a traceability list.
 *
 * Tiering, which is what makes this safe to use:
 *   Tier 0  No tags at all.      Flock counting only. Zero extra work.  <- 95% of farms
 *   Tier 1  A tag range.         Three numbers. Nothing per-animal.      <- most tagged farms
 *   Tier 2  Individual animals.  One row each, only where identity matters.
 *
 * Tier 2 is reserved for animals where a *single decision* hinges on identity:
 * a sick animal being isolated, an insured animal, a pedigree/breeding animal,
 * one being sold. Out of 500 head that is typically 5-50, not 500.
 *
 * Note on BigInt: ANITRAC tags are up to 15 digits and can exceed
 * Number.MAX_SAFE_INTEGER when a farmer fat-fingers extra digits, so all
 * arithmetic here is BigInt-based rather than numeric.
 */

export const ANITRAC_PREFIX = "141";
export const ANITRAC_MAX_DIGITS = 15;
/** Hard ceiling on how many tags one range may cover (guards a typo). */
export const MAX_TAG_RANGE = 2000;

export interface TagRangeInput {
  /**
   * Optional rather than merely nullable: a single tagged animal legitimately
   * has NO tagTo, and forcing callers to write `tagTo: null` to express that
   * invites exactly the confusion this file had already been bitten by. An
   * absent key and an explicit null mean the same thing here.
   */
  tagFrom?: string | null;
  tagTo?: string | null;
  /** How many animals are actually in the flock. */
  count?: number | null;
}

export interface ResolvedTagRange {
  /** How many tags the range covers. */
  span: number;
  /** Expected = the farmer told us how many head there are. */
  expected: number | null;
  /** True when the range matches the stated head count. */
  consistent: boolean;
  /** Plain-language explanation for the farmer, or null when everything agrees. */
  note: string | null;
  tags: string[];
}

const digits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

export function isValidTagSegment(v: unknown): boolean {
  const d = digits(v);
  return d.length > 0 && d.length <= ANITRAC_MAX_DIGITS;
}

/**
 * Build the individual tag numbers a range covers, or describe why not.
 * Always returns something actionable — a farmer must never be stuck.
 */
export function resolveTagRange(input: TagRangeInput): ResolvedTagRange {
  const from = digits(input.tagFrom);
  const to = digits(input.tagTo);
  const expected = input.count == null ? null : Number(input.count);

  if (!from && !to) {
    return {
      span: 0,
      expected,
      consistent: true,
      note: null,
      tags: [],
    };
  }

  if (!from) {
    return {
      span: 0,
      expected,
      consistent: false,
      note: "Enter the first and last tag number.",
      tags: [],
    };
  }

  // A single tag with no range end is a perfectly valid record of ONE tagged
  // animal — and it is the DEFAULT mode of the ANITRAC keypad, whose button
  // reads "Save tag" (singular). Treating it as a broken range made the summary
  // row report "Optional. Skip if your animals are not tagged" immediately
  // after a farmer successfully saved one, so they would enter it again.
  if (!to) {
    if (from.length > ANITRAC_MAX_DIGITS) {
      return {
        span: 0,
        expected,
        consistent: false,
        note: `Tag number must be ${ANITRAC_MAX_DIGITS} digits only.`,
        tags: [],
      };
    }
    const single = BigInt(from);
    // Still checked against the head count: 1 tag against 50 head is a real
    // mismatch worth saying out loud, and one tag is not exempt from it.
    if (expected != null && expected > 0 && expected !== 1) {
      return {
        span: 1,
        expected,
        consistent: false,
        note: `Animals are ${expected}, tags cover 1.`,
        tags: [single.toString()],
      };
    }
    return { span: 1, expected, consistent: true, note: null, tags: [single.toString()] };
  }

  if (from.length > ANITRAC_MAX_DIGITS || to.length > ANITRAC_MAX_DIGITS) {
    return {
      span: 0,
      expected,
      consistent: false,
      note: `Tag number must be ${ANITRAC_MAX_DIGITS} digits only.`,
      tags: [],
    };
  }

  // Comparing by length then lexicographically keeps 15-digit values exact.
  const cmp = from.length !== to.length ? from.length - to.length : from.localeCompare(to);
  if (cmp > 0) {
    return {
      span: 0,
      expected,
      consistent: false,
      note: "The last tag number must be greater than the first.",
      tags: [],
    };
  }

  const fromN = BigInt(from);
  const toN = BigInt(to);
  const span = Number(toN - fromN) + 1;

  if (span > MAX_TAG_RANGE) {
    return {
      span: 0,
      expected,
      consistent: false,
      note: `That is ${span} tags. Enter ${MAX_TAG_RANGE} or fewer.`,
      tags: [],
    };
  }

  const tags: string[] = [];
  for (let i = BigInt(0); i < BigInt(span); i++) tags.push((fromN + i).toString());

  let note: string | null = null;
  let consistent = true;
  if (expected != null && expected > 0 && expected !== span) {
    consistent = false;
    note =
      span > expected
        ? `Tags cover ${span}, but the animals number ${expected}.`
        : `Animals are ${expected}, tags cover ${span}.`;
  }

  return { span, expected, consistent, note, tags };
}

/**
 * A plain-language summary a farmer (or a county officer) can read aloud.
 * Plain language, no jargon, because this may be printed on a traceability list.
 */
export function describeTagRange(
  r: ResolvedTagRange,
  from: string | null | undefined,
  to: string | null | undefined
): string {
  if (r.span === 0) return "No tags yet";
  const a = digits(from);
  const b = digits(to);
  // A single tag has no "to" — printing "141… to " with nothing after it reads
  // as a broken record on a traceability list a county officer may hold.
  if (!b) return r.span === 1 ? `Tag ${a}` : `Tags ${r.span}: ${a}`;
  return `Tags ${r.span}: ${a} to ${b}`;
}