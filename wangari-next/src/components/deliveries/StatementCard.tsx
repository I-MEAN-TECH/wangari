"use client";

import * as React from "react";
import {
  ReceiptText,
  Share2,
  Printer,
  Building2,
  Wallet,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/farmer-ui/status-chip";
import { cn } from "@/lib/utils";

/**
 * StatementCard — the farmer's proof of what they are owed.
 *
 * WHY THIS EXISTS: dairy co-operatives in Kenya (N-KCC and others) have been
 * widely delinquent on milk payments, with farmers owed KES 300M+ and PS Mueke
 * warning that poor returns will cause a shortage. The root problem is that a
 * farmer cannot independently verify their own deliveries or what they were
 * paid, so a dispute is unresolvable. This card is that independent record.
 *
 * DESIGN RULES (docs/module-plan.md §0):
 *  - The BIGGEST thing on the card is the balance owed, in huge KES, in red if
 *    it is still owed. That is the one number the whole screen exists to show.
 *  - Colour + icon carry the meaning; the words are the second layer.
 *  - One big button produces a plain, printable page the farmer can hand to a
 *    co-op clerk — that is what actually settles the argument.
 *
 * The per-buyer breakdown is the real settlement device: a co-op will engage
 * with "you owe me KES 45,000 for 30 deliveries to Githunguri", which is one
 * question, instead of a total across three buyers.
 */

export interface DeliveryStatement {
  month: string;
  deliveries: number;
  gross: number;
  deductions: number;
  inputExpenses: number;
  net: number;
  paid: number;
  outstanding: number;
  allTimeOutstanding?: number;
  unpaidDeliveries?: number;
  /**
   * Deliveries the buyer let slip past the date they promised. Kept separate
   * from plain "outstanding": an unpaid delivery whose due date has not arrived
   * is not late, and telling a farmer it is would make the card untrustworthy.
   */
  arrears?: { total: number; count: number; oldestDays: number | null };
  /**
   * Deductions grouped by who the money went to. "The co-op kept KES 4,000" and
   * "KES 4,000 repaid my SACCO loan" are the same figure and two different
   * conversations — this is the distinction the farmer is missing today.
   */
  deductionsByCreditor?: Record<string, number>;
  byBuyer?: Record<
    string,
    {
      deliveries: number;
      quantity: number;
      gross: number;
      deductions: number;
      paid: number;
      outstanding: number;
    }
  >;
  farm?: { name: string; county: string | null; code: string | null; owner: { name: string } } | null;
}

const money = (n: number) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;

/**
 * The all-time balance is the number the farmer actually takes to a co-op, so
 * it falls back to the month's outstanding if an older server response (or a
 * cached payload) is missing it. Never render a misleading zero.
 */
const allTimeOwed = (s: DeliveryStatement) =>
  typeof s.allTimeOutstanding === "number" ? s.allTimeOutstanding : s.outstanding;

export function StatementCard({
  statement,
  monthLabel,
}: {
  statement: DeliveryStatement;
  monthLabel: string;
}) {
  const [printing, setPrinting] = React.useState(false);

  const owed = allTimeOwed(statement);
  const settled = owed <= 0.01;
  const buyers = statement.byBuyer ?? {};

  /**
   * Printing beats building a PDF library here. The farmer gets a real page
   * they can hand over, and it works offline on any phone.
   */
  const printStatement = () => {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 500);
  };

  const shareStatement = async () => {
    const text = [
      `${statement.farm?.name || "Farm"} — Delivery & Payment Statement`,
      `Period: ${monthLabel}`,
      ``,
      `Total delivered: ${money(statement.gross)}`,
      `Deductions: ${money(statement.deductions)}`,
      `Paid: ${money(statement.paid)}`,
      `Outstanding: ${money(statement.outstanding)}`,
      ``,
      `Total outstanding: ${money(owed)}`,
      ...(statement.arrears && statement.arrears.count > 0
        ? [`Past the promised date: ${money(statement.arrears.total)} (${statement.arrears.count} deliveries${statement.arrears.oldestDays != null ? `, longest ${statement.arrears.oldestDays} days` : ""})`]
        : []),
      ...Object.entries(statement.deductionsByCreditor ?? {}).map(
        ([who, amount]) => `Deductions to ${who}: ${money(amount)}`
      ),
      ...Object.entries(buyers).map(
        ([buyer, c]) => `- ${buyer}: ${money(c.outstanding)} (${c.deliveries} deliveries)`
      ),
      ``,
      `— Wangari`,
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "Payment statement", text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* the farmer dismissed the share sheet — nothing to do */
    }
  };

  return (
    <Card className={cn("overflow-hidden", settled ? "border-tone-good-border" : "border-tone-warn-border")}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ReceiptText className={cn("h-5 w-5", settled ? "text-tone-good-text" : "text-tone-warn-text")} aria-hidden />
            <h2 className="font-semibold text-lg">Payment statement</h2>
          </div>
          <span className="text-sm text-muted-foreground">{monthLabel}</span>
        </div>

        {/* THE number. Biggest thing on the card, on purpose. */}
        <div
          className={cn(
            "rounded-2xl p-4 text-center",
            settled ? "bg-tone-good-bg" : "bg-tone-warn-bg"
          )}
        >
          <div className="mb-1 flex items-center justify-center gap-2">
            {settled ? (
              <CheckCircle2 className="h-5 w-5 text-tone-good-text" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 text-tone-warn-text" aria-hidden />
            )}
            <span className="text-sm font-semibold uppercase tracking-wide text-wangari-muted">
              {settled ? "All payments received" : "Owed to you"}
            </span>
          </div>
          <p
            className={cn(
              "font-mono text-3xl font-bold tabular-nums sm:text-4xl",
              settled ? "text-tone-good-text" : "text-tone-warn-text"
            )}
          >
            {money(owed)}
          </p>
          {!settled ? (
            <p className="mt-1 text-sm font-medium text-wangari-muted">
              {statement.unpaidDeliveries} deliveries unpaid
            </p>
          ) : null}
        </div>

        {/* This month's movement, kept visually secondary to the balance. */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-wangari-cream p-3">
            <p className="text-xs font-semibold uppercase text-wangari-muted">Delivered</p>
            <p className="text-lg font-bold text-tone-good-text">{money(statement.gross)}</p>
          </div>
          <div className="rounded-xl bg-wangari-cream p-3">
            <p className="text-xs font-semibold uppercase text-wangari-muted">Deductions</p>
            <p className="text-lg font-bold text-tone-warn-text">−{money(statement.deductions)}</p>
          </div>
          <div className="rounded-xl bg-wangari-cream p-3">
            <p className="text-xs font-semibold uppercase text-wangari-muted">Paid</p>
            <p className="text-lg font-bold text-tone-good-text">{money(statement.paid)}</p>
          </div>
        </div>

        {/* Per-buyer: the line that makes a co-op engage. */}
        {Object.keys(buyers).length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-wangari-text">
              <Building2 className="h-4 w-4" aria-hidden />
              Per buyer
            </div>
            <ul className="space-y-1.5">
              {Object.entries(buyers).map(([buyer, c]) => (
                <li
                  key={buyer}
                  className="flex items-center justify-between gap-3 rounded-xl border border-wangari-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-wangari-heading">{buyer}</p>
                    <p className="text-xs text-wangari-muted">
                      {c.deliveries} deliveries
                    </p>
                  </div>
                  <StatusChip
                    tone={c.outstanding > 0.01 ? "warn" : "good"}
                    label={money(c.outstanding)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Arrears, with a clock. Only shown when a buyer gave a date and
            missed it, so the line always means something specific. */}
        {statement.arrears && statement.arrears.count > 0 ? (
          <div className="rounded-xl border border-tone-warn-border bg-tone-warn-bg px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-tone-warn-text" aria-hidden />
              <p className="text-sm font-semibold text-tone-warn-text">
                {money(statement.arrears.total)} past the date you were promised
              </p>
            </div>
            <p className="mt-1 text-xs text-wangari-muted">
              {statement.arrears.count} deliver{statement.arrears.count === 1 ? "y" : "ies"}
              {statement.arrears.oldestDays != null
                ? ` · longest wait ${statement.arrears.oldestDays} days`
                : ""}
            </p>
          </div>
        ) : null}

        {/* Who took the money. The slip shows one deduction total; this splits
            it into the co-op's own charges and the farmer's other debts. */}
        {statement.deductionsByCreditor && Object.keys(statement.deductionsByCreditor).length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-wangari-text">
              <Wallet className="h-4 w-4" aria-hidden />
              Who the deductions went to
            </div>
            <ul className="space-y-1">
              {Object.entries(statement.deductionsByCreditor).map(([who, amount]) => (
                <li key={who} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-wangari-muted">{who}</span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums text-wangari-text">
                    −{money(amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Hand it over. This is what actually settles the argument. */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={shareStatement}
          >
            <Share2 className="h-4 w-4" aria-hidden />
            Share
          </Button>
          <Button
            className="flex-1"
            onClick={printStatement}
            disabled={printing}
          >
            <Printer className="h-4 w-4" aria-hidden />
            Print statement
          </Button>
        </div>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          <Wallet className="mr-1 inline h-3 w-3" aria-hidden />
          This statement comes from your own records. Show it to your buyer or
          village co-op.
        </p>

        {/* Print-only header: the co-op clerk should know whose this is and
            when it was produced, straight away. */}
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">
            {statement.farm?.name} — Delivery &amp; Payment Statement
          </h1>
          <p>
            Farmer: {statement.farm?.owner?.name}
            {statement.farm?.county ? ` · ${statement.farm.county}` : ""}
            {statement.farm?.code ? ` · Farm code ${statement.farm.code}` : ""}
          </p>
          <p>
            Period: {monthLabel} · Generated{" "}
            {new Date().toLocaleDateString("en-KE")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default StatementCard;