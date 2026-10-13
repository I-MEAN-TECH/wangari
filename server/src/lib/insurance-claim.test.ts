import { describe, it, expect } from "vitest";
import { claimPosition, claimSummary, type ClaimRecord } from "./insurance-claim.js";

const on = new Date("2026-10-13T09:00:00Z");

function claim(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    id: 1,
    policyId: 3,
    claimRef: "CLM-88",
    incidentOn: new Date("2026-08-01T00:00:00Z"),
    eventType: "drought",
    measuredLossUnits: 6,
    expectedAmount: 80000,
    receivedAmount: 25000,
    receivedOn: new Date("2026-09-20T00:00:00Z"),
    status: "paid",
    notes: null,
    ...overrides,
  };
}

describe("claimPosition", () => {
  it("shows what arrived against what was expected without equating them", () => {
    const p = claimPosition(claim(), on);
    expect(p.expected).toBe(80000);
    expect(p.received).toBe(25000);
    expect(p.shortfall).toBe(55000);
    expect(p.shortfallPct).toBe(68.8);
    // The sentence that keeps the trust: two numbers and an explicit refusal to
    // treat the payout as the loss.
    expect(p.statement).toContain("Your measured loss is not the same thing as the payout");
  });

  it("reports days from the incident to the money arriving", () => {
    const p = claimPosition(claim(), on);
    expect(p.settledDays).toBe(50);
    expect(p.outcome).toBe("paid");
  });

  it("does not treat a status change with no amount as a payment", () => {
    const p = claimPosition(claim({ status: "paid", receivedAmount: null, receivedOn: null }), on);
    expect(p.received).toBeNull();
    expect(p.settledDays).toBeNull();
    expect(p.statement).toContain("no amount was recorded");
  });

  it("never prices the measured loss", () => {
    const p = claimPosition(
      claim({ measuredLossUnits: null, expectedAmount: null, receivedAmount: null, status: "submitted" }),
      on
    );
    // A valued loss needs a market price we would have to choose for the farmer,
    // and any figure we chose would become the number they quote to an insurer.
    expect(p.statement).not.toContain("KES");
    expect(p.statement).toContain("loss not counted");
  });

  it("counts how long an unsettled claim has been open", () => {
    const p = claimPosition(claim({ status: "submitted", receivedAmount: null, receivedOn: null }), on);
    expect(p.openDays).toBe(73);
    expect(p.outcome).toBe("awaiting");
  });

  it("reads each status into one of four outcomes", () => {
    expect(claimPosition(claim({ status: "approved" }), on).outcome).toBe("approved");
    expect(claimPosition(claim({ status: "rejected" }), on).outcome).toBe("rejected");
    expect(claimPosition(claim({ status: "anything else" }), on).outcome).toBe("awaiting");
  });
});

describe("claimSummary", () => {
  it("counts expected across all claims and received only from paid ones", () => {
    const s = claimSummary([
      claim({ id: 1, expectedAmount: 80000, receivedAmount: 25000, status: "paid" }),
      claim({ id: 2, expectedAmount: 40000, receivedAmount: 40000, status: "approved", receivedOn: null }),
    ], on);
    expect(s.expected).toBe(120000);
    // The approved claim has an amount recorded but no money yet: counting it as
    // received would tell a farmer they had been paid when they had not.
    expect(s.received).toBe(25000);
    expect(s.paid).toBe(1);
    expect(s.approved).toBe(1);
    expect(s.shortfall).toBe(55000);
  });

  it("reports the longest a claim has been open", () => {
    const s = claimSummary([
      claim({ id: 1, status: "submitted", receivedAmount: null, receivedOn: null, incidentOn: new Date("2026-09-01") }),
      claim({ id: 2, status: "submitted", receivedAmount: null, receivedOn: null, incidentOn: new Date("2026-07-01") }),
    ], on);
    expect(s.oldestOpenDays).toBe(104);
  });

  it("carries the anti-promise basis line with the totals", () => {
    expect(claimSummary([], on).basis).toContain("A payout can be more or less");
    expect(claimSummary([], on).oldestOpenDays).toBeNull();
  });
});
