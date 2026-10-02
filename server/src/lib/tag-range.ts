/**
 * Shared tag-range logic (server side).
 *
 * Kept in step with the client helper in wangari-next/src/lib/tag-range.ts —
 * the two must never disagree, because the client validates before the server
 * trusts.
 *
 * The whole point: a farmer with 500 head records THREE numbers (first tag,
 * last tag, count) and the individual tags are generated on demand, only when
 * a traceability list is actually requested.
 */

export const ANITRAC_PREFIX = "141";
export const ANITRAC_MAX_DIGITS = 15;
export const MAX_TAG_RANGE = 2000;

export const digits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

export interface ResolvedTagRange {
  span: number;
  expected: number | null;
  consistent: boolean;
  note: string | null;
  tags: string[];
}

/** Resolve a first..last range. Mirrors the client's resolveTagRange exactly. */
export function resolveTagRange(
  tagFrom: unknown,
  tagTo: unknown,
  count?: number | null
): ResolvedTagRange {
  const from = digits(tagFrom);
  const to = digits(tagTo);
  const expected = count == null ? null : Number(count);

  if (!from && !to)
    return { span: 0, expected, consistent: true, note: null, tags: [] };

  if (!from || !to)
    return {
      span: 0,
      expected,
      consistent: false,
      note: "Weka namba ya kwanza na namba ya mwisho.",
      tags: [],
    };

  if (from.length > ANITRAC_MAX_DIGITS || to.length > ANITRAC_MAX_DIGITS)
    return {
      span: 0,
      expected,
      consistent: false,
      note: `Namba ni tarakimu ${ANITRAC_MAX_DIGITS} tu.`,
      tags: [],
    };

  const cmp =
    from.length !== to.length ? from.length - to.length : from.localeCompare(to);
  if (cmp > 0)
    return {
      span: 0,
      expected,
      consistent: false,
      note: "Namba ya mwisho lazima iwe kubwa kuliko ya kwanza.",
      tags: [],
    };

  const fromN = BigInt(from);
  const toN = BigInt(to);
  const span = Number(toN - fromN) + 1;

  if (span > MAX_TAG_RANGE)
    return {
      span: 0,
      expected,
      consistent: false,
      note: `Hiyo ni mimezo ${span}. Ingiza kipande cha ${MAX_TAG_RANGE}.`,
      tags: [],
    };

  const tags: string[] = [];
  for (let i = BigInt(0); i < BigInt(span); i++) tags.push((fromN + i).toString());

  let note: string | null = null;
  let consistent = true;
  if (expected != null && expected > 0 && expected !== span) {
    consistent = false;
    note =
      span > expected
        ? `Alama ziko ${span}, lakini wanyama ni ${expected}.`
        : `Wanyama ni ${expected}, alama ziko ${span}.`;
  }

  return { span, expected, consistent, note, tags };
}

/**
 * Build the traceability rows a range implies, WITHOUT storing them.
 * A herd of 500 costs three columns on the flock and zero extra rows.
 */
export function rangeRows(
  flock: { id: number; name: string; breed: string | null; type: string | null; category: string | null },
  range: ResolvedTagRange
) {
  return range.tags.map((tag) => ({
    tagNumber: tag,
    species: flock.type,
    breed: flock.breed,
    sex: null,
    status: "active",
    birthDate: null,
    createdAt: new Date(),
    flock: { name: flock.name },
    vaccinations: [] as unknown[],
    source: "flock-range" as const,
  }));
}