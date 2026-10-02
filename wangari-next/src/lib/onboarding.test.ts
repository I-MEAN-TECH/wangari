import { describe, it, expect } from "vitest";

/**
 * Onboarding-gate rules.
 *
 * Two failure modes, both serious, and they pull in opposite directions:
 *  - TOO LOOSE: an account that has never been used reaches the dashboard,
 *    seeing a placeholder farm or empty dashboard (the bug that shipped).
 *  - TOO TIGHT: a real farmer mid-season with real records gets locked out of
 *    their own financial data because a form is incomplete.
 *
 * So the rule under test: gate on whether the account has EVER recorded
 * anything, and only then. Real activity always wins.
 */

import {
  hasRealActivity,
  onboardingRequired,
  onboardingStatus,
  routeAfterAuth,
  shouldBlockDashboard,
} from "./onboarding";

const NEVER = { firstRecordAt: null, profileComplete: false };
const ACTIVE = { firstRecordAt: "2026-09-03T00:00:00.000Z", profileComplete: false };
const CONFIGURED_BUT_EMPTY = { firstRecordAt: null, profileComplete: true };
const UNKNOWN_YET = { firstRecordAt: undefined as any };

describe("hasRealActivity — the real signal", () => {
  it("is true only when a first record exists", () => {
    expect(hasRealActivity(ACTIVE)).toBe(true);
  });

  it("is false for a never-used account", () => {
    expect(hasRealActivity(NEVER)).toBe(false);
  });

  it("does NOT count a configured-but-empty farm as activity", () => {
    // Setting a farm name is not the same as farming. Otherwise a brand-new
    // account that filled in a form would skip the gate.
    expect(hasRealActivity(CONFIGURED_BUT_EMPTY)).toBe(false);
  });
});

describe("onboardingRequired — the security boundary", () => {
  it("requires onboarding for an account that has never been used", () => {
    expect(onboardingRequired(NEVER)).toBe(true);
  });

  it("NEVER gates an account with real records, even if profileComplete=false", () => {
    // The critical anti-lockout test: a working farmer must always get in.
    expect(onboardingRequired(ACTIVE)).toBe(false);
  });

  it("still gates a configured-but-never-recorded account", () => {
    expect(onboardingRequired(CONFIGURED_BUT_EMPTY)).toBe(true);
  });
});

describe("onboardingStatus", () => {
  it("reports needs_onboarding for a fresh account", () => {
    expect(onboardingStatus(NEVER)).toBe("needs_onboarding");
  });

  it("reports active once there is a record", () => {
    expect(onboardingStatus(ACTIVE)).toBe("active");
  });

  it("reports unknown while we have not fetched state yet", () => {
    expect(onboardingStatus(UNKNOWN_YET)).toBe("unknown");
  });

  it("does NOT gate an active farmer while state is still loading", () => {
    // `undefined` is the absence of an answer, not the answer "empty".
    // Getting this wrong briefly locks out a working farmer on every load.
    expect(onboardingRequired(UNKNOWN_YET)).toBe(false);
    expect(shouldBlockDashboard(UNKNOWN_YET)).toBe(false);
  });

  it("gates only once we have actually fetched and found nothing", () => {
    expect(onboardingRequired({ firstRecordAt: null })).toBe(true);
  });
});

describe("routeAfterAuth", () => {
  it("sends a never-used account to onboarding", () => {
    expect(routeAfterAuth(NEVER)).toBe("/onboarding");
  });

  it("sends an active farmer to the dashboard", () => {
    expect(routeAfterAuth(ACTIVE)).toBe("/dashboard");
  });
});

describe("shouldBlockDashboard", () => {
  it("blocks the dashboard for a never-used account", () => {
    expect(shouldBlockDashboard(NEVER)).toBe(true);
  });

  it("does NOT block the dashboard for an active farmer", () => {
    expect(shouldBlockDashboard(ACTIVE)).toBe(false);
  });
});

describe("no farmer with data can ever be locked out", () => {
  it("holds across every profileComplete combination", () => {
    for (const pc of [true, false, null, undefined]) {
      expect(onboardingRequired({ firstRecordAt: "2026-01-01", profileComplete: pc as any })).toBe(false);
      expect(shouldBlockDashboard({ firstRecordAt: "2026-01-01", profileComplete: pc as any })).toBe(false);
    }
  });
});
