"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  CalendarCheck,
  CalendarRange,
  TrendingUp,
  Wallet,
  Tractor,
  Egg,
  Milk,
  Wheat,
  Beef,
  Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { financesSeries } from "@/lib/chart-series";
import { THEME } from "@/lib/theme-palette";
import type { FarmRecordResponse } from "@/components/farm-record/FarmRecordCard";

/**
 * FarmRecordSummary — the on-screen half of My Farm Record.
 *
 * ── Why the record needed a visual layer ───────────────────────────────────
 * The card below is the artefact a farmer HANDS OVER, and it is deliberately a
 * document: no axes, no charts, nothing to interpret. That is right for paper
 * and wrong for the phone. On screen the farmer needs the opposite — see at a
 * glance whether the work is building, which months were thin, and whether
 * money is going up — because that is what makes them keep recording.
 *
 * So this layer is additive, never a replacement: it sits ABOVE the card,
 * is marked `no-print`, and changes nothing about what the printed record says.
 * Print stays a document; the screen becomes a dashboard.
 *
 * ── Two honesty rules carried over from the card ───────────────────────────
 *  - A month with no records is drawn at zero rather than skipped. A gap is
 *    information; a chart that closes over it flatters.
 *  - Where the record is too short to grade, the star strip is not drawn at
 *    all (see FarmRecordCard) — the summary does the same, rather than showing
 *    an empty row that reads like failure.
 */

const money = (n: number) => `KES ${Math.round(Number(n) || 0).toLocaleString("en-KE")}`;
const num = (n: number) => Math.round(Number(n) || 0).toLocaleString("en-KE");

const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } };

const OUTPUT_ICON = { eggs: Egg, milk: Milk, harvest: Wheat, livestock: Beef } as const;

