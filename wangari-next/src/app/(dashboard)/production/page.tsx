"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Egg, Milk, Beef, Wheat, AlertTriangle, TrendingUp, Plus, X, Search, Leaf, ChevronRight, Check, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import Link from "next/link";
import { speciesTemplates } from "@/lib/species-templates";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

function getSpeciesInfo(type: string | null) {
  if (!type) return { label: "birds", metric: "eggs", icon: Egg, unit: "eggs" };
  const t = speciesTemplates[type];
  if (!t) return { label: "animals", metric: "output", icon: Beef, unit: "units" };
  if (t.category === "poultry") return { label: "birds", metric: "eggs", icon: Egg, unit: "eggs" };
  if (t.category === "aquaculture") return { label: "fish", metric: "weight", icon: Beef, unit: "kg" };
  if (t.name.toLowerCase().includes("dairy")) return { label: "cattle", metric: "milk", icon: Milk, unit: "litres" };
  return { label: "animals", metric: "weight", icon: Beef, unit: "kg" };
}

export default function ProductionPage() {
  const [records, setRecords] = React.useState<any[]>([]);
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { showToast, ToastComponent } = useToast();

  // Step-by-step form
  const [step, setStep] = React.useState(0); // 0=select flock, 1=enter data, 2=confirm
  const [form, setForm] = React.useState({ flockId: "", eggsCollected: "", milkCollected: "", avgWeight: "", weightGain: "", feedUsed: "", mortality: "", notes: "" });

  const load = () => {
    Promise.all([api.get("/api/production"), api.get("/api/flocks")])
      .then(([p, f]) => { setRecords(Array.isArray(p) ? p : []); setFlocks(Array.isArray(f) ? f : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const selectedFlock = flocks.find((f: any) => f.id === Number(form.flockId));
  const info = getSpeciesInfo(selectedFlock?.type || null);

  const resetForm = () => {
    setForm({ flockId: "", eggsCollected: "", milkCollected: "", avgWeight: "", weightGain: "", feedUsed: "", mortality: "", notes: "" });
    setStep(0);
    setShowForm(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this production record?")) return;
    await api.delete("/api/production/" + id);
    showToast("Record deleted!");
    load();
  };

  const handleSubmit = async () => {
    const payload: any = {
      flockId: Number(form.flockId) || null,
      date: new Date().toISOString().split("T")[0], // upsert key — server rejects records without it
      eggsCollected: info.metric === "eggs" ? Number(form.eggsCollected || 0) : 0,
      milkCollected: info.metric === "milk" ? Number(form.milkCollected || 0) : 0,
      avgWeight: info.metric === "weight" && form.avgWeight ? Number(form.avgWeight) : null,
      weightGain: info.metric === "weight" && form.weightGain ? Number(form.weightGain) : null,
      feedUsed: Number(form.feedUsed || 0),
      mortality: Number(form.mortality || 0),
      notes: form.notes,
    };
    try {
      await api.post("/api/production", payload);
      resetForm();
      showToast("Production recorded!");
      load();
    } catch (err: any) {
      console.error("Save record failed:", err);
      showToast(err?.message || "Could not save the record — please try again");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#166534]" /></div>;

  const totalOutput = records.reduce((s, r) => s + (info.metric === "milk" ? Number(r.milkCollected) : info.metric === "weight" ? Number(r.weightGain || 0) : r.eggsCollected || 0), 0);
  const totalMortality = records.reduce((s, r) => s + r.mortality, 0);
  const totalFeed = records.reduce((s, r) => s + Number(r.feedUsed), 0);
  const avgDaily = records.length ? Math.round(totalOutput / records.length) : 0;

  const kpis = [
    { title: `Total ${info.unit}`, value: info.metric === "milk" ? `${totalOutput.toFixed(1)}L` : info.metric === "weight" ? `${totalOutput.toFixed(1)}kg` : totalOutput.toLocaleString(), icon: <info.icon className="h-5 w-5" /> },
    { title: "Avg Daily", value: info.metric === "milk" ? `${avgDaily.toFixed(1)}L` : info.metric === "weight" ? `${avgDaily.toFixed(1)}kg` : String(avgDaily), icon: <TrendingUp className="h-5 w-5" /> },
    { title: "Total Feed", value: `${totalFeed.toFixed(0)} kg`, icon: <Wheat className="h-5 w-5" /> },
    { title: "Mortality", value: String(totalMortality), icon: <AlertTriangle className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Production" description="Track daily output for all your farm groups"
          action={<Button onClick={() => { setShowForm(true); setStep(0); }} className="bg-[#166534] hover:bg-[#14532D] cursor-pointer font-bold"><Plus className="h-4 w-4 mr-2" />Log Production</Button>}
        />
      </motion.div>

      {/* Step-by-step form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border border-[#E5E7EB] hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-6">
                  {["Select Group", "Enter Data", "Review"].map((label, i) => (
                    <React.Fragment key={label}>
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${i <= step ? "text-[#166534]" : "text-gray-300"}`}>
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i < step ? "bg-[#166534] text-white" : i === step ? "bg-[#166534] text-white" : "bg-gray-100 text-gray-400"}`}>
                          {i < step ? <Check className="h-3 w-3" /> : i + 1}
                        </div>
                        {label}
                      </div>
                      {i < 2 && <div className={`flex-1 h-0.5 rounded ${i < step ? "bg-[#166534]" : "bg-gray-100"}`} />}
                    </React.Fragment>
                  ))}
                  <button onClick={resetForm} className="ml-auto text-[#94A3B8] hover:text-[#64748B] cursor-pointer"><X className="h-4 w-4" /></button>
                </div>

                {/* Step 0: Select Group */}
                {step === 0 && (
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-3">Which group are you recording for?</p>
                    
                    {flocks.length === 0 ? (
                      <div className="text-center py-6 px-4 bg-[#F8FAFC] rounded-2xl border border-dashed border-[#E5E7EB] space-y-3">
                        <p className="text-sm font-bold text-[#0F172A]">No Animal Groups Created Yet</p>
                        <p className="text-xs text-[#64748B]">Create an animal or poultry group first to track group production.</p>
                        <div className="flex justify-center gap-2 pt-1">
                          <Link href="/flocks">
                            <Button className="bg-[#166534] hover:bg-[#14532D] font-bold text-xs">
                              <Plus className="h-4 w-4 mr-1.5" /> Add Animal Group
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                        {flocks.map(f => {
                          const ft = speciesTemplates[f.type];
                          return (
                            <button key={f.id} onClick={() => { setForm({ ...form, flockId: String(f.id) }); setStep(1); }}
                              className="text-left rounded-xl border border-gray-200 px-3 py-2.5 hover:border-[#166534] hover:bg-[#F0FDF4] transition-all cursor-pointer">
                              <p className="text-sm font-semibold text-gray-900">{f.name}</p>
                              <p className="text-[10px] text-gray-400">{ft?.name || f.type} · {f.currentCount} head</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: Enter Data */}
                {step === 1 && selectedFlock && (
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-1">
                      Recording for <span className="text-[#166534]">{selectedFlock.name}</span>
                    </p>
                    <p className="text-xs text-gray-400 mb-4">{info.label} — enter today&apos;s numbers</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {info.metric === "eggs" && (
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-gray-500">🥚 Eggs Collected</Label>
                          <Input type="number" placeholder="0" value={form.eggsCollected} onChange={e => setForm({ ...form, eggsCollected: e.target.value })} className="h-11 rounded-xl text-lg font-bold" autoFocus />
                        </div>
                      )}
                      {info.metric === "milk" && (
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-gray-500">🥛 Milk (Litres)</Label>
                          <Input type="number" placeholder="0" step="0.5" value={form.milkCollected} onChange={e => setForm({ ...form, milkCollected: e.target.value })} className="h-11 rounded-xl text-lg font-bold" autoFocus />
                        </div>
                      )}
                      {info.metric === "weight" && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-gray-500">⚖️ Avg Weight (kg)</Label>
                            <Input type="number" placeholder="0" step="0.1" value={form.avgWeight} onChange={e => setForm({ ...form, avgWeight: e.target.value })} className="h-11 rounded-xl text-lg font-bold" autoFocus />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-gray-500">📈 Weight Gain (kg)</Label>
                            <Input type="number" placeholder="0" step="0.1" value={form.weightGain} onChange={e => setForm({ ...form, weightGain: e.target.value })} className="h-11 rounded-xl text-lg font-bold" />
                          </div>
                        </>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-gray-500">💀 Deaths</Label>
                        <Input type="number" placeholder="0" value={form.mortality} onChange={e => setForm({ ...form, mortality: e.target.value })} className="h-11 rounded-xl text-lg font-bold" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-gray-500">🌾 Feed Used (kg)</Label>
                        <Input type="number" placeholder="0" step="0.5" value={form.feedUsed} onChange={e => setForm({ ...form, feedUsed: e.target.value })} className="h-11 rounded-xl text-lg font-bold" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-gray-500">📝 Notes</Label>
                        <Input placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-11 rounded-xl" />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button onClick={() => setStep(2)} className="bg-[#166534] hover:bg-[#14532D] cursor-pointer">Review <ChevronRight className="h-4 w-4 ml-1" /></Button>
                      <Button variant="outline" onClick={() => setStep(0)} className="cursor-pointer">Back</Button>
                    </div>
                  </div>
                )}

                {/* Step 2: Confirm */}
                {step === 2 && selectedFlock && (
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-4">Confirm your entry</p>
                    <div className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Group:</span><span className="font-bold">{selectedFlock.name}</span></div>
                      {info.metric === "eggs" && <div className="flex justify-between"><span className="text-gray-500">Eggs:</span><span className="font-bold text-[#166534]">{form.eggsCollected || "0"}</span></div>}
                      {info.metric === "milk" && <div className="flex justify-between"><span className="text-gray-500">Milk:</span><span className="font-bold text-[#166534]">{form.milkCollected || "0"}L</span></div>}
                      {info.metric === "weight" && <div className="flex justify-between"><span className="text-gray-500">Weight Gain:</span><span className="font-bold text-[#166534]">{form.weightGain || "0"}kg</span></div>}
                      {Number(form.mortality) > 0 && <div className="flex justify-between"><span className="text-gray-500">Deaths:</span><span className="font-bold text-red-500">{form.mortality}</span></div>}
                      {Number(form.feedUsed) > 0 && <div className="flex justify-between"><span className="text-gray-500">Feed:</span><span className="font-bold">{form.feedUsed}kg</span></div>}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button onClick={handleSubmit} className="bg-[#166534] hover:bg-[#14532D] cursor-pointer">✓ Save Record</Button>
                      <Button variant="outline" onClick={() => setStep(1)} className="cursor-pointer">Edit</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPIs */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <motion.div key={kpi.title} variants={fadeUp} whileHover={{ y: -4, scale: 1.02 }}>
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

      {/* Search */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
        <input placeholder="Search by group name..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-11 rounded-xl border border-[#E5E7EB] pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534] transition-all" />
      </motion.div>

      {/* Records table */}
      {records.length === 0 ? <EmptyState title="No records yet" description="Tap 'Log Production' to record your first entry." /> : (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <div className="space-y-2">
            {records.filter(r => !search || r.flock?.name?.toLowerCase().includes(search.toLowerCase())).slice(0, 30).map((r) => {
              const ft = r.flock?.type ? speciesTemplates[r.flock.type] : null;
              const isMilk = ft?.name?.toLowerCase().includes("dairy");
              const isMeat = ["broilers", "cattle_beef", "goats", "sheep", "pigs"].includes(r.flock?.type);
              const output = isMilk ? `${Number(r.milkCollected || 0).toFixed(1)}L` : isMeat ? `${Number(r.weightGain || 0).toFixed(1)}kg` : `${r.eggsCollected} eggs`;
              return (
                <Card key={r.id} className="border border-[#E5E7EB]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-[#0F172A]">{r.flock?.name || "Unknown"}</p>
                        <p className="text-[10px] text-[#94A3B8]">{new Date(r.date).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-[#166534]">{output}</p>
                        {r.mortality > 0 && <p className="text-[10px] text-red-500 font-bold">{r.mortality} deaths</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-[10px] text-[#94A3B8]">Feed: {Number(r.feedUsed).toFixed(1)}kg</p>
                      {ft && <Badge variant="outline" className="text-[9px]">{ft.name}</Badge>}
                      <button onClick={() => handleDelete(r.id)} className="ml-auto text-[#94A3B8] hover:text-red-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      )}
      {ToastComponent}
    </div>
  );
}
