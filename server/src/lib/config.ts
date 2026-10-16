// Central product constants — change here, applies everywhere.
//
// The legacy `TRIAL_DAYS = 14` and `trialEndDate()` helpers are kept here as
// deprecated no-ops so any external import that still references them
// compiles; new code must not introduce new callers. The product moved to a
// perpetual "Free Core" tier; trial windows are not granted to new signups.
// If you need the math, write `new Date(t.getTime() + 14 * 86400000)` where
// `t` is the start time — there's no longer a single "trial length" to
// parameterise.
/** @deprecated Use a literal `+ 14 * 86400000` where needed. */
export const TRIAL_DAYS = 14;
/** @deprecated No new callers. */
export function trialEndDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}
