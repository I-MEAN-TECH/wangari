"use client";

import * as React from "react";
import Link from "next/link";
import {
  Printer, Share2, ChevronLeft, ChevronRight, Wheat, MapPin,
  ArrowLeft, CircleCheck, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shareable monthly statement (M4).
 *
 * Success test from the plan: "a farmer screenshots the statement and sends
 * it unprompted — to a buyer, a co-op, or WhatsApp Status." So the design
 * rules here are screenshot rules: one tall card, big KES numbers, every
 * figure traceable to the farmer's own records, and a footer that says so.
 *
 * It is composed entirely of endpoints that already exist —
 * `/api/deliveries/statement` (the dispute-proof payout maths) and
 * `/api/profitability` (M4's cost-vs-price economics). No new backend: an
 * export that disagrees with the screens it came from would be worse than no
 * export at all.
 */

interface Economics {
  verdict: "profitable" | "thin" | "losing" | "no-cost" | "no-price";
  ownPricePerUnit: number | null;
  marketPricePerUnit: number | null;
  costPerUnit: number | null;
  profitPerUnit: number | null;
  headline: string;
  detail: string;
}

interface PRow {
  id: string;
  kind: "flock" | "crop" | "general";
  name: string;
  sub: string;
  outputUnits: number;
  unit: string | null;
  economics: Economics | null;
}

interface BuyerLine {
  deliveries: number;
  quantity: number;
  gross: number;
  deductions: number;
  paid: number;
  outstanding: number;
}

interface Stmt {
  month: string;
  deliveries: number;
  gross: number;
  deductions: number;
  inputExpenses: number;
  net: number;
  paid: number;
  outstanding: number;
  byBuyer: Record<string, BuyerLine>;
  allTimeOutstanding: number;
  unpaidDeliveries: number;
  /** Money the buyer let slip past the date they gave — not the same as owed. */
  arrears?: { total: number; count: number; oldestDays: number | null };
  /** Deductions split by who took them: the co-op, an agrovet, or a loan. */
  deductionsByCreditor?: Record<string, number>;
  /**
   * The per-delivery slip. This is the part a co-op clerk reads: on which date,
   * how much, at what butterfat, and what date they promised to pay by. Until
   * now the route computed all of it and no surface rendered a line of it.
   */
  deliveryList?: DeliveryLine[];
  /** B7: what the farm was actually paid per unit, across its whole history. */
  realised?: Realised;
  priceByBuyer?: BuyerPrice[];
  /** A7: butterfat against the price received, on the farmer's OWN median. */
  qualityVsPrice?: QualityVsPrice;
  priceByGrade?: GradePrice[];
  farm: { name: string; county: string | null; code: string | null; owner: { name: string } } | null;
}

interface DeliveryLine {
  id: number;
  date: string;
  commodity: string;
  quantity: number;
  unit: string;
  buyer: string | null;
  expectedPay: number | null;
  paidAmount: number | null;
  payBy: string | null;
  status: string;
  fatPct: number | null;
  snfPct: number | null;
  density: number | null;
  addedWaterPct: number | null;
  tpc: number | null;
  gradedBy: string | null;
  deductions: { label: string | null; amount: number; creditor: string | null }[];
}

interface Realised {
  deliveries: number;
  quantity: number;
  unit: string | null;
  pricedQuantity: number;
  unpricedQuantity: number;
  value: number;
  pricePerUnit: number | null;
}

interface BuyerPrice extends Realised {
  buyer: string;
  commodity: string;
}

interface QualityVsPrice {
  medianFatPct: number | null;
  atOrAbove: { deliveries: number; pricePerUnit: number | null; quantity: number };
  below: { deliveries: number; pricePerUnit: number | null; quantity: number };
  basis: string;
}

interface GradePrice {
  cropType: string;
  grade: string;
  quantityKg: number;
  pricedQuantityKg: number;
  value: number;
  pricePerKg: number | null;
}

const KES = (n: number) => "KES " + Math.round(n).toLocaleString("en-KE");
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${r2(n)}%`;
const shortDate = (d: string) =>
  new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short" });

const VERDICTS: Record<Economics["verdict"], { label: string; chip: string; text: string }> = {
  profitable: { label: "Making money", chip: "bg-wangari-green-100 text-wangari-green-800", text: "text-wangari-green-700" },
  thin: { label: "Thin margin", chip: "bg-wangari-amber-100 text-wangari-amber-800", text: "text-tone-warn-text" },
  losing: { label: "Losing money", chip: "bg-badge-red-bg text-badge-red-text", text: "text-wangari-red-600" },
  "no-cost": { label: "No cost data", chip: "bg-wangari-gray-100 text-wangari-gray-600", text: "text-wangari-gray-700" },
  "no-price": { label: "No price data", chip: "bg-wangari-sky-100 text-wangari-sky-700", text: "text-wangari-sky-700" },
};

function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-KE", { month: "long", year: "numeric" });
}
function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function StatementPage() {
  const [month, setMonth] = React.useState(currentMonth());
  const [stmt, setStmt] = React.useState<Stmt | null>(null);
  const [rows, setRows] = React.useState<PRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async (m: string) => {
    setLoading(true);
    setNotice(null);
    const { default: api } = await import("@/lib/api-client");
    const [s, p] = await Promise.allSettled([
      api.get(`/api/deliveries/statement?month=${m}`),
      api.get("/api/profitability?days=30"),
    ]);
    setStmt(s.status === "fulfilled" ? (s.value as Stmt) : null);
    setRows(p.status === "fulfilled" ? ((p.value as any).rows ?? []) : []);
    if (s.status === "rejected" && p.status === "rejected") {
      setNotice("Could not load your records. The statement only ever shows numbers your own device has saved.");
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(month); }, [month, load]);

  const priceRows = rows.filter((r): r is PRow & { economics: Economics } =>
    r.kind !== "general" && Boolean(r.economics) && r.outputUnits > 0
  ).slice(0, 4);

  const share = async () => {
    const text = `${stmt?.farm?.name ?? "Our farm"} — ${monthLabel(month)} statement`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: text, text, url: window.location.href });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setNotice("Link copied — paste it into WhatsApp.");
        setTimeout(() => setNotice(null), 3000);
      }
    } catch { /* user cancelled the share sheet */ }
  };

  const buyers = Object.entries(stmt?.byBuyer ?? {});
  const today = new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      {/* Print rules: the statement prints as the card alone, no app chrome. */}
      <style>{`@media print { aside, header, nav, [data-no-print] { display: none !important; } body { background: #fff; } }`}</style>

      {/* Toolbar (never printed, never screenshotted) */}
      <div data-no-print className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/profitability" className="inline-flex items-center gap-1.5 text-sm font-bold text-wangari-green-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to scoreboard
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-wangari-border bg-white">
            <button
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="px-3 py-2.5 text-wangari-gray-500 hover:bg-wangari-gray-50 rounded-l-xl cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-black text-wangari-gray-700 min-w-[110px] text-center">{monthLabel(month)}</span>
            <button
              onClick={() => month < currentMonth() && setMonth(shiftMonth(month, 1))}
              disabled={month >= currentMonth()}
              className="px-3 py-2.5 text-wangari-gray-500 hover:bg-wangari-gray-50 disabled:opacity-30 rounded-r-xl cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-10 gap-1.5">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button size="sm" onClick={share} className="h-10 gap-1.5 bg-wangari-green-800 hover:bg-wangari-green-900">
            <Share2 className="h-4 w-4" /> Share
          </Button>
        </div>
      </div>

      {notice && (
        <div data-no-print className="rounded-xl border border-wangari-sky-200 bg-wangari-sky-50 px-4 py-2.5 text-xs font-bold text-wangari-sky-800">
          {notice}
        </div>
      )}

      {/* The card — everything below is the screenshot */}
      <div className="rounded-2xl border border-wangari-border bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="border-b border-wangari-gray-100 bg-gradient-to-br from-wangari-green-50 to-white px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-wangari-gray-900">
                {loading ? "…" : (stmt?.farm?.name ?? "Farm statement")}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-wangari-gray-500">
                {stmt?.farm?.county && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{stmt.farm.county}</span>
                )}
                {stmt?.farm?.code && <span>Code {stmt.farm.code}</span>}
                <span className="inline-flex items-center gap-1"><Wheat className="h-3 w-3" />Monthly statement · {monthLabel(month)}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-wangari-gray-400">Net this month</p>
              <p className={`text-2xl font-black ${(stmt?.net ?? 0) >= 0 ? "text-wangari-green-700" : "text-wangari-red-600"}`}>
                {loading ? "…" : KES(stmt?.net ?? 0)}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800 mx-auto" />
          </div>
        ) : (
          <>
            {/* The four numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-wangari-gray-100 border-b border-wangari-gray-100">
              {[
                { label: "Deliveries", value: stmt?.gross ?? 0, note: `${stmt?.deliveries ?? 0} deliveries` },
                { label: "Deductions", value: -(stmt?.deductions ?? 0), note: "buyer deductions" },
                { label: "Input expenses", value: -(stmt?.inputExpenses ?? 0), note: "recorded this month" },
                { label: "Paid", value: stmt?.paid ?? 0, note: "received" },
              ].map((c) => (
                <div key={c.label} className="px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-wangari-gray-400">{c.label}</p>
                  <p className="mt-1 text-base font-black text-wangari-gray-900">{KES(c.value)}</p>
                  <p className="text-[10px] text-wangari-gray-400">{c.note}</p>
                </div>
              ))}
            </div>

            {/* Owed — the dispute-proof line */}
            <div className="border-b border-wangari-gray-100 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-wangari-gray-400">Outstanding (all time)</p>
                <p className={`text-lg font-black ${(stmt?.allTimeOutstanding ?? 0) > 0 ? "text-wangari-amber-600" : "text-wangari-green-700"}`}>
                  {KES(stmt?.allTimeOutstanding ?? 0)}
                  {(stmt?.unpaidDeliveries ?? 0) > 0 && (
                    <span className="ml-2 align-middle text-[11px] font-bold text-wangari-amber-600">
                      across {stmt?.unpaidDeliveries} deliveries
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-wider text-wangari-gray-400">This month owed</p>
                <p className="text-lg font-black text-wangari-gray-900">{KES(stmt?.outstanding ?? 0)}</p>
              </div>
            </div>

            {/* Cost of production vs price */}
            <div className="border-b border-wangari-gray-100 px-6 py-4">
              <p className="text-sm font-black text-wangari-gray-900">Cost of production vs price</p>
              {priceRows.length === 0 ? (
                <p className="mt-1 text-xs text-wangari-gray-500">
                  Not enough recorded output in the last 30 days to quote a per-unit cost yet.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {priceRows.map((r) => {
                    const e = r.economics;
                    const v = VERDICTS[e.verdict];
                    const u = r.unit ?? "unit";
                    return (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-wangari-gray-100 bg-wangari-gray-50/60 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-wangari-gray-900">{r.name}</p>
                          <p className="text-[11px] text-wangari-gray-500">
                            {e.costPerUnit !== null && e.costPerUnit > 0 ? `Cost ${KES(r2(e.costPerUnit))}/${u}` : "Cost not recorded"}
                            {e.ownPricePerUnit && ` · you earn ${KES(r2(e.ownPricePerUnit))}/${u}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${v.chip}`}>{v.label}</span>
                          <span className={`text-xs font-black ${v.text}`}>{e.headline}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Arrears: only ever shown against a date the buyer gave, so the
                line is a fact rather than a grievance. */}
            {(stmt?.arrears?.count ?? 0) > 0 && (
              <div className="border-b border-wangari-gray-100 bg-wangari-amber-50 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-wangari-amber-800">
                      Past the promised date
                    </p>
                    <p className="text-lg font-black text-wangari-amber-600">
                      {KES(stmt?.arrears?.total ?? 0)}
                    </p>
                  </div>
                  <p className="text-right text-[11px] font-bold text-wangari-amber-800">
                    {stmt?.arrears?.count} deliver{(stmt?.arrears?.count ?? 0) === 1 ? "y" : "ies"} late
                    {stmt?.arrears?.oldestDays != null && (
                      <><br />longest wait {stmt.arrears.oldestDays} days</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Who the deductions went to. A single deduction total hides the
                difference between a co-op charge and a loan repayment. */}
            {Object.keys(stmt?.deductionsByCreditor ?? {}).length > 0 && (
              <div className="border-b border-wangari-gray-100 px-6 py-4">
                <p className="text-sm font-black text-wangari-gray-900">Who the deductions went to</p>
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {Object.entries(stmt?.deductionsByCreditor ?? {}).map(([who, amount]) => (
                      <tr key={who} className="border-t border-wangari-gray-50">
                        <td className="py-1.5 font-bold text-wangari-gray-800">{who}</td>
                        <td className="py-1.5 text-right font-black text-wangari-gray-900">
                          −{KES(amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per-buyer: what settles an argument with a co-op */}
            {buyers.length > 0 && (
              <div className="border-b border-wangari-gray-100 px-6 py-4">
                <p className="text-sm font-black text-wangari-gray-900">By buyer</p>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-wangari-gray-400">
                      <th className="py-1 font-black">Buyer</th>
                      <th className="py-1 font-black text-right">Qty</th>
                      <th className="py-1 font-black text-right">Gross</th>
                      <th className="py-1 font-black text-right">Paid</th>
                      <th className="py-1 font-black text-right">Owed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyers.map(([name, b]) => (
                      <tr key={name} className="border-t border-wangari-gray-50">
                        <td className="py-1.5 font-bold text-wangari-gray-800">{name}</td>
                        <td className="py-1.5 text-right text-wangari-gray-600">{Math.round(b.quantity).toLocaleString()}</td>
                        <td className="py-1.5 text-right text-wangari-gray-800">{KES(b.gross)}</td>
                        <td className="py-1.5 text-right text-wangari-gray-600">{KES(b.paid)}</td>
                        <td className={`py-1.5 text-right font-black ${b.outstanding > 0 ? "text-wangari-amber-600" : "text-wangari-green-700"}`}>{KES(b.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* B7: what you were actually paid per unit, citing the base it
                rests on. The quantity with no price recorded is stated beside
                the average, never folded into it at zero: an average over the
                deliveries that happen to carry a price is not an average, and
                a co-op can dismantle a number that hides its base. */}
            {stmt?.realised && stmt.realised.pricePerUnit != null && (
              <div className="border-b border-wangari-gray-100 px-6 py-4">
                <p className="text-sm font-black text-wangari-gray-900">What you were paid</p>
                <p className="mt-1 text-lg font-black text-wangari-gray-900">
                  {KES(r2(stmt.realised.pricePerUnit))}
                  <span className="ml-1 text-xs font-bold text-wangari-gray-500">
                    per {stmt.realised.unit ?? "unit"}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-wangari-gray-500">
                  {Math.round(stmt.realised.pricedQuantity).toLocaleString()} {stmt.realised.unit ?? "units"} across{" "}
                  {stmt.realised.deliveries} deliver{stmt.realised.deliveries === 1 ? "y" : "ies"} with a price recorded.
                </p>
                {stmt.realised.unpricedQuantity > 0 && (
                  <p className="mt-1 text-[11px] font-bold text-wangari-amber-700">
                    {Math.round(stmt.realised.unpricedQuantity).toLocaleString()} {stmt.realised.unit ?? "units"} has no
                    price on the ticket and is not in this average.
                  </p>
                )}
                {(stmt.priceByBuyer ?? []).length > 1 && (
                  <table className="mt-2 w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-wangari-gray-400">
                        <th className="py-1 font-black">Buyer</th>
                        <th className="py-1 text-right font-black">Qty</th>
                        <th className="py-1 text-right font-black">Paid per unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stmt.priceByBuyer ?? []).map((b) => (
                        <tr key={`${b.buyer}-${b.commodity}`} className="border-t border-wangari-gray-50">
                          <td className="py-1.5 font-bold text-wangari-gray-800">
                            {b.buyer}
                            {b.commodity !== "milk" && <span className="ml-1 text-[10px] text-wangari-gray-400">{b.commodity}</span>}
                          </td>
                          <td className="py-1.5 text-right text-wangari-gray-600">{Math.round(b.pricedQuantity).toLocaleString()}</td>
                          <td className="py-1.5 text-right font-black text-wangari-gray-900">
                            {b.pricePerUnit != null ? KES(r2(b.pricePerUnit)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* A7: butterfat against the price received. Split on the farmer's
                own middle reading, because a co-op's payment bands are their
                commercial term and we are not told them. The basis line is not
                decoration — it is the sentence that stops this being read as a
                payment rule. */}
            {stmt?.qualityVsPrice && stmt.qualityVsPrice.medianFatPct != null && (
              <div className="border-b border-wangari-gray-100 px-6 py-4">
                <p className="text-sm font-black text-wangari-gray-900">Butterfat and price</p>
                <p className="mt-0.5 text-[11px] text-wangari-gray-500">
                  The middle butterfat of your own deliveries was {pct(stmt.qualityVsPrice.medianFatPct)}.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { label: `At or above ${pct(stmt.qualityVsPrice.medianFatPct)}`, group: stmt.qualityVsPrice.atOrAbove },
                    { label: `Below ${pct(stmt.qualityVsPrice.medianFatPct)}`, group: stmt.qualityVsPrice.below },
                  ].map((row) => (
                    <div key={row.label} className="rounded-xl border border-wangari-gray-100 bg-wangari-gray-50/60 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-wangari-gray-400">{row.label}</p>
                      <p className="mt-0.5 text-base font-black text-wangari-gray-900">
                        {row.group.pricePerUnit != null ? KES(r2(row.group.pricePerUnit)) : "—"}
                        <span className="ml-1 text-[10px] font-bold text-wangari-gray-500">per unit</span>
                      </p>
                      <p className="text-[10px] text-wangari-gray-400">
                        {row.group.deliveries} deliver{row.group.deliveries === 1 ? "y" : "ies"}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-wangari-gray-500">{stmt.qualityVsPrice.basis}</p>
              </div>
            )}

            {/* B7 continued: grade lives on the harvest, not the lorry ticket,
                so this is the only place a per-grade price can come from. An
                ungraded harvest is shown rather than dropped — how much of the
                crop goes ungraded is usually where the money is. */}
            {(stmt?.priceByGrade ?? []).length > 0 && (
              <div className="border-b border-wangari-gray-100 px-6 py-4">
                <p className="text-sm font-black text-wangari-gray-900">Price by grade</p>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-wangari-gray-400">
                      <th className="py-1 font-black">Crop</th>
                      <th className="py-1 font-black">Grade</th>
                      <th className="py-1 text-right font-black">Kg</th>
                      <th className="py-1 text-right font-black">Per kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stmt?.priceByGrade ?? []).map((g) => (
                      <tr key={`${g.cropType}-${g.grade}`} className="border-t border-wangari-gray-50">
                        <td className="py-1.5 font-bold capitalize text-wangari-gray-800">{g.cropType}</td>
                        <td className="py-1.5 capitalize text-wangari-gray-600">{g.grade}</td>
                        <td className="py-1.5 text-right text-wangari-gray-600">{Math.round(g.quantityKg).toLocaleString()}</td>
                        <td className="py-1.5 text-right font-black text-wangari-gray-900">
                          {g.pricePerKg != null ? KES(r2(g.pricePerKg)) : "not sold yet"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* The per-delivery slip. This is the section a co-op clerk reads
                line by line, and the reason the statement exists: a date, a
                quantity, the butterfat the co-op itself measured, and the date
                they promised to pay. A blank means the reading was not taken —
                never zero, which would read as a fault in the farmer's milk. */}
            {(stmt?.deliveryList ?? []).length > 0 && (
              <div className="border-b border-wangari-gray-100 px-6 py-4">
                <p className="text-sm font-black text-wangari-gray-900">Every delivery this month</p>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-wangari-gray-400">
                      <th className="py-1 font-black">Date</th>
                      <th className="py-1 font-black">Buyer</th>
                      <th className="py-1 text-right font-black">Qty</th>
                      <th className="py-1 text-right font-black">Fat</th>
                      <th className="py-1 text-right font-black">SNF</th>
                      <th className="py-1 text-right font-black">Gross</th>
                      <th className="py-1 text-right font-black">Paid</th>
                      <th className="py-1 text-right font-black">Owed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stmt?.deliveryList ?? []).map((d) => {
                      const ded = d.deductions.reduce((s, x) => s + Number(x.amount), 0);
                      const owed = Number(d.expectedPay ?? 0) - ded - Number(d.paidAmount ?? 0);
                      const notes = [
                        d.addedWaterPct != null && d.addedWaterPct > 0 ? `added water ${pct(d.addedWaterPct)}` : null,
                        d.density != null ? `density ${r2(d.density)}` : null,
                        d.tpc != null ? `TPC ${d.tpc}` : null,
                        d.gradedBy ? `graded by ${d.gradedBy}` : null,
                        ...d.deductions.map((x) => `${x.creditor ?? x.label ?? "deduction"} −${KES(x.amount)}`),
                      ].filter(Boolean) as string[];
                      return (
                        <React.Fragment key={d.id}>
                          <tr className="border-t border-wangari-gray-50">
                            <td className="py-1.5 whitespace-nowrap text-wangari-gray-600">{shortDate(d.date)}</td>
                            <td className="py-1.5 font-bold text-wangari-gray-800">{d.buyer ?? "—"}</td>
                            <td className="py-1.5 text-right text-wangari-gray-600">
                              {Math.round(Number(d.quantity)).toLocaleString()} <span className="text-[10px]">{d.unit}</span>
                            </td>
                            <td className={`py-1.5 text-right font-black ${d.fatPct != null ? "text-wangari-gray-900" : "text-wangari-gray-300"}`}>
                              {d.fatPct != null ? pct(d.fatPct) : "—"}
                            </td>
                            <td className={`py-1.5 text-right ${d.snfPct != null ? "text-wangari-gray-700" : "text-wangari-gray-300"}`}>
                              {d.snfPct != null ? pct(d.snfPct) : "—"}
                            </td>
                            <td className="py-1.5 text-right text-wangari-gray-800">{KES(Number(d.expectedPay ?? 0))}</td>
                            <td className="py-1.5 text-right text-wangari-gray-600">{KES(Number(d.paidAmount ?? 0))}</td>
                            <td className={`py-1.5 text-right font-black ${owed > 0.01 ? "text-wangari-amber-600" : "text-wangari-green-700"}`}>
                              {KES(owed)}
                            </td>
                          </tr>
                          {(notes.length > 0 || d.payBy) && (
                            <tr>
                              <td colSpan={8} className="pb-1.5 text-[10px] leading-relaxed text-wangari-gray-500">
                                {notes.join(" · ")}
                                {d.payBy && (
                                  <span className="ml-1 font-bold text-wangari-gray-600">
                                    promised by {new Date(d.payBy).toLocaleDateString("en-KE")}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-1.5 text-[11px] text-wangari-gray-400">
                  A dash means the reading was not taken on that ticket — not zero.
                </p>
              </div>
            )}

            {/* Honesty footer — the line that keeps this document trustworthy */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-wangari-gray-50 px-6 py-3.5">
              <p className="flex items-center gap-1.5 text-[11px] text-wangari-gray-500">
                {(stmt?.net ?? 0) >= 0
                  ? <CircleCheck className="h-3.5 w-3.5 text-wangari-green-600" />
                  : <TriangleAlert className="h-3.5 w-3.5 text-wangari-red-500" />}
                Computed from this farm's own records — not an audited statement.
              </p>
              <p className="text-[11px] text-wangari-gray-400">Wangari · generated {today}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
