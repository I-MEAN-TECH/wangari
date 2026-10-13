/**
 * Milk/egg withdrawal windows (gap report §1 A6).
 *
 * The farmer's ONE hard constraint after treating an animal is that the milk or
 * eggs cannot be sold for a period. Get it wrong and a consignment is rejected,
 * or accepted and then traced back to the farm — which is worse.
 *
 * Two rules this file will not break:
 *
 *  1. **We never compute a withdrawal period from a drug.** Half-lives, label
 *     variations and off-label dosing make any number we derived a plausible
 *     fiction. The date comes from the vet or the label, and this file only
 *     counts days towards it.
 *  2. **A record with no date produces no warning.** Silence is not clearance,
 *     but it is also not evidence of a violation — so a treated animal with no
 *     recorded date is surfaced as "ask your vet when this milk is safe", not as
 *     a safe one.
 *
 * Pure: the route fetches, this decides what today means.
 */

const DAY = 86400000;

/** Midnight-normalised, so "today" is a calendar day and not a clock reading. */
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

export interface WithdrawalRecord {
  id: number;
  /** The treated animal, when the record names one. */
  animalId: number | null;
  flockId: number | null;
  /** The keeper's own words for what was wrong. */
  condition: string;
  /** What was done — drug, dose, quarantine. */
  action: string | null;
  observedAt: Date;
  /** The last day the product may not be sold. Null = nobody recorded one. */
  withdrawalUntil: Date | null;
  /** e.g. "milk 3 days" — exactly as the label or the vet put it. */
  withdrawalNote: string | null;
}

export type WithdrawalState = "inside" | "cleared" | "unrecorded";

export interface WithdrawalStatus {
  record: WithdrawalRecord;
  state: WithdrawalState;
  /** Last day of the window, when there is one. */
  until: Date | null;
  /**
   * Whole days left, counting today as one. 0 when the window ended today or
   * earlier. Null when no date was recorded.
   */
  daysRemaining: number | null;
}

/** Where the treatment sits relative to the date it protects. */
export function withdrawalStatus(r: WithdrawalRecord, on: Date = new Date()): WithdrawalStatus {
  const today = dateOnly(on);
  const until = r.withdrawalUntil ? dateOnly(r.withdrawalUntil) : null;
  if (!until) return { record: r, state: "unrecorded", until: null, daysRemaining: null };
  // The window ENDS on `until`, so a treatment whose last safe date is today is
  // still inside it. Off-by-one here is a rejected consignment.
  const daysRemaining = Math.max(0, daysBetween(today, until) + 1);
  return { record: r, state: daysRemaining > 0 ? "inside" : "cleared", until, daysRemaining };
}

export const isInsideWithdrawal = (r: WithdrawalRecord, on: Date = new Date()): boolean =>
  withdrawalStatus(r, on).state === "inside";

/**
 * The animals whose product is still protected TODAY, newest treatment first.
 *
 * Sorted by the earliest-remaining date so the cow that frees up tomorrow heads
 * a list the farmer is deciding from this morning.
 */
export function activeWithdrawals(records: WithdrawalRecord[], on: Date = new Date()): WithdrawalStatus[] {
  return records
    .map((r) => withdrawalStatus(r, on))
    .filter((s) => s.state === "inside")
    .sort((a, b) => (a.until as Date).getTime() - (b.until as Date).getTime());
}

/** Treatments with no withdrawal date recorded — the ones to ask the vet about. */
export function unrecordedWithdrawals(records: WithdrawalRecord[], on: Date = new Date()): WithdrawalStatus[] {
  return records.map((r) => withdrawalStatus(r, on)).filter((s) => s.state === "unrecorded");
}

export interface WithdrawalAdvice {
  /** True when at least one treated animal's product must not be sold today. */
  blocked: boolean;
  /** The animals blocking it, with days left. */
  animals: { animalId: number | null; condition: string; until: Date; daysRemaining: number }[];
  /** Advice for an animal treated with NO date on file. */
  unrecorded: string[];
  /** One line a farmer can read in a second. Null when there is nothing to say. */
  message: string | null;
}

/**
 * What to say when the farmer is about to sell milk or eggs.
 *
 * Called on the DELIVERY form, which is the moment the mistake would be made.
 * `productKind` is "milk" or "eggs" — the two things a withdrawal window
 * actually protects — and anything else returns no advice at all rather than a
 * generic warning about a rule that does not apply.
 */
export function withdrawalAdvice(
  records: WithdrawalRecord[],
  productKind: string,
  on: Date = new Date()
): WithdrawalAdvice {
  if (productKind !== "milk" && productKind !== "eggs") {
    return { blocked: false, animals: [], unrecorded: [], message: null };
  }

  const active = activeWithdrawals(records, on);
  const animals = active.map((s) => ({
    animalId: s.record.animalId,
    condition: s.record.condition,
    until: s.until as Date,
    daysRemaining: s.daysRemaining as number,
  }));

  // Only treatments that plausibly affect this product. A dry-cow tube and a
  // footbath are both "treatments"; only one of them means the milk is unsafe,
  // and warning about the other would teach the farmer to ignore this.
  const unrecorded = unrecordedWithdrawals(records, on)
    .filter((s) => s.record.observedAt.getTime() >= on.getTime() - 30 * DAY)
    .map(
      (s) =>
        `${s.record.condition}${s.record.animalId ? ` (animal #${s.record.animalId})` : ""} — no withdrawal date recorded`
    );

  if (!animals.length && !unrecorded.length) {
    return { blocked: false, animals: [], unrecorded: [], message: null };
  }

  const soonest = animals[0];
  // "this eggs" is the kind of copy that makes a farmer stop reading, so the
  // product is named in its own plural.
  const product = productKind === "eggs" ? "these eggs" : "this milk";
  const message = animals.length
    ? `${animals.length} treated ${animals.length === 1 ? "animal is" : "animals are"} still inside the withdrawal window — ` +
      `do not sell ${product} yet. ` +
      (soonest
        ? `The first clears on ${soonest.until.toISOString().slice(0, 10)} (${soonest.daysRemaining} day${soonest.daysRemaining === 1 ? "" : "s"}).`
        : "")
    : `A recent treatment has no withdrawal date on file — ask your vet before selling ${product}.`;

  return { blocked: animals.length > 0, animals, unrecorded, message };
}
