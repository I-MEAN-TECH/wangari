/**
 * Transaction attribution — deciding which enterprise a transaction belongs to.
 *
 * ## What this replaced
 *
 * `profitability.ts` used to attribute transactions by substring match:
 *
 *     const matchEnterprise = (text: string): Ent | null => {
 *       const t = (text || "").toLowerCase();
 *       for (const [name, id] of flockByName) if (t.includes(name)) return ...
 *       for (const [name, id] of cropByName)  if (t.includes(name)) return ...
 *       return null;
 *     };
 *
 * That is a guess dressed as logic, and it fails in both directions:
 *   - **False positive:** a flock named "Layers" claimed every row whose
 *     description merely mentioned layers.
 *   - **Order dependence:** `Map` iteration order decided the winner when two
 *     flock names both appeared in one description.
 *   - **Silent wrongness:** nothing told the farmer the number was a guess.
 *
 * He is meant to take that number to a SACCO. So the rule is now: **an explicit
 * reference, or nothing.** Inference happens only where it cannot be wrong —
 * exactly one candidate.
 *
 * ## Why "exactly one" and not "the best match"
 *
 * Because a farmer with two dairy flocks has no way to tell us which one sold
 * the milk, and putting all of it on one of them is worse than putting it
 * nowhere. "General" is honest; a coin flip is not. When the farmer tells us
 * by picking a flock on the entry screen, rule 1 takes over and the guess stops
 * being needed at all.
 */

import { classifyIncome, type EnterpriseKind } from "./ledger-taxonomy.js";

/** A flock, as far as attribution cares. */
export type KnownFlock = {
  id: number;
  category?: string | null;
  type?: string | null;
};

/** A crop, as far as attribution cares. */
export type KnownCrop = { id: number };

/** Every enterprise on the farm, pre-loaded. */
export type KnownEnterprises = {
  flocks: readonly KnownFlock[];
  crops: readonly KnownCrop[];
};

/** The enterprise a transaction resolved to. `general` means "the whole farm". */
export type EnterpriseRef =
  | { kind: "flock"; id: number }
  | { kind: "crop"; id: number }
  | { kind: "general"; id: null };

/** The "we could not and would not guess" answer. Frozen so callers can't mutate it. */
export const GENERAL_ENTERPRISE: EnterpriseRef = Object.freeze({
  kind: "general",
  id: null,
});

/** Just the fields attribution reads. Accepts a full Prisma row. */
export type AttributionInput = {
  type?: string | null;
  category?: string | null;
  flockId?: number | null;
  cropId?: number | null;
};

/**
 * Which enterprise kind is this flock?
 *
 * Deliberately delegates to `classifyIncome`, so flocks and income categories
 * share ONE vocabulary. If `milk` means `dairy` on the income side, it must
 * mean `dairy` on the flock side too, or rule 3 can never match anything.
 *
 * `category` is checked first because it is the field the flock form sets
 * ("poultry", "dairy", "aquaculture"). `type` is the fallback, because a flock
 * created before `category` existed carries only `type` ("layers", "broilers").
 */
export function enterpriseKindForFlock(flock: KnownFlock): EnterpriseKind {
  const byCategory = classifyIncome(flock.category);
  if (byCategory !== "general") return byCategory;
  return classifyIncome(flock.type);
}

/**
 * Resolve a transaction to an enterprise.
 *
 * Order of decision:
 *   1. an explicit `flockId` naming a flock that still exists
 *   2. an explicit `cropId` naming a crop that still exists
 *   3. for **income only**, when exactly one enterprise matches the income
 *      kind: that enterprise
 *   4. otherwise `general`
 *
 * Note the asymmetry in rule 3: expenses get no inference. An expense has no
 * enterprise-shaped signal in its category — `animal_feed` is spent on the
 * whole farm until the farmer says otherwise — so inferring would be invention.
 */
export function attributeTransaction(
  tx: AttributionInput,
  known: KnownEnterprises
): EnterpriseRef {
  const flockIds = new Set(known.flocks.map((f) => f.id));
  const cropIds = new Set(known.crops.map((c) => c.id));

  // Rule 1 and 2: explicit, and verified to still exist. A `flockId` pointing
  // at a deleted flock is treated as absent rather than trusted, because the
  // FK is ON DELETE SET NULL and a stale value would otherwise resurrect it.
  if (tx.flockId != null && flockIds.has(tx.flockId)) {
    return { kind: "flock", id: tx.flockId };
  }
  if (tx.cropId != null && cropIds.has(tx.cropId)) {
    return { kind: "crop", id: tx.cropId };
  }

  // Rule 3: income only, and only when unambiguous.
  if (tx.type === "income") {
    const kind = classifyIncome(tx.category);

    if (kind === "crops") {
      return known.crops.length === 1
        ? { kind: "crop", id: known.crops[0].id }
        : GENERAL_ENTERPRISE;
    }

    if (kind !== "general") {
      const matches = known.flocks.filter((f) => enterpriseKindForFlock(f) === kind);
      if (matches.length === 1) return { kind: "flock", id: matches[0].id };
    }
  }

  // Rule 4.
  return GENERAL_ENTERPRISE;
}
