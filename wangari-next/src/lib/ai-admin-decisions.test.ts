import { describe, it, expect } from "vitest";
import {
  canActivate, activateBlockedReason, latencyBand, formatSeconds, canDelete,
  costLabel, sourceLabel, validateSettings, parseSetting,
} from "./ai-admin-decisions";

/**
 * The rules the AI admin screen enforces.
 *
 * These were extracted from the page because the page itself cannot be tested
 * by rendering: it is a client component that fetches in `useEffect`, and
 * `renderToStaticMarkup` never runs effects — a suite written against the
 * rendered page asserts only that a loading spinner exists. These functions
 * hold the behaviour the operator actually relies on, so they are where the
 * assertions belong.
 *
 * Every rule here is a MIRROR of a guard the server also enforces. The server
 * is the guarantee; these exist so the UI never offers a button that would only
 * come back as a 400 with no explanation.
 */

describe("canActivate — the probe gate", () => {
  it("allows only a model that has passed", () => {
    expect(canActivate({ probeState: "passing" })).toBe(true);
  });

  it("refuses every other state", () => {
    // The gate is the entire point of this module. A model that cannot chain
    // two tool calls answers a chat fine and then leaves the screen quiet
    // halfway through recording a sale.
    for (const state of ["untested", "failing", "error"]) {
      expect(canActivate({ probeState: state }), state).toBe(false);
    }
  });

  it("does not trust a state it does not recognise", () => {
    // An unknown state from a newer server version must fail closed, not open.
    expect(canActivate({ probeState: "weird-new-state" })).toBe(false);
    expect(canActivate({ probeState: "" })).toBe(false);
  });
});

describe("activateBlockedReason", () => {
  it("tells an untested operator exactly what to do next", () => {
    expect(activateBlockedReason({ probeState: "untested" })).toMatch(/pass the agent test/i);
  });

  it("distinguishes an error from a genuine failure", () => {
    // They need different actions: one fixes the key, the other picks a model.
    expect(activateBlockedReason({ probeState: "error" })).toMatch(/key|provider/i);
    expect(activateBlockedReason({ probeState: "failing" })).toMatch(/failed/i);
  });

  it("says nothing when there is no block", () => {
    expect(activateBlockedReason({ probeState: "passing" })).toBe("");
  });
});

describe("latencyBand", () => {
  it("bands speed by what a farmer experiences, not by round numbers", () => {
    expect(latencyBand(500).tone).toBe("good");
    expect(latencyBand(2999).tone).toBe("good");
    expect(latencyBand(3000).tone).toBe("ok");
    expect(latencyBand(9999).tone).toBe("ok");
    expect(latencyBand(10000).tone).toBe("slow");
    expect(latencyBand(29999).tone).toBe("slow");
    expect(latencyBand(30000).tone).toBe("bad");
  });

  it("says so when nothing has been measured", () => {
    // "0.0s" would read as an instant answer, which is the opposite of the truth.
    const b = latencyBand(null);
    expect(b.tone).toBe("unknown");
    expect(b.label).toMatch(/no traffic/i);
  });
});

describe("formatSeconds", () => {
  it("renders milliseconds as seconds", () => {
    expect(formatSeconds(2930)).toBe("2.9s");
    expect(formatSeconds(41000)).toBe("41.0s");
    expect(formatSeconds(0)).toBe("0.0s");
  });

  it("uses a dash rather than zero when there is no measurement", () => {
    expect(formatSeconds(null)).toBe("—");
  });
});

describe("canDelete", () => {
  it("protects the live model", () => {
    // Deleting it would leave every farmer with no assistant until one was
    // activated by hand.
    expect(canDelete({ role: "primary" })).toBe(false);
  });

  it("allows removing anything that is not live", () => {
    expect(canDelete({ role: "fallback" })).toBe(true);
    expect(canDelete({ role: "candidate" })).toBe(true);
  });
});

