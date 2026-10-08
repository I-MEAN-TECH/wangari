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

import { speciesFor } from "@/lib/species-resolve";
import { BTN_LINK_SM } from "@/components/ui/patterns";
import {
  harvestPatternFor,
  isFrequentlyLogged,
  HARVEST_PATTERN_META,
} from "@/lib/crop-harvest-pattern";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

function getSpeciesInfo(type: string | null) {
  if (!type) return { label: "animals", metric: "output", icon: Beef, unit: "units" };
  const t = speciesFor({ type });
  if (!t) return { label: "animals", metric: "output", icon: Beef, unit: "units" };
  // Per-species production metric: eggs for layers/kienyeji only — every
  // other animal records its own natural output (milk, weight, honey…).
  if (type === "layers" || type === "kienyeji") return { label: "birds", metric: "eggs", icon: Egg, unit: "eggs" };
  if (type === "cattle_dairy" || (t.category === "livestock" && t.name.toLowerCase().includes("dairy"))) return { label: "cattle", metric: "milk", icon: Milk, unit: "litres" };
  if (t.category === "aquaculture") return { label: "fish", metric: "weight", icon: Beef, unit: "kg" };
  if (type === "bees") return { label: "hives", metric: "weight", icon: Beef, unit: "kg" };
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

  // ── Crop output ──────────────────────────────────────────────────────
  // Daily Output used to be animals only, which is why spinach and avocado
  // had nowhere to be logged. Leafy crops are cut weekly and tree crops are
  // picked season after season, so both belong on the screen a farmer opens
  // every day. Which crops belong here is decided by crop-harvest-pattern,
  // and what gets saved is the crop's own harvest row (dates + kg + sale),
  // so the Crops module and Daily Output can never disagree.
  const [tab, setTab] = React.useState<"animals" | "crops">("animals");
  const [crops, setCrops] = React.useState<any[]>([]);
  const [cropsLoading, setCropsLoading] = React.useState(true);
  const [pickDrafts, setPickDrafts] = React.useState<Record<number, { quantityKg: string; salePrice: string }>>({});
  const [savingPickId, setSavingPickId] = React.useState<number | null>(null);

  const load = () => {
    Promise.all([api.get("/api/production"), api.get("/api/flocks")])
      .then(([p, f]) => { setRecords(Array.isArray(p) ? p : []); setFlocks(Array.isArray(f) ? f : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  const loadCrops = () => {
    api.get("/api/crops")
      .then((d: any) => setCrops(Array.isArray(d) ? d : []))
      .catch(() => setCrops([]))
      .finally(() => setCropsLoading(false));
  };

  React.useEffect(() => { load(); loadCrops(); }, []);

  const loggedCrops = crops.filter((c) => isFrequentlyLogged(c));
  const singleCrops = crops.filter((c) => !isFrequentlyLogged(c));

  const cropHarvests = loggedCrops.flatMap((c: any) =>
    (c.harvests || []).map((h: any) => ({ ...h, crop: c }))
  );
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pickedThisWeek = cropHarvests.filter((h: any) => new Date(h.date).getTime() >= weekAgo);
  const cropTotalKg = cropHarvests.reduce((s: number, h: any) => s + Number(h.quantityKg || 0), 0);
  const cropTotalValue = cropHarvests.reduce((s: number, h: any) => s + Number(h.salePrice || 0), 0);

  const setDraft = (id: number, patch: Partial<{ quantityKg: string; salePrice: string }>) => {
    setPickDrafts((prev) => {
      const base = prev[id] ?? { quantityKg: "", salePrice: "" };
      return { ...prev, [id]: { ...base, ...patch } };
    });
  };

  const logPick = async (crop: any) => {
    const draft = pickDrafts[crop.id];
    const quantityKg = Number(draft?.quantityKg || 0);
    if (!quantityKg || quantityKg <= 0) {
      showToast("Enter how much you picked (kg) first");
      return;
    }
    setSavingPickId(crop.id);
    try {
      await api.post(`/api/crops/${crop.id}/harvest`, {
        date: new Date().toISOString().split("T")[0],
        quantityKg,
        salePrice: draft?.salePrice ? Number(draft.salePrice) : null,
      });
      setDraft(crop.id, { quantityKg: "", salePrice: "" });
      showToast(`${quantityKg} kg recorded for ${crop.name}`);
      loadCrops();
    } catch (err: any) {
      showToast(err?.message || "Could not save the pick — please try again");
    } finally {
      setSavingPickId(null);
    }
  };

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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

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
          action={<Button onClick={() => { setShowForm(true); setStep(0); }} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer font-bold"><Plus className="h-4 w-4 mr-2" />Log Production</Button>}
        />
      </motion.div>

      {/* Animals and crops both answer "what came off the farm today?", but they
          write to different tables — so the switch is explicit rather than
          pretending a harvest and a milk yield are the same number. */}
      <div className="flex gap-1 rounded-xl bg-wangari-sunken p-1 w-fit">
        <button onClick={() => setTab("animals")}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${tab === "animals" ? "bg-white text-wangari-green-800 shadow-sm" : "text-wangari-muted"}`}>
          Animal output
        </button>
        <button onClick={() => setTab("crops")}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${tab === "crops" ? "bg-white text-wangari-green-800 shadow-sm" : "text-wangari-muted"}`}>
          Crop output
        </button>
      </div>

      {tab === "animals" && (
        <>
      {/* Step-by-step form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border border-wangari-border hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-6">
                  {["Select Group", "Enter Data", "Review"].map((label, i) => (
                    <React.Fragment key={label}>
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${i <= step ? "text-wangari-green-800" : "text-wangari-gray-300"}`}>
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i < step ? "bg-wangari-green-800 text-white" : i === step ? "bg-wangari-green-800 text-white" : "bg-wangari-gray-100 text-wangari-gray-400"}`}>
                          {i < step ? <Check className="h-3 w-3" /> : i + 1}
                        </div>
                        {label}
                      </div>
                      {i < 2 && <div className={`flex-1 h-0.5 rounded ${i < step ? "bg-wangari-green-800" : "bg-wangari-gray-100"}`} />}
                    </React.Fragment>
                  ))}
                  <button onClick={resetForm} className={BTN_LINK_SM}><X className="h-4 w-4" /></button>
                </div>

                {/* Step 0: Select Group */}
                {step === 0 && (
                  <div>
                    <p className="text-sm font-bold text-wangari-gray-900 mb-3">Which group are you recording for?</p>
                    
                    {flocks.length === 0 ? (
                      <div className="text-center py-6 px-4 bg-tone-neutral-bg rounded-2xl border border-dashed border-wangari-border space-y-3">
                        <p className="text-sm font-bold text-wangari-heading">No Animal Groups Created Yet</p>
                        <p className="text-xs text-wangari-muted">Create an animal or poultry group first to track group production.</p>
                        <div className="flex justify-center gap-2 pt-1">
                          <Link href="/flocks">
                            <Button className="bg-wangari-green-800 hover:bg-wangari-green-900 font-bold text-xs">
                              <Plus className="h-4 w-4 mr-1.5" /> Add Animal Group
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                        {flocks.map(f => {
                          const ft = speciesFor(f);
                          return (
                            <button key={f.id} onClick={() => { setForm({ ...form, flockId: String(f.id) }); setStep(1); }}
                              className="text-left rounded-xl border border-wangari-border px-3 py-2.5 hover:border-wangari-green-800 hover:bg-wangari-green-50 transition-all cursor-pointer">
                              <p className="text-sm font-semibold text-wangari-gray-900">{f.name}</p>
                              <p className="text-[10px] text-wangari-gray-400">{ft?.name || f.type} · {f.currentCount} head</p>
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
                    <p className="text-sm font-bold text-wangari-gray-900 mb-1">
                      Recording for <span className="text-wangari-green-800">{selectedFlock.name}</span>
                    </p>
                    <p className="text-xs text-wangari-gray-400 mb-4">{info.label} — enter today&apos;s numbers</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {info.metric === "eggs" && (
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-wangari-gray-500">🥚 Eggs Collected</Label>
                          <Input type="number" placeholder="0" value={form.eggsCollected} onChange={e => setForm({ ...form, eggsCollected: e.target.value })} className="h-11 rounded-xl text-lg font-bold" autoFocus />
                        </div>
                      )}
                      {info.metric === "milk" && (
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-wangari-gray-500">🥛 Milk (Litres)</Label>
                          <Input type="number" placeholder="0" step="0.5" value={form.milkCollected} onChange={e => setForm({ ...form, milkCollected: e.target.value })} className="h-11 rounded-xl text-lg font-bold" autoFocus />
                        </div>
                      )}
                      {info.metric === "weight" && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-wangari-gray-500">⚖️ Avg Weight (kg)</Label>
                            <Input type="number" placeholder="0" step="0.1" value={form.avgWeight} onChange={e => setForm({ ...form, avgWeight: e.target.value })} className="h-11 rounded-xl text-lg font-bold" autoFocus />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-wangari-gray-500">📈 Weight Gain (kg)</Label>
                            <Input type="number" placeholder="0" step="0.1" value={form.weightGain} onChange={e => setForm({ ...form, weightGain: e.target.value })} className="h-11 rounded-xl text-lg font-bold" />
                          </div>
                        </>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-gray-500">💀 Deaths</Label>
                        <Input type="number" placeholder="0" value={form.mortality} onChange={e => setForm({ ...form, mortality: e.target.value })} className="h-11 rounded-xl text-lg font-bold" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-gray-500">🌾 Feed Used (kg)</Label>
                        <Input type="number" placeholder="0" step="0.5" value={form.feedUsed} onChange={e => setForm({ ...form, feedUsed: e.target.value })} className="h-11 rounded-xl text-lg font-bold" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-gray-500">📝 Notes</Label>
                        <Input placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-11 rounded-xl" />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button onClick={() => setStep(2)} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">Review <ChevronRight className="h-4 w-4 ml-1" /></Button>
                      <Button variant="outline" onClick={() => setStep(0)} className="cursor-pointer">Back</Button>
                    </div>
                  </div>
                )}

                {/* Step 2: Confirm */}
                {step === 2 && selectedFlock && (
                  <div>
                    <p className="text-sm font-bold text-wangari-gray-900 mb-4">Confirm your entry</p>
                    <div className="rounded-xl bg-wangari-green-50 border border-wangari-green-200 p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-wangari-gray-500">Group:</span><span className="font-bold">{selectedFlock.name}</span></div>
                      {info.metric === "eggs" && <div className="flex justify-between"><span className="text-wangari-gray-500">Eggs:</span><span className="font-bold text-wangari-green-800">{form.eggsCollected || "0"}</span></div>}
                      {info.metric === "milk" && <div className="flex justify-between"><span className="text-wangari-gray-500">Milk:</span><span className="font-bold text-wangari-green-800">{form.milkCollected || "0"}L</span></div>}
                      {info.metric === "weight" && <div className="flex justify-between"><span className="text-wangari-gray-500">Weight Gain:</span><span className="font-bold text-wangari-green-800">{form.weightGain || "0"}kg</span></div>}
                      {Number(form.mortality) > 0 && <div className="flex justify-between"><span className="text-wangari-gray-500">Deaths:</span><span className="font-bold text-wangari-red-500">{form.mortality}</span></div>}
                      {Number(form.feedUsed) > 0 && <div className="flex justify-between"><span className="text-wangari-gray-500">Feed:</span><span className="font-bold">{form.feedUsed}kg</span></div>}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button onClick={handleSubmit} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">✓ Save Record</Button>
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
            <Card className="border border-wangari-border hover:shadow-lg hover:border-wangari-green-200 transition-all duration-300">
              <CardContent className="pt-6 pb-4 px-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mb-3">{kpi.icon}</div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-wangari-muted mb-1">{kpi.title}</p>
                <p className="text-2xl font-extrabold text-wangari-heading tracking-tight">{kpi.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Search */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle" />
        <input placeholder="Search by group name..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-11 rounded-xl border border-wangari-border pl-10 pr-4 text-sm focus:ring-2 focus:ring-wangari-green-800/20 focus:border-wangari-green-800 transition-all" />
      </motion.div>

      {/* Records table */}
      {records.length === 0 ? <EmptyState title="No records yet" description="Tap 'Log Production' to record your first entry." /> : (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <div className="space-y-2">
            {records.filter(r => !search || r.flock?.name?.toLowerCase().includes(search.toLowerCase())).slice(0, 30).map((r) => {
              const ft = r.flock ? speciesFor(r.flock) : null;
              const isMilk = ft?.name?.toLowerCase().includes("dairy");
              const isMeat = ["broilers", "cattle_beef", "goats", "sheep", "pigs"].includes(r.flock?.type);
              const output = isMilk ? `${Number(r.milkCollected || 0).toFixed(1)}L` : isMeat ? `${Number(r.weightGain || 0).toFixed(1)}kg` : `${r.eggsCollected} eggs`;
              return (
                <Card key={r.id} className="border border-wangari-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-wangari-heading">{r.flock?.name || "Unknown"}</p>
                        <p className="text-[10px] text-wangari-subtle">{new Date(r.date).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-wangari-green-800">{output}</p>
                        {r.mortality > 0 && <p className="text-[10px] text-wangari-red-500 font-bold">{r.mortality} deaths</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-[10px] text-wangari-subtle">Feed: {Number(r.feedUsed).toFixed(1)}kg</p>
                      {ft && <Badge variant="outline" className="text-[9px]">{ft.name}</Badge>}
                      <button onClick={() => handleDelete(r.id)} className="ml-auto text-wangari-subtle hover:text-wangari-red-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      )}
        </>
      )}

      {/* ── Crop output — continuous pickers and perennial tree crops ────
          Spinach, sukuma wiki, tomatoes and passion fruit give output week
          after week from the same plants; avocado, mango, banana, macadamia
          and coffee are planted once and picked for years. Neither fits the
          one-shot "Harvest" flow, so both are logged here, straight onto the
          crop's own harvest record. */}
      {tab === "crops" && (
        <div className="space-y-4">
          {cropsLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" />
            </div>
          ) : loggedCrops.length === 0 ? (
            <div className="text-center py-10 px-4 bg-tone-neutral-bg rounded-2xl border border-dashed border-wangari-border space-y-3">
              <Leaf className="h-9 w-9 text-wangari-green-700 mx-auto" />
              <p className="text-sm font-bold text-wangari-heading">Nothing here yields again and again yet</p>
              <p className="text-xs text-wangari-muted max-w-md mx-auto">
                Spinach, sukuma wiki, tomatoes, French beans and passion fruit are picked week after week from the
                same plants. Avocado, mango, banana, macadamia, coffee and tea are planted once and picked for
                years. Add one and its daily output is logged from here.
              </p>
              <Link href="/crops">
                <Button className="bg-wangari-green-800 hover:bg-wangari-green-900 font-bold text-xs">
                  <Plus className="h-4 w-4 mr-1.5" /> Add a crop
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { title: "Crops producing", value: String(loggedCrops.length), icon: <Leaf className="h-5 w-5" /> },
                  { title: "Picks this week", value: String(pickedThisWeek.length), icon: <TrendingUp className="h-5 w-5" /> },
                  { title: "Total picked", value: `${cropTotalKg.toLocaleString("en-KE")} kg`, icon: <Wheat className="h-5 w-5" /> },
                  { title: "Harvest value", value: `KES ${cropTotalValue.toLocaleString("en-KE")}`, icon: <Egg className="h-5 w-5" /> },
                ].map((kpi) => (
                  <motion.div key={kpi.title} variants={fadeUp} whileHover={{ y: -4, scale: 1.02 }}>
                    <Card className="border border-wangari-border hover:shadow-lg hover:border-wangari-green-200 transition-all duration-300">
                      <CardContent className="pt-6 pb-4 px-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mb-3">{kpi.icon}</div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-wangari-muted mb-1">{kpi.title}</p>
                        <p className="text-2xl font-extrabold text-wangari-heading tracking-tight">{kpi.value}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              <div className="space-y-2">
                {loggedCrops.map((c: any) => {
                  const pattern = harvestPatternFor(c);
                  const meta = HARVEST_PATTERN_META[pattern];
                  const last = (c.harvests || [])[0];
                  const draft = pickDrafts[c.id] || { quantityKg: "", salePrice: "" };
                  return (
                    <Card key={c.id} className="border border-wangari-border">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-wangari-heading truncate">{c.name}</p>
                          <Badge variant="outline" className="text-[9px]">{c.cropType}</Badge>
                          <Badge className={`text-[9px] border ${pattern === "continuous" ? "bg-wangari-green-50 text-wangari-green-800 border-wangari-green-200" : "bg-wangari-purple-50 text-wangari-purple-700 border-wangari-purple-200"}`}>
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-wangari-subtle mt-1">{meta.summary}</p>
                        <p className="text-[10px] text-wangari-muted mt-1">
                          {c.areaAcres ? `${Number(c.areaAcres)} acres` : "area not set"}
                          {last
                            ? ` · last pick ${Number(last.quantityKg).toLocaleString("en-KE")} kg on ${new Date(last.date).toLocaleDateString("en-KE")}`
                            : " · no pick recorded yet"}
                        </p>
                        <div className="flex flex-wrap items-end gap-2 mt-3">
                          <div className="w-28">
                            <Label className="text-[10px] font-semibold text-wangari-muted">Today (kg)</Label>
                            <Input type="number" inputMode="decimal" placeholder="0" value={draft.quantityKg}
                              onChange={(e) => setDraft(c.id, { quantityKg: e.target.value })} className="h-9 rounded-lg text-sm font-bold" />
                          </div>
                          <div className="w-32">
                            <Label className="text-[10px] font-semibold text-wangari-muted">Sale value (KES)</Label>
                            <Input type="number" inputMode="decimal" placeholder="optional" value={draft.salePrice}
                              onChange={(e) => setDraft(c.id, { salePrice: e.target.value })} className="h-9 rounded-lg text-sm" />
                          </div>
                          <Button onClick={() => logPick(c)} disabled={savingPickId === c.id}
                            className="h-9 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer font-bold text-xs">
                            {savingPickId === c.id ? "Saving…" : (<><Plus className="h-3.5 w-3.5 mr-1" />Log pick</>)}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {singleCrops.length > 0 && (
                <p className="text-xs text-wangari-muted">
                  {singleCrops.length} single-harvest crop{singleCrops.length === 1 ? "" : "s"} (maize, beans, potatoes…)
                  are recorded on the <Link href="/crops" className="font-bold text-wangari-green-800 hover:underline">Crops</Link> page when you harvest them.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {ToastComponent}
    </div>
  );
}
