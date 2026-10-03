import { describe, it, expect } from "vitest";

/**
 * First-run gating rules.
 *
 * The regression that matters: a dairy farmer logging milk every night, who
 * never added an animal to the system, was shown "Welcome to Wangari! Start
 * here — follow these 3 easy steps" forever, because the banner gated on
 * totalFlocks. Production had 5 farms with zero records and the onboarding
 * was not one of the things that fixed it — it was three English chores
 * before any reward.
 *
 * So: gate on what the farmer has DONE, never on what they haven't configured.
 */

import {
  hasRecorded,
  showFirstRunCard,
  showKpiGrid,
  openDeliveryFormByDefault,
  showStatementOnDashboard,
  statementPrompt,
} from "./first-run";

const NEW = { firstRecordAt: null, loading: false };
const ACTIVE = { firstRecordAt: "2026-09-30T08:00:00.000Z", loading: false };
const LOADING = { firstRecordAt: undefined, loading: true };

describe("hasRecorded", () => {
  it("is false for a brand-new farm", () => {
    expect(hasRecorded(NEW)).toBe(false);
  });

  it("is true once anything is recorded", () => {
    expect(hasRecorded(ACTIVE)).toBe(true);
  });

  it("treats loading as NOT recorded, so we never guess", () => {
    expect(hasRecorded(LOADING)).toBe(false);
  });
});

describe("showFirstRunCard", () => {
  it("shows for a farm with nothing recorded", () => {
    expect(showFirstRunCard(NEW)).toBe(true);
  });

  it("hides for a farm that has recorded something", () => {
    expect(showFirstRunCard(ACTIVE)).toBe(false);
  });

  it("never flashes while loading — the key anti-nag rule", () => {
    // A month-long farmer opening the app must not be shown a welcome card
    // for one frame before the payload arrives.
    expect(showFirstRunCard(LOADING)).toBe(false);
  });
});

describe("showKpiGrid — the all-zeros wall", () => {
  it("is hidden for a farm with no records", () => {
    expect(showKpiGrid(NEW)).toBe(false);
  });

  it("is shown the moment there is something true to display", () => {
    expect(showKpiGrid(ACTIVE)).toBe(true);
  });

  it("stays visible while loading, to avoid a layout jump", () => {
    expect(showKpiGrid(LOADING)).toBe(true);
  });
});

describe("the setup banner is gone, not re-gated", () => {
  // Regression this file exists for. An earlier version kept the old
  // "add your animals / record output" banner and only re-gated it. The test
  // proved that was still a nag: a dairy farmer who logs milk nightly and
  // never adds a flock is precisely that case, so they would still have been
  // told to go and set up animals — just in Swahili.
  //
  // Telling someone who is already recording to do setup work is a nag
  // however it is phrased, so the banner was deleted rather than gated.
  // Setup remains reachable from the sidebar whenever the farmer wants it.
  it("no longer exists as a function to call", async () => {
    const mod = await import("./first-run");
    expect(Object.keys(mod)).not.toContain("showSetupSteps");
  });

  it("a recording farmer is never in the first-run state at all", () => {
    expect(hasRecorded(ACTIVE)).toBe(true);
    expect(showFirstRunCard(ACTIVE)).toBe(false);
  });
});

describe("openDeliveryFormByDefault", () => {
  it("opens ready to log for a farmer with no deliveries", () => {
    expect(openDeliveryFormByDefault(0)).toBe(true);
  });

  it("leaves a returning farmer's page closed, so the statement leads", () => {
    expect(openDeliveryFormByDefault(4)).toBe(false);
  });
});

describe("the gates are mutually consistent", () => {
  it("a new farmer sees the card and NOT the zero-grid", () => {
    expect(showFirstRunCard(NEW)).toBe(true);
    expect(showKpiGrid(NEW)).toBe(false);
  });

  it("an active farmer sees the grid and NOT the card", () => {
    expect(showFirstRunCard(ACTIVE)).toBe(false);
    expect(showKpiGrid(ACTIVE)).toBe(true);
  });
});

describe("showStatementOnDashboard", () => {
  it("shows the statement when the farmer is genuinely owed money", () => {
    // The whole point of row 12: the proof a farmer hands a co-op clerk should
    // not be behind a tab they have to know about.
    expect(showStatementOnDashboard({ outstanding: 45000 })).toBe(true);
    expect(showStatementOnDashboard({ outstanding: 1 })).toBe(true);
  });

  it("stays away when nothing is owed", () => {
    expect(showStatementOnDashboard({ outstanding: 0 })).toBe(false);
  });

  it("stays away while loading, so a working farmer is never flashed KES 0", () => {
    expect(showStatementOnDashboard({ outstanding: 0, loading: true })).toBe(false);
    expect(showStatementOnDashboard({ outstanding: null, loading: true })).toBe(false);
  });

  it("stays away when the figure is unknown rather than guessing", () => {
    expect(showStatementOnDashboard({ outstanding: null })).toBe(false);
    expect(showStatementOnDashboard({ outstanding: undefined })).toBe(false);
  });

  // Postgres NUMERIC arrives as a string; "45000" must still count as owed.
  it("accepts a numeric string from the API", () => {
    expect(showStatementOnDashboard({ outstanding: "45000" as unknown as number })).toBe(true);
    expect(showStatementOnDashboard({ outstanding: "0" as unknown as number })).toBe(false);
  });

  it("does not show for a negative balance the farmer owes the buyer", () => {
    expect(showStatementOnDashboard({ outstanding: -500 })).toBe(false);
  });
});

describe("statementPrompt", () => {
  it("tells the dashboard to show the card, with the amount", () => {
    expect(statementPrompt({ outstanding: 4200 })).toEqual({ kind: "show", outstanding: 4200 });
  });

  it("tells the dashboard to offer logging a delivery instead", () => {
    // An empty gap teaches a farmer nothing. The next useful thing is always
    // the next action.
    expect(statementPrompt({ outstanding: 0 })).toEqual({ kind: "empty" });
  });

  it("says nothing at all while loading", () => {
    expect(statementPrompt({ outstanding: null })).toEqual({ kind: "loading" });
    expect(statementPrompt({ outstanding: 100, loading: true })).toEqual({ kind: "loading" });
  });
});

describe("the statement and the delivery form are deliberately opposite", () => {
  // The form offers itself when there is nothing; the statement speaks only
  // when there is something. Reversing either one re-creates the original bug.
  it("a brand new farmer gets the open form and no statement", () => {
    expect(openDeliveryFormByDefault(0)).toBe(true);
    expect(showStatementOnDashboard({ outstanding: 0 })).toBe(false);
  });

  it("a dairy farmer with money owed gets the statement and a closed form", () => {
    expect(openDeliveryFormByDefault(30)).toBe(false);
    expect(showStatementOnDashboard({ outstanding: 45000 })).toBe(true);
  });
});
