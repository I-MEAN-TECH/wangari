"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp, TrendingDown, Calendar, Download, Bird, Leaf } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import api from "@/lib/api-client";

import { speciesFor } from "@/lib/species-resolve";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const scaleIn = { hidden: { opacity: 0, scale: 0.92 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } } };

const GREEN = "#166534";
const LIGHT_GREEN = "#22C55E";
const MUTED = "#94A3B8";
const GRID = "#E5E7EB";

export default function ReportsPage() {
  const [production, setProduction] = React.useState<any[]>([]);
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([api.get("/api/production"), api.get("/api/transactions"), api.get("/api/flocks")])
      .then(([p, t, f]) => { setProduction(p as any[]); setTransactions(t as any[]); setFlocks(f as any[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleExportPDF = () => { window.print(); };

  const handleExportCSV = () => {
    const rows = [["Date", "Output", "Mortality", "Feed (kg)"]];
    prodChart.forEach(d => rows.push([d.date, String(d.output), String(d.mortality), String(d.feed)]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "production_report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#166534]" /></div>;

  // Production by date — aggregate across all species
  const prodByDate: Record<string, { output: number; mortality: number; feed: number }> = {};
  production.forEach((r) => {
    const d = new Date(r.date).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
    if (!prodByDate[d]) prodByDate[d] = { output: 0, mortality: 0, feed: 0 };
    // Aggregate: eggs + milk + weight gain
    prodByDate[d].output += (r.eggsCollected || 0) + Number(r.milkCollected || 0) + Number(r.weightGain || 0);
    prodByDate[d].mortality += r.mortality;
    prodByDate[d].feed += Number(r.feedUsed);
  });
  const prodChart = Object.entries(prodByDate).slice(-14).map(([date, v]) => ({ date, ...v }));

  // Revenue vs Expenses by month
  const txByMonth: Record<string, { income: number; expense: number }> = {};
  transactions.forEach((t: any) => {
    const d = new Date(t.date).toLocaleDateString("en-KE", { month: "short", year: "2-digit" });
    if (!txByMonth[d]) txByMonth[d] = { income: 0, expense: 0 };
    if (t.type === "income") txByMonth[d].income += Number(t.amount);
    else txByMonth[d].expense += Number(t.amount);
  });
  const financeChart = Object.entries(txByMonth).map(([month, v]) => ({ month, ...v }));

  // Expense breakdown
  const catMap: Record<string, number> = {};
  transactions.filter((t: any) => t.type === "expense").forEach((t: any) => {
    const cat = t.category || "Other";
    catMap[cat] = (catMap[cat] || 0) + Number(t.amount);
  });
  const expensePie = Object.entries(catMap).map(([name, value]) => ({ name, value }));

  // Summary stats
  const totalOutput = production.reduce((s, r) => s + (r.eggsCollected || 0) + Number(r.milkCollected || 0) + Number(r.weightGain || 0), 0);
  const totalMortality = production.reduce((s, r) => s + r.mortality, 0);
  const income = transactions.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const expenses = transactions.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalAnimals = flocks.reduce((s, f) => s + (f.currentCount || 0), 0);
  const mortalityRate = totalAnimals > 0 ? ((totalMortality / (totalAnimals + totalMortality)) * 100).toFixed(1) : "0";

  // Species breakdown
  const speciesMap: Record<string, { count: number; name: string }> = {};
  flocks.forEach((f: any) => {
    const sp = speciesFor(f);
    const cat = sp?.category || "other";
    if (!speciesMap[cat]) speciesMap[cat] = { count: 0, name: cat.charAt(0).toUpperCase() + cat.slice(1) };
    speciesMap[cat].count += f.currentCount || 0;
  });
  const speciesPie = Object.values(speciesMap).map(s => ({ name: s.name, value: s.count }));

  // Production by species
  const prodBySpecies: Record<string, number> = {};
  production.forEach((r) => {
    const sp = r.flock ? speciesFor(r.flock) : null;
    const cat = sp?.category || "other";
    prodBySpecies[cat] = (prodBySpecies[cat] || 0) + (r.eggsCollected || 0) + Number(r.milkCollected || 0) + Number(r.weightGain || 0);
  });

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Reports</h1>
          <p className="text-sm text-[#64748B] mt-1">Analytics across all your farm operations.</p>
        </div>
        <div className="flex gap-2 no-print">
          <Button onClick={handleExportPDF} variant="outline" className="border-[#E5E7EB] hover:bg-[#F0FDF4] hover:border-[#BBF7D0] cursor-pointer">
            <Download className="h-4 w-4 mr-2" /> Export PDF
          </Button>
          <Button onClick={handleExportCSV} variant="outline" className="border-[#E5E7EB] hover:bg-[#F0FDF4] hover:border-[#BBF7D0] cursor-pointer">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Output", value: totalOutput.toLocaleString(), icon: <TrendingUp className="h-5 w-5" /> },
          { title: "Mortality Rate", value: mortalityRate + "%", icon: <TrendingDown className="h-5 w-5" /> },
          { title: "Total Revenue", value: "KES " + income.toLocaleString(), icon: <TrendingUp className="h-5 w-5" /> },
          { title: "Total Expenses", value: "KES " + expenses.toLocaleString(), icon: <TrendingDown className="h-5 w-5" /> },
        ].map((kpi) => (
          <motion.div key={kpi.title} variants={scaleIn} whileHover={{ y: -4, scale: 1.02 }}>
            <Card className="border border-[#E5E7EB] hover:shadow-lg hover:border-[#BBF7D0] transition-all duration-300">
              <CardContent className="pt-6 pb-4 px-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4EA] text-[#166534] mb-3">{kpi.icon}</div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] mb-1">{kpi.title}</p>
                <p className="text-2xl font-extrabold text-[#0F172A] tracking-tight">{kpi.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-[#E5E7EB] hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#166534]" />
                <CardTitle className="text-base font-bold">Production Trend</CardTitle>
              </div>
              <p className="text-xs text-[#94A3B8]">Last 14 days — all species combined</p>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={prodChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUTED }} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />
                  <Area type="monotone" dataKey="output" stroke={GREEN} fill={GREEN} fillOpacity={0.1} strokeWidth={2} name="Output" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-[#E5E7EB] hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#166534]" />
                <CardTitle className="text-base font-bold">Revenue vs Expenses</CardTitle>
              </div>
              <p className="text-xs text-[#94A3B8]">By month</p>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={financeChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: MUTED }} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />
                  <Bar dataKey="income" fill={GREEN} radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expense" fill={MUTED} radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-[#E5E7EB] hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-[#166534]" />
                <CardTitle className="text-base font-bold">Mortality Trend</CardTitle>
              </div>
              <p className="text-xs text-[#94A3B8]">Daily count</p>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={prodChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUTED }} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />
                  <Line type="monotone" dataKey="mortality" stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: "#EF4444" }} name="Mortality" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-[#E5E7EB] hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#166534]" />
                <CardTitle className="text-base font-bold">Livestock by Species</CardTitle>
              </div>
              <p className="text-xs text-[#94A3B8]">Animal count breakdown</p>
            </CardHeader>
            <CardContent className="pt-2">
              {speciesPie.length === 0 ? (
                <div className="flex items-center justify-center h-[250px] text-sm text-[#94A3B8]">No livestock yet</div>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie data={speciesPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} strokeWidth={2} stroke="#fff">
                        {speciesPie.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? GREEN : i === 1 ? LIGHT_GREEN : i === 2 ? "#86EFAC" : MUTED} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {speciesPie.map((e, i) => (
                      <div key={e.name} className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ background: [GREEN, LIGHT_GREEN, "#86EFAC", MUTED][i] }} />
                        <span className="text-xs text-[#64748B]">{e.name}</span>
                        <span className="text-xs font-bold text-[#0F172A]">{e.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Expense Breakdown + Feed */}
      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-[#E5E7EB] hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#166534]" />
                <CardTitle className="text-base font-bold">Expense Breakdown</CardTitle>
              </div>
              <p className="text-xs text-[#94A3B8]">By category</p>
            </CardHeader>
            <CardContent className="pt-2">
              {expensePie.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-sm text-[#94A3B8]">No expense data yet</div>
              ) : (
                <div className="space-y-2">
                  {expensePie.sort((a, b) => b.value - a.value).slice(0, 6).map((e, i) => (
                    <div key={e.name} className="flex items-center gap-3">
                      <div className="h-2.5 rounded-full" style={{ background: [GREEN, LIGHT_GREEN, "#86EFAC", MUTED, "#CBD5E1", "#F1F5F9"][i], width: `${Math.min((e.value / Math.max(...expensePie.map(x => x.value))) * 100, 100)}%` }} />
                      <span className="text-xs text-[#64748B] flex-shrink-0">{e.name}</span>
                      <span className="text-xs font-bold text-[#0F172A] ml-auto">KES {e.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-[#E5E7EB] hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#166534]" />
                <CardTitle className="text-base font-bold">Feed Consumption</CardTitle>
              </div>
              <p className="text-xs text-[#94A3B8]">Daily usage in kg</p>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={prodChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUTED }} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />
                  <Bar dataKey="feed" fill={GREEN} radius={[4, 4, 0, 0]} name="Feed (kg)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
