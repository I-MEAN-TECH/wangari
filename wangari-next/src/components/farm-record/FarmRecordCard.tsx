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
 *    let it read as failure. We show the countdown: "siku 21 zaidi". A grade is
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
  topProduct: { label: string; icon: string; amount: number; unit: string } | null;
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
      `${farm.name} — Rekodi ya shamba`,
      farm.county ? ` county: ${farm.county}` : "",
      farm.code ? ` Namba: ${farm.code}` : "",
      ``,
      `Muda wa rekodi: miezi ${period.monthsWithRecords} (siku ${period.recordSpanDays})`,
      `Siku zilizoandikwa: ${evidence.activity.daysRecorded} kati ya ${evidence.activity.windowDays}`,
      `Gharama: ${money(evidence.inputs.totalExpense)}`,
      `Mapato: ${money(evidence.market.totalIncome)}`,
      evidence.market.deliveryOwed > 0 ? `Bado inadaiwa: ${money(evidence.market.deliveryOwed)}` : ``,
      ``,
      grade.graded
        ? `Alama ya rekodi: ${grade.stars} kati ya 5 — ${grade.summary}`
        : `Bado sija maliza: ${grade.summary}`,
      ``,
      record.disclosure,
      `— ${printedOn}`,
    ]
      .filter((l) => l !== undefined)
      .join("\n")
      .replace(/\n\n+/g, "\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "Rekodi ya shamba", text: lines });
      } else {
        await navigator.clipboard.writeText(lines);
      }
    } catch {
      /* farmer dismissed the share sheet — nothing to do */
    }
  };

  return (
    <Card className="overflow-hidden border-green-200">
      <CardContent className="space-y-5 pt-6">
        {/* ── WHO. The farm is the subject of this page. ────────────────── */}
        <div className="text-center">
          <div className="mb-1 flex items-center justify-center gap-2 text-green-700">
            <Sprout className="h-6 w-6" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-widest">Rekodi ya shamba</span>
          </div>
          <h1 className="text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">{farm.name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {[farm.owner, farm.county, farm.location].filter(Boolean).join(" · ")}
          </p>
          {farm.code ? (
            <p className="mt-1 font-mono text-xs text-gray-500">Namba ya shamba: {farm.code}</p>
          ) : null}
        </div>

        {/* ── HOW LONG. Honesty first: banks want seasons, say where we are. ─ */}
        <div className="rounded-3xl bg-gray-50 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-600">
            <CalendarDays className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide">Muda wa rekodi</span>
          </div>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
            Miezi {period.monthsWithRecords}
          </p>
          <p className="mt-1 text-sm font-medium text-gray-600">{period.seasonsNote}</p>
        </div>

        {/* ── THE GRADE. The centrepiece, in stars + colour. ─────────────── */}
        <div
          className={cn(
            "rounded-3xl border-2 p-5 text-center",
            !grade.graded
              ? "border-gray-200 bg-gray-50"
              : grade.tone === "good"
                ? "border-green-300 bg-green-50"
                : grade.tone === "warn"
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-300 bg-gray-50"
          )}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            {grade.graded ? "Alama ya rekodi" : "Rekodi inaingia"}
          </p>

          {grade.graded ? (
            <>
              <div className="mt-2 flex items-center justify-center gap-1" role="img"
                aria-label={`Alama ${grade.stars} kati ya 5`}>
                {Array.from({ length: grade.maxStars }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-10 w-10",
                      i < grade.stars
                        ? grade.tone === "good"
                          ? "fill-green-500 text-green-600"
                          : "fill-amber-400 text-amber-500"
                        : "text-gray-300"
                    )}
                    aria-hidden
                  />
                ))}
              </div>
              <p className="mt-1 text-2xl font-bold text-gray-800">
                {grade.stars} / {grade.maxStars}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-3xl font-bold text-gray-800">
                {grade.progress.daysUntilGrading}
              </p>
              <p className="text-sm font-semibold text-gray-600">siku zaidi kuanza</p>
            </>
          )}

          <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-relaxed text-gray-700">
            {grade.summary}
          </p>
        </div>

        {/* ── The four things a loan officer actually asks for. ───────────── */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Ushahidi wa kazi
          </h2>
          <ul className="space-y-2">
            {criteria.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3",
                  c.earned ? "border-green-200 bg-green-50/60" : "border-gray-200 bg-white"
                )}
              >
                {c.earned ? (
                  <Star className="mt-0.5 h-6 w-6 shrink-0 fill-green-500 text-green-600" aria-hidden />
                ) : (
                  <CircleDashed className="mt-0.5 h-6 w-6 shrink-0 text-gray-300" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">{c.label}</p>
                  <p className="text-sm text-gray-600">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* ── The numbers, biggest last because they are supporting evidence. ─ */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-center">
            <p className="text-xs font-semibold uppercase text-gray-600">Jumla ya mapato</p>
            <p className="text-xl font-bold text-green-700">{money(evidence.market.totalIncome)}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-xs font-semibold uppercase text-gray-600">Jumla ya gharama</p>
            <p className="text-xl font-bold text-amber-700">{money(evidence.inputs.totalExpense)}</p>
          </div>
        </div>

        {record.topProduct ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-gray-50 p-3">
            <span className="text-2xl" aria-hidden>{record.topProduct.icon}</span>
            <span className="text-sm text-gray-600">Kitu unachozalisha zaidi:</span>
            <span className="font-bold text-gray-900">
              {num(record.topProduct.amount)} {record.topProduct.unit} {record.topProduct.label.toLowerCase()}
            </span>
          </div>
        ) : null}

        {/* ── Scale + market: what a lender asks next. ───────────────────── */}
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Fact icon={<Tractor className="h-4 w-4" aria-hidden />} label="Mifumo" value={num(record.scale.flocks)} />
          <Fact icon={<Beef className="h-4 w-4" aria-hidden />} label="Wanyama" value={num(record.scale.headCount)} />
          <Fact icon={<Wheat className="h-4 w-4" aria-hidden />} label="Bustani" value={num(record.scale.crops)} />
          <Fact icon={<Users className="h-4 w-4" aria-hidden />} label="Wateja" value={num(evidence.market.sales + evidence.market.deliveries)} />
        </div>

        {/* Output detail — only the lines that apply to this farm. */}
        <div className="flex flex-wrap justify-center gap-2">
          {evidence.output.eggs > 0 ? (
            <StatusChip tone="good" emoji="🥚" label={`${num(evidence.output.eggs)} mayai`} />
          ) : null}
          {evidence.output.milk > 0 ? (
            <StatusChip tone="good" emoji="🥛" label={`${num(evidence.output.milk)} litre`} />
          ) : null}
          {evidence.output.harvestKg > 0 ? (
            <StatusChip tone="good" emoji="🌾" label={`${num(evidence.output.harvestKg)} kg`} />
          ) : null}
          {evidence.output.weightKg > 0 ? (
            <StatusChip tone="good" emoji="🐄" label={`${num(evidence.output.weightKg)} kg`} />
          ) : null}
        </div>

        {evidence.market.buyers.length > 0 ? (
          <div className="rounded-2xl border border-gray-200 p-3">
            <p className="text-xs font-semibold uppercase text-gray-500">Wanunuzi wako</p>
            <p className="mt-1 font-medium text-gray-800">
              {evidence.market.buyers.join(", ")}
            </p>
            {evidence.market.deliveryOwed > 0 ? (
              <StatusChip
                tone="warn"
                emoji="⏳"
                className="mt-2"
                label={`Bado inadaiwa ${money(evidence.market.deliveryOwed)}`}
              />
            ) : null}
          </div>
        ) : null}

        {/* ── Growth. The honest early signal: the record itself improving. ─ */}
        <div className="rounded-2xl bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <TrendingUp
              className={cn("h-5 w-5", trend.recordingImproving ? "text-green-600" : "text-gray-400")}
              aria-hidden
            />
            <p className="text-sm font-medium text-gray-700">
              {trend.recordingImproving
                ? "Rekodi yako inaendelea kuwa kubwa kila mwezi."
                : "Endelea kuandika kila siku ili rekodi yako ikae."}
            </p>
          </div>
          {trend.recentMonths.length > 0 ? (
            <div className="mt-2 flex items-end justify-between gap-1" aria-hidden>
              {trend.recentMonths.map((m) => {
                const max = Math.max(...trend.recentMonths.map((x) => x.daysRecorded), 1);
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-green-400"
                      style={{ height: `${Math.max(4, (m.daysRecorded / max) * 40)}px` }}
                    />
                    <span className="text-[10px] text-gray-500">{m.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {grade.nextStep ? (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Hatua inayofuata</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{grade.nextStep.label}</p>
          </div>
        ) : null}

        {/* ── Hand it over. One tap each. ────────────────────────────────── */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={shareRecord}>
            <Share2 className="h-4 w-4" aria-hidden />
            Tuma
          </Button>
          <Button className="flex-1" onClick={printRecord} disabled={printing}>
            <Printer className="h-4 w-4" aria-hidden />
            Chapisha
          </Button>
        </div>

        {/* No loan promise. Ever. This is the sentence that has to be true. */}
        <p className="flex items-start gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
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
    <div className="rounded-2xl bg-gray-50 p-2">
      <div className="flex items-center justify-center gap-1 text-gray-500">
        {icon}
        <span className="text-[11px] font-semibold uppercase">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

export { STAR_ORDER, STAR_TONE };
export default FarmRecordCard;
