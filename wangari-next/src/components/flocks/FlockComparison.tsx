"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { X, BarChart3, TrendingUp, Heart, DollarSign, Calendar, PawPrint } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import api from "@/lib/api-client";
import { getSpeciesCategories } from "@/lib/species-templates";
import { speciesFor } from "@/lib/species-resolve";

interface FlockComparisonProps {
  flockIds: number[];
  onClose: () => void;
}

interface ComparisonData {
  id: number;
  name: string;
  breed: string;
  type: string;
  category: string;
  initialCount: number;
  currentCount: number;
  mortality: number;
  mortalityRate: number;
  hatchDate: string | null;
  daysSinceStart: number;
  avgProduction: number;
  totalProduction: number;
  totalFeedCost: number;
  totalInvestment: number;
  feedCostPerMonth: number;
  costPerAnimal: number;
  pendingVax: number;
  completedVax: number;
  totalVax: number;
  status: string;
  location: string | null;
  purpose: string | null;
  photoUrl: string | null;
}

function getBestMetric(values: number[], mode: "highest" | "lowest"): number {
  if (values.length === 0) return -1;
  const best = mode === "highest" ? Math.max(...values) : Math.min(...values);
  return values.indexOf(best);
}

export function FlockComparison({ flockIds, onClose }: FlockComparisonProps) {
  const [data, setData] = React.useState<ComparisonData[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const load = async () => {
      try {
        const result = await api.get(`/api/flocks/compare?ids=${flockIds.join(",")}`);
        setData(Array.isArray(result) ? result : []);
      } catch (err) {
        console.error("Failed to load comparison:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [flockIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-200 border-t-emerald-600 animate-spin" />
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-400">Select at least 2 flocks to compare</p>
      </div>
    );
  }

  // Find best metrics for highlighting
  const mortalityIdx = getBestMetric(data.map((d) => d.mortalityRate), "lowest");
  const productionIdx = getBestMetric(data.map((d) => d.avgProduction), "highest");
  const costIdx = getBestMetric(data.map((d) => d.costPerAnimal), "lowest");
  const survivalIdx = getBestMetric(data.map((d) => d.currentCount / Math.max(d.initialCount, 1)), "highest");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              Flock Comparison
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Comparing {data.length} flocks side by side</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Headers */}
          <div className="flex gap-4 mb-6">
            {data.map((flock) => {
              const species = speciesFor(flock);
              return (
                <div key={flock.id} className="flex-1 p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 flex-shrink-0">
                      <PawPrint className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-gray-900 truncate">{flock.name}</h3>
                      <p className="text-[11px] text-gray-400 truncate">{flock.breed || species?.name}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comparison Table */}
          <div className="space-y-1">
            {([
              {
                label: "Status",
                values: data.map((f) => f.status) as any[],
                render: (v: any) => <Badge variant="default" className={v === "active" ? "bg-emerald-50 text-emerald-700" : ""}>{v}</Badge>,
              },
              {
                label: "Current Count",
                values: data.map((f) => f.currentCount),
                render: (v: number) => <span className="font-bold text-gray-900">{v.toLocaleString()}</span>,
                best: getBestMetric(data.map((f) => f.currentCount), "highest"),
              },
              {
                label: "Mortality Rate",
                values: data.map((f) => f.mortalityRate),
                render: (v: number) => <span className={cn("font-bold", v <= 3 ? "text-emerald-700" : v <= 5 ? "text-amber-700" : "text-red-700")}>{v.toFixed(1)}%</span>,
                best: mortalityIdx,
              },
              {
                label: "Days Active",
                values: data.map((f) => f.daysSinceStart),
                render: (v: number) => <span>{v} days</span>,
              },
              {
                label: "Avg Daily Production",
                values: data.map((f) => f.avgProduction),
                render: (v: number) => <span className="font-bold text-emerald-700">{v > 0 ? v.toFixed(0) : "—"}</span>,
                best: productionIdx,
              },
              {
                label: "Total Production",
                values: data.map((f) => f.totalProduction),
                render: (v: number) => <span>{v.toLocaleString()}</span>,
                best: getBestMetric(data.map((f) => f.totalProduction), "highest"),
              },
              {
                label: "Cost per Animal",
                values: data.map((f) => f.costPerAnimal),
                render: (v: number) => <span>{v > 0 ? `KES ${v.toLocaleString()}` : "—"}</span>,
                best: costIdx,
              },
              {
                label: "Total Investment",
                values: data.map((f) => f.totalInvestment),
                render: (v: number) => <span>{v > 0 ? `KES ${v.toLocaleString()}` : "—"}</span>,
              },
              {
                label: "Feed Cost/Month",
                values: data.map((f) => f.feedCostPerMonth),
                render: (v: number) => <span>{v > 0 ? `KES ${v.toLocaleString()}` : "—"}</span>,
              },
              {
                label: "Total Feed Spent",
                values: data.map((f) => f.totalFeedCost),
                render: (v: number) => <span>{v > 0 ? `KES ${v.toLocaleString()}` : "—"}</span>,
              },
              {
                label: "Vaccinations",
                values: data.map((f) => f.completedVax),
                render: (v: number, i: number) => (
                  <span>
                    <span className="text-emerald-600">{data[i].completedVax}</span>
                    <span className="text-gray-400">/{data[i].totalVax}</span>
                    {data[i].pendingVax > 0 && <span className="text-amber-600 ml-1">({data[i].pendingVax} due)</span>}
                  </span>
                ),
              },
              {
                label: "Survival Rate",
                values: data.map((f) => f.currentCount / Math.max(f.initialCount, 1)),
                render: (v: number) => <span className={cn("font-bold", v >= 0.95 ? "text-emerald-700" : v >= 0.9 ? "text-amber-700" : "text-red-700")}>{(v * 100).toFixed(1)}%</span>,
                best: survivalIdx,
              },
            ] as any[]).map((row: any) => (
              <div key={row.label} className="flex gap-4 items-center py-2.5 px-2 rounded-lg hover:bg-gray-50">
                <div className="w-40 text-xs font-semibold text-gray-400 uppercase flex-shrink-0">{row.label}</div>
                {data.map((flock, i) => (
                  <div key={flock.id} className="flex-1 text-sm">
                    {row.render(row.values[i], i)}
                    {row.best === i && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">BEST</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
