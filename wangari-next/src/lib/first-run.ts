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
