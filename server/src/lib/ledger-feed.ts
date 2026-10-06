/**
 * Allocating a shared feed bill to the flocks that actually ate it.
 *
 * ## The problem
 *
 * A farmer logs one expense — `animal_feed`, KES 30,000 — and attaches it to no
 * particular flock. Separately, his daily production records carry `feedUsed`
 * per flock, so we know which birds ate it. Spreading the bill by kilos is the
 * right thing to do, and it is where `profitability.ts` went wrong:
 *
 *     e.feedCost = (kg / totalFeedKg) * Math.max(totalFeedExpense, e.feedCost);
 *     e.costs    = Math.max(e.costs, e.feedCost);
 *
 * That **assigns** the allocatee its share and leaves the original expense on
 * "general" exactly where it was. The flocks reported 30,000 of feed and the
 * farm still reported 30,000 of feed: `summary.totalCosts` read 60,000 for a
 * 30,000 bill.
 *
 * Feed is the largest cost line on most of these farms. A profit figure wrong
 * by the size of the biggest cost line is worse than no figure, because the
 * farmer will act on it — and take it to a SACCO.
 *
 * ## The rule
 *
 * **Allocation moves cost. It never creates it.** Whatever this function
 * returns has the same sum as what it was given. Every test in the suite
 * defends that one invariant.
 *
 * ## Why this is a separate module
 *
 * Because it is arithmetic, not plumbing. Keeping it pure means the invariant
 * can be tested without a database, which is the only way the 60,000 bug could
 * have been caught before a farmer saw it.
 */

/** One enterprise and its feed position, as far as allocation cares. */
export type FeedAllocatable = {
  key: string;
  kind: "flock" | "crop" | "general";
  feedCost: number;
  /** Kilos of feed this enterprise is recorded as having consumed. */
  kgConsumed: number;
};

/**
 * Spread the unattributed feed pool across the flocks that consumed it.
 *
 * @returns a map of key → new `feedCost`. The sum of values equals the sum of
 *          `feedCost` on the input, always.
 *
 * Rules, in order:
 *   1. The pool is every feed cost sitting on a **non-flock** enterprise —
 *      those are the rows the farmer did not attribute.
 *   2. Only flocks that consumed feed **and have no feed cost of their own**
 *      receive a share, split by kilos consumed. A flock that already carries
 *      its own feed expense is left exactly as it is; it does not need a guess.
 *   3. The amount handed out is deducted from the holders **in proportion to
 *      how much they held**, floored at zero.
 */
export function allocateFeedPool(
  items: readonly FeedAllocatable[]
): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) result.set(item.key, item.feedCost);
  if (items.length === 0) return result;

  // Rule 1.
  const pool = items
    .filter((i) => i.kind !== "flock")
    .reduce((s, i) => s + i.feedCost, 0);
  if (pool <= 0) return result;

  // Rule 2.
  const consumers = items.filter(
    (i) => i.kind === "flock" && i.kgConsumed > 0 && i.feedCost === 0
  );
  const needKg = consumers.reduce((s, i) => s + i.kgConsumed, 0);
  if (needKg <= 0) return result;

  let moved = 0;
  for (const consumer of consumers) {
    const amount = (consumer.kgConsumed / needKg) * pool;
    result.set(consumer.key, (result.get(consumer.key) ?? 0) + amount);
    moved += amount;
  }

  // Rule 3. `moved` is at most `holderTotal`, so each proportional cut is at
  // most that holder's own cost — the floor is belt and braces against a
  // negative cost sneaking into the data, not a normal path.
  const holders = items.filter((i) => i.kind !== "flock" && i.feedCost > 0);
  const holderTotal = holders.reduce((s, i) => s + i.feedCost, 0);
  if (holderTotal <= 0) {
    // Nothing held the pool, so nothing can be deducted. Undo the handout
    // rather than invent money that was never spent.
    for (const consumer of consumers) result.set(consumer.key, consumer.feedCost);
    return result;
  }

  for (const holder of holders) {
    const cut = Math.min((holder.feedCost / holderTotal) * moved, holder.feedCost);
    result.set(holder.key, Math.max(0, (result.get(holder.key) ?? 0) - cut));
  }

  return result;
}
