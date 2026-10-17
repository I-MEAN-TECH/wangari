/**
 * Matching money received to the delivery it settled (gap report §3 C3).
 *
 * An unmatched M-Pesa receipt is the single most common reason a farmer believes
 * they were not paid. The money already lands in `transactions`; what was
 * missing was the link back to what it paid for.
 *
 * The doc's guidance is "match by reference/amount in the existing ledger;
 * manual confirm is enough for a first version", and that is the shape here: this
 * file PROPOSES, it never confirms. A proposal is a question with a score
 * attached, and the farmer's confirmation is what writes the match.
 *
 * Rules:
 *  - **A payment is never assumed to settle a delivery.** Amounts repeat — three
 *    farmers delivering 12 litres get three identical receipts — so an exact
 *    amount match is strong evidence, not proof, and the confidence is shown
 *    rather than acted on.
 *  - **Payments only match deliveries that came BEFORE them.** A receipt dated
 *    before the milk was delivered is not that milk's payment, and allowing it
 *    would let one late payment silently settle a delivery made afterwards.
 *  - **Only what is owed is compared.** A delivery is matched against what the
 *    buyer still owes on it (expected, less deductions, less anything already
 *    paid), because that is the number the receipt is trying to clear.
 */

const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface IncomeTransaction {
  id: number;
  date: Date;
  amount: number;
  description: string | null;
  paymentMethod: string | null;
  reference: string | null;
  /** Already matched to a delivery, when the farmer confirmed one. */
  deliveryId: number | null;
  matchedAt: Date | null;
  matchedBy: string | null;
}

export interface OpenDelivery {
  id: number;
  date: Date;
  buyer: string;
  commodity: string;
  receiptRef: string | null;
  /** Gross expected, before anything was withheld. */
  expectedPay: number | null;
  /** Deductions the buyer took off this delivery. */
  deductions: number;
  /** Anything recorded as already received. */
  paidAmount: number | null;
}

/** Still owed on the delivery: expected − deductions − paid. */
export function outstandingOn(d: OpenDelivery): number | null {
  if (d.expectedPay == null) return null;
  return r2(Math.max(0, Number(d.expectedPay) - Number(d.deductions || 0) - Number(d.paidAmount || 0)));
}

export type MatchReasonKind = "amount" | "reference" | "buyer" | "timing";

/**
 * How a score is presented.
 *
 * Exported because the proposal path adjusts a score after scoring (a part-paid
 * delivery is lifted above the floor once a second signal agrees) and a boost
 * that did not move the label would show a "0.45 · weak" proposal — a number and
 * a word disagreeing on the same row.
 */
export function confidenceFor(score: number): MatchProposal["confidence"] {
  return score >= 0.75 ? "likely" : score >= 0.45 ? "maybe" : "weak";
}

export interface MatchReason {
  kind: MatchReasonKind;
  /** How much this reason contributes to the score, 0–1. */
  weight: number;
  detail: string;
}

export interface MatchProposal {
  transactionId: number;
  deliveryId: number;
  /** 0–1. Shown to the farmer; never used to auto-confirm. */
  score: number;
  /** >= 0.75 is presented as a likely match, below it as a maybe. */
  confidence: "likely" | "maybe" | "weak";
  amountDifference: number | null;
  daysApart: number | null;
  reasons: MatchReason[];
}

export interface ReconcileOptions {
  /** Amounts within this many KES count as equal. Default 1. */
  toleranceKes?: number;
  /** A payment may not be matched more than this many days after the delivery. */
  maxDaysAfter?: number;
  /** Proposals below this score are not returned at all. */
  minScore?: number;
}

