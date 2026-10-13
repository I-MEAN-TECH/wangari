import { describe, it, expect } from "vitest";
import { groupMembers, groupLedger, memberStatement, type SavingsEntryRecord } from "./savings-ledger.js";

function entry(overrides: Partial<SavingsEntryRecord> = {}): SavingsEntryRecord {
  return {
    id: 1,
    groupName: "Umoja Chama",
    memberName: "Grace",
    entryType: "contribution",
    amount: 2000,
    occurredOn: new Date("2026-10-05"),
    counterparty: null,
    ...overrides,
  };
}

describe("groupMembers", () => {
  it("keeps a member's savings apart from their loan", () => {
    // Netting the two is how a member is told they have nothing saved while
    // owing everything.
    const [grace] = groupMembers("Umoja Chama", [
      entry({ id: 1, entryType: "contribution", amount: 2000 }),
      entry({ id: 2, entryType: "contribution", amount: 3000 }),
      entry({ id: 3, entryType: "withdrawal", amount: 1000 }),
      entry({ id: 4, entryType: "loan_out", amount: 10000 }),
      entry({ id: 5, entryType: "repayment", amount: 4000 }),
    ]);
    expect(grace.contributions).toBe(5000);
    expect(grace.withdrawals).toBe(1000);
    expect(grace.savingsBalance).toBe(4000);
    expect(grace.outstandingLoan).toBe(6000);
  });

  it("floors the outstanding loan at zero rather than reporting a negative debt", () => {
    const [grace] = groupMembers("Umoja Chama", [
      entry({ id: 1, entryType: "loan_out", amount: 5000 }),
      entry({ id: 2, entryType: "repayment", amount: 5500 }),
    ]);
    expect(grace.outstandingLoan).toBe(0);
  });

  it("marks a member who has never borrowed", () => {
    const [grace] = groupMembers("Umoja Chama", [entry()]);
    expect(grace.neverBorrowed).toBe(true);
    expect(grace.lastEntryOn).toEqual(new Date("2026-10-05"));
  });

  it("ignores an unrecognised entry type instead of guessing a bucket", () => {
    // A wrong bucket is a wrong balance, which is worse than a smaller one.
    const [grace] = groupMembers("Umoja Chama", [
      entry({ id: 1, entryType: "contribution", amount: 2000 }),
      entry({ id: 2, entryType: "mystery", amount: 9999 }),
    ]);
    expect(grace.savingsBalance).toBe(2000);
    expect(grace.outstandingLoan).toBe(0);
    expect(grace.entries).toBe(2);
  });

  it("only counts rows from the group asked about", () => {
    const out = groupMembers("Umoja Chama", [
      entry({ id: 1, groupName: "Umoja Chama" }),
      entry({ id: 2, groupName: "Other Chama", amount: 50000 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].contributions).toBe(2000);
  });

  it("puts the largest saver first", () => {
    const out = groupMembers("Umoja Chama", [
      entry({ id: 1, memberName: "Grace", amount: 2000 }),
      entry({ id: 2, memberName: "Peter", amount: 9000 }),
    ]);
    expect(out[0].memberName).toBe("Peter");
  });
});

describe("groupLedger", () => {
  it("derives the pot from what came in, went out, was lent and was repaid", () => {
    const [ledger] = groupLedger([
      entry({ id: 1, memberName: "Grace", entryType: "contribution", amount: 5000 }),
      entry({ id: 2, memberName: "Peter", entryType: "contribution", amount: 5000 }),
      entry({ id: 3, memberName: "Grace", entryType: "loan_out", amount: 6000 }),
      entry({ id: 4, memberName: "Grace", entryType: "repayment", amount: 2000 }),
    ]);
    // 10000 in, 6000 out on loan, 2000 back = 6000 in the box.
    expect(ledger.pot).toBe(6000);
    expect(ledger.totalSavings).toBe(10000);
    expect(ledger.totalOutstandingLoans).toBe(4000);
    expect(ledger.members).toHaveLength(2);
  });

  it("keeps one group's book separate from another's", () => {
    const ledgers = groupLedger([
      entry({ id: 1, groupName: "Umoja Chama", amount: 1000 }),
      entry({ id: 2, groupName: "Mwangaza", amount: 7000 }),
    ]);
    expect(ledgers).toHaveLength(2);
    expect(ledgers.find((l) => l.groupName === "Mwangaza")!.pot).toBe(7000);
    expect(ledgers.find((l) => l.groupName === "Umoja Chama")!.pot).toBe(1000);
  });
});

describe("memberStatement", () => {
  it("gives one member their position in every group they belong to", () => {
    const out = memberStatement("Grace", [
      entry({ id: 1, groupName: "Umoja Chama", amount: 2000 }),
      entry({ id: 2, groupName: "Mwangaza", amount: 3000 }),
      entry({ id: 3, groupName: "Umoja Chama", memberName: "Peter", amount: 9000 }),
    ]);
    expect(out.map((s) => s.groupName).sort()).toEqual(["Mwangaza", "Umoja Chama"]);
    expect(out.find((s) => s.groupName === "Umoja Chama")!.contributions).toBe(2000);
  });
});
