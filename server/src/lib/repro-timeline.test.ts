import { describe, it, expect } from "vitest";
import { cowTimeline, allCows, herdRepro, type BreedingEvent } from "./repro-timeline.js";

const DAY = 86400000;
/** "today" for the tests — the 12th, matching the report's scan date. */
const ON = new Date("2026-10-12");

const ev = (over: Partial<BreedingEvent>): BreedingEvent => ({
  damName: "Njeri",
  matingDate: new Date("2026-01-10"),
  expectedBirth: null,
  actualBirth: null,
  offspringCount: null,
  offspringAlive: null,
  method: "ai",
  status: "pending",
  ...over,
});

describe("cowTimeline — days in milk from the birth the farmer recorded", () => {
  it("counts days since the last actual birth", () => {
    const t = cowTimeline("Njeri", [ev({ actualBirth: new Date("2026-09-01"), status: "born", matingDate: new Date("2025-11-20") })], ON);
    expect(t.lastCalving!.getTime()).toBe(new Date("2026-09-01").getTime());
    // 1 Sep → 12 Oct = 41 days
    expect(t.daysInMilk).toBe(41);
  });

  it("no recorded birth → daysInMilk stays null, never zero-faked", () => {
    const t = cowTimeline("Njeri", [ev({ status: "confirmed" })], ON);
    expect(t.lastCalving).toBeNull();
    expect(t.daysInMilk).toBeNull();
  });

  it("an unrecorded dam name produces nothing at all", () => {
    const t = cowTimeline("随便", [ev({ damName: "Vache" })], ON);
    expect(t.calvings.length).toBe(0);
    expect(t.daysInMilk).toBeNull();
  });
});

describe("calving interval — the gap between recorded births", () => {
  it("one pair one interval; two pairs two intervals", () => {
    const t = cowTimeline("Njeri", [
      ev({ actualBirth: new Date("2024-06-01"), matingDate: new Date("2024-03-01") }),
      ev({ actualBirth: new Date("2025-07-01"), matingDate: new Date("2025-04-01") }),
      ev({ actualBirth: new Date("2026-08-01"), matingDate: new Date("2026-05-01") }),
    ], ON);
    expect(t.calvings.length).toBe(3);
    // 1 Jun 24 → 1 Jul 25 = 395 days; 1 Jul 25 → 1 Aug 26 = 396 days
    expect(t.calvingIntervalsDays).toEqual([395, 396]);
  });

  it("a single calving has no interval, and the lib says so with an empty list", () => {
    const t = cowTimeline("Njeri", [ev({ actualBirth: new Date("2026-01-15"), matingDate: new Date("2025-10-05") })], ON);
    expect(t.calvingIntervalsDays).toEqual([]);
  });
});

describe("services per conception — attempts before the confirmed one", () => {
  it("two failed/pending then one confirmed = 3", () => {
    const lastCalving = new Date("2026-01-15");
    const t = cowTimeline("Njeri", [
      ev({ actualBirth: lastCalving, status: "born", matingDate: new Date("2025-10-05") }),
      ev({ matingDate: new Date("2026-03-01"), status: "failed" }),
      ev({ matingDate: new Date("2026-04-01"), status: "pending" }),
      ev({ matingDate: new Date("2026-05-10"), status: "confirmed" }),
    ], ON);
    expect(t.servicesPerConception).toBe(3);
  });

  it("nothing recorded since the last calving → null, not zero", () => {
    const t = cowTimeline("Njeri", [ev({ actualBirth: new Date("2026-01-15"), status: "born", matingDate: new Date("2025-10-05") })], ON);
    expect(t.servicesPerConception).toBeNull();
  });

  it("no calving on record → the figure is null too, honestly uncomputable", () => {
    const t = cowTimeline("Njeri", [ev({ matingDate: new Date("2026-05-10"), status: "confirmed" })], ON);
    expect(t.servicesPerConception).toBeNull();
  });
});

describe("calvingSoon — 7 days of expected birth, matching the cron nudge", () => {
  it("expected birth 3 days out is soon", () => {
    const exp = new Date(ON.getTime() + 3 * DAY);
    const t = cowTimeline("Njeri", [ev({ status: "pending", expectedBirth: exp })], ON);
    expect(t.calvingSoon).toBe(true);
    expect(t.pendingServices.length).toBe(1);
  });

  it("expected birth 20 days out is not", () => {
    const exp = new Date(ON.getTime() + 20 * DAY);
    const t = cowTimeline("Njeri", [ev({ status: "pending", expectedBirth: exp })], ON);
    expect(t.calvingSoon).toBe(false);
  });

  it("a birth that never got an expected date is neither soon nor pending-in-vain", () => {
    const t = cowTimeline("Njeri", [ev({ status: "confirmed" })], ON);
    expect(t.calvingSoon).toBe(false);
    expect(t.pendingServices.length).toBe(0);
  });
});

describe("herdRepro — the farm-level lens, with no invented benchmark", () => {
  const events: BreedingEvent[] = [
    ev({ damName: "Njeri", actualBirth: new Date("2024-06-01"), status: "born", matingDate: new Date("2024-03-01") }),
    ev({ damName: "Njeri", actualBirth: new Date("2025-07-01"), status: "born", matingDate: new Date("2025-04-01") }),
    ev({ damName: "Njeri", matingDate: new Date("2026-09-01"), status: "pending" }),
    ev({ damName: "Wanjiru", actualBirth: new Date("2026-02-01"), status: "born", matingDate: new Date("2025-11-01") }),
    ev({ damName: "Wanjiru", matingDate: new Date("2026-06-01"), status: "confirmed" }),
  ];

  it("counts cows and who has a calving record", () => {
    const h = herdRepro(events, ON);
    expect(h.cowCount).toBe(2);
    expect(h.cowsWithCalvingRecord).toBe(2);
  });

  it("mean interval over the one recorded pair", () => {
    const h = herdRepro(events, ON);
    expect(h.meanCalvingIntervalDays).toBe(395);
  });

  it("services per conception averages across cows that have it", () => {
    const h = herdRepro(events, ON);
    // Wanjiru: 1 service (06-01, confirmed) after her 02-01 calving
    // Njeri: none recorded since 2025-07-01 → not counted
    expect(h.meanServicesPerConception).toBe(1);
  });

  it("the pending-service list names the cow, in the farmer's own naming", () => {
    const h = herdRepro(events, ON);
    expect(h.cowsPendingService).toEqual(["Njeri"]);
  });
});