/** Does one lowercased string contain the other? Used for references and names. */
function overlaps(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * One transaction against one delivery, scored.
 *
 * Exported because the scoring is the thing worth testing, and because the route
 * reuses it when a farmer picks a pair by hand and wants to know why we did not
 * suggest it.
 */
export function scoreMatch(
  txn: IncomeTransaction,
  delivery: OpenDelivery,
  on: Date = new Date(),
  toleranceKes = 1
): MatchProposal {
  const reasons: MatchReason[] = [];
  let score = 0;

  const owed = outstandingOn(delivery);
  const diff = owed != null ? Math.abs(txn.amount - owed) : null;
  const tolerance = toleranceKes;

  if (diff != null && diff <= tolerance) {
    // Exact to the shilling. The strongest signal there is, and still only a
    // signal — round sums repeat constantly.
    score += 0.5;
    reasons.push({ kind: "amount", weight: 0.5, detail: `Amount matches what is owed on this delivery (KES ${owed!.toLocaleString()})` });
  } else if (diff != null && owed != null && owed > 0 && diff / owed <= 0.02) {
    score += 0.3;
    reasons.push({ kind: "amount", weight: 0.3, detail: `Amount is within 2% of the KES ${owed.toLocaleString()} owed` });
  }

  // A shared receipt/slip number is better evidence than an amount, because it
  // is not something that repeats by coincidence.
  if (
    delivery.receiptRef &&
    txn.reference &&
    (overlaps(txn.reference, delivery.receiptRef) || txn.reference.replace(/\D/g, "") === delivery.receiptRef.replace(/\D/g, ""))
  ) {
    score += 0.35;
    reasons.push({ kind: "reference", weight: 0.35, detail: `Receipt number ${delivery.receiptRef} appears on both` });
  }

  // The buyer's name in the transaction description. Weak on its own — "Brookside"
  // appears on most of this farm's transactions — so it stays worth little.
  if (txn.description && delivery.buyer && overlaps(txn.description, delivery.buyer)) {
    score += 0.1;
    reasons.push({ kind: "buyer", weight: 0.1, detail: `Description names ${delivery.buyer}` });
  }

  const rawDays = Math.round((txn.date.getTime() - delivery.date.getTime()) / DAY);
  if (rawDays >= 0) {
    if (rawDays <= 14) {
      score += 0.15;
      reasons.push({ kind: "timing", weight: 0.15, detail: `Paid ${rawDays} day${rawDays === 1 ? "" : "s"} after delivery` });
    } else if (rawDays <= 90) {
      // A co-op paying at the end of the following month is normal, not a signal
      // against — but it is not evidence for either.
      score += 0.05;
      reasons.push({ kind: "timing", weight: 0.05, detail: `Paid ${rawDays} days after delivery` });
    }
  }

  const bounded = Math.min(1, Math.round(score * 100) / 100);
  return {
    transactionId: txn.id,
    deliveryId: delivery.id,
    score: bounded,
    confidence: confidenceFor(bounded),
    amountDifference: diff != null ? r2(txn.amount - owed!) : null,
    daysApart: rawDays,
    reasons,
  };
}

/**
 * The best proposal per open delivery, best first.
 *
 * One proposal per DELIVERY rather than per transaction: two receipts cannot
 * both be suggested as settling the same delivery, or a farmer confirming both
 * would double-count what the co-op paid.
 */
export function proposeMatches(
  transactions: IncomeTransaction[],
  deliveries: OpenDelivery[],
  options: ReconcileOptions = {}
): MatchProposal[] {
  const tolerance = options.toleranceKes ?? 1;
  const maxDaysAfter = options.maxDaysAfter ?? 120;
  const minScore = options.minScore ?? 0.45;

  // Only money that came IN and has NOT already been matched. A confirmed match
  // is a decision the farmer made; re-proposing it invites a silent overwrite.
  const open = transactions.filter((t) => t.deliveryId == null && t.amount > 0);

  const scored: MatchProposal[] = [];
  for (const t of open) {
    for (const d of deliveries) {
      const daysAfter = Math.round((t.date.getTime() - d.date.getTime()) / DAY);
      // A receipt cannot settle a delivery made after it.
      if (daysAfter < 0 || daysAfter > maxDaysAfter) continue;
      const p = scoreMatch(t, d, new Date(), tolerance);
      const owed = outstandingOn(d);
      const amountOk = owed != null && Math.abs(t.amount - owed) <= tolerance;
      // Something less than the balance, but not nothing: a co-op that paid part
      // of a month's milk. This is exactly the case where a farmer needs the link
      // made, so it survives the score floor — but only when a non-amount signal
      // (a receipt number or the buyer's name) agrees, or every unrelated
      // payment in the ledger would be proposed against it.
      const partial = owed != null && t.amount > 0 && t.amount < owed;
      const hasSignal = p.reasons.some((r) => r.kind === "reference" || r.kind === "buyer");
      if (p.score < minScore && !amountOk && !(partial && hasSignal)) continue;
      const finalScore = amountOk ? Math.max(p.score, 0.5) : partial && hasSignal ? Math.max(p.score, 0.45) : p.score;
      // Score and label move together, or the row reads "0.45 · weak".
      scored.push({ ...p, score: finalScore, confidence: confidenceFor(finalScore) });
    }
  }

  const bestPerDelivery = new Map<number, MatchProposal>();
  for (const p of scored.sort((a, b) => b.score - a.score || (a.daysApart ?? 0) - (b.daysApart ?? 0))) {
    if (!bestPerDelivery.has(p.deliveryId)) bestPerDelivery.set(p.deliveryId, p);
  }
  return [...bestPerDelivery.values()].sort((a, b) => b.score - a.score);
}

/**
 * What is still owed once confirmed receipts are taken into account.
 *
 * `paidAmount` on the delivery is what the buyer said; matched transactions are
 * what actually arrived. Both reduce the balance, and taking only the first would
 * overstate what the farm is owed.
 */
export function balanceAfterMatches(d: OpenDelivery, matchedByDelivery: Map<number, number>): number {
  const owed = outstandingOn(d);
  if (owed == null) return 0;
  return r2(Math.max(0, owed - (matchedByDelivery.get(d.id) ?? 0)));
}

export interface ReconciliationSummary {
  /** Income transactions with nothing to show they settled a delivery. */
  unmatchedTransactions: number;
  unmatchedValue: number;
  /** Deliveries still carrying a balance with no match. */
  unmatchedDeliveries: number;
  unmatchedDeliveryValue: number;
  /** Transactions already confirmed against a delivery. */
  matched: number;
  matchedValue: number;
  proposals: number;
  /** Deliveries that are fully settled, matched or paid. */
  settled: number;
}

/**
 * The farm's reconciliation position.
 *
 * `settled` counts deliveries that are actually clear — a delivery with money
 * against it and no balance left is settled whether the link was made or the
 * payment was recorded directly on the delivery. Requiring a link before
 * declaring money received would tell a farmer they are owed money they already
 * have.
 */
export function reconciliationSummary(
  transactions: IncomeTransaction[],
  deliveries: OpenDelivery[],
  proposals: MatchProposal[]
): ReconciliationSummary {
  const matched = transactions.filter((t) => t.deliveryId != null);
  const unmatched = transactions.filter((t) => t.deliveryId == null && t.amount > 0);

  // Money the farmer CONFIRMED against a delivery clears it, even when nothing
  // was written back onto the delivery row. Without this, linking a receipt would
  // leave the delivery still showing as owed — and a farmer would be told they
  // are owed money they have already been paid.
  const matchedByDelivery = new Map<number, number>();
  for (const t of matched) {
    matchedByDelivery.set(t.deliveryId as number, (matchedByDelivery.get(t.deliveryId as number) ?? 0) + t.amount);
  }

  const open = deliveries.filter((d) => balanceAfterMatches(d, matchedByDelivery) > 0.01);

  return {
    unmatchedTransactions: unmatched.length,
    unmatchedValue: r2(unmatched.reduce((s, t) => s + t.amount, 0)),
    unmatchedDeliveries: open.length,
    unmatchedDeliveryValue: r2(open.reduce((s, d) => s + balanceAfterMatches(d, matchedByDelivery), 0)),
    matched: matched.length,
    matchedValue: r2(matched.reduce((s, t) => s + t.amount, 0)),
    proposals: proposals.length,
    settled: deliveries.length - open.length,
  };
}

// ─── Auto-confirm: the safe subset of matches the system can apply without
//     a human click ─────────────────────────────────────────────────────

export interface AutoMatch {
  transactionId: number;
  deliveryId: number;
  /** Why this was auto-confirmed, for the audit log. */
  reasons: string[];
}

/**
 * Find the income transactions and open deliveries that are the SAME
 * payment: same reference number AND same amount-to-the-cent. These are
 * the only matches the system is allowed to apply without the farmer's
 * click.
 *
 * Why "reference AND amount", not just one:
 *   - Amount alone is not unique. Three farmers delivering 12 litres
 *     produce three identical KES 600 receipts. An amount-only matcher
 *     would auto-confirm one of them against the wrong delivery.
 *   - Reference alone is not enough. The reference is the buyer's own
 *     slip number, which the buyer enters once when the receipt is
 *     made. A typo on the farmer's side, a partial payment, or a
 *     deduction taken off the gross all leave the reference intact and
 *     the amount different. A reference-only matcher would auto-confirm
 *     the wrong amount.
 *   - Both together is the unique signature of "this M-Pesa IS the
 *     settlement of this delivery". The combination is what the farmer
 *     themselves would click to confirm.
 *
 * The function is pure and idempotent. The cron wraps it in a database
 * write that stamps matchedBy = "auto" and matchedAt = now().
 */
export function findAutoConfirmMatches(
  transactions: IncomeTransaction[],
  deliveries: OpenDelivery[],
): AutoMatch[] {
  const out: AutoMatch[] = [];
  for (const t of transactions) {
    // A confirmed match is the farmer's decision. Re-applying one
    // silently is a class of bug we never want.
    if (t.matchedBy != null) continue;
    if (t.deliveryId != null) continue;
    if (t.amount <= 0) continue;
    if (typeof t.reference !== "string" || t.reference.trim() === "") continue;

    for (const d of deliveries) {
      if (d.expectedPay == null) continue;
      if (typeof d.receiptRef !== "string" || d.receiptRef.trim() === "") continue;
      // The delivery must still owe something. A zero outstanding
      // means the buyer has already paid in full (or the previous
      // payment settled it), and double-crediting is the failure mode
      // we never want. A *partially* paid delivery is fine — the
      // outstanding balance is the amount we compare against.
      const owed = outstandingOn(d);
      if (owed == null) continue;
      if (owed <= 0) continue;
      // Chronology: the receipt must arrive on or after the delivery.
      // Anything earlier is the wrong payment (a previous month's slip
      // photographed by accident, a misdated phone entry, etc.).
      if (t.date.getTime() < d.date.getTime()) continue;
      // The two unique signals.
      if (t.reference.trim() !== d.receiptRef.trim()) continue;
      if (Math.abs(t.amount - owed) > 0.01) continue;

      out.push({
        transactionId: t.id,
        deliveryId: d.id,
        reasons: ["reference", "amount"],
      });
      // One delivery per transaction; the first perfect match wins.
      break;
    }
  }
  return out;
}
