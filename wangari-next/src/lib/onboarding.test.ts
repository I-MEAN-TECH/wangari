import { describe, it, expect } from "vitest";

/**
 * Onboarding-gate rules.
 *
 * Two failure modes, both serious, and they pull in opposite directions:
 *  - TOO LOOSE: an account that has never been used reaches the dashboard,
 *    seeing a placeholder farm (the original shipped bug).
 *  - TOO TIGHT: a real farmer mid-season with real records gets locked out of
 *    their own financial data because a form is incomplete.
 *
 * ── The regression this file now exists to prevent ─────────────────────────
 * The first version gated on real activity ALONE. That shipped as an infinite
 * redirect loop: completing onboarding writes the farm name and type but
 * creates no production/harvest/money/delivery row, so `firstRecordAt` stayed
 * null and the farmer was bounced straight back to /onboarding after
 * submitting. Every farmer, every time.
 *
 * The fix is a second signal — `claimedAt` — and EITHER signal clears the gate.
 * The tests below pin that, including the exact post-submit state that used to
 * loop forever.
 */

import {
  hasRealActivity,
  onboardingRequired,
  onboardingStatus,
  routeAfterAuth,
  shouldBlockDashboard,
} from "./onboarding";

/** Fetched, and nothing has ever happened. */
const NEVER = {
  firstRecordAt: null,
  claimedAt: null,
  profileComplete: false,
};
/** Fetched, with real production records — a working farmer. */
const ACTIVE = {
  firstRecordAt: "2026-09-03T00:00:00.000Z",
  claimedAt: null,
  profileComplete: false,
};
/**
 * THE BUG CASE. The farmer just submitted onboarding: farm name + type saved,
 * `claimedAt` stamped, but no production/harvest/money/delivery row yet.
 * Before the fix this was gated and produced an infinite redirect loop.
 */
const JUST_CLAIMED = {
  firstRecordAt: null,
  claimedAt: "2026-10-02T12:00:00.000Z",
  profileComplete: false,
};
/** State not fetched yet — `undefined`, which is NOT an answer. */
const UNKNOWN_YET = {
  firstRecordAt: undefined as any,
  claimedAt: undefined as any,
};

describe("hasRealActivity — claimed OR recorded", () => {
  it("is true when there is a first record", () => {
    expect(hasRealActivity(ACTIVE)).toBe(true);
  });

  it("is true when the farm has been claimed, even with zero records", () => {
    // This is the completion signal. Without it, submitting the form could
    // never satisfy the gate, because claiming a farm creates no records.
    expect(hasRealActivity(JUST_CLAIMED)).toBe(true);
  });

  it("is false for a never-used account", () => {
    expect(hasRealActivity(NEVER)).toBe(false);
  });

  it("does not count a configured-but-empty farm as claimed", () => {
    // profileComplete is the settings-page concern and is deliberately NOT a
    // gate signal. Trusting it would let a stale flag wave anyone through.
    expect(
      hasRealActivity({ firstRecordAt: null, claimedAt: null, profileComplete: true })
    ).toBe(false);
  });

  it("treats an empty string as no signal, not as a claim", () => {
    expect(
      hasRealActivity({ firstRecordAt: "", claimedAt: "" })
    ).toBe(false);
  });
});

describe("onboardingRequired — the gate", () => {
  it("gates an account that has never been used", () => {
    expect(onboardingRequired(NEVER)).toBe(true);
  });

  it("does NOT gate a farmer with records", () => {
    expect(onboardingRequired(ACTIVE)).toBe(false);
  });

  it("does NOT gate a farmer who just completed onboarding", () => {
    // THE REGRESSION. This assertion is the whole point of `claimedAt`.
    expect(onboardingRequired(JUST_CLAIMED)).toBe(false);
  });

  it("does NOT gate while the state is still loading", () => {
    // Gating on unknown is how a working farmer gets locked out for one frame
    // on every single page load.
    expect(onboardingRequired(UNKNOWN_YET)).toBe(false);
  });
});

describe("the redirect loop that shipped", () => {
  it("lets a farmer through immediately after submitting", () => {
    // Walk the exact sequence that trapped every farmer in a loop.
    expect(onboardingRequired(NEVER)).toBe(true); // 1. first visit -> gated
    expect(routeAfterAuth(NEVER)).toBe("/onboarding");
    // 2. they fill the form; the server stamps claimedAt
    expect(routeAfterAuth(JUST_CLAIMED)).toBe("/dashboard"); // 3. must NOT bounce back
  });

  it("never sends a claimed farmer back to onboarding", () => {
    const afterSubmit = { firstRecordAt: null, claimedAt: new Date().toISOString() };
    expect(routeAfterAuth(afterSubmit)).not.toBe("/onboarding");
  });

  it("keeps a working farmer out of the loop even before they claim", () => {
    expect(routeAfterAuth(ACTIVE)).toBe("/dashboard");
  });
});

describe("onboardingStatus", () => {
  it("is unknown before the state loads", () => {
    expect(onboardingStatus(UNKNOWN_YET)).toBe("unknown");
  });

  it("is active for records", () => {
    expect(onboardingStatus(ACTIVE)).toBe("active");
  });

  it("is active for a just-claimed farm", () => {
    expect(onboardingStatus(JUST_CLAIMED)).toBe("active");
  });

  it("needs onboarding only when nothing has happened", () => {
    expect(onboardingStatus(NEVER)).toBe("needs_onboarding");
  });

  it("is unknown for a fetched state on an account that never logged in", () => {
    expect(
      onboardingStatus({ ...NEVER, everLoggedIn: false })
    ).toBe("unknown");
  });
});

describe("shouldBlockDashboard mirrors the gate", () => {
  it("agrees with onboardingRequired in every case", () => {
    for (const state of [NEVER, ACTIVE, JUST_CLAIMED, UNKNOWN_YET]) {
      expect(shouldBlockDashboard(state)).toBe(onboardingRequired(state));
    }
  });

  it("does not block a farmer who has just claimed their farm", () => {
    expect(shouldBlockDashboard(JUST_CLAIMED)).toBe(false);
  });
});