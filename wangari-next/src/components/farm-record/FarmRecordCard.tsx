"use client";

import * as React from "react";
import {
  Share2,
  Printer,
  Sprout,
  CalendarDays,
  Beef,
  Wheat,
  Star,
  ShieldCheck,
  TrendingUp,
  Users,
  Tractor,
  CircleDashed,
  Egg,
  Milk,
  Hourglass,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/farmer-ui/status-chip";
import { cn } from "@/lib/utils";

/**
 * FarmRecordCard — the "bankable farm", as one page a farmer can hand over.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * In Kenya the credit wall is not a risk problem, it is a VISIBILITY problem:
 * a farmer with eleven flawless seasons is rejected because no one can see the
 * record. A loan officer without collateral looks for an operational history in
 * four categories — activity, inputs, yield, market linkage — across seasons.
 *
 * Wangari already holds all four, because the farmer recorded them to manage
 * the farm. This card is the honest summary of that, and it is the artefact the
 * farmer physically hands to a SACCO clerk, an AFC agent or a bank.
 *
 * ── Design rules (docs/module-plan.md §0) ──────────────────────────────────
 *  - Five stars, colour + icon, then the word. A farmer who cannot read still
 *    knows a full row of stars from an empty one.
 *  - The biggest element is the FARM, then the record, then the grade. Not a
 *    chart. Nothing here requires the farmer to interpret an axis.
 *  - If the record is too short to grade, we DO NOT show an empty star row and
 *    let it read as failure. We show the countdown: "21 more days to go". A grade is
 *    never shown for a record that cannot support one.
 *  - Missing days are shown as missing. The report never flatters.
 *  - No promise of a loan. The card says what it is: a record of work done.
 */

export interface FarmRecordResponse {
  farm: {
    name: string;
    code: string | null;
    county: string | null;
    location: string | null;
    farmType: string | null;
    owner: string | null;
  };
  period: {
    firstRecord: string | null;
    lastRecord: string | null;
    recordSpanDays: number;
    /** Months of calendar time elapsed since the first record. */
    recordMonths: number;
    /**
     * Months that CONTAIN records. This is the honest "how much history do I
     * have" number and the one shown to the farmer — elapsed months alone would
     * overstate a farm with two entries in eighteen months.
     */
    monthsWithRecords: number;
    seasonsNote: string;
  };
  evidence: {
    activity: { daysRecorded: number; windowDays: number };
    inputs: {
      totalExpense: number;
      windowExpense: number;
      records: number;
      applications: number;
      inputApplicationCost: number;
    };
    output: { eggs: number; milk: number; weightKg: number; harvestKg: number; mortality: number };
    market: {
      sales: number; deliveries: number; buyers: string[];
      totalIncome: number; windowIncome: number;
      deliveryOwed: number;
    };
    labour: { daysWithAttendance: number; records: number };
  };
  scale: { flocks: number; headCount: number; crops: number; totalAreaAcres: number; taggedAnimals: number };
  trend: {
    recentMonths: Array<{ month: string; daysRecorded: number; income: number; expense: number }>;
    recordingImproving: boolean;
  };
  topProduct: {
    label: string;
    icon: "eggs" | "milk" | "harvest" | "livestock";
    amount: number;
    unit: string;
  } | null;
  grade: {
    graded: boolean;
    stars: number;
    maxStars: number;
    tone: "good" | "warn" | "neutral";
    summary: string;
    criteria: Array<{ id: string; label: string; detail: string; earned: boolean }>;
    progress: { daysLogged: number; windowDays: number; consistency: number; daysUntilGrading: number };
    nextStep: { id: string; label: string } | null;
  };
  generatedAt: string;
  disclosure: string;
}

const money = (n: number) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;
const num = (n: number) => Math.round(Number(n) || 0).toLocaleString();

/** The five stars, in the fixed order the farmer learns once. */
const STAR_ORDER = ["consistency", "output", "inputs", "market", "duration"];

const STAR_TONE: Record<string, "good" | "warn" | "neutral"> = {
  consistency: "warn",
  output: "good",
  inputs: "warn",
  market: "good",
  duration: "neutral",
};

/**
 * Server sends an icon KEY, never a glyph — see routes/farm-record.ts. The
 * client owns how it is drawn, so a record stays correct if the icon set
 * changes and the same key renders identically in every surface that shows it.
 */
const TOP_PRODUCT_ICON = {
  eggs: Egg,
  milk: Milk,
  harvest: Wheat,
  livestock: Beef,
} as const;

export function FarmRecordCard({ record }: { record: FarmRecordResponse }) {
  const [printing, setPrinting] = React.useState(false);
  const { farm, period, evidence, grade, trend } = record;

  const criteria = React.useMemo(() => {
    const byId = new Map(grade.criteria.map((c) => [c.id, c]));
    return STAR_ORDER.map((id) => byId.get(id)).filter(Boolean) as typeof grade.criteria;
  }, [grade.criteria]);

  const printedOn = new Date(record.generatedAt).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const printRecord = () => {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 500);
  };

  const shareRecord = async () => {
    const lines = [
      `${farm.name} — Farm Record`,
      farm.county ? ` county: ${farm.county}` : "",
      farm.code ? ` Code: ${farm.code}` : "",
      ``,
      `Record period: ${period.monthsWithRecords} months (${period.recordSpanDays} days)`,
      `Days recorded: ${evidence.activity.daysRecorded} of ${evidence.activity.windowDays}`,
      `Costs: ${money(evidence.inputs.totalExpense)}`,
      `Income: ${money(evidence.market.totalIncome)}`,
      evidence.market.deliveryOwed > 0 ? `Outstanding: ${money(evidence.market.deliveryOwed)}` : ``,
      ``,
      grade.graded
        ? `Record grade: ${grade.stars} of 5 — ${grade.summary}`
        : `Not graded yet: ${grade.summary}`,
      ``,
      record.disclosure,
      `— ${printedOn}`,
    ]
      .filter((l) => l !== undefined)
      .join("\n")
      .replace(/\n\n+/g, "\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "Farm record", text: lines });
      } else {
        await navigator.clipboard.writeText(lines);
      }
    } catch {
      /* farmer dismissed the share sheet — nothing to do */
    }
  };

  return (
    <Card className="overflow-hidden border-tone-good-border">
      <CardContent className="space-y-5 pt-6">
        {/* ── WHO. The farm is the subject of this page. ────────────────── */}
        <div className="text-center">
          <div className="mb-1 flex items-center justify-center gap-2 text-tone-good-text">
            <Sprout className="h-6 w-6" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-widest">Farm record</span>
          </div>
          <h1 className="text-2xl font-bold leading-tight text-wangari-heading sm:text-3xl">{farm.name}</h1>
          <p className="mt-1 text-sm text-wangari-muted">
            {[farm.owner, farm.county, farm.location].filter(Boolean).join(" · ")}
          </p>
          {farm.code ? (
            <p className="mt-1 font-mono text-xs text-wangari-muted">Farm code: {farm.code}</p>
          ) : null}
        </div>

        {/* ── HOW LONG. Honesty first: banks want seasons, say where we are. ─ */}
        <div className="rounded-2xl bg-wangari-cream p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-wangari-muted">
            <CalendarDays className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide">Record period</span>
          </div>
          <p className="mt-1 text-3xl font-bold tabular-nums text-wangari-heading">
            Months {period.monthsWithRecords}
          </p>
          <p className="mt-1 text-sm font-medium text-wangari-muted">{period.seasonsNote}</p>
        </div>

        {/* ── THE GRADE. The centrepiece, in stars + colour. ─────────────── */}
        <div
          className={cn(
            "rounded-2xl border-2 p-5 text-center",
            !grade.graded
              ? "border-wangari-border bg-wangari-cream"
              : grade.tone === "good"
                ? "border-tone-good-border bg-tone-good-bg"
                : grade.tone === "warn"
                  ? "border-tone-warn-border bg-tone-warn-bg"
                  : "border-wangari-border bg-wangari-cream"
          )}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-wangari-muted">
            {grade.graded ? "Record grade" : "Record starting"}
          </p>

          {grade.graded ? (
            <>
              <div className="mt-2 flex items-center justify-center gap-1" role="img"
                aria-label={`Grade ${grade.stars} of 5`}>
                {Array.from({ length: grade.maxStars }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-10 w-10",
                      i < grade.stars
                        ? grade.tone === "good"
                          ? "fill-wangari-green-500 text-tone-good-text"
                          : "fill-wangari-green-300 text-tone-warn-text"
                        : "text-wangari-subtle"
                    )}
                    aria-hidden
                  />
                ))}
              </div>
              <p className="mt-1 text-2xl font-bold text-wangari-heading">
                {grade.stars} / {grade.maxStars}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-3xl font-bold text-wangari-heading">
                {grade.progress.daysUntilGrading}
              </p>
              <p className="text-sm font-semibold text-wangari-muted">more days to go</p>
            </>
          )}

          <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-relaxed text-wangari-text">
            {grade.summary}
          </p>
        </div>

        {/* ── The four things a loan officer actually asks for. ───────────── */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-wangari-muted">
            Ushahidi wa kazi
          </h2>
          <ul className="space-y-2">
            {criteria.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3",
                  c.earned ? "border-tone-good-border bg-tone-good-bg" : "border-wangari-border bg-white"
                )}
              >
                {c.earned ? (
                  <Star className="mt-0.5 h-6 w-6 shrink-0 fill-wangari-green-500 text-tone-good-text" aria-hidden />
                ) : (
                  <CircleDashed className="mt-0.5 h-6 w-6 shrink-0 text-wangari-subtle" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-wangari-heading">{c.label}</p>
                  <p className="text-sm text-wangari-muted">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* ── The numbers, biggest last because they are supporting evidence. ─ */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-tone-good-border bg-tone-good-bg p-3 text-center">
            <p className="text-xs font-semibold uppercase text-wangari-muted">Total income</p>
            <p className="text-xl font-bold text-tone-good-text">{money(evidence.market.totalIncome)}</p>
          </div>
          <div className="rounded-2xl border border-tone-warn-border bg-tone-warn-bg p-3 text-center">
            <p className="text-xs font-semibold uppercase text-wangari-muted">Total costs</p>
            <p className="text-xl font-bold text-tone-warn-text">{money(evidence.inputs.totalExpense)}</p>
          </div>
        </div>

        {record.topProduct ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-wangari-cream p-3">
            {(() => {
              const TopIcon = TOP_PRODUCT_ICON[record.topProduct.icon] ?? Wheat;
              return <TopIcon className="h-4 w-4 text-wangari-green-700" aria-hidden />;
            })()}
            <span className="text-sm text-wangari-muted">Most produced:</span>
            <span className="font-bold text-wangari-heading">
              {num(record.topProduct.amount)} {record.topProduct.unit} {record.topProduct.label.toLowerCase()}
            </span>
          </div>
        ) : null}

        {/* ── Scale + market: what a lender asks next. ───────────────────── */}
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Fact icon={<Tractor className="h-4 w-4" aria-hidden />} label="Groups" value={num(record.scale.flocks)} />
          <Fact icon={<Beef className="h-4 w-4" aria-hidden />} label="Animals" value={num(record.scale.headCount)} />
          <Fact icon={<Wheat className="h-4 w-4" aria-hidden />} label="Crops" value={num(record.scale.crops)} />
          <Fact icon={<Users className="h-4 w-4" aria-hidden />} label="Buyers" value={num(evidence.market.sales + evidence.market.deliveries)} />
        </div>

        {/* Output detail — only the lines that apply to this farm. */}
        <div className="flex flex-wrap justify-center gap-2">
          {evidence.output.eggs > 0 ? (
            <StatusChip
              tone="good"
              icon={Egg}
              label={`${num(evidence.output.eggs)} eggs`}
            />
          ) : null}
          {evidence.output.milk > 0 ? (
            <StatusChip
              tone="good"
              icon={Milk}
              label={`${num(evidence.output.milk)} litres`}
            />
          ) : null}
          {evidence.output.harvestKg > 0 ? (
            <StatusChip
              tone="good"
              icon={Wheat}
              label={`${num(evidence.output.harvestKg)} kg`}
            />
          ) : null}
          {evidence.output.weightKg > 0 ? (
            <StatusChip
              tone="good"
              icon={Beef}
              label={`${num(evidence.output.weightKg)} kg`}
            />
          ) : null}
        </div>

        {evidence.market.buyers.length > 0 ? (
          <div className="rounded-2xl border border-wangari-border p-3">
            <p className="text-xs font-semibold uppercase text-wangari-muted">Your buyers</p>
            <p className="mt-1 font-medium text-wangari-heading">
              {evidence.market.buyers.join(", ")}
            </p>
            {evidence.market.deliveryOwed > 0 ? (
              <StatusChip
                tone="warn"
                icon={Hourglass}
                className="mt-2"
                label={`${money(evidence.market.deliveryOwed)} outstanding`}
              />
            ) : null}
          </div>
        ) : null}

        {/* ── Growth. The honest early signal: the record itself improving. ─ */}
        <div className="rounded-2xl bg-wangari-cream p-3">
          <div className="flex items-center gap-2">
            <TrendingUp
              className={cn("h-5 w-5", trend.recordingImproving ? "text-tone-good-text" : "text-wangari-subtle")}
              aria-hidden
            />
            <p className="text-sm font-medium text-wangari-text">
              {trend.recordingImproving
                ? "Your record is getting bigger every month."
                : "Keep recording every day so your record keeps growing."}
            </p>
          </div>
          {trend.recentMonths.length > 0 ? (
            <div className="mt-2 flex items-end justify-between gap-1" aria-hidden>
              {trend.recentMonths.map((m) => {
                const max = Math.max(...trend.recentMonths.map((x) => x.daysRecorded), 1);
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-wangari-green-400"
                      style={{ height: `${Math.max(4, (m.daysRecorded / max) * 40)}px` }}
                    />
                    <span className="text-[10px] text-wangari-muted">{m.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {grade.nextStep ? (
          <div className="rounded-2xl border-2 border-tone-warn-border bg-tone-warn-bg p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-tone-warn-text">Next step</p>
            <p className="mt-1 text-lg font-bold text-wangari-heading">{grade.nextStep.label}</p>
          </div>
        ) : null}

        {/* ── Hand it over. One tap each. ────────────────────────────────── */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={shareRecord}>
            <Share2 className="h-4 w-4" aria-hidden />
            Share
          </Button>
          <Button className="flex-1" onClick={printRecord} disabled={printing}>
            <Printer className="h-4 w-4" aria-hidden />
            Print
          </Button>
        </div>

        {/* No loan promise. Ever. This is the sentence that has to be true. */}
        <p className="flex items-start gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tone-good-text" aria-hidden />
          {record.disclosure}
        </p>

        {/* ── Print-only: the officer sees whose this is, first. ──────────── */}
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">Farm Operational Record</h1>
          <p>
            Farm: {farm.name}
            {farm.owner ? ` · Farmer: ${farm.owner}` : ""}
            {farm.county ? ` · ${farm.county}` : ""}
            {farm.code ? ` · Farm code ${farm.code}` : ""}
          </p>
          <p>
            Record period: {period.recordSpanDays} days ({period.recordMonths} months) ·{" "}
            {period.firstRecord} to {period.lastRecord}
          </p>
          <p>
            Record completeness: {evidence.activity.daysRecorded} of{" "}
            {evidence.activity.windowDays} days · {grade.stars} of {grade.maxStars} criteria
          </p>
          <p>Generated {printedOn} from the farmer&apos;s own Wangari records.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-wangari-cream p-2">
      <div className="flex items-center justify-center gap-1 text-wangari-muted">
        {icon}
        <span className="text-[11px] font-semibold uppercase">{label}</span>
      </div>
      <p className="text-lg font-bold text-wangari-heading">{value}</p>
    </div>
  );
}

export { STAR_ORDER, STAR_TONE };
export default FarmRecordCard;
