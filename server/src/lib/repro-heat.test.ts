/**
 * The A4 additions to the reproduction timeline.
 *
 * Kept beside `repro-timeline.test.ts` rather than inside it so the A3 suite
 * (days in milk, calving interval, services per conception) keeps testing exactly
 * what it was written for. These are the new facts: a heat with no service, the
 * 21-day cycle, and the dry period.
 */
import { describe, it, expect } from "vitest";
import { cowTimeline, herdRepro, HEAT_CYCLE_DAYS, type BreedingEvent } from "./repro-timeline.js";

const on = new Date("2026-10-13T09:00:00Z");
const DAY = 86400000;

function event(overrides: Partial<BreedingEvent> = {}): BreedingEvent {
  return {
    damName: "Njeru",
    matingDate: null,
    heatObservedAt: null,
    heatSigns: null,
    dryOffDate: null,
    expectedBirth: null,
    actualBirth: null,
    offspringCount: null,
    offspringAlive: null,
    method: null,
    status: "pending",
    ...overrides,
  };
}

describe("a heat with no service yet", () => {
  it("is kept on the timeline instead of being dropped for having no mating date", () => {
    const cow = cowTimeline("Njeru", [event({ heatObservedAt: new Date("2026-10-03"), status: "heat" })], on);
    expect(cow.lastHeat).toEqual(new Date("2026-10-03"));
    expect(cow.daysSinceHeat).toBe(10);
    expect(cow.pendingServices).toEqual([]);
  });

  it("states the next heat as 21 days on, as a date to watch", () => {
    const cow = cowTimeline("Njeru", [event({ heatObservedAt: new Date("2026-10-03") })], on);
    expect(cow.nextHeatExpected).toEqual(new Date("2026-10-24"));
    expect(cow.daysToNextHeat).toBe(11);
    expect(HEAT_CYCLE_DAYS).toBe(21);
  });

  it("reports a negative countdown rather than shouting overdue", () => {
    // She may have been served and settled, or simply not looked at. An app that
    // shouts "overdue" at a settled cow is an app that gets muted.
    const cow = cowTimeline("Njeru", [event({ heatObservedAt: new Date("2026-09-01") })], on);
    expect(cow.daysToNextHeat).toBeLessThan(0);
  });

  it("measures how long after the heat the service actually happened", () => {
    const cow = cowTimeline(
      "Njeru",
      [
        event({ heatObservedAt: new Date("2026-09-20") }),
        event({ matingDate: new Date("2026-09-23"), status: "pending" }),
      ],
      on
    );
    expect(cow.heatToServiceDays).toBe(3);
    expect(cow.pendingServices).toHaveLength(1);
  });

  it("has no cycle arithmetic at all with no heat recorded", () => {
    const cow = cowTimeline("Njeru", [event({ matingDate: new Date("2026-09-01") })], on);
    expect(cow.lastHeat).toBeNull();
    expect(cow.nextHeatExpected).toBeNull();
    expect(cow.daysToNextHeat).toBeNull();
  });

  it("ignores an Invalid Date leaking in as a heat", () => {
    const cow = cowTimeline("Njeru", [event({ heatObservedAt: new Date("nonsense") })], on);
    expect(cow.lastHeat).toBeNull();
  });
});

describe("services per conception with nullable mating dates", () => {
  it("counts only rows that actually recorded a service", () => {
    const cow = cowTimeline(
      "Njeru",
      [
        event({ actualBirth: new Date("2026-01-10"), heatObservedAt: new Date("2026-03-01") }),
        event({ matingDate: new Date("2026-03-02"), status: "confirmed" }),
      ],
      on
    );
    expect(cow.servicesPerConception).toBe(1);
    expect(cow.daysInMilk).toBe(276);
  });
});

describe("dry-off", () => {
  it("marks a cow dry when she was dried off and has not calved since", () => {
    const cow = cowTimeline(
      "Njeru",
      [
        event({ actualBirth: new Date("2025-12-01"), status: "born" }),
        event({ dryOffDate: new Date("2026-09-01") }),
      ],
      on
    );
    expect(cow.isDry).toBe(true);
    expect(cow.lastDryOff).toEqual(new Date("2026-09-01"));
    expect(cow.dryDays).toBe(42);
  });

  it("ends the dry period when she calves again", () => {
    // Without this, every cow ever dried off would stay dry forever.
    const cow = cowTimeline(
      "Njeru",
      [
        event({ dryOffDate: new Date("2026-01-01") }),
        event({ actualBirth: new Date("2026-03-01"), status: "born" }),
      ],
      on
    );
    expect(cow.isDry).toBe(false);
    expect(cow.dryDays).toBeNull();
    expect(cow.lastDryOff).toEqual(new Date("2026-01-01"));
  });
});

describe("herdRepro with heat and dry-off", () => {
  it("counts cows with a heat record and the ones to watch this week", () => {
    const herd = herdRepro(
      [
        // Heat 18 days ago: the next one is expected in 3 days, so she is on the
        // watch list.
        event({ damName: "Njeru", heatObservedAt: new Date(on.getTime() - 18 * DAY) }),
        // Heat 40 days ago: far past any window. She may be settled, so she is
        // dropped rather than labelled overdue.
        event({ damName: "Wanjiku", heatObservedAt: new Date(on.getTime() - 40 * DAY) }),
      ],
      on
    );
    expect(herd.cowsWithHeatRecord).toBe(2);
    expect(herd.cowsDueForHeatCheck).toEqual(["Njeru"]);
  });

  it("reports how many are dry and the longest dry period", () => {
    const herd = herdRepro(
      [
        event({ damName: "Njeru", dryOffDate: new Date("2026-09-01") }),
        event({ damName: "Wanjiku", dryOffDate: new Date("2026-08-01") }),
        event({ damName: "Achieng" }),
      ],
      on
    );
    expect(herd.cowsDry).toBe(2);
    expect(herd.longestDryDays).toBe(73);
  });

  it("says nothing about heat when no heat has ever been recorded", () => {
    const herd = herdRepro([event({ damName: "Njeru", matingDate: new Date("2026-09-01") })], on);
    expect(herd.cowsWithHeatRecord).toBe(0);
    expect(herd.cowsDueForHeatCheck).toEqual([]);
    expect(herd.cowsDry).toBe(0);
    expect(herd.longestDryDays).toBeNull();
  });
});

describe("21-day cycle sanity", () => {
  it("puts a heat exactly three weeks back on today's next-heat date", () => {
    const heat = new Date(on.getTime() - HEAT_CYCLE_DAYS * DAY);
    const cow = cowTimeline("Njeru", [event({ heatObservedAt: heat })], on);
    expect(cow.daysSinceHeat).toBe(HEAT_CYCLE_DAYS);
    expect(cow.daysToNextHeat).toBe(0);
    expect(cow.nextHeatExpected?.toISOString().slice(0, 10)).toBe(on.toISOString().slice(0, 10));
  });
});
