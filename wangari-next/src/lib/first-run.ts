/**
 * First-run gating — the rules that decide what a farmer sees first.
 *
 * These are pure functions so they can be pinned by tests. The bug they
 * encode is a real one from production: the old onboarding banner gated on
 * `totalFlocks`, so a dairy farmer who logged milk nightly but never added
 * an animal was shown "Welcome to Wangari! Start here" forever — while
 * already doing exactly the right thing.
 *
 * The lesson: gate on what the farmer HAS DONE (a record), never on what
 * they haven't configured yet.
 */

export interface FirstRunState {
  /** Earliest real activity on the farm, or null. Null = nothing recorded. */
  firstRecordAt: string | null | undefined;
  /** Still loading the dashboard payload. */
  loading?: boolean;
}

/**
 * Has this farmer already recorded anything?
 *
 * `undefined` means "we don't know yet" (loading) and must NOT be treated as
 * a new farmer — otherwise the invitation flashes at someone who has been
 * using the app for months on every dashboard load.
 */
export function hasRecorded(s: FirstRunState): boolean {
  if (s.loading || s.firstRecordAt === undefined) return false;
  return Boolean(s.firstRecordAt);
}

/** Show the first-run money-moment card? Only for a farm with nothing yet. */
export function showFirstRunCard(s: FirstRunState): boolean {
  if (s.loading || s.firstRecordAt === undefined) return false;
  return !s.firstRecordAt;
}

/**
 * Show the KPI grid (today's summary, feed score, cost per egg…)?
 *
 * Hidden while empty: a wall of zeros and empty ratios tells a new farmer
 * nothing and makes a working app look broken. It returns the moment there is
 * something true to show.
 */
export function showKpiGrid(s: FirstRunState): boolean {
  if (s.loading || s.firstRecordAt === undefined) return true;
  return Boolean(s.firstRecordAt);
}

/**
 * NOTE: there is deliberately no `showSetupSteps()` here.
 *
 * An earlier version re-gated the old "add your animals / record output /
 * record money" banner so it appeared only for farmers who had recorded
 * something but configured no animals. The tests caught that this was still
 * the same bug: a dairy farmer who logs milk nightly and never adds a flock
 * is EXACTLY that farmer, so they would still have been nagged — in Swahili
 * this time, which is not an improvement.
 *
 * Telling someone who is already recording to go and do setup work is a nag,
 * however it is phrased and however well translated. Setup is reachable from
 * the sidebar whenever they want it; it does not need a banner. The banner is
 * gone rather than re-gated.
 */

/** Should the deliveries form open itself, ready to log? */
export function openDeliveryFormByDefault(deliveryCount: number): boolean {
  return deliveryCount === 0;
}

/**
 * Show the "you are owed" statement ON THE DASHBOARD, not one tap away?
 *
 * This is gap-analysis row 12's remaining half. The capability shipped long ago
 * — gross, deductions, net, paid, outstanding, per-buyer and printable — but the
 * diagnosis was that it lived in a tab a farmer has to go and find, so the one
 * screen that could settle a dispute with a co-op clerk was a screen they had to
 * know to visit.
 *
 * So the rule is narrow on purpose. The statement appears on the dashboard ONLY
 * when the farmer is owed real money. It is the single most valuable thing Wangari
 * can put in front of a dairy farmer, and it only means anything once there is
 * something behind it: a farmer with nothing logged has nothing owed, and showing
 * them "you are owed KES 0" on their first day is how you teach someone that the
 * app is empty.
 *
 * This is the OPPOSITE of the delivery-form rule above, and deliberately so:
 * the form should offer itself when there is nothing, the statement should only
 * speak when there is something.
 */
export function showStatementOnDashboard(state: {
  outstanding: number | null | undefined;
  loading?: boolean;
}): boolean {
  // While loading we know nothing, so we show nothing. Flashing "KES 0 owed"
  // at a working dairy farmer on every dashboard load would be worse than the
  // tab this is meant to replace.
  if (state.loading || state.outstanding === null || state.outstanding === undefined) return false;
  return Number(state.outstanding) > 0;
}

/**
 * What to put on that card when it is NOT shown.
 *
 * Returning a reason rather than a boolean lets the dashboard offer the next
 * useful thing instead of a blank gap — a farmer with no deliveries owed gets
 * pointed at logging one.
 */
export type StatementPrompt =
  | { kind: "show"; outstanding: number }
  | { kind: "empty" }
  | { kind: "loading" };

export function statementPrompt(state: {
  outstanding: number | null | undefined;
  loading?: boolean;
}): StatementPrompt {
  if (state.loading || state.outstanding === null || state.outstanding === undefined) {
    return { kind: "loading" };
  }
  return Number(state.outstanding) > 0
    ? { kind: "show", outstanding: Number(state.outstanding) }
    : { kind: "empty" };
}
