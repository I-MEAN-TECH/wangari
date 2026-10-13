/**
 * What the insurer promised and what the insurer paid (gap report §3 C5).
 *
 * Index insurance pays on a TRIGGER — rainfall, an area yield — not on what
 * happened on this particular farm. Those two things are routinely different in
 * both directions, and the gap between them is where trust dies: a farmer told
 * "you are covered" who receives a third of the loss they counted themselves
 * stops believing any of the rest of it.
 *
 * So the rule here is absolute: **the measured loss and the payout are never
 * converted into one another.** No "your loss was worth KES 80,000 so expect
 * KES 80,000", no payout estimate, no implied ratio. The farmer's own count sits
 * beside the money and the sentence we print says which is which.
 *
 * That is also why this file refuses to price a loss at all: valuing 6 dead cows
 * requires a market price we would have to choose for the farmer, and any figure
 * we chose would become the number they quote to an insurer who never agreed to
 * it.
 */

const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ClaimRecord {
  id: number;
  policyId: number | null;
  insurer?: string | null;
  policyNumber?: string | null;
  claimRef: string | null;
  incidentOn: Date;
  /** drought | flood | pest | disease | fire | price | other */
  eventType: string;
  /** The farmer's own count of what was lost: head, kg, trees. */
  measuredLossUnits: number | null;
  expectedAmount: number | null;
  receivedAmount: number | null;
  receivedOn: Date | null;
  status: string;
  notes: string | null;
}

export type ClaimOutcome = "awaiting" | "approved" | "paid" | "rejected";

function outcomeOf(status: string): ClaimOutcome {
  if (status === "paid") return "paid";
  if (status === "rejected") return "rejected";
  if (status === "approved") return "approved";
  return "awaiting";
}

export interface ClaimPosition {
  record: ClaimRecord;
  outcome: ClaimOutcome;
  /** What the farmer was told to expect, in KES. */
  expected: number | null;
  /** What actually arrived, in KES. */
  received: number | null;
  /** expected − received, only once something has been received. */
  shortfall: number | null;
  shortfallPct: number | null;
  /** Days from the incident to the money arriving. Null until it does. */
  settledDays: number | null;
  /** Days the claim has been open, for a claim that is not settled. */
  openDays: number;
  /** One sentence, plain, never asserting that a payout equals a loss. */
  statement: string;
}

const money = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

export function claimPosition(c: ClaimRecord, on: Date = new Date()): ClaimPosition {
  const expected = c.expectedAmount != null ? r2(c.expectedAmount) : null;
  const received = c.receivedAmount != null ? r2(c.receivedAmount) : null;
  const shortfall = expected != null && received != null ? r2(expected - received) : null;

  return {
    record: c,
    outcome: outcomeOf(c.status),
    expected,
    received,
    shortfall,
    shortfallPct: shortfall != null && expected ? Math.round((shortfall / expected) * 1000) / 10 : null,
    settledDays: c.receivedOn ? Math.max(0, Math.round((c.receivedOn.getTime() - c.incidentOn.getTime()) / DAY)) : null,
    openDays: Math.max(0, Math.round((on.getTime() - c.incidentOn.getTime()) / DAY)),
    statement: describe(c, expected, received, shortfall),
  };
}

function describe(
  c: ClaimRecord,
  expected: number | null,
  received: number | null,
  shortfall: number | null
): string {
  const loss = c.measuredLossUnits != null ? `${c.measuredLossUnits} ${c.eventType === "drought" ? "units" : "unit(s)"} lost as you counted them` : "loss not counted";
  const head = `${c.eventType} on ${c.incidentOn.toISOString().slice(0, 10)} — ${loss}`;

  switch (outcomeOf(c.status)) {
    case "rejected":
      return `${head}. The claim was rejected.`;
    case "paid":
      if (received == null) return `${head}. Marked paid, but no amount was recorded.`;
      // The sentence that matters: two numbers, side by side, no inference.
      return shortfall != null && shortfall > 1
        ? `${head}. ${money(received)} received against ${money(expected as number)} expected — a difference of ${money(shortfall)}. Your measured loss is not the same thing as the payout.`
        : `${head}. ${money(received)} received.`;
    case "approved":
      return `${head}. Approved${expected != null ? ` for ${money(expected)}` : ""} — not yet paid.`;
    default:
      return `${head}. Submitted — no decision recorded yet.`;
  }
}

export interface ClaimSummary {
  claims: number;
  /** Total the farmer was told to expect across all claims. */
  expected: number;
  /** Total actually received. */
  received: number;
  /** Across claims where both figures exist. */
  shortfall: number;
  shortfallPct: number | null;
  paid: number;
  awaiting: number;
  approved: number;
  rejected: number;
  /** The longest a claim has sat open. Null when nothing is open. */
  oldestOpenDays: number | null;
  /** The sentence printed beside the totals — the anti-promise line. */
  basis: string;
}

/**
 * Farm-level claim position.
 *
 * `received` counts only claims marked paid WITH an amount: a status change with
 * no money recorded is not a payment, and counting it as one would tell a farmer
 * they had been paid when they had not.
 */
export function claimSummary(claims: ClaimRecord[], on: Date = new Date()): ClaimSummary {
  const positions = claims.map((c) => claimPosition(c, on));
  const expected = positions.reduce((s, p) => s + (p.expected ?? 0), 0);
  const received = positions.reduce((s, p) => s + (p.outcome === "paid" ? (p.received ?? 0) : 0), 0);
  const shortfall = positions.reduce((s, p) => s + (p.shortfall ?? 0), 0);
  const open = positions.filter((p) => p.outcome === "awaiting" || p.outcome === "approved");

  return {
    claims: positions.length,
    expected: r2(expected),
    received: r2(received),
    shortfall: r2(shortfall),
    shortfallPct: expected > 0 && received > 0 ? Math.round((shortfall / expected) * 1000) / 10 : null,
    paid: positions.filter((p) => p.outcome === "paid").length,
    awaiting: positions.filter((p) => p.outcome === "awaiting").length,
    approved: positions.filter((p) => p.outcome === "approved").length,
    rejected: positions.filter((p) => p.outcome === "rejected").length,
    oldestOpenDays: open.length ? Math.max(...open.map((p) => p.openDays)) : null,
    basis:
      "Index cover pays on a trigger (rainfall or an area average), not on your own loss. A payout can be more or less than what you counted.",
  };
}
