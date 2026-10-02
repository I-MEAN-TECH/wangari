/**
 * Onboarding state — the "has this account ever really been used?" rules.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * A 337-line onboarding wizard used to live at /onboarding but was linked from
 * only one place and POSTed to /api/user-preferences, a route that does not
 * exist — the 404 was swallowed by `catch { /* Continue anyway *\/ }`. So the
 * farm name and location a farmer entered were silently discarded and they
 * landed on the dashboard believing it had saved.
 *
 * ── The bug this file existed to create, and then did ──────────────────────
 * The first version gated on ONE signal: real farm activity. That was wrong,
 * and it shipped as an infinite redirect loop. Completing onboarding writes the
 * farm name and type — it does NOT create a production, harvest, money or
 * delivery row. So a farmer who submitted the form was instantly re-gated back
 * to /onboarding, and again, and again. The data saved fine; the gate simply
 * had no way to recognise that the work was done.
 *
 * ── The rule, which must never regress ─────────────────────────────────────
 * Two independent signals mean "past onboarding", and EITHER one is enough:
 *   1. `claimedAt`   — the farmer stated their farm. This is the completion.
 *   2. `firstRecordAt` — they have real farm activity.
 *
 * Never gate a farmer who has records — we will not lock a working farmer out
 * of their own data to tidy up a form. And once a farm is claimed, it stays
 * unblocked: re-prompting someone who already told us what they farm is a nag,
 * not a security control.
 */

export type OnboardingStatus = "needs_onboarding" | "active" | "unknown";

export interface OnboardingInput {
  /** Did the farmer ever set a full profile in settings? */
  profileComplete?: boolean | null;
  /**
   * Earliest real activity across production, harvest, money, deliveries — or
   * null when the farm has never recorded anything.
   */
  firstRecordAt?: string | null;
  /**
   * When the farmer completed onboarding and stated their farm. THIS is the
   * completion signal; `firstRecordAt` alone could never serve that purpose.
   */
  claimedAt?: string | null;
  /** Did they ever sign in (even without recording)? */
  everLoggedIn?: boolean | null;
}

const isTimestamp = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/**
 * Has this account EVER been used, in the sense that matters: either the
 * farmer claimed their farm, or they have real activity behind them.
 */
export function hasRealActivity(i: OnboardingInput): boolean {
  return isTimestamp(i.firstRecordAt) || isTimestamp(i.claimedAt);
}

/**
 * Must this account complete onboarding before it can use the app?
 *
 * TRUE only when we have fetched the state AND it shows no claim and no
 * activity. `undefined` (not loaded) is never a gate — treating unknown as
 * "needs onboarding" is what gates a working farmer for one frame on every
 * page load.
 */
export function onboardingRequired(i: OnboardingInput): boolean {
  if (i.firstRecordAt === undefined && i.claimedAt === undefined) return false;
  return !hasRealActivity(i);
}

export function onboardingStatus(i: OnboardingInput): OnboardingStatus {
  if (i.firstRecordAt === undefined && i.claimedAt === undefined) {
    return "unknown";
  }
  if (hasRealActivity(i)) return "active";
  if (i.everLoggedIn === false) return "unknown";
  return "needs_onboarding";
}

/**
 * Where should the app send this user right now?
 *
 * - needs onboarding → /onboarding
 * - otherwise       → /dashboard
 */
export function routeAfterAuth(i: OnboardingInput): string {
  return onboardingRequired(i) ? "/onboarding" : "/dashboard";
}

/**
 * Client-side gate: should we block the dashboard content and show onboarding?
 * Mirrors `onboardingRequired` so the two cannot drift; the server remains the
 * real enforcement (this only avoids flashing the dashboard).
 */
export function shouldBlockDashboard(i: OnboardingInput): boolean {
  return onboardingRequired(i);
}