"use client";

import * as React from "react";
import { Printer, Building2, CalendarRange, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { FarmRecordResponse } from "./FarmRecordCard";

/**
 * LenderBrief — the SAME record, framed for the person who assesses credit.
 *
 * ── Why a second template ──────────────────────────────────────────────────
 * A SACCO clerk or AFC agent is a different reader from a farmer. They are
 * looking for four specific things (research, Oct 2026): an activity history,
 * input and procurement evidence, yield, and proof that a real buyer pays.
 * They also want the caveats — how long the record actually is.
 *
 * So the farmer's card stays big, icon-first and jargon-free, and this one is
 * denser and states the limits plainly. Same data, two readers.
 *
 * ── What it deliberately does NOT do ───────────────────────────────────────
 * It does not estimate a loan amount, suggest a rate, or predict approval.
 * Wangari is the proof layer; the credit decision belongs to the lender. A
 * number we invented would be the easiest thing in the app to be wrong about,
 * and the most damaging.
 */

const money = (n: number) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;

export function LenderBrief({ record }: { record: FarmRecordResponse }) {
  const [printing, setPrinting] = React.useState(false);
  const { farm, period, evidence, grade, trend } = record;

  const print = () => {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 500);
  };

  return (
    <Card className="border-gray-300">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Building2 className="h-5 w-5 text-gray-500" aria-hidden />
              Operational history — for assessment
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {farm.name}
              {farm.owner ? ` · ${farm.owner}` : ""}
              {farm.county ? ` · ${farm.county}` : ""}
              {farm.code ? ` · code ${farm.code}` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={print} disabled={printing}>
            <Printer className="h-4 w-4" aria-hidden />
            Print
          </Button>
        </div>

        {/* The caveats go FIRST. An assessor needs the limits before the figures. */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Scope and limits</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              Record spans <strong>{period.recordSpanDays} days</strong> ({period.recordMonths}{" "}
              months), {period.firstRecord} to {period.lastRecord}.
            </li>
            <li>
              Farmer self-recorded via Wangari. Figures are as entered, not
              independently audited.
            </li>
            <li>
              {evidence.activity.daysRecorded} of {evidence.activity.windowDays} recent days
              have a production or harvest entry.
            </li>
            <li>Wangari does not assess creditworthiness or recommend a loan.</li>
          </ul>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Panel title="1. Activity">
            <Row k="Days with production/harvest" v={`${evidence.activity.daysRecorded} / ${evidence.activity.windowDays}`} />
            <Row k="Production records (90d)" v={String(evidence.activity.daysRecorded)} />
            <Row k="Crop applications" v={String(evidence.inputs.applications)} />
            <Row k="Worker attendance days" v={String(evidence.labour.daysWithAttendance)} />
            <Row k="Flocks / head" v={`${record.scale.flocks} / ${record.scale.headCount}`} />
            <Row k="Crops / area" v={`${record.scale.crops} / ${record.scale.totalAreaAcres} acres`} />
            <Row k="ANITRAC-tagged animals" v={String(record.scale.taggedAnimals)} />
          </Panel>

          <Panel title="2. Inputs and procurement">
            <Row k="Expense entries" v={String(evidence.inputs.records)} />
            <Row k="Total recorded spend" v={money(evidence.inputs.totalExpense)} />
            <Row k="Spend in last 90 days" v={money(evidence.inputs.windowExpense)} />
            <Row k="Input application cost" v={money(evidence.inputs.inputApplicationCost)} />
          </Panel>

          <Panel title="3. Yield">
            <Row k="Eggs" v={evidence.output.eggs.toLocaleString()} />
            <Row k="Milk (litres)" v={evidence.output.milk.toLocaleString()} />
            <Row k="Harvest (kg)" v={evidence.output.harvestKg.toLocaleString()} />
            <Row k="Weight gain (kg)" v={evidence.output.weightKg.toLocaleString()} />
            <Row k="Mortality recorded" v={evidence.output.mortality.toLocaleString()} />
          </Panel>

          <Panel title="4. Market linkage">
            <Row k="Sales recorded" v={String(evidence.market.sales)} />
            <Row k="Deliveries recorded" v={String(evidence.market.deliveries)} />
            <Row k="Named buyers" v={evidence.market.buyers.join(", ") || "—"} />
            <Row k="Total income" v={money(evidence.market.totalIncome)} />
            <Row k="Income in last 90 days" v={money(evidence.market.windowIncome)} />
            <Row
              k="Outstanding from buyers"
              v={money(evidence.market.deliveryOwed)}
              tone={evidence.market.deliveryOwed > 0 ? "warn" : "good"}
            />
          </Panel>
        </div>

        {/* Criteria as a checklist an assessor can scan in seconds. */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Record completeness ({grade.stars}/{grade.maxStars})
          </h3>
          <ul className="mt-2 space-y-1">
            {grade.criteria.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.earned ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" aria-hidden />
                )}
                <span>
                  <strong>{c.label}</strong> — {c.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Is the record itself improving? For an early-stage borrower this
            matters more than any single month's figure. */}
        {trend.recentMonths.length > 0 ? (
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500">
              <CalendarRange className="h-4 w-4" aria-hidden />
              Monthly record
            </h3>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="py-1">Month</th>
                  <th className="py-1 text-right">Days</th>
                  <th className="py-1 text-right">Income</th>
                  <th className="py-1 text-right">Expense</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {trend.recentMonths.map((m) => (
                  <tr key={m.month} className="border-b last:border-0">
                    <td className="py-1">{m.month}</td>
                    <td className="py-1 text-right">{m.daysRecorded}</td>
                    <td className="py-1 text-right">{money(m.income)}</td>
                    <td className="py-1 text-right">{money(m.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
              <TrendingUp
                className={`h-4 w-4 ${trend.recordingImproving ? "text-green-600" : "text-gray-400"}`}
                aria-hidden
              />
              {trend.recordingImproving
                ? "Recording frequency is increasing month on month."
                : "Recording frequency is flat or declining."}
            </p>
          </div>
        ) : null}

        {/* Print-only attestation block — no signature is forged, and none is
            required: the farmer is attesting, not Wangari guaranteeing. */}
        <div className="hidden print:block">
          <hr className="my-4" />
          <div className="flex justify-between text-xs">
            <div>
              <p className="font-semibold">Farmer attestation</p>
              <p>I confirm these records were entered by me or on my behalf.</p>
              <p className="mt-6">____________________________</p>
              <p>{farm.owner || ""} · {farm.name}</p>
            </div>
            <div>
              <p className="font-semibold">Generated</p>
              <p>{new Date(record.generatedAt).toLocaleString("en-KE")}</p>
              <p className="mt-6">____________________________</p>
              <p>Assessor</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-3">
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      <dl className="mt-1 space-y-0.5">{children}</dl>
    </div>
  );
}

function Row({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <dt className="text-gray-600">{k}</dt>
      <dd
        className={`text-right font-medium ${
          tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-700" : "text-gray-900"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

export default LenderBrief;