function Kpi({ title, value, sub, icon }: { title: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card className="border border-wangari-border hover:shadow-lg hover:border-wangari-green-200 transition-all duration-300">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mb-3">
          {icon}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-wangari-muted mb-1">{title}</p>
        <p className="text-2xl font-extrabold text-wangari-heading tracking-tight">{value}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-wangari-subtle">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

export function FarmRecordSummary({ record }: { record: FarmRecordResponse }) {
  const { period, evidence, scale, trend, topProduct, grade } = record;

  const months = (trend?.recentMonths ?? []).map((m) => ({
    month: m.month,
    income: Number(m.income) || 0,
    expense: Number(m.expense) || 0,
    days: Number(m.daysRecorded) || 0,
  }));

  const hasFinanceData = months.some((m) => m.income > 0 || m.expense > 0);
  const hasDayData = months.some((m) => m.days > 0);

  const TopIcon = topProduct ? OUTPUT_ICON[topProduct.icon] ?? Wheat : Wheat;

  const kpis = [
    {
      title: "Days recorded",
      value: num(evidence.activity.daysRecorded),
      sub: `in the last ${evidence.activity.windowDays} days`,
      icon: <CalendarCheck className="h-5 w-5" />,
    },
    {
      title: "Months with records",
      value: num(period.monthsWithRecords),
      sub: period.recordSpanDays > 0 ? `over ${num(period.recordSpanDays)} days` : "just getting started",
      icon: <CalendarRange className="h-5 w-5" />,
    },
    {
      title: "Money in",
      value: money(evidence.market.totalIncome),
      sub: `${num(evidence.market.sales)} sales · ${num(evidence.market.deliveries)} deliveries`,
      icon: <TrendingUp className="h-5 w-5" />,
    },
    {
      title: "Money out",
      value: money(evidence.inputs.totalExpense),
      sub: `${num(evidence.inputs.records)} input records`,
      icon: <Wallet className="h-5 w-5" />,
    },
  ];

  const scaleItems = [
    { label: "Animal groups", value: num(scale.flocks) },
    { label: "Animals", value: num(scale.headCount) },
    { label: "Crops", value: num(scale.crops) },
    { label: "Acres", value: Number(scale.totalAreaAcres || 0).toFixed(1) },
  ];

  return (
    // `no-print`: this is the screen view. The paper version is the card below.
    <div className="no-print space-y-5">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <Kpi key={k.title} title={k.title} value={k.value} sub={k.sub} icon={k.icon} />
          ))}
        </div>
      </motion.div>

      {/* What the farm is, and what it produces most — both read as cards, not tables. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border border-wangari-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-wangari-heading">
              <Tractor className="h-4 w-4 text-wangari-green-800" />
              What you farm
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {scaleItems.map((s) => (
                <div key={s.label} className="rounded-xl bg-wangari-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-wangari-muted">{s.label}</p>
                  <p className="text-lg font-bold text-wangari-heading">{s.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-wangari-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-wangari-heading">
              <TopIcon className="h-4 w-4 text-wangari-green-800" />
              Your biggest output
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topProduct ? (
              <div className="rounded-xl bg-tone-good-bg p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-wangari-muted">{topProduct.label}</p>
                <p className="text-2xl font-extrabold text-wangari-green-800">
                  {num(topProduct.amount)} <span className="text-sm font-bold">{topProduct.unit}</span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-wangari-muted">
                No output recorded yet — log a day of production and it will appear here.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-wangari-gray-50 p-2">
                <p className="text-[10px] text-wangari-subtle">Eggs</p>
                <p className="text-sm font-bold">{num(evidence.output.eggs)}</p>
              </div>
              <div className="rounded-lg bg-wangari-gray-50 p-2">
                <p className="text-[10px] text-wangari-subtle">Milk (L)</p>
                <p className="text-sm font-bold">{num(evidence.output.milk)}</p>
              </div>
              <div className="rounded-lg bg-wangari-gray-50 p-2">
                <p className="text-[10px] text-wangari-subtle">Harvest (kg)</p>
                <p className="text-sm font-bold">{num(evidence.output.harvestKg)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-wangari-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-wangari-heading">Money in and out, month by month</CardTitle>
          </CardHeader>
          <CardContent>
            {hasFinanceData ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {/* var() is invalid in SVG presentation attributes, so chart axes and
                      grids read the JS mirror of @theme (see lib/theme-palette.ts). */}
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME["wangari-border"]} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: THEME["wangari-subtle"] }} />
                  <YAxis tick={{ fontSize: 11, fill: THEME["wangari-subtle"] }} width={56} />
                  <Tooltip formatter={(v: any) => money(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="income" name="Money in" fill={financesSeries[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Money out" fill={financesSeries[6] ?? financesSeries[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-xs text-wangari-muted">
                No money recorded yet. When you log a sale or an expense it will show here month by month.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border border-wangari-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-wangari-heading">Days you recorded each month</CardTitle>
            <p className="text-xs text-wangari-muted">A gap is a month with nothing written down — shown honestly.</p>
          </CardHeader>
          <CardContent>
            {hasDayData ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME["wangari-border"]} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: THEME["wangari-subtle"] }} />
                  <YAxis tick={{ fontSize: 11, fill: THEME["wangari-subtle"] }} width={40} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="days"
                    name="Days recorded"
                    stroke={financesSeries[0]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-xs text-wangari-muted">
                Nothing recorded yet. Your first day of records starts this line.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* The five criteria, as chips. Only shown once the record can carry a grade —
          the same rule the printed card follows. */}
      {grade.graded && (
        <Card className="border border-wangari-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-wangari-heading">
              <Star className="h-4 w-4 text-wangari-amber-500" />
              What a lender looks for
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {grade.criteria.map((c) => (
                <div key={c.id} className="rounded-xl border border-wangari-border p-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.earned
                        ? "bg-tone-good-bg text-wangari-green-800"
                        : "bg-wangari-gray-100 text-wangari-muted"
                    }`}
                  >
                    {c.earned ? "Met" : "Not yet"}
                  </span>
                  <p className="mt-1 text-xs font-bold text-wangari-heading">{c.label}</p>
                  <p className="mt-0.5 text-[11px] text-wangari-muted">{c.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
