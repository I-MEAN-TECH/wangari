import { describe, it, expect } from "vitest";

/**
 * Activation funnel maths.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 * On 2 Oct 2026 we reordered the entire product because a usage audit showed
 * 5 of 8 farms had never recorded anything. That audit was a one-off manual
 * query. This pins the same measurement as a pure function so the number can
 * be produced every week and compared to last week.
 *
 * ── The three rules that keep it honest ───────────────────────────────────
 * 1. STEP-TO-STEP, NOT COUNT-TO-COUNT. "Onboarded / signups" is a lie when
 *    some accounts predate the instrumentation: the numerator is a different
 *    population. Every rate here is computed on the *intersection* — of the
 *    users who did the previous step, how many did this one.
 * 2. NO NaN. An empty funnel has no denominator. That must read as 0, not NaN,
 *    because this number ends up in front of a founder and in a funding deck.
 * 3. SAY WHAT WE CANNOT SEE. Users with no events at all are not "unactivated"
 *    — they are *untracked*. They are counted separately and the report says so.
 *
 * Day arithmetic is done on UTC calendar days derived from `YYYY-MM-DD` strings
 * so the result does not shift when the server runs in a different timezone.
 */

import {
  computeFunnel,
  type FunnelEvent,
  type FunnelStage,
} from "./activation-funnel.js";

const ev = (userId: number, stage: FunnelStage, day: string): FunnelEvent => ({
  userId,
  stage,
  day,
});

describe("rule 1 — every rate is measured on the users who took the previous step", () => {
  it("counts each user once per stage however many events they have", () => {
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(1, "signup", "2026-09-02"), // repeated login/client retry
      ev(2, "signup", "2026-09-03"),
    ]);
    expect(f.signups).toBe(2);
  });

  it("measures onboarding against signups, not against all users", () => {
    // User 2 onboarded but has no signup row — a pre-instrumentation account.
    // Counting 1/2 here would credit or blame us for an account we never saw
    // sign up. The intersection is the only honest denominator.
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(2, "signup", "2026-09-01"),
      ev(1, "onboarding_completed", "2026-09-01"),
      ev(2, "onboarding_completed", "2026-09-01"),
      ev(3, "onboarding_completed", "2026-09-01"), // never seen signing up
    ]);
    expect(f.signups).toBe(2);
    expect(f.onboardingCompleted).toBe(3); // the raw count is still reported…
    expect(f.steps[0].rate).toBe(1); // …but the rate only uses the 2 we saw
    expect(f.steps[0].denominator).toBe(2);
  });

  it("an untracked account never enters the denominator", () => {
    // 9 accounts we cannot see, 1 we can, and that one did finish onboarding.
    // The rate is 1/1 — not 1/10, which would blame us for accounts that were
    // created before this table existed.
    const f = computeFunnel(
      [ev(1, "signup", "2026-09-01"), ev(1, "onboarding_completed", "2026-09-01")],
      { totalUsers: 10 }
    );
    expect(f.steps[0].denominator).toBe(1);
    expect(f.steps[0].rate).toBe(1);
    expect(f.untrackedUsers).toBe(9);
  });

  it("a signup with no onboarding is genuinely 0, not 1-over-nothing", () => {
    const f = computeFunnel([ev(1, "signup", "2026-09-01")], { totalUsers: 10 });
    expect(f.steps[0].rate).toBe(0);
    expect(f.steps[0].lost).toBe(1);
  });
});

describe("the funnel itself", () => {
  it("walks signup → onboarding → first record → day-7 return", () => {
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(1, "onboarding_completed", "2026-09-01"),
      ev(1, "first_record", "2026-09-02"),
      ev(1, "active", "2026-09-09"), // 7 days after the first record
      ev(2, "signup", "2026-09-01"), // signs up, stops here
      ev(3, "signup", "2026-09-01"),
      ev(3, "onboarding_completed", "2026-09-01"),
      ev(3, "first_record", "2026-09-03"),
    ]);
    expect(f.signups).toBe(3);
    expect(f.onboardingCompleted).toBe(2);
    expect(f.firstRecord).toBe(2);
    expect(f.returnedDay7).toBe(1);

    expect(f.steps.map((s) => s.rate)).toEqual([2 / 3, 1, 1 / 2]);
    expect(f.signupToFirstRecordRate).toBe(2 / 3);
  });

  it("a farmer who drops before onboarding is the drop-off we most want to see", () => {
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(1, "onboarding_completed", "2026-09-01"),
      ev(1, "first_record", "2026-09-01"),
      ev(1, "active", "2026-09-08"),
      ...[2, 3, 4, 5, 6].map((id) => ev(id, "signup", "2026-09-01")),
    ]);
    expect(f.biggestDropStep?.id).toBe("onboarding_completed");
    expect(f.biggestDropStep?.lost).toBe(5); // 6 signed up, 1 finished onboarding
  });
});

