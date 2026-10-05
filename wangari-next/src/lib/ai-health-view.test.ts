import { describe, it, expect } from "vitest";
import {
  stateMeta,
  isSidelined,
  sidelinedLabel,
  uptimePct,
  uptimeScore,
  overallTone,
  fallbackSentence,
  timeAgo,
  wouldUseNow,
  whoLabel,
  type ModelHealthLike,
} from "./ai-health-view";

/**
 * The panel's job is to stop "the AI is not working" from being the end of a
 * farmer's report and an operator's only clue.
 *
 * Two properties are asserted here that a rendering test could not catch.
 *
 * 1. AN UNKNOWN STATE NEVER READS AS HEALTHY. If a newer server sends a state
 *    this build has never heard of, the old panel must say "Checking" — a
 *    default of "Answering" would tell an operator everything is fine at the
 *    exact moment it might not be, which is the failure this whole feature was
 *    built to remove.
 * 2. AN UNKNOWN USER IS LABELLED, NOT HIDDEN. Traffic that could not be
 *    attributed still happened and still came from somewhere.
 */

const NOW = 1_700_000_000_000;

function h(partial: Partial<ModelHealthLike> & { model: string }): ModelHealthLike {
  return {
    state: "unknown", lastStatus: null, lastReason: null, lastFailureAt: null,
    lastHealthyAt: null, consecutiveFailures: 0, calls: 0, failures: 0, uptime: 1,
    ...partial,
  };
}

/*
 * `summariseUsage` used to live here. It moved to the server
 * (lib/model-health.ts) because it has to run over every record the store
 * holds: the panel receives only the most recent 60 rows, so counting distinct
 * farmers over those would under-report exactly when the numbers were worth
 * trusting. Its tests moved with it.
 */

describe("stateMeta", () => {
  it("never calls an unknown state healthy", () => {
    expect(stateMeta("healthy").label).toBe("Answering");
    // A model nobody has called yet is not a model that works. Saying so here
    // is how a dead model ends up looking fine on the panel.
    expect(stateMeta("unknown").label).toBe("Not tried yet");
    expect(stateMeta("brand_new_state_from_a_newer_server").label).toBe("Checking");
  });

  it("distinguishes a pause from a retirement", () => {
    // These need opposite responses from the operator: one clears itself in
    // five minutes, the other needs a human.
    expect(stateMeta("exhausted").label).toBe("No capacity");
    expect(stateMeta("rate_limited").label).toBe("Rate limited");
    expect(stateMeta("gone").label).toBe("Retired");
  });
});

describe("isSidelined", () => {
  it("is true for a pause with time left and for a retirement", () => {
    expect(isSidelined(h({ model: "a", state: "exhausted", sidelinedForMs: 240_000 }))).toBe(true);
    expect(isSidelined(h({ model: "a", state: "gone" }))).toBe(true);
  });

  it("is false once the pause has expired", () => {
    // The 5-minute cooldown running out is the whole recovery mechanism. If
    // this stayed true the assistant would never come back on its own.
    expect(isSidelined(h({ model: "a", state: "exhausted", sidelinedForMs: 0 }))).toBe(false);
    expect(isSidelined(h({ model: "a", state: "rate_limited" }))).toBe(false);
  });
});

describe("sidelinedLabel", () => {
  it("says nothing when nothing is paused", () => {
    expect(sidelinedLabel(0)).toBe("");
    expect(sidelinedLabel(null)).toBe("");
    expect(sidelinedLabel(undefined)).toBe("");
  });

  it("never renders 'until you clear it' as a number of seconds", () => {
    // -1 is a different kind of fact, not a very long pause. Showing "-1s" or
    // rounding it would misinform exactly the case an operator most needs.
    expect(sidelinedLabel(-1)).toBe("until you clear it");
  });

  it("reads in minutes past a minute, so it stays short on screen", () => {
    expect(sidelinedLabel(30_000)).toBe("paused 30s");
    expect(sidelinedLabel(240_000)).toBe("paused 4m");
  });
});

