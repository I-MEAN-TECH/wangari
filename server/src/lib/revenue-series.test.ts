import { describe, it, expect } from "vitest";
import { buildRevenueSeries } from "./revenue-series.js";

describe("buildRevenueSeries", () => {
  it("returns an empty series for no transactions", () => {
    expect(buildRevenueSeries([])).toEqual([]);
  });

  it("buckets income and expenses by UTC calendar month and sorts ascending", () => {
    const rows = [
      { date: new Date("2026-03-15T00:00:00Z"), type: "income", amount: 5000 },
      { date: new Date("2026-03-20T00:00:00Z"), type: "expense", amount: 1200 },
      { date: new Date("2026-01-05T00:00:00Z"), type: "expense", amount: 800 },
      { date: new Date("2026-03-31T00:00:00Z"), type: "income", amount: 700.4 },
    ];
    expect(buildRevenueSeries(rows)).toEqual([
      { key: "2026-01", income: 0, expenses: 800 },
      { key: "2026-03", income: 5700, expenses: 1200 },
    ]);
  });

  it("rolls the year over: Dec 31 and Jan 1 are different keys", () => {
    const rows = [
      { date: new Date("2025-12-31T00:00:00Z"), type: "expense", amount: 100 },
      { date: new Date("2026-01-01T00:00:00Z"), type: "income", amount: 250 },
    ];
    expect(buildRevenueSeries(rows)).toEqual([
      { key: "2025-12", income: 0, expenses: 100 },
      { key: "2026-01", income: 250, expenses: 0 },
    ]);
  });

  it("cuts months on the UTC date, not the server's local timezone", () => {
    // The 1st at UTC midnight is the farm's 1st; a local read west of UTC
    // would bucket it into the previous month.
    const rows = [{ date: new Date("2026-05-01T00:00:00Z"), type: "income", amount: 40 }];
    expect(buildRevenueSeries(rows)).toEqual([{ key: "2026-05", income: 40, expenses: 0 }]);
  });

  it("ignores unknown types, invalid dates and non-numeric amounts", () => {
    const rows = [
      { date: new Date("2026-02-10T00:00:00Z"), type: "transfer", amount: 999 },
      { date: new Date("not-a-date"), type: "income", amount: 10 },
      { date: new Date("2026-02-11T00:00:00Z"), type: "income", amount: "oops" },
      { date: new Date("2026-02-12T00:00:00Z"), type: "income", amount: 60 },
    ];
    expect(buildRevenueSeries(rows)).toEqual([{ key: "2026-02", income: 60, expenses: 0 }]);
  });
});
