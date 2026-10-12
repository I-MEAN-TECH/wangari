import { describe, it, expect } from "vitest";
import {
  cowDays,
  cowYield,
  herdSummary,
  coverage,
  normaliseSession,
  SESSIONS,
  type MilkingRow,
  type HerdAnimal,
} from "./per-cow-yield.js";

/** Rows shaped exactly as the Prisma rows a route passes in. */
const row = (over: Partial<MilkingRow> = {}): MilkingRow => ({
  animalId: 1,
  date: new Date("2026-10-01"),
  session: "full_day",
  milkLitres: 12,
  ...over,
});

const cow = (id: number, label: string, flockId: number | null = 7): HerdAnimal => ({ id, label, flockId });

describe("cowDays — milking rows collapsed into days", () => {
  it("folds a morning and an evening row into one day", () => {
    const days = cowDays([
      row({ date: new Date("2026-10-01"), session: "morning", milkLitres: 8 }),
      row({ date: new Date("2026-10-01"), session: "evening", milkLitres: 6 }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].litres).toBe(14);
    expect(days[0].sessions).toBe(2);
    expect(days[0].isWholeDay).toBe(false);
  });

  it("keeps a full_day row as a whole day and marks it as such", () => {
    const days = cowDays([row({ session: "full_day", milkLitres: 13.5 })]);
    expect(days[0].isWholeDay).toBe(true);
    expect(days[0].sessions).toBe(1);
  });

  it("returns days oldest first regardless of row order", () => {
    const days = cowDays([
      row({ date: new Date("2026-10-03") }),
      row({ date: new Date("2026-10-01") }),
      row({ date: new Date("2026-10-02") }),
    ]);
    expect(days.map((d) => d.date.toISOString().slice(0, 10))).toEqual([
      "2026-10-01", "2026-10-02", "2026-10-03",
    ]);
  });

  it("drops rows with an unusable date or a non-numeric litre figure rather than counting them as zero", () => {
    const days = cowDays([
      row({ date: new Date("nonsense") }),
      row({ milkLitres: NaN }),
      row({ milkLitres: 10 }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].litres).toBe(10);
  });
});

describe("cowYield — one cow's window", () => {
  const rows = [
    row({ animalId: 1, date: new Date("2026-10-01"), milkLitres: 10 }),
    row({ animalId: 1, date: new Date("2026-10-02"), milkLitres: 14 }),
    row({ animalId: 1, date: new Date("2026-10-03"), milkLitres: 12 }),
    row({ animalId: 2, date: new Date("2026-10-01"), milkLitres: 99 }),
  ];

  it("totals only this animal's litres and ignores the other cow's", () => {
    const y = cowYield(cow(1, "Nyota"), rows);
    expect(y.totalLitres).toBe(36);
    expect(y.daysRecorded).toBe(3);
  });

  it("averages over recorded days only", () => {
    expect(cowYield(cow(1, "Nyota"), rows).avgLitresPerRecordedDay).toBe(12);
  });

  it("averages over the whole window when told the window length, counting silent days as zero", () => {
    // 36 litres over a 30-day window is 1.2/day — the number that exposes a
    // cow milked only on her best three days, which the recorded-day mean hides.
    expect(cowYield(cow(1, "Nyota"), rows, 30).avgLitresPerWindowDay).toBe(1.2);
  });

  it("names the best and worst recorded days", () => {
    const y = cowYield(cow(1, "Nyota"), rows);
    expect(y.best?.litres).toBe(14);
    expect(y.worst?.litres).toBe(10);
    expect(y.lastRecordedOn?.toISOString().slice(0, 10)).toBe("2026-10-03");
  });

  it("returns nulls, never zeros, for a cow with no rows at all", () => {
    const y = cowYield(cow(3, "Zawadi"), rows);
    expect(y.daysRecorded).toBe(0);
    expect(y.totalLitres).toBe(0);
    expect(y.avgLitresPerRecordedDay).toBeNull();
    expect(y.avgLitresPerWindowDay).toBeNull();
    expect(y.best).toBeNull();
    expect(y.lastRecordedOn).toBeNull();
  });

  it("carries the flock the cow was recorded in", () => {
    expect(cowYield(cow(1, "Nyota", 12), rows).flockId).toBe(12);
    expect(cowYield(cow(1, "Nyota", null), rows).flockId).toBeNull();
  });
});

describe("herdSummary — the cows side by side", () => {
  const herd = [cow(1, "Nyota"), cow(2, "Zawadi"), cow(3, "Malaika")];
  const rows = [
    row({ animalId: 1, date: new Date("2026-10-01"), milkLitres: 10 }),
    row({ animalId: 1, date: new Date("2026-10-02"), milkLitres: 10 }),
    row({ animalId: 2, date: new Date("2026-10-01"), milkLitres: 18 }),
    row({ animalId: 2, date: new Date("2026-10-02"), milkLitres: 20 }),
  ];

  it("lists the best producer first", () => {
    const s = herdSummary(herd, rows);
    expect(s.cows[0].label).toBe("Zawadi");
    expect(s.topCow?.label).toBe("Zawadi");
  });

  it("keeps an unrecorded cow in the list instead of dropping her", () => {
    const s = herdSummary(herd, rows);
    expect(s.cows).toHaveLength(3);
    expect(s.cows.map((c) => c.label)).toContain("Malaika");
    expect(s.cows.find((c) => c.label === "Malaika")?.totalLitres).toBe(0);
  });

  it("totals the herd and averages across recorded cows only", () => {
    const s = herdSummary(herd, rows);
    expect(s.herdTotalLitres).toBe(58);
    expect(s.herdAvgPerRecordedDay).toBe(14.5);
  });

  it("reports no top cow and no average when nobody was recorded", () => {
    const s = herdSummary(herd, []);
    expect(s.topCow).toBeNull();
    expect(s.herdAvgPerRecordedDay).toBeNull();
    expect(s.herdTotalLitres).toBe(0);
  });
});

describe("coverage — the gap between the flock total and the per-cow rows", () => {
  const herd = [cow(1, "Nyota"), cow(2, "Zawadi"), cow(3, "Malaika")];

  it("reports the unattributed litres rather than dividing them into a fake per-cow figure", () => {
    const rows = [row({ animalId: 1, milkLitres: 12 }), row({ animalId: 2, milkLitres: 10 })];
    const c = coverage(herd, rows, 31);
    expect(c.attributedLitres).toBe(22);
    expect(c.flockTotalLitres).toBe(31);
    expect(c.unattributedLitres).toBe(9);
    expect(c.coveragePct).toBe(70.97);
    expect(c.cowsRecorded).toBe(2);
    expect(c.cowsInHerd).toBe(3);
  });

  it("names the cows with no record — the list of who still needs milking recorded", () => {
    const rows = [row({ animalId: 1, milkLitres: 12 })];
    expect(coverage(herd, rows, 31).cowsNotRecorded).toEqual([2, 3]);
  });

  it("flags when the per-cow rows add up to more than the flock total — a data error, not rounding", () => {
    const rows = [row({ animalId: 1, milkLitres: 30 }), row({ animalId: 2, milkLitres: 10 })];
    const c = coverage(herd, rows, 31);
    expect(c.exceedsFlockTotal).toBe(true);
    expect(c.unattributedLitres).toBe(-9);
  });

  it("says it does not know the coverage when no flock total was logged", () => {
    const c = coverage(herd, [row({ animalId: 1, milkLitres: 12 })], 0);
    expect(c.coveragePct).toBeNull();
    expect(c.exceedsFlockTotal).toBe(true);
  });

  it("reaches 100% when the cows account for the whole flock total", () => {
    const rows = [
      row({ animalId: 1, milkLitres: 12 }),
      row({ animalId: 2, milkLitres: 9 }),
      row({ animalId: 3, milkLitres: 10 }),
    ];
    const c = coverage(herd, rows, 31);
    expect(c.coveragePct).toBe(100);
    expect(c.unattributedLitres).toBe(0);
    expect(c.cowsNotRecorded).toEqual([]);
  });

  it("is a pure read — attributing litres never changes the flock total it was given", () => {
    const rows = [row({ animalId: 1, milkLitres: 12 })];
    coverage(herd, rows, 31);
    expect(rows[0].milkLitres).toBe(12);
  });
});

describe("normaliseSession", () => {
  it("accepts the three real milking sessions", () => {
    for (const s of SESSIONS) expect(normaliseSession(s)).toBe(s);
  });

  it("accepts a session in any case, with stray whitespace", () => {
    expect(normaliseSession("  MORNING ")).toBe("morning");
  });

  it("falls back to full_day rather than rejecting a row over a label", () => {
    expect(normaliseSession("afternoon")).toBe("full_day");
    expect(normaliseSession(undefined)).toBe("full_day");
    expect(normaliseSession(7)).toBe("full_day");
  });
});