describe("uptime", () => {
  it("says dash rather than 100% for a model that has never run", () => {
    // 0 calls with a default uptime of 1 would render a perfect score for a
    // model nobody has ever called. That is the optimistic lie again.
    expect(uptimePct(h({ model: "a", calls: 0, uptime: 1 }))).toBe("—");
    expect(uptimeScore(h({ model: "a", calls: 0, uptime: 1 }))).toBe(-1);
  });

  it("reports zero for a model that has only ever failed", () => {
    expect(uptimePct(h({ model: "a", calls: 1, uptime: 0 }))).toBe("0%");
    expect(uptimeScore(h({ model: "a", calls: 1, uptime: 0 }))).toBe(0);
  });
});

describe("overallTone", () => {
  const candidates = ["primary:free", "backup:free"];

  it("says so when nothing has been called yet", () => {
    expect(overallTone([], candidates).label).toBe("No traffic yet");
    expect(overallTone([h({ model: "unrelated:free" })], candidates).label).toBe("No traffic yet");
  });

  it("says the assistant is down only when EVERY candidate is paused", () => {
    const models = [
      h({ model: "primary:free", state: "exhausted", sidelinedForMs: 100_000 }),
      h({ model: "backup:free", state: "exhausted", sidelinedForMs: 100_000 }),
    ];
    expect(overallTone(models, candidates).label).toBe("Every model is paused");
  });

  it("says it is answering as soon as ONE candidate works", () => {
    // The automatic selection exists so one sick model cannot take the
    // assistant down. If the panel said "down" here, the panel would be
    // contradicting the thing that was just built.
    const models = [
      h({ model: "primary:free", state: "exhausted", sidelinedForMs: 100_000 }),
      h({ model: "backup:free", state: "healthy", calls: 3, uptime: 1 }),
    ];
    expect(overallTone(models, candidates).label).toBe("Wangari AI is answering");
  });

  it("does not count a model outside the candidate list", () => {
    const models = [h({ model: "some-other-model", state: "healthy", calls: 5, uptime: 1 })];
    expect(overallTone(models, candidates).label).toBe("No traffic yet");
  });
});

describe("fallbackSentence", () => {
  it("names both models AND the reason", () => {
    // The reason is the part that was missing before automatic selection. A
    // fallback with no stated cause is indistinguishable from a bug.
    expect(
      fallbackSentence({
        at: NOW, from: "primary:free", to: "backup:free",
        reason: "primary:free unavailable (every upstream channel is rate-limited) — used backup:free instead",
        userId: 3, ip: "1.1.1.1",
      }),
    ).toContain("backup:free took over from primary:free");
  });

  it("still reads correctly when the reason is missing", () => {
    expect(
      fallbackSentence({ at: NOW, from: null, to: "backup:free", reason: null, userId: null, ip: null }),
    ).toBe("backup:free took over from the configured model");
  });
});

describe("timeAgo", () => {
  it("says 'just now' rather than a sub-five-second number", () => {
    expect(timeAgo(NOW - 1_000, NOW)).toBe("just now");
    expect(timeAgo(NOW - 30_000, NOW)).toBe("30s ago");
    expect(timeAgo(NOW - 3_600_000, NOW)).toBe("1h ago");
  });

  it("refuses to invent a time from an unparseable value", () => {
    expect(timeAgo("not a date", NOW)).toBe("unknown");
  });
});

describe("wouldUseNow", () => {
  it("names the model selection would actually call", () => {
    const models = [
      h({ model: "primary:free", state: "exhausted", sidelinedForMs: 60_000 }),
      h({ model: "backup:free", state: "healthy", calls: 1, uptime: 1 }),
    ];
    expect(wouldUseNow(models, ["primary:free", "backup:free"])).toBe("backup:free");
  });

  it("falls back to the first candidate rather than reporting nothing", () => {
    // Silence would look identical to a broken panel. A wrong model is
    // visibly wrong and recoverable.
    const models = [h({ model: "primary:free", state: "gone" })];
    expect(wouldUseNow(models, ["primary:free", "backup:free"])).toBe("primary:free");
    expect(wouldUseNow(models, [])).toBeNull();
  });
});

describe("whoLabel", () => {
  it("labels unattributed traffic rather than printing null", () => {
    expect(whoLabel(null)).toBe("unattributed");
    expect(whoLabel(7)).toBe("user 7");
  });
});