import { describe, it, expect } from "vitest";
import { cashFlow, type CashFlowInputs } from "./cash-flow.js";

// Mid-October, so the horizon spans Oct–Jan on a 90-day window.
const on = new Date("2026-10-13T09:00:00Z");
const DAY = 86400000;

function inputs(overrides: Partial<CashFlowInputs> = {}): CashFlowInputs {
  return { owed: [], planned: [], loans: [], trailingCosts: [], ...overrides };
}

const month = (out: ReturnType<typeof cashFlow>, label: string) =>
  out.buckets.find((b) => b.label.startsWith(label))!;

describe("cashFlow — what the farm is owed", () => {
  it("places money on the date the buyer promised", () => {
    const out = cashFlow(
      inputs({
        owed: [{ id: 1, amount: 45000, payBy: new Date("2026-11-20T00:00:00Z"), label: "Githunguri delivery" }],
      }),
      on
    );
    expect(month(out, "Nov").expectedIn).toBe(45000);
    expect(month(out, "Nov").lines[0].label).toBe("Githunguri delivery");
  });

  it("keeps overdue promises OUT of the months", () => {
    // A co-op three months late is the normal case on this farm, and budgeting on
    // money that has not arrived is how a school-fees deadline is missed.
    const out = cashFlow(
      inputs({
        owed: [
          { id: 1, amount: 30000, payBy: new Date("2026-08-01T00:00:00Z"), label: "Old delivery" },
          { id: 2, amount: 10000, payBy: new Date("2026-11-01T00:00:00Z"), label: "Recent" },
        ],
      }),
      on
    );
    expect(out.overdue.amount).toBe(30000);
    expect(out.overdue.deliveries).toBe(1);
    expect(out.overdue.oldest).toEqual(new Date("2026-08-01T00:00:00Z"));
    expect(out.totalIn).toBe(10000);
    expect(out.warnings[0]).toContain("already past the date you were promised");
  });

  it("projects nothing from a delivery with no promise date", () => {
    const out = cashFlow(inputs({ owed: [{ id: 1, amount: 9000, payBy: null, label: "No date" }] }), on);
    expect(out.totalIn).toBe(0);
    expect(out.overdue.amount).toBe(0);
  });
});

describe("cashFlow — the plan", () => {
  it("repeats a monthly plan item across the horizon", () => {
    const out = cashFlow(
      inputs({
        planned: [
          { id: 1, label: "School fees", direction: "outflow", amount: 20000, dueOn: new Date("2026-10-05T00:00:00Z"), recurring: "monthly", category: "family" },
        ],
      }),
      on
    );
    expect(out.buckets.map((b) => b.expectedOut)).toEqual([20000, 20000, 20000, 20000]);
    expect(out.totalOut).toBe(80000);
  });

  it("places a once-off item in its own month only", () => {
    const out = cashFlow(
      inputs({
        planned: [
          { id: 1, label: "Fertiliser", direction: "outflow", amount: 15000, dueOn: new Date("2026-12-01T00:00:00Z"), recurring: "once", category: "inputs" },
        ],
      }),
      on
    );
    expect(month(out, "Dec").expectedOut).toBe(15000);
    expect(month(out, "Nov").expectedOut).toBe(0);
  });

  it("reads a planned inflow as money in, not out", () => {
    const out = cashFlow(
      inputs({
        planned: [
          { id: 1, label: "Milk advance", direction: "inflow", amount: 5000, dueOn: new Date("2026-11-02T00:00:00Z"), recurring: "once", category: null },
        ],
      }),
      on
    );
    expect(month(out, "Nov").expectedIn).toBe(5000);
    expect(month(out, "Nov").expectedOut).toBe(0);
  });

  it("spreads a weekly item across the horizon", () => {
    const out = cashFlow(
      inputs({
        planned: [
          { id: 1, label: "Casual labour", direction: "outflow", amount: 1000, dueOn: new Date("2026-10-16T00:00:00Z"), recurring: "weekly", category: null },
        ],
      }),
      on
    );
    // 16, 23, 30 Oct then 6, 13 Nov — 13 Nov is the first to fall in November.
    expect(month(out, "Oct").expectedOut).toBe(3000);
    expect(month(out, "Nov").expectedOut).toBeGreaterThan(0);
  });

  it("ignores a plan item beyond the horizon instead of dragging it in", () => {
    const out = cashFlow(
      inputs({
        planned: [
          { id: 1, label: "Next year", direction: "outflow", amount: 99999, dueOn: new Date("2027-06-01T00:00:00Z"), recurring: "once", category: null },
        ],
      }),
      on
    );
    expect(out.totalOut).toBe(0);
  });
});

describe("cashFlow — loan instalments", () => {
  it("starts from the instalments already covered by what was repaid", () => {
    const out = cashFlow(
      inputs({
        loans: [
          {
            id: 1,
            lender: "Githunguri SACCO",
            instalmentAmount: 5000,
            firstInstalmentDue: new Date("2026-10-20T00:00:00Z"),
            instalmentCount: 12,
            amountPaid: 10000,
          },
        ],
      }),
      on
    );
    // Oct and Nov are already paid (two instalments), so the first projected one
    // is December.
    expect(month(out, "Oct").expectedOut).toBe(0);
    expect(month(out, "Nov").expectedOut).toBe(0);
    expect(month(out, "Dec").expectedOut).toBe(5000);
  });

  it("counts a partly-paid instalment as still owing", () => {
    const out = cashFlow(
      inputs({
        loans: [
          {
            id: 1,
            lender: "AFC",
            instalmentAmount: 5000,
            firstInstalmentDue: new Date("2026-11-05T00:00:00Z"),
            instalmentCount: 6,
            amountPaid: 4999,
          },
        ],
      }),
      on
    );
    // floor(4999/5000) = 0, so November is still due.
    expect(month(out, "Nov").expectedOut).toBe(5000);
  });

  it("skips a loan with no instalment plan recorded", () => {
    const out = cashFlow(
      inputs({
        loans: [{ id: 1, lender: "Chama", instalmentAmount: null, firstInstalmentDue: null, instalmentCount: null, amountPaid: 0 }],
      }),
      on
    );
    expect(out.totalOut).toBe(0);
  });

  it("stops at the last instalment", () => {
    const out = cashFlow(
      inputs({
        loans: [
          {
            id: 1,
            lender: "SACCO",
            instalmentAmount: 5000,
            firstInstalmentDue: new Date("2026-10-05T00:00:00Z"),
            instalmentCount: 1,
            amountPaid: 0,
          },
        ],
      }),
      on
    );
    expect(month(out, "Oct").expectedOut).toBe(5000);
    expect(month(out, "Nov").expectedOut).toBe(0);
  });
});

describe("cashFlow — the farm's own costs and the answer", () => {
  it("repeats the trailing average over every month", () => {
    const out = cashFlow(
      inputs({ trailingCosts: [{ label: "Feed", monthlyAverage: 12000, monthsAveraged: 3 }] }),
      on
    );
    expect(out.buckets.every((b) => b.expectedOut === 12000)).toBe(true);
  });

  it("names the first month projected short, worst news first", () => {
    const out = cashFlow(
      inputs({ trailingCosts: [{ label: "Feed", monthlyAverage: 30000, monthsAveraged: 3 }] }),
      on
    );
    expect(out.firstShortMonth).toBe("Oct 2026");
    expect(out.warnings[0]).toContain("projected to be KES 30,000 short");
    expect(out.net).toBe(-120000);
  });

  it("warns when an average comes from less than a full month", () => {
    const out = cashFlow(
      inputs({ trailingCosts: [{ label: "Vet drugs", monthlyAverage: 900, monthsAveraged: 0.5 }] }),
      on
    );
    expect(out.warnings.some((w) => w.includes("less than a full month"))).toBe(true);
  });

  it("carries the caveat that this is a forecast and not a balance", () => {
    const out = cashFlow(inputs(), on);
    expect(out.basis).toContain("not a bank balance");
    expect(out.firstShortMonth).toBeNull();
    expect(out.horizonDays).toBe(90);
  });

  it("covers the horizon in whole calendar months", () => {
    const out = cashFlow(inputs(), on);
    expect(out.buckets.map((b) => b.label)).toEqual(["Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027"]);
    // Exclusive end, so a payment on the 1st lands in exactly one month.
    expect(out.buckets[1].from.getTime() - out.buckets[0].to.getTime()).toBe(0);
  });

  it("honours a custom horizon", () => {
    const out = cashFlow(inputs(), on, 30);
    expect(out.buckets).toHaveLength(2);
  });

  it("adds a stated regular income to every month", () => {
    const out = cashFlow(inputs({ regularMonthlyIncome: 8000 }), on);
    expect(out.totalIn).toBe(32000);
    expect(out.firstShortMonth).toBeNull();
  });
});