describe("costLabel", () => {
  it("labels a free model plainly", () => {
    expect(costLabel({ isFree: true, costInPerM: null, costOutPerM: null })).toBe("Free");
  });

  it("shows both directions of a priced model", () => {
    // Input and output differ by ~4x on most models; showing one is how a farm
    // SaaS ends up with a bill nobody predicted.
    expect(costLabel({ isFree: false, costInPerM: 2.5, costOutPerM: 10 })).toBe("$2.5/$10 per 1M");
  });

  it("does not invent a price that was never entered", () => {
    expect(costLabel({ isFree: false, costInPerM: null, costOutPerM: null })).toBe("Paid");
    expect(costLabel({ isFree: false, costInPerM: 3, costOutPerM: null })).toBe("$3/$? per 1M");
  });
});

describe("sourceLabel", () => {
  it("distinguishes a registry choice from an environment default", () => {
    // They behave differently when the database is unavailable, and a
    // super-admin needs to know which they are relying on.
    expect(sourceLabel(true)).toMatch(/environment/i);
    expect(sourceLabel(false)).toMatch(/registry/i);
  });
});

describe("validateSettings", () => {
  const ok = { searchesPerTurn: 2, rateLimitWindowMs: 60000, maxSteps: 8 };

  it("accepts the current defaults", () => {
    expect(validateSettings(ok)).toBeNull();
  });

  it("bounds each field", () => {
    // Unbounded steps would hang a farmer's tab for hours on one question.
    expect(validateSettings({ ...ok, maxSteps: 0 })).toMatch(/max agent steps/i);
    expect(validateSettings({ ...ok, maxSteps: 21 })).toMatch(/max agent steps/i);
    expect(validateSettings({ ...ok, searchesPerTurn: -1 })).toMatch(/searches/i);
    expect(validateSettings({ ...ok, searchesPerTurn: 11 })).toMatch(/searches/i);
    // A window shorter than a second would retry into a closed window forever.
    expect(validateSettings({ ...ok, rateLimitWindowMs: 999 })).toMatch(/rate-limit/i);
    expect(validateSettings({ ...ok, rateLimitWindowMs: 300_001 })).toMatch(/rate-limit/i);
  });

  it("rejects a cleared field rather than reading it as a silent zero", () => {
    // This is the bug this function guards. Number("") is 0 — NOT NaN — so an
    // emptied input would otherwise save as "0 searches per turn" and switch
    // research off across the whole product with no error anywhere.
    expect(validateSettings({ ...ok, searchesPerTurn: parseSetting("") })).toMatch(/searches/i);
    expect(validateSettings({ ...ok, maxSteps: parseSetting("  ") })).toMatch(/max agent steps/i);
    expect(validateSettings({ ...ok, rateLimitWindowMs: parseSetting("") })).toMatch(/rate-limit/i);
  });

  it("rejects a non-numeric field", () => {
    expect(validateSettings({ ...ok, maxSteps: parseSetting("abc") })).toMatch(/max agent steps/i);
  });

  it("still accepts a deliberate zero", () => {
    // Zero searches is a real choice (turn research off entirely), and must
    // not be confused with an empty field.
    expect(validateSettings({ ...ok, searchesPerTurn: parseSetting("0") })).toBeNull();
  });

  it("accepts the boundaries themselves", () => {
    expect(validateSettings({ searchesPerTurn: 0, rateLimitWindowMs: 1000, maxSteps: 1 })).toBeNull();
    expect(validateSettings({ searchesPerTurn: 10, rateLimitWindowMs: 300_000, maxSteps: 20 })).toBeNull();
  });
});

describe("parseSetting", () => {
  it("tells an empty field apart from a typed zero", () => {
    // Number("") === 0, which is the whole reason this exists.
    expect(Number("")).toBe(0);
    expect(Number.isNaN(parseSetting(""))).toBe(true);
    expect(Number.isNaN(parseSetting("   "))).toBe(true);
    expect(parseSetting("0")).toBe(0);
    expect(parseSetting("8")).toBe(8);
  });

  it("does not accept NaN or Infinity as a real value", () => {
    // NaN and Infinity both pass Number(), so they have to be rejected by
    // range rather than assumed away.
    expect(Number.isNaN(parseSetting("NaN"))).toBe(true);
    expect(Number.isNaN(parseSetting("abc"))).toBe(true);
    expect(parseSetting("Infinity")).toBe(Infinity);
  });
});
