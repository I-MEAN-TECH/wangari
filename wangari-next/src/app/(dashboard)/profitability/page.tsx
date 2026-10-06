"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, TrendingDown, Wheat, RefreshCw, Info } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

interface Row {
  id: string; kind: "flock" | "crop" | "general"; name: string; sub: string;
  species?: string | null; category?: string | null; cropType?: string | null;
  revenue: number; costs: number; feedCost: number; profit: number;
  margin: number | null; feedEfficiency: number | null; outputKg: number;
  outputUnits: number; unit: string | null; costPerUnit: number | null;
  /** M4 — cost vs price, side by side. Null when the row has no unit. */
  economics: Economics | null;
  marketRef: { commodity: string; region: string | null; source: string | null; ageLabel: string; stale: boolean } | null;
}

interface Economics {
  verdict: "profitable" | "thin" | "losing" | "no-cost" | "no-price";
  priceSource: "own" | "market" | null;
  ownPricePerUnit: number | null;
  marketPricePerUnit: number | null;
  profitPerUnit: number | null;
  costPerUnit: number | null;
  pricePerUnit: number | null;
  headline: string;
  detail: string;
}

/** Verdict → colour. The farmer reads the chip before the sentence (R2). */
const VERDICTS: Record<Economics["verdict"], { label: string; chip: string; text: string }> = {
  profitable: { label: "Making money", chip: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  thin: { label: "Thin margin", chip: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  losing: { label: "Losing money", chip: "bg-red-100 text-red-700", text: "text-red-600" },
  "no-cost": { label: "No cost data", chip: "bg-gray-100 text-gray-600", text: "text-gray-700" },
  "no-price": { label: "No price data", chip: "bg-sky-100 text-sky-700", text: "text-sky-700" },
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// Icon per REAL animal/plant type — not a generic hen for everything.
// Flocks carry their species (layers, cattle_dairy, goats…), crops their type.
const SPECIES_ICON: Record<string, string> = {
  layers: "🐔",
  broilers: "🍗",
  kienyeji: "🐔",
  poultry: "🐔",
  cattle_dairy: "🐄",
  cattle_beef: "🐮",
  cattle: "🐄",
  livestock: "🐄",
  goats: "🐐",
  sheep: "🐏",
  pigs: "🐖",
  rabbits: "🐇",
  fish: "🐟",
  aquaculture: "🐟",
  bees: "🐝",
  other: "🐾",
};
const CROP_ICON: Record<string, string> = {
  maize: "🌽",
  beans: "🫘",
  tomatoes: "🍅",
  kale: "🥬",
  cabbage: "🥬",
  onions: "🧅",
  potatoes: "🥔",
  watermelon: "🍉",
  avocado: "🥑",
  mango: "🥭",
  coffee: "☕",
};

function rowIcon(r: Row): string {
  if (r.kind === "flock") return SPECIES_ICON[r.species || ""] || SPECIES_ICON[r.category || ""] || "🐾";
  if (r.kind === "crop") {
    const ct = (r.cropType || "").toLowerCase();
    const key = Object.keys(CROP_ICON).find((k) => ct.includes(k));
    return key ? CROP_ICON[key] : "🌾";
  }
  return "🏡";
}
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
  // M4: enterprises that can honestly show a cost-vs-price row (they produced
  // something, so there is a per-unit denominator at all).
  const priceRows = enterprises.filter(r => r.economics && r.outputUnits > 0);
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

      {/* M4 — cost of production vs price, side by side */}
      {!loading && priceRows.length > 0 && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-gray-200 overflow-hidden">
            <CardContent className="p-0">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-black text-gray-900">Cost of production vs price</p>
                <p className="flex items-center gap-1 text-[10px] text-gray-400"><Info className="h-3 w-3" /> What one unit costs you, earns you, and fetches</p>
              </div>
              <div className="divide-y divide-gray-100">
                {priceRows.map((r) => {
                  const e = r.economics!;
                  const v = VERDICTS[e.verdict];
                  const u = r.unit === "egg" ? "egg" : r.unit === "litre" ? "litre" : r.unit ?? "unit";
                  const col = (label: string, value: number | null, note: string) => (
                    <div className="rounded-xl bg-gray-50 px-2 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">{label}</p>
                      <p className="mt-0.5 text-sm font-black text-gray-900">{value !== null ? KES(r2(value)) : "—"}</p>
                      <p className="text-[9px] leading-tight text-gray-400">{note}</p>
                    </div>
                  );
                  return (
                    <div key={r.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg" title={r.species || r.cropType || r.kind}>{rowIcon(r)}</span>
                        <p className="text-sm font-extrabold text-gray-900">{r.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${v.chip}`}>{v.label}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        {col("Cost to make", e.costPerUnit !== null && e.costPerUnit > 0 ? e.costPerUnit : null, `per ${u} · your records`)}
                        {col("You earn", e.ownPricePerUnit, `per ${u} · your books`)}
                        {col("County pays", e.marketPricePerUnit, r.marketRef ? `${r.marketRef.region ?? "national"} · ${r.marketRef.ageLabel}` : `per ${u} · no reference yet`)}
                      </div>
                      <p className={`mt-2.5 text-sm font-extrabold ${v.text}`}>{e.headline}</p>
                      <p className="text-xs leading-relaxed text-gray-500">{e.detail}</p>
                      {!r.marketRef && (
                        <Link href="/market-prices" className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-wangari-green-50 px-2.5 py-1.5 text-[11px] font-bold text-wangari-green-800 hover:bg-wangari-green-100 transition-colors">
                          Record the price you're offered <TrendingUp className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
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
                      <div className="hidden sm:block text-xl" title={r.species || r.cropType || r.kind}>{rowIcon(r)}</div>
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
