/**
 * Onboarding state — the "has this account ever really been used?" rules.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * A 337-line onboarding wizard existed at /onboarding but was linked from
 * only one place and POSTed to /api/user-preferences, a route that does not
 * exist — the 404 was swallowed by `catch { /* Continue anyway *\/ }`. So
 * every farm name, location and farm type a farmer entered was silently
 * discarded and they landed on the dashboard thinking it had saved. Nothing
 * ever checked whether the account had been used, so a brand-new account
 * (or a Google sign-in that auto-created a placeholder farm) walked straight
 * into the app with nothing configured.
 *
 * These are pure functions, pinned by tests, because the whole point is that
 * the gate must be right: too loose and a stranger lands on a dashboard, too
 * tight and a real farmer is locked out of their own records mid-season.
 *
 * ── The rule that matters most ─────────────────────────────────────────────
 * `onboardingRequired` is TRUE only for an account that has NEVER recorded
 * anything. An account with real farm activity — even one whose profile is
 * technically incomplete — is never gated. We will not lock a working
 * farmer out of their own data to tidy up a form.
 */

export type OnboardingStatus = "needs_onboarding" | "active" | "unknown";

export interface OnboardingInput {
  /** Did the farmer ever set a farm name/location/type? (profileComplete) */
  profileComplete?: boolean | null;
  /**
   * Earliest real activity across production, harvest, money, deliveries —
   * or null when the farm has never recorded anything. This is the real
   * "has this account ever been used" signal, not a config flag.
   */
  firstRecordAt?: string | null;
  /** Did they ever sign in (even without recording)? */
  everLoggedIn?: boolean | null;
}

/**
 * Has this account EVER been used — i.e. does it have real farm activity?
 * A configured-but-empty farm is still "never used" for gating purposes;
 * we want them through onboarding to actually log their first record.
 */
export function hasRealActivity(i: OnboardingInput): boolean {
  // Only a real, fetched timestamp counts. `undefined` (not loaded) is not
  // activity; `null` (fetched, nothing there) is not activity either.
  return typeof i.firstRecordAt === "string" && i.firstRecordAt.length > 0;
}

/**
 * Must this account complete onboarding before it can use the app?
 *
 * TRUE only when the account has never recorded anything. This is the
 * security boundary: an account that has never been used cannot assert
 * ownership of a farm, so it must state its farm (and therefore claim it)
 * before being let into the dashboard.
 */
export function onboardingRequired(i: OnboardingInput): boolean {
  // `undefined` means the farm's state has not loaded yet. Gating on that is
  // how you briefly lock out a working farmer on every page load, so an
  // unknown state is NOT a gate — only a fetched "no activity" is.
  if (i.firstRecordAt === undefined) return false;
  return !hasRealActivity(i);
}

export function onboardingStatus(i: OnboardingInput): OnboardingStatus {
  // While we have not fetched the farm's state yet (`firstRecordAt` is
  // `undefined`, not `null`), we must report "unknown" and let the app decide
  // nothing. Treating unknown as "needs onboarding" would wrongly gate a
  // working farmer for one frame on every load — the exact lockout this
  // module exists to avoid. `null` is a real answer (fetched, nothing there);
  // `undefined` is the absence of an answer.
  if (i.firstRecordAt === undefined) return "unknown";
  if (hasRealActivity(i)) return "active";
  if (i.everLoggedIn === false) return "unknown";
  return "needs_onboarding";
}

/**
 * Where should the app send this user right now?
 *
 * - needs onboarding      → /onboarding
 * - onboarding just done  → /dashboard
 * - already active       → wherever they were going
 */
export function routeAfterAuth(i: OnboardingInput): string {
  return onboardingRequired(i) ? "/onboarding" : "/dashboard";
}

/**
 * Client-side gate: should we block the dashboard content and show onboarding?
 * Mirrors `onboardingRequired` so the two can't drift; the server remains the
 * real enforcement (this is only to avoid flashing the dashboard).
 */
export function shouldBlockDashboard(i: OnboardingInput): boolean {
  return onboardingRequired(i);
}
