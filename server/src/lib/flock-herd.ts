/**
 * Pure herd arithmetic — the part of "move stock between groups" and "merge two
 * groups" that can be reasoned about without a database.
 *
 * The routes in routes/flocks.ts are thin wrappers around these: they do the
 * tenancy checks, the writes and the ledger rows. Keeping the arithmetic here
 * means the invariants that actually matter (head count is never negative, and
 * a transfer or merge never invents or destroys animals) are unit-testable on
 * their own — see flock-herd.test.ts.
 */

/**
 * Reasons a group's head count can change. A transfer records a PAIR of these
 * — `transfer_out` on the group losing stock and `transfer_in` on the group
 * gaining it — so both sides of one event agree.
 *
 * Deliberately a closed set. A free-text reason would let the ledger drift into
 * synonyms ("bought" / "purchased" / "bought in") and a farmer could no longer
 * total it. `adjustment` is the escape hatch for a correction, and it is the
 * only reason that is not a real physical event.
 */
export const HERD_REASONS = [
  "purchase",
  "birth",
  "transfer_in",
  "transfer_out",
  "merged_in",
  "merged_out",
  "split_in",
  "split_out",
  "sale",
  "death",
  "adjustment",
] as const;

export type HerdReason = (typeof HERD_REASONS)[number];

export function isHerdReason(value: unknown): value is HerdReason {
  return typeof value === "string" && (HERD_REASONS as readonly string[]).includes(value);
}

/**
 * Apply a signed delta to a count, floored at zero.
 *
 * A count can never be negative — you cannot own minus three cows. Clamping
 * rather than throwing is deliberate: the flock count is edited by hand and can
 * lag behind reality, so a transfer of 5 from a group the farmer has recorded
 * as holding 3 should move the 5 animals and land the count on 0, not fail and
 * leave the farmer unable to act.
 */
export function applyDelta(count: number, delta: number): number {
  const base = Number.isFinite(count) ? Math.floor(count) : 0;
  const d = Number.isFinite(delta) ? Math.floor(delta) : 0;
  return Math.max(0, base + d);
}

/**
 * How many head a move of `requested` actually takes out of a group holding
 * `available`. The result is what both the source decrement and the target
 * increment must use, so the two never disagree — the previous failure mode in
 * this area was counting the two sides separately.
 */
export function movableHead(available: number, requested: number): number {
  const have = Math.max(0, Math.floor(Number.isFinite(available) ? available : 0));
  const want = Math.max(0, Math.floor(Number.isFinite(requested) ? requested : 0));
  return Math.min(have, want);
}

export interface LedgerSide {
  countBefore: number;
  countAfter: number;
  delta: number;
}

/**
 * The two ledger rows a transfer writes. Returned together so a caller cannot
 * apply one without the other, and so the conservation invariant is obvious:
 * the source's delta is the exact negative of the target's.
 */
export function transferLedger(
  fromCount: number,
  toCount: number,
  moved: number
): { from: LedgerSide; to: LedgerSide } {
  // `-moved || 0` normalises a zero move to +0. A bare `-moved` yields -0,
  // which is equal to 0 numerically but serialises as "-0" and reads as a
  // spurious negative in the ledger UI.
  const from = { countBefore: fromCount, countAfter: applyDelta(fromCount, -moved), delta: -moved || 0 };
  const to = { countBefore: toCount, countAfter: applyDelta(toCount, moved), delta: moved || 0 };
  return { from, to };
}

/** The two ledger rows a merge writes. Source ends empty; target gains it all. */
export function mergeLedger(
  sourceCount: number,
  targetCount: number
): { source: LedgerSide; target: LedgerSide } {
  const moved = Math.max(0, sourceCount);
  return {
    source: { countBefore: sourceCount, countAfter: 0, delta: -moved || 0 },
    target: { countBefore: targetCount, countAfter: applyDelta(targetCount, moved), delta: moved || 0 },
  };
}

/**
 * Whether two groups are plausibly the same species, for the mixed-species
 * guard on a merge.
 *
 * A merge of a poultry group into a cattle herd is almost always a mis-tap, so
 * the route refuses it unless the farmer confirms. But `category` defaults to
 * "poultry" and older rows may carry a value that does not match their type, so
 * this returns `compatible: true` whenever either side is missing a category —
 * refusing on absent data would block a legitimate merge.
 */
export function speciesCompatible(
  a: string | null | undefined,
  b: string | null | undefined
): { compatible: boolean; note: string | null } {
  if (!a || !b) return { compatible: true, note: null };
  if (a === b) return { compatible: true, note: null };
  return {
    compatible: false,
    note: `One group is recorded as "${a}" and the other as "${b}". Merging different species is usually a mistake.`,
  };
}
