"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, TrendingDown, Wheat, RefreshCw, Info } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

interface Row {
  id: string; kind: "flock" | "crop" | "general"; name: string; sub: string;
  revenue: number; costs: number; feedCost: number; profit: number;
  margin: number | null; feedEfficiency: number | null; outputKg: number;
}

const KIND_ICON: Record<string, string> = { flock: "🐔", crop: "🌾", general: "🏡" };
const KES = (n: number) => "KES " + n.toLocaleString();

export default function ProfitabilityPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [summary, setSummary] = React.useState({ totalRevenue: 0, totalCosts: 0, totalProfit: 0 });
  const [days, setDays] = React.useState(90);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback((period: number) => {
    setLoading(true);
    import("@/lib/api-client").then(({ default: api }) =>
      api.get(`/api/profitability?days=${period}`)
        .then((d: any) => { setRows(d.rows || []); setSummary(d.summary); })
        .catch(() => {})
        .finally(() => setLoading(false))
    );
  }, []);

  React.useEffect(() => { load(days); }, [days, load]);

  const enterprises = rows.filter(r => r.kind !== "general");
  const general = rows.find(r => r.kind === "general");
  const best = enterprises[0];
  const worst = enterprises.length > 1 ? enterprises[enterprises.length - 1] : null;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader
          title="Profitability Scoreboard"
          description="Which flock, block or pond actually makes money — ranked by real profit from your own records"
          action={
            <div className="flex gap-1.5">
              {[30, 90, 365].map(d => (
                <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}
                  className={`cursor-pointer ${days === d ? "bg-[#166534] hover:bg-[#14532D]" : ""}`}>
                  {d === 30 ? "30d" : d === 90 ? "90d" : "1yr"}
                </Button>
              ))}
            </div>
          }
        />
      </motion.div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Revenue</p>
          <p className="mt-1 text-lg font-black text-gray-900">{loading ? "…" : KES(summary.totalRevenue)}</p>
        </motion.div>
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Costs</p>
          <p className="mt-1 text-lg font-black text-gray-900">{loading ? "…" : KES(summary.totalCosts)}</p>
        </motion.div>
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className={`rounded-2xl border p-4 ${summary.totalProfit >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Net profit</p>
          <p className={`mt-1 text-lg font-black ${summary.totalProfit >= 0 ? "text-emerald-800" : "text-red-700"}`}>{loading ? "…" : KES(summary.totalProfit)}</p>
        </motion.div>
      </div>

      {/* Podium insights */}
      {!loading && best && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-amber-500 shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Most profitable</p>
              <p className="text-sm font-extrabold text-emerald-900">{best.name} — {KES(best.profit)} net</p>
              {best.margin != null && <p className="text-xs text-emerald-700">{best.margin}% margin{best.feedEfficiency ? ` · KES ${best.feedEfficiency} earned per KES 1 of feed` : ""}</p>}
            </div>
          </div>
          {worst && worst.profit < 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-red-500 shrink-0" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-red-700">Losing money</p>
                <p className="text-sm font-extrabold text-red-900">{worst.name} — {KES(worst.profit)} net</p>
                <p className="text-xs text-red-700">Costs {KES(worst.costs)} vs revenue {KES(worst.revenue)}. Fix it or cut it.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ranked table */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border border-gray-200 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-black text-gray-900">Every enterprise, ranked</p>
              <p className="flex items-center gap-1 text-[10px] text-gray-400"><Info className="h-3 w-3" /> From your own sales & expense records</p>
            </div>
            {loading ? (
              <div className="p-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#166534] mx-auto" /></div>
            ) : enterprises.length === 0 ? (
              <div className="p-10 text-center">
                <TrendingUp className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-bold text-gray-900">Not enough data yet</p>
                <p className="text-xs text-gray-500 mt-1">Record sales and expenses tagged to your flocks and crops — the scoreboard fills in as you work.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {enterprises.map((r, i) => {
                  const profitPositive = r.profit >= 0;
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${i === 0 ? "bg-amber-100 text-amber-700" : i === enterprises.length - 1 && !profitPositive ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                        {i + 1}
                      </div>
                      <div className="hidden sm:block text-xl">{KIND_ICON[r.kind]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-gray-900 truncate">{r.name}</p>
                        <p className="text-[11px] text-gray-400 capitalize">
                          {r.sub || r.kind}
                          {r.outputKg > 0 && <> · {r.outputKg.toLocaleString()} kg output</>}
                          {r.feedCost > 0 && <> · feed {KES(r.feedCost)}</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
                          {profitPositive ? "+" : ""}{KES(r.profit)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {r.margin != null ? `${r.margin}% margin` : `rev ${KES(r.revenue)}`}
                          {r.feedEfficiency != null && <> · {r.feedEfficiency}× on feed</>}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {general && (general.revenue > 0 || general.costs > 0) && (
                  <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/80 border-t-2 border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-500">Untagged (whole-farm) transactions</p>
                      <p className="text-[10px] text-gray-400">Tag sales/expense descriptions with flock or crop names to attribute them.</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold ${general.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{KES(general.profit)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-wangari-subtle">
        <Wheat className="h-3 w-3" /> "× on feed" = revenue earned per KES 1 of feed spent — the single best efficiency lens for livestock.
      </p>
    </div>
  );
}
