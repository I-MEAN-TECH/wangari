/**
 * Chama / table-banking position per member (gap report §3 C7).
 *
 * A chama is not a co-operative. Members contribute on a fixed day, borrow from
 * the pot, and repay — often with interest — and the question a member actually
 * asks is not "what is the group worth" but *"what have I put in and what do I
 * still owe"*. That is the whole document this file produces.
 *
 * Two deliberate limits, both stated rather than papered over:
 *
 *  1. **We do not model interest.** A repayment row records what was handed
 *     over. Splitting it into principal and interest would need the group's rule,
 *     which the group owns and which changes between rounds. The member's
 *     position is therefore contributions, withdrawals, loans taken and
 *     repayments made — the four things written in the book.
 *  2. **A `loan_out` is a member receiving money, not the group lending.** The
 *     direction is per member, which is what makes one flat table able to answer
 *     both "how much is in the pot" and "what does Grace owe".
 *
 * Pure: the route fetches rows, this decides what the book means.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export type SavingsEntryType = "contribution" | "withdrawal" | "loan_out" | "repayment";

export interface SavingsEntryRecord {
  id: number;
  groupName: string;
  memberName: string;
  entryType: string;
  amount: number;
  occurredOn: Date;
  counterparty: string | null;
}

export const ENTRY_TYPES: SavingsEntryType[] = ["contribution", "withdrawal", "loan_out", "repayment"];

export interface MemberStatement {
  groupName: string;
  memberName: string;
  /** Money paid in over time. */
  contributions: number;
  /** Money taken out of their own savings. */
  withdrawals: number;
  /** Loans the member received from the pot. */
  loanedOut: number;
  /** Repayments the member has made (whatever the group counts them as). */
  repaid: number;
  /**
   * Their own savings: what they put in, less what they took back out. Loans do
   * NOT reduce this — a loan is a debt against the pot, not a withdrawal of
   * their own money, and netting the two is how a member is told they have
   * nothing saved while owing everything.
   */
  savingsBalance: number;
  /** Still owed on loans taken. Never below zero, even with an overpayment. */
  outstandingLoan: number;
  entries: number;
  lastEntryOn: Date | null;
  /** True when the pot has no record of this member ever borrowing. */
  neverBorrowed: boolean;
}

function statementFor(groupName: string, memberName: string, rows: SavingsEntryRecord[]): MemberStatement {
  let contributions = 0;
  let withdrawals = 0;
  let loanedOut = 0;
  let repaid = 0;
  let lastEntryOn: Date | null = null;

  for (const e of rows) {
    const amount = Number(e.amount) || 0;
    switch (e.entryType) {
      case "contribution":
        contributions += amount;
        break;
      case "withdrawal":
        withdrawals += amount;
        break;
      case "loan_out":
        loanedOut += amount;
        break;
      case "repayment":
        repaid += amount;
        break;
      // An unrecognised type is ignored rather than guessed into a bucket. A
      // wrong bucket is a wrong balance, which is worse than a smaller one.
      default:
        break;
    }
    if (!lastEntryOn || e.occurredOn.getTime() > lastEntryOn.getTime()) lastEntryOn = e.occurredOn;
  }

  return {
    groupName,
    memberName,
    contributions: r2(contributions),
    withdrawals: r2(withdrawals),
    loanedOut: r2(loanedOut),
    repaid: r2(repaid),
    savingsBalance: r2(contributions - withdrawals),
    // Floored at zero: a repayment larger than the loan is a real thing (a final
    // round-up), and a negative debt would read as the pot owing the member.
    outstandingLoan: r2(Math.max(0, loanedOut - repaid)),
    entries: rows.length,
    lastEntryOn,
    neverBorrowed: loanedOut === 0,
  };
}

/** Every member of one group, the member with the largest balance first. */
export function groupMembers(groupName: string, rows: SavingsEntryRecord[]): MemberStatement[] {
  const byMember = new Map<string, SavingsEntryRecord[]>();
  for (const e of rows) {
    if (e.groupName !== groupName) continue;
    if (!byMember.has(e.memberName)) byMember.set(e.memberName, []);
    byMember.get(e.memberName)!.push(e);
  }
  return [...byMember.entries()]
    .map(([member, memberRows]) => statementFor(groupName, member, memberRows))
    .sort((a, b) => b.savingsBalance - a.savingsBalance);
}

export interface GroupLedger {
  groupName: string;
  members: MemberStatement[];
  /** What the book says the pot holds: in − out − lent + repaid. */
  pot: number;
  totalSavings: number;
  /** Everything members still owe the pot. */
  totalOutstandingLoans: number;
  contributions: number;
  withdrawals: number;
  loanedOut: number;
  repaid: number;
  entries: number;
  /** The distinct group names in the farm's book, for a picker. */
  groups: string[];
}

/**
 * The group's own book.
 *
 * `pot` is the arithmetic of the entries and nothing else. A chama that has also
 * put money in a bank account or bought a water tank has assets this file cannot
 * see, so the panel labels this the book position rather than "the money you
 * have" — overstating a group's cash is how a member arrives expecting a payout
 * that is not there.
 */
export function groupLedger(rows: SavingsEntryRecord[]): GroupLedger[] {
  const groups = [...new Set(rows.map((r) => r.groupName))];
  return groups.map((groupName) => {
    const own = rows.filter((r) => r.groupName === groupName);
    const sum = (type: string) =>
      r2(own.filter((r) => r.entryType === type).reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const contributions = sum("contribution");
    const withdrawals = sum("withdrawal");
    const loanedOut = sum("loan_out");
    const repaid = sum("repayment");
    const members = groupMembers(groupName, own);
    return {
      groupName,
      members,
      pot: r2(contributions - withdrawals - loanedOut + repaid),
      totalSavings: r2(members.reduce((s, m) => s + m.savingsBalance, 0)),
      totalOutstandingLoans: r2(members.reduce((s, m) => s + m.outstandingLoan, 0)),
      contributions,
      withdrawals,
      loanedOut,
      repaid,
      entries: own.length,
      groups,
    };
  });
}

/** One member's statement across the whole book, for a personal page. */
export function memberStatement(memberName: string, rows: SavingsEntryRecord[]): MemberStatement[] {
  const groups = [...new Set(rows.filter((r) => r.memberName === memberName).map((r) => r.groupName))];
  return groups.map((g) => statementFor(g, memberName, rows.filter((r) => r.groupName === g && r.memberName === memberName)));
}