describe("day-7 return is measured from the FIRST RECORD, not from signup", () => {
  it("counts a return on exactly day 7", () => {
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(1, "first_record", "2026-09-03"),
      ev(1, "active", "2026-09-10"),
    ]);
    expect(f.returnedDay7).toBe(1);
  });

  it("does NOT count a return on day 6", () => {
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(1, "first_record", "2026-09-03"),
      ev(1, "active", "2026-09-09"),
    ]);
    expect(f.returnedDay7).toBe(0);
  });

  it("does not credit a farmer who was active BEFORE they ever recorded", () => {
    // They logged in on day 1 and day 5, and recorded nothing. Two app opens
    // is not a habit — they never started.
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(1, "active", "2026-09-01"),
      ev(1, "active", "2026-09-06"),
    ]);
    expect(f.firstRecord).toBe(0);
    expect(f.returnedDay7).toBe(0);
  });

  it("counts a farmer once no matter how many days they came back", () => {
    const f = computeFunnel([
      ev(1, "first_record", "2026-09-01"),
      ev(1, "active", "2026-09-08"),
      ev(1, "active", "2026-09-09"),
      ev(1, "active", "2026-09-20"),
    ]);
    expect(f.returnedDay7).toBe(1);
  });

  it("spans a month boundary without falling back to a naive day count", () => {
    const f = computeFunnel([
      ev(1, "first_record", "2026-09-28"),
      ev(1, "active", "2026-10-05"), // 7 days, across the month boundary
    ]);
    expect(f.returnedDay7).toBe(1);
  });

  it("spans a leap day without drifting by one", () => {
    const f = computeFunnel([
      ev(1, "first_record", "2028-02-26"),
      ev(1, "active", "2028-03-04"), // 7 days across Feb 29
    ]);
    expect(f.returnedDay7).toBe(1);
  });
});

describe("rule 2 — no NaN, no Infinity, ever", () => {
  it("an empty funnel is all zeroes, not NaN", () => {
    const f = computeFunnel([]);
    expect(f.signups).toBe(0);
    expect(f.firstRecord).toBe(0);
    for (const s of f.steps) {
      expect(Number.isFinite(s.rate)).toBe(true);
      expect(s.rate).toBe(0);
      expect(Number.isFinite(s.lost)).toBe(true);
    }
    expect(Number.isFinite(f.signupToFirstRecordRate)).toBe(true);
    expect(Number.isFinite(f.medianDaysToFirstRecord)).toBe(true);
  });

  it("every rate is a real fraction between 0 and 1", () => {
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(1, "onboarding_completed", "2026-09-01"),
      ev(1, "first_record", "2026-09-01"),
      ev(1, "active", "2026-09-08"),
      ev(2, "signup", "2026-09-01"),
    ]);
    for (const s of f.steps) {
      expect(s.rate).toBeGreaterThanOrEqual(0);
      expect(s.rate).toBeLessThanOrEqual(1);
    }
  });
});

describe("rule 3 — we say what we cannot see", () => {
  it("reports accounts that predate the instrumentation separately", () => {
    const f = computeFunnel([ev(1, "signup", "2026-09-01")], { totalUsers: 8 });
    expect(f.untrackedUsers).toBe(7);
    expect(f.coverage).toBe(0.125); // 1 of 8 accounts is tracked at all
  });

  it("assumes no untracked accounts when we were not told the total", () => {
    const f = computeFunnel([ev(1, "signup", "2026-09-01")]);
    expect(f.untrackedUsers).toBe(0);
    expect(f.coverage).toBe(1);
  });
});

describe("time to first record", () => {
  it("measures from signup to the first record, in days", () => {
    const f = computeFunnel([
      ev(1, "signup", "2026-09-01"),
      ev(1, "first_record", "2026-09-01"), // same day — the best case
      ev(2, "signup", "2026-09-01"),
      ev(2, "first_record", "2026-09-04"),
      ev(3, "signup", "2026-09-01"),
      ev(3, "first_record", "2026-09-08"),
    ]);
    // [0, 3, 7] → median 3
    expect(f.medianDaysToFirstRecord).toBe(3);
  });

  it("is null-ish (0) when nobody has recorded yet, never negative", () => {
    const f = computeFunnel([ev(1, "signup", "2026-09-01")]);
    expect(f.medianDaysToFirstRecord).toBe(0);
  });

  it("ignores a record that somehow predates the signup", () => {
    // Data-integrity failure, not a signal. A negative number here would be
    // the kind of thing that quietly destroys trust in the whole dashboard.
    const f = computeFunnel([
      ev(1, "signup", "2026-09-10"),
      ev(1, "first_record", "2026-09-01"),
    ]);
    expect(f.medianDaysToFirstRecord).toBe(0);
  });
});

describe("malformed input degrades instead of throwing", () => {
  it("ignores events with an unparseable day", () => {
    const f = computeFunnel([
      ev(1, "signup", "not-a-date"),
      ev(2, "signup", "2026-09-01"),
    ]);
    expect(f.signups).toBe(1);
  });

  it("ignores an unknown stage rather than counting it as progress", () => {
    const f = computeFunnel([
      { userId: 1, stage: "teleported" as FunnelStage, day: "2026-09-01" },
      ev(2, "signup", "2026-09-01"),
    ]);
    expect(f.signups).toBe(1);
    expect(f.firstRecord).toBe(0);
  });
});