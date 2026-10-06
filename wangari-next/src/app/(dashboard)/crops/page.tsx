"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Plus, X, Search, Droplets, TrendingUp, Trash2, Check, MapPin, ChevronRight, Bug, Pill, AlertTriangle, AlertOctagon, Sprout, Calendar, CalendarClock, BarChart3, Package, FlaskConical, ShieldAlert, Wallet, ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { CropGuidanceCard } from "@/components/crops/CropGuidanceCard";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import { BTN_LINK_SM } from "@/components/ui/patterns";
import { cropsSeries as COLORS } from "@/lib/chart-series";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const CROP_TYPES = [
  "Maize", "Beans", "Green Grams", "Cowpeas", "Pigeon Peas", "Groundnuts", "Tomatoes", "Kale", "Cabbage", "Onions", "Potatoes", "Sorghum", "Millet", "Wheat", "Sugarcane",
  "Avocado", "Macadamia", "Mango", "Citrus", "Passion Fruit", "Bananas", "Papaya", "Coffee", "Tea",
];
// Perennial orchard crops: produce for years/decades — no single "harvested" end state.
const PERENNIAL_CROPS = new Set(["Avocado", "Macadamia", "Mango", "Citrus", "Passion Fruit", "Bananas", "Papaya", "Coffee", "Tea"]);
// Typical years from planting to first commercial harvest (Kenya smallholder guides).
const MATURITY_YEARS: Record<string, number> = { Avocado: 3, Macadamia: 4, Mango: 4, Citrus: 4, "Passion Fruit": 1, Bananas: 1, Papaya: 1, Coffee: 3, Tea: 3 };
const GROWTH_STAGES = ["Planted", "Germinating", "Vegetative", "Flowering", "Fruiting", "Ready"];
const HEALTH_ISSUES = ["Pest", "Disease", "Weed", "Nutrient Deficiency", "Weather Damage"];
const APPLICATION_TYPES = ["Fertilizer", "Pesticide", "Herbicide", "Irrigation", "Organic Manure"];

function getGrowthProgress(plantingDate: string | null, expectedHarvest: string | null): { stage: string; percent: number } {
  if (!plantingDate) return { stage: "Unknown", percent: 0 };
  const planted = new Date(plantingDate).getTime();
  const now = Date.now();
  const total = expectedHarvest ? new Date(expectedHarvest).getTime() - planted : 120 * 86400000;
  const elapsed = now - planted;
  const pct = Math.min(Math.max((elapsed / total) * 100, 0), 100);
  if (pct < 10) return { stage: "Germinating", percent: pct };
  if (pct < 30) return { stage: "Vegetative", percent: pct };
  if (pct < 55) return { stage: "Flowering", percent: pct };
  if (pct < 80) return { stage: "Fruiting", percent: pct };
  return { stage: "Ready", percent: pct };
}

type Modal = null | "harvest" | "health" | "apply" | "postharvest" | "soiltest" | "batches";

// Batch chain for the post-harvest status timeline (harvested → dispatched)
const BATCH_STAGES = ["harvested", "graded", "treated", "stored", "packed", "dispatched"] as const;

function BatchTimeline({ status }: { status: string }) {
  const idx = BATCH_STAGES.indexOf(status as (typeof BATCH_STAGES)[number]);
  const effIdx = status === "rejected" ? -2 : idx < 0 ? 0 : idx;
  return (
    <div className="flex items-center gap-0.5">
      {BATCH_STAGES.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center gap-0.5" title={s}>
            <div className={`h-2.5 w-2.5 rounded-full ${i <= effIdx && effIdx >= 0 ? "bg-wangari-green-800" : effIdx === -2 ? (i === 0 ? "bg-wangari-red-500" : "bg-wangari-border") : "bg-wangari-border"}`} />
            <span className={`text-[8px] capitalize ${i <= effIdx && effIdx >= 0 ? "text-wangari-green-800 font-bold" : "text-wangari-gray-400"}`}>{s}</span>
          </div>
          {i < BATCH_STAGES.length - 1 && <div className={`h-0.5 w-3 -mt-3 ${i < effIdx && effIdx >= 0 ? "bg-wangari-green-800" : "bg-wangari-border"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function CropsPage() {
  const [crops, setCrops] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const { showToast, ToastComponent } = useToast();

  // Create form
  const [showForm, setShowForm] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({ name: "", cropType: "", variety: "", areaAcres: "", plantingDate: "", expectedHarvest: "", location: "", pricePerKg: "", harvestSeason: "", maturityYears: "" });

  // Action modals
  const [activeModal, setActiveModal] = React.useState<Modal>(null);
  const [modalCrop, setModalCrop] = React.useState<any>(null);
  const [harvestForm, setHarvestForm] = React.useState({ date: new Date().toISOString().split("T")[0], quantityKg: "", quality: "A", salePrice: "" });
  const [healthForm, setHealthForm] = React.useState({ date: new Date().toISOString().split("T")[0], issueType: "Pest", description: "", severity: "low", treatment: "" });
  const [applyForm, setApplyForm] = React.useState({ date: new Date().toISOString().split("T")[0], type: "Fertilizer", productName: "", quantity: "", unit: "kg", cost: "", phiDays: "" });
  const [phForm, setPhForm] = React.useState({ harvestDate: new Date().toISOString().split("T")[0], quantityKg: "", grade: "", dryMatterPct: "", treatment: "" });
  const [soilForm, setSoilForm] = React.useState({ date: new Date().toISOString().split("T")[0], labName: "", ph: "", nitrogen: "", phosphorus: "", potassium: "", organicMatterPct: "", recommendation: "" });
  const [phBatches, setPhBatches] = React.useState<any[]>([]);
  const [soilTests, setSoilTests] = React.useState<any[]>([]);
  const [insights, setInsights] = React.useState<any>({ phiAlerts: [], reminders: [], profitability: [] });

  const load = () => {
    api.get("/api/crops").then(d => { setCrops(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
    api.get("/api/crops/insights").then(d => setInsights(d)).catch(() => {});
  };
  React.useEffect(() => { load(); }, []);

  const openModal = (modal: Modal, crop: any) => { setActiveModal(modal); setModalCrop(crop); };
  const closeModal = () => { setActiveModal(null); setModalCrop(null); };

  const resetForm = () => { setForm({ name: "", cropType: "", variety: "", areaAcres: "", plantingDate: "", expectedHarvest: "", location: "", pricePerKg: "", harvestSeason: "", maturityYears: "" }); setStep(0); setShowForm(false); };

  const handleCreate = async () => {
    await api.post("/api/crops", {
      ...form,
      isPerennial: PERENNIAL_CROPS.has(form.cropType),
      maturityYears: form.maturityYears || (PERENNIAL_CROPS.has(form.cropType) ? String(MATURITY_YEARS[form.cropType] ?? "") : ""),
    });
    import("@/lib/posthog").then(({ trackEvent }) => trackEvent("crop_registered", { crop_type: form.cropType, perennial: PERENNIAL_CROPS.has(form.cropType) }));
    resetForm(); showToast("Crop registered!"); load();
  };
  const handleDelete = async (id: number) => { if (!confirm("Delete this crop?")) return; await api.delete("/api/crops/" + id); load(); };

  const handleHarvest = async () => { if (!modalCrop) return; await api.post(`/api/crops/${modalCrop.id}/harvest`, harvestForm); import("@/lib/posthog").then(({ trackEvent }) => trackEvent("harvest_recorded", { crop_type: modalCrop.cropType, quantity_kg: Number(harvestForm.quantityKg) || 0, has_sale: !!harvestForm.salePrice })); setHarvestForm({ date: new Date().toISOString().split("T")[0], quantityKg: "", quality: "A", salePrice: "" }); closeModal(); showToast("Harvest recorded!"); load(); };
  const handleHealth = async () => { if (!modalCrop) return; await api.post(`/api/crops/${modalCrop.id}/health`, healthForm); setHealthForm({ date: new Date().toISOString().split("T")[0], issueType: "Pest", description: "", severity: "low", treatment: "" }); closeModal(); showToast("Health issue recorded!"); load(); };
  const handleApply = async () => { if (!modalCrop) return; await api.post(`/api/crops/${modalCrop.id}/apply`, applyForm); setApplyForm({ date: new Date().toISOString().split("T")[0], type: "Fertilizer", productName: "", quantity: "", unit: "kg", cost: "", phiDays: "" }); closeModal(); showToast("Application recorded!"); load(); };
  const handlePostHarvest = async () => {
    if (!modalCrop) return;
    try {
      await api.post(`/api/crops/${modalCrop.id}/post-harvest`, phForm);
      setPhForm({ harvestDate: new Date().toISOString().split("T")[0], quantityKg: "", grade: "", dryMatterPct: "", treatment: "" });
      closeModal(); showToast("Post-harvest batch created!"); load();
    } catch (e: any) { showToast(e?.message || "Failed to create batch"); }
  };
  const handleSoilTest = async () => {
    if (!modalCrop) return;
    try {
      await api.post("/api/crops/soil-tests", { ...soilForm, cropId: modalCrop.id });
      setSoilForm({ date: new Date().toISOString().split("T")[0], labName: "", ph: "", nitrogen: "", phosphorus: "", potassium: "", organicMatterPct: "", recommendation: "" });
      closeModal(); showToast("Soil test recorded!"); load();
    } catch (e: any) { showToast(e?.message || "Failed to record soil test"); }
  };
  const openBatches = async (crop: any) => {
    setModalCrop(crop);
    try { setPhBatches(await api.get(`/api/crops/${crop.id}/post-harvest`)); } catch { setPhBatches([]); }
    try { setSoilTests(await api.get(`/api/crops/soil-tests?cropId=${crop.id}`)); } catch { setSoilTests([]); }
    setActiveModal("batches");
  };
  const advanceBatch = async (batch: any) => {
    const idx = BATCH_STAGES.indexOf(batch.status);
    if (idx < 0 || idx >= BATCH_STAGES.length - 1) return;
    const next = BATCH_STAGES[idx + 1];
    if (!confirm(`Advance batch ${batch.batchCode} to "${next}"?`)) return;
    try {
      // Auto-fill sensible fields when advancing: treatment date, cooling time, packed qty
      const patch: any = { status: next };
      if (next === "treated" && !batch.treatment) patch.treatment = "Fungicide dip";
      if (next === "treated" && !batch.treatmentDate) patch.treatmentDate = new Date().toISOString();
      if (next === "stored") { if (!batch.cooledAt) patch.cooledAt = new Date().toISOString(); if (!batch.storageTempC) patch.storageTempC = 5; }
      if (next === "packed") { if (!batch.packedQtyKg) patch.packedQtyKg = Number(batch.quantityKg); if (!batch.cartons) patch.cartons = Math.ceil(Number(batch.quantityKg) / 4); }
      await api.patch(`/api/crops/post-harvest/${batch.id}`, patch);
      setPhBatches((prev) => prev.map((b: any) => b.id === batch.id ? { ...b, ...patch } : b));
      showToast(`Batch advanced to ${next}`);
      load();
    } catch (e: any) { showToast(e?.message || "Failed to advance batch"); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  const totalAcres = crops.reduce((s, c) => s + Number(c.areaAcres || 0), 0);
  const totalHarvest = crops.reduce((s, c) => s + (c.harvests || []).reduce((hs: number, h: any) => hs + Number(h.quantityKg || 0), 0), 0);
  const activeCrops = crops.filter(c => c.status === "active").length;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Crops & Plantation" description="Register, track growth, record harvests & treatments"
          action={<Button onClick={() => { setShowForm(true); setStep(0); }} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer"><Plus className="h-4 w-4 mr-2" />Add Crop</Button>}
        />
      </motion.div>

      {/* Step-by-step form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border border-wangari-border hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-6">
                  {["What crop?", "Field details", "Confirm"].map((label, i) => (
                    <React.Fragment key={label}>
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${i <= step ? "text-wangari-green-800" : "text-wangari-gray-300"}`}>
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i < step ? "bg-wangari-green-800 text-white" : i === step ? "bg-wangari-green-800 text-white" : "bg-wangari-gray-100 text-wangari-gray-400"}`}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</div>
                        {label}
                      </div>
                      {i < 2 && <div className={`flex-1 h-0.5 rounded ${i < step ? "bg-wangari-green-800" : "bg-wangari-gray-100"}`} />}
                    </React.Fragment>
                  ))}
                  <button onClick={resetForm} className={BTN_LINK_SM}><X className="h-4 w-4" /></button>
                </div>

                {step === 0 && (
                  <div>
                    <p className="text-sm font-bold text-wangari-gray-900 mb-3">What are you planting?</p>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {CROP_TYPES.map(c => (
                        <button key={c} onClick={() => { setForm({ ...form, cropType: c }); setStep(1); }}
                          className="rounded-xl border border-wangari-border px-3 py-3 text-center text-sm font-medium hover:border-wangari-green-800 hover:bg-wangari-green-50 transition-all cursor-pointer">{c}</button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div>
                    <p className="text-sm font-bold text-wangari-gray-900 mb-1">Planting <span className="text-wangari-green-800">{form.cropType}</span></p>
                    <p className="text-xs text-wangari-gray-400 mb-4">Give your field a name and set the basics</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">🏷️ Field Name *</Label><Input placeholder="e.g. North Field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl" autoFocus /></div>
                      <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">📐 Area (Acres)</Label><Input type="number" placeholder="e.g. 2" step="0.1" value={form.areaAcres} onChange={e => setForm({ ...form, areaAcres: e.target.value })} className="h-11 rounded-xl" /></div>
                      <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">🌱 Variety</Label><Input placeholder="e.g. H614" value={form.variety} onChange={e => setForm({ ...form, variety: e.target.value })} className="h-11 rounded-xl" /></div>
                      <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">📅 Planting Date</Label><Input type="date" value={form.plantingDate} onChange={e => setForm({ ...form, plantingDate: e.target.value })} className="h-11 rounded-xl" /></div>
                      <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">🎯 Expected Harvest</Label><Input type="date" value={form.expectedHarvest} onChange={e => setForm({ ...form, expectedHarvest: e.target.value })} className="h-11 rounded-xl" /></div>
                      <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">📍 Location</Label><Input placeholder="e.g. Behind house" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="h-11 rounded-xl" /></div>
                      <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">💰 Price per kg (KES)</Label><Input type="number" placeholder="e.g. 50" value={form.pricePerKg} onChange={e => setForm({ ...form, pricePerKg: e.target.value })} className="h-11 rounded-xl" /></div>
                      {PERENNIAL_CROPS.has(form.cropType) && (
                        <>
                          <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">🌳 Years to maturity</Label><Input type="number" placeholder={String(MATURITY_YEARS[form.cropType] ?? 3)} value={form.maturityYears} onChange={e => setForm({ ...form, maturityYears: e.target.value })} className="h-11 rounded-xl" /></div>
                          <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-gray-500">🗓️ Harvest season</Label><Input placeholder="e.g. Apr-Sep" value={form.harvestSeason} onChange={e => setForm({ ...form, harvestSeason: e.target.value })} className="h-11 rounded-xl" /></div>
                        </>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button onClick={() => setStep(2)} disabled={!form.name} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer disabled:opacity-50">Review <ChevronRight className="h-4 w-4 ml-1" /></Button>
                      <Button variant="outline" onClick={() => setStep(0)} className="cursor-pointer">Back</Button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <p className="text-sm font-bold text-wangari-gray-900 mb-4">Confirm</p>
                    <div className="rounded-xl bg-wangari-green-50 border border-wangari-green-200 p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-wangari-gray-500">Crop:</span><span className="font-bold">{form.cropType}</span></div>
                      <div className="flex justify-between"><span className="text-wangari-gray-500">Field:</span><span className="font-bold">{form.name || "Unnamed"}</span></div>
                      {form.areaAcres && <div className="flex justify-between"><span className="text-wangari-gray-500">Area:</span><span className="font-bold">{form.areaAcres} acres</span></div>}
                      {form.plantingDate && <div className="flex justify-between"><span className="text-wangari-gray-500">Planting:</span><span className="font-bold">{new Date(form.plantingDate).toLocaleDateString()}</span></div>}
                      {form.pricePerKg && <div className="flex justify-between"><span className="text-wangari-gray-500">Price/kg:</span><span className="font-bold">KES {form.pricePerKg}</span></div>}
                      {PERENNIAL_CROPS.has(form.cropType) && <div className="flex justify-between"><span className="text-wangari-gray-500">Type:</span><span className="font-bold">Perennial orchard</span></div>}
                      {form.maturityYears && <div className="flex justify-between"><span className="text-wangari-gray-500">Maturity:</span><span className="font-bold">{form.maturityYears} years</span></div>}
                      {form.harvestSeason && <div className="flex justify-between"><span className="text-wangari-gray-500">Season:</span><span className="font-bold">{form.harvestSeason}</span></div>}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button onClick={handleCreate} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">✓ Save Crop</Button>
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
        {[
          { title: "Active Crops", value: String(activeCrops), icon: <Leaf className="h-5 w-5" /> },
          { title: "Total Area", value: `${totalAcres.toFixed(1)} acres`, icon: <MapPin className="h-5 w-5" /> },
          { title: "Total Harvest", value: `${totalHarvest.toFixed(0)} kg`, icon: <Droplets className="h-5 w-5" /> },
          { title: "Crops", value: String(crops.length), icon: <Sprout className="h-5 w-5" /> },
        ].map(kpi => (
          <motion.div key={kpi.title} variants={fadeUp}>
            <Card className="border border-wangari-border hover:shadow-lg transition-all">
              <CardContent className="pt-6 pb-4 px-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mb-3">{kpi.icon}</div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-wangari-muted mb-1">{kpi.title}</p>
                <p className="text-2xl font-extrabold text-wangari-heading">{kpi.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* PHI expiry + harvest season alerts */}
      {(insights.phiAlerts?.length > 0 || insights.reminders?.length > 0) && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-2">
          {insights.phiAlerts.map((a: any, i: number) => (
            <div key={`phi-${i}`} className={`flex items-center gap-3 rounded-xl border p-3 ${a.safe ? "bg-wangari-green-50 border-wangari-green-200" : "bg-tone-warn-bg border-tone-warn-border"}`}>
              <ShieldAlert className={`h-5 w-5 shrink-0 ${a.safe ? "text-wangari-green-600" : "text-wangari-amber-600"}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${a.safe ? "text-wangari-green-800" : "text-wangari-amber-800"}`}>
                  {a.safe ? "✅ Safe to harvest" : "⏳ PHI active"} — {a.cropName}
                </p>
                <p className="text-xs text-wangari-gray-500 truncate">{a.productName} sprayed {new Date(a.sprayedOn).toLocaleDateString()} · {a.phiDays}-day PHI</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-xs font-bold ${a.safe ? "text-wangari-green-700" : "text-tone-warn-text"}`}>{a.safe ? "Now" : `${a.daysLeft}d left`}</p>
                <p className="text-[10px] text-wangari-gray-400">safe {new Date(a.safeDate).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
          {insights.reminders.map((r: any, i: number) => (
            <div key={`rem-${i}`} className="flex items-center gap-3 rounded-xl border p-3 bg-wangari-blue-50 border-wangari-blue-200">
              <CalendarClock className="h-5 w-5 shrink-0 text-wangari-blue-600" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-wangari-blue-800">🗓️ {r.message} — {r.cropName}</p>
                {r.date && <p className="text-xs text-wangari-gray-500">{new Date(r.date).toLocaleDateString()} · {r.cropType}</p>}
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Profitability: inputs vs revenue per crop block */}
      {insights.profitability?.some((p: any) => p.inputCost > 0 || p.revenue > 0) && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-border">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="h-4 w-4 text-wangari-green-800" />
                <p className="text-sm font-bold text-wangari-gray-900">Crop Profitability</p>
                <p className="text-[10px] text-wangari-gray-400 ml-auto">input costs vs harvest revenue per block</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-wangari-gray-400 border-b border-wangari-gray-100">
                      <th className="pb-2 pr-3">Crop Block</th>
                      <th className="pb-2 pr-3 text-right">Inputs</th>
                      <th className="pb-2 pr-3 text-right">Revenue</th>
                      <th className="pb-2 pr-3 text-right">Profit</th>
                      <th className="pb-2 pr-3 text-right">Margin</th>
                      <th className="pb-2 pr-3 text-right">Cost/kg</th>
                      <th className="pb-2 text-right">Yield</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.profitability.filter((p: any) => p.inputCost > 0 || p.revenue > 0).map((p: any) => (
                      <tr key={p.cropId} className="border-b border-wangari-gray-50 last:border-0">
                        <td className="py-2 pr-3"><span className="font-bold text-wangari-gray-900">{p.cropName}</span><span className="text-wangari-gray-400 ml-1.5">{p.cropType}{p.areaAcres ? ` · ${p.areaAcres}ac` : ""}</span></td>
                        <td className="py-2 pr-3 text-right text-wangari-red-600">−KES {p.inputCost.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right text-wangari-green-700">+KES {p.revenue.toLocaleString()}</td>
                        <td className={`py-2 pr-3 text-right font-bold ${p.profit >= 0 ? "text-wangari-green-700" : "text-wangari-red-600"}`}>KES {p.profit.toLocaleString()}</td>
                        <td className={`py-2 pr-3 text-right ${p.marginPct == null ? "text-wangari-gray-300" : p.marginPct >= 0 ? "text-wangari-green-600" : "text-wangari-red-500"}`}>{p.marginPct == null ? "—" : `${p.marginPct}%`}</td>
                        <td className="py-2 pr-3 text-right text-wangari-gray-500">{p.costPerKg == null ? "—" : `KES ${p.costPerKg}`}</td>
                        <td className="py-2 text-right text-wangari-gray-500">{p.totalKg ? `${p.totalKg.toFixed(0)} kg` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle" />
        <input placeholder="Search crops..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-11 rounded-xl border border-wangari-border pl-10 pr-4 text-sm focus:ring-2 focus:ring-wangari-green-800/20 focus:border-wangari-green-800 transition-all" />
      </motion.div>

      {/* Charts */}
      {crops.length > 0 && (() => {
        // Harvest by crop type
        const harvestByType: Record<string, number> = {};
        crops.forEach(c => { (c.harvests || []).forEach((h: any) => { harvestByType[c.cropType] = (harvestByType[c.cropType] || 0) + Number(h.quantityKg || 0); }); });
        const harvestPie = Object.entries(harvestByType).map(([name, value]) => ({ name, value })).filter(h => h.value > 0);

        // Input costs by type
        const costsByType: Record<string, number> = {};
        crops.forEach(c => { (c.applications || []).forEach((a: any) => { costsByType[a.type] = (costsByType[a.type] || 0) + Number(a.cost || 0); }); });
        const costPie = Object.entries(costsByType).map(([name, value]) => ({ name, value })).filter(c => c.value > 0);

        // Health issues count
        const healthByType: Record<string, number> = {};
        crops.forEach(c => { (c.health || []).forEach((h: any) => { healthByType[h.issueType] = (healthByType[h.issueType] || 0) + 1; }); });
        const healthBar = Object.entries(healthByType).map(([name, count]) => ({ name, count }));

        
        if (harvestPie.length === 0 && costPie.length === 0 && healthBar.length === 0) return null;

        return (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <div className="grid lg:grid-cols-3 gap-4">
              {harvestPie.length > 0 && (
                <Card className="border border-wangari-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="h-4 w-4 text-wangari-green-800" />
                      <p className="text-xs font-bold text-wangari-gray-900">Harvest by Crop</p>
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={harvestPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} strokeWidth={2} stroke="#fff">
                          {harvestPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => `${Number(v).toFixed(0)} kg`} contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {harvestPie.map((h, i) => (
                        <div key={h.name} className="flex items-center gap-1"><div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="text-[10px] text-wangari-gray-500">{h.name}: {h.value.toFixed(0)}kg</span></div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {costPie.length > 0 && (
                <Card className="border border-wangari-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Pill className="h-4 w-4 text-wangari-green-800" />
                      <p className="text-xs font-bold text-wangari-gray-900">Input Costs</p>
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={costPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} strokeWidth={2} stroke="#fff">
                          {costPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => `KES ${Number(v).toLocaleString()}`} contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {costPie.map((c, i) => (
                        <div key={c.name} className="flex items-center gap-1"><div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="text-[10px] text-wangari-gray-500">{c.name}: KES {c.value.toLocaleString()}</span></div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {healthBar.length > 0 && (
                <Card className="border border-wangari-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Bug className="h-4 w-4 text-wangari-amber-500" />
                      <p className="text-xs font-bold text-wangari-gray-900">Health Issues</p>
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={healthBar} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#5F6E85" }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} width={90} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }} />
                        <Bar dataKey="count" fill="#F59E0B" radius={[0, 4, 4, 0]} name="Issues" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          </motion.div>
        );
      })()}

      {/* Crop cards */}
      {crops.length === 0 ? <EmptyState title="No crops yet" description="Tap 'Add Crop' to register your first field." /> : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {crops.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.cropType.toLowerCase().includes(search.toLowerCase())).map((crop) => {
            const totalKg = (crop.harvests || []).reduce((s: number, h: any) => s + Number(h.quantityKg || 0), 0);
            const growth = getGrowthProgress(crop.plantingDate, crop.expectedHarvest);
            const daysLeft = crop.expectedHarvest ? Math.ceil((new Date(crop.expectedHarvest).getTime() - Date.now()) / 86400000) : null;
            const hasActiveIssues = (crop.health || []).some((h: any) => !h.outcome || h.outcome === "ongoing");

            return (
              <motion.div key={crop.id} variants={fadeUp} whileHover={{ y: -4 }}>
                <Card className="border border-wangari-border hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-700"><Leaf className="h-5 w-5" /></div>
                        <div>
                          <h3 className="text-base font-bold text-wangari-gray-900">{crop.name}</h3>
                          <p className="text-xs text-wangari-gray-400">{crop.cropType}{crop.variety ? ` (${crop.variety})` : ""}</p>
                          {crop.isPerennial && (
                            <p className="text-[10px] font-semibold text-wangari-green-600 mt-0.5">
                              🌳 Perennial{crop.maturityYears ? ` · ${crop.maturityYears}y to maturity` : ""}{crop.harvestSeason ? ` · ${crop.harvestSeason}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {hasActiveIssues && <Badge className="bg-tone-bad-bg text-badge-red-text border-tone-bad-border text-[9px]"><Bug className="h-2.5 w-2.5 mr-0.5" />Issue</Badge>}
                        <Badge className={crop.status === "active" ? "bg-wangari-green-50 text-wangari-green-700 border-wangari-green-200" : "bg-wangari-gray-50 text-wangari-gray-500"}>{crop.status}</Badge>
                      </div>
                    </div>

                    {/* Growth Progress */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-wangari-gray-400 uppercase">Growth</span>
                        <span className="text-[10px] font-bold text-wangari-green-800">{growth.stage}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-wangari-gray-100">
                        <div className="h-full rounded-full bg-wangari-green-800 transition-all" style={{ width: `${growth.percent}%` }} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      {crop.areaAcres && <div className="rounded-lg bg-wangari-gray-50 p-2"><span className="text-wangari-gray-400">Area</span><p className="font-bold">{crop.areaAcres} acres</p></div>}
                      {daysLeft !== null && <div className="rounded-lg bg-wangari-gray-50 p-2"><span className="text-wangari-gray-400">Harvest</span><p className="font-bold">{daysLeft > 0 ? `${daysLeft} days` : "Ready"}</p></div>}
                      {totalKg > 0 && <div className="rounded-lg bg-wangari-green-50 p-2"><span className="text-wangari-green-600">Harvested</span><p className="font-bold text-wangari-green-700">{totalKg.toFixed(0)} kg</p></div>}
                    </div>

                    {/* What to apply to THIS crop, at the stage it is actually at.
                        Recording a crop used to end there: the farmer logged maize
                        and got no fertiliser, pesticide or timing back. This sits on
                        the card so the answer needs no extra tap. */}
                    <div className="mb-3">
                      <CropGuidanceCard crop={crop} />
                    </div>

                    {/* Lifecycle tabs */}
                    <div className="mt-3 pt-3 border-t border-wangari-gray-100">
                      <div className="flex gap-1 mb-2">
                        {[
                          { key: "growth", label: "Growth", icon: <Sprout className="h-3 w-3" />, color: "bg-wangari-green-50 text-wangari-green-700" },
                          { key: "watering", label: "Water", icon: <Droplets className="h-3 w-3" />, color: "bg-wangari-blue-50 text-badge-blue-text" },
                          { key: "flower", label: "Flower", icon: <Leaf className="h-3 w-3" />, color: "bg-wangari-purple-50 text-wangari-purple-700" },
                          { key: "harvest", label: "Harvest", icon: <Check className="h-3 w-3" />, color: "bg-tone-warn-bg text-tone-warn-text" },
                        ].map(tab => {
                          const isActive = growth.stage.toLowerCase().includes(tab.key) ||
                            (tab.key === "growth" && ["Germinating", "Vegetative"].includes(growth.stage)) ||
                            (tab.key === "flower" && ["Flowering", "Fruiting"].includes(growth.stage)) ||
                            (tab.key === "harvest" && growth.stage === "Ready");
                          return (
                            <div key={tab.key} className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${isActive ? tab.color + " ring-1 ring-current/20" : "bg-wangari-gray-50 text-wangari-gray-400"}`}>
                              {tab.icon}{tab.label}
                            </div>
                          );
                        })}
                      </div>
                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button onClick={() => openModal("harvest", crop)} className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-wangari-green-50 text-wangari-green-700 text-[10px] font-semibold hover:bg-wangari-green-100 transition-colors cursor-pointer">
                          <Check className="h-3.5 w-3.5" />Harvest
                        </button>
                        <button onClick={() => openModal("health", crop)} className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-tone-warn-bg text-tone-warn-text text-[10px] font-semibold hover:bg-wangari-amber-100 transition-colors cursor-pointer">
                          <Bug className="h-3.5 w-3.5" />Report Issue
                        </button>
                        <button onClick={() => openModal("apply", crop)} className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-wangari-blue-50 text-badge-blue-text text-[10px] font-semibold hover:bg-badge-blue-bg transition-colors cursor-pointer">
                          <Pill className="h-3.5 w-3.5" />Apply Input
                        </button>
                        <button onClick={() => openModal("postharvest", crop)} className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-wangari-purple-50 text-wangari-purple-700 text-[10px] font-semibold hover:bg-wangari-purple-100 transition-colors cursor-pointer">
                          <Package className="h-3.5 w-3.5" />Post-Harvest
                        </button>
                        <button onClick={() => openModal("soiltest", crop)} className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-wangari-teal-50 text-wangari-teal-700 text-[10px] font-semibold hover:bg-wangari-teal-100 transition-colors cursor-pointer">
                          <FlaskConical className="h-3.5 w-3.5" />Soil Test
                        </button>
                        <button onClick={() => openBatches(crop)} className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-wangari-gray-50 text-wangari-gray-600 text-[10px] font-semibold hover:bg-wangari-gray-100 transition-colors cursor-pointer">
                          <BarChart3 className="h-3.5 w-3.5" />Batches & Tests
                        </button>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(crop.id)} className="w-full mt-2 text-[10px] text-wangari-gray-400 hover:text-wangari-red-500 cursor-pointer">Delete crop</button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {activeModal && modalCrop && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeModal}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-wangari-gray-900 mb-1">
                {activeModal === "harvest" && "Record Harvest"}
                {activeModal === "health" && "Report Health Issue"}
                {activeModal === "apply" && "Record Input Application"}
                {activeModal === "postharvest" && "Post-Harvest Batch"}
                {activeModal === "soiltest" && "Record Soil Test"}
                {activeModal === "batches" && "Batches & Soil Tests"}
              </h3>
              <p className="text-xs text-wangari-gray-400 mb-4">{modalCrop.name} — {modalCrop.cropType}</p>

              {activeModal === "harvest" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Date</Label><Input type="date" value={harvestForm.date} onChange={e => setHarvestForm({ ...harvestForm, date: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Quantity (kg)</Label><Input type="number" placeholder="0" value={harvestForm.quantityKg} onChange={e => setHarvestForm({ ...harvestForm, quantityKg: e.target.value })} className="h-9 rounded-lg text-sm" autoFocus /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Grade</Label><select value={harvestForm.quality} onChange={e => setHarvestForm({ ...harvestForm, quality: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm"><option>A</option><option>B</option><option>C</option></select></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Sale Price (KES)</Label><Input type="number" placeholder="0" value={harvestForm.salePrice} onChange={e => setHarvestForm({ ...harvestForm, salePrice: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  </div>
                </div>
              )}

              {activeModal === "health" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Date</Label><Input type="date" value={healthForm.date} onChange={e => setHealthForm({ ...healthForm, date: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Issue Type</Label><select value={healthForm.issueType} onChange={e => setHealthForm({ ...healthForm, issueType: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm">{HEALTH_ISSUES.map(i => <option key={i}>{i}</option>)}</select></div>
                  </div>
                  <div><Label className="text-xs font-semibold text-wangari-gray-400">Description</Label><Input placeholder="e.g. Aphids on leaves" value={healthForm.description} onChange={e => setHealthForm({ ...healthForm, description: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Severity</Label><select value={healthForm.severity} onChange={e => setHealthForm({ ...healthForm, severity: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Treatment</Label><Input placeholder="e.g. Malathion" value={healthForm.treatment} onChange={e => setHealthForm({ ...healthForm, treatment: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  </div>
                </div>
              )}

              {activeModal === "apply" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Date</Label><Input type="date" value={applyForm.date} onChange={e => setApplyForm({ ...applyForm, date: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Type</Label><select value={applyForm.type} onChange={e => setApplyForm({ ...applyForm, type: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm">{APPLICATION_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                  </div>
                  <div><Label className="text-xs font-semibold text-wangari-gray-400">Product Name</Label><Input placeholder="e.g. NPK 17:17:17" value={applyForm.productName} onChange={e => setApplyForm({ ...applyForm, productName: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Quantity</Label><Input type="number" placeholder="0" value={applyForm.quantity} onChange={e => setApplyForm({ ...applyForm, quantity: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Unit</Label><select value={applyForm.unit} onChange={e => setApplyForm({ ...applyForm, unit: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm"><option>kg</option><option>litres</option><option>bags</option><option>ml</option></select></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Cost (KES)</Label><Input type="number" placeholder="0" value={applyForm.cost} onChange={e => setApplyForm({ ...applyForm, cost: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  </div>
                  {applyForm.type === "Pesticide" && (
                    <div>
                      <Label className="text-xs font-semibold text-wangari-gray-400">Pre-Harvest Interval (days)</Label>
                      <Input type="number" placeholder="e.g. 14" value={applyForm.phiDays} onChange={e => setApplyForm({ ...applyForm, phiDays: e.target.value })} className="h-9 rounded-lg text-sm" />
                      <p className="text-[10px] text-wangari-gray-400 mt-1">Export compliance: minimum days between this spray and harvest.</p>
                    </div>
                  )}
                </div>
              )}

              {activeModal === "postharvest" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Harvest Date</Label><Input type="date" value={phForm.harvestDate} onChange={e => setPhForm({ ...phForm, harvestDate: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Quantity (kg)</Label><Input type="number" placeholder="0" value={phForm.quantityKg} onChange={e => setPhForm({ ...phForm, quantityKg: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-wangari-gray-400">Grade</Label>
                      <select value={phForm.grade} onChange={e => setPhForm({ ...phForm, grade: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm">
                        <option value="">— Select —</option>
                        <option>Premium Export</option><option>Export</option><option>Domestic</option><option>Reject</option>
                      </select>
                    </div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Dry Matter %</Label><Input type="number" step="0.1" placeholder="e.g. 26" value={phForm.dryMatterPct} onChange={e => setPhForm({ ...phForm, dryMatterPct: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  </div>
                  {Number(phForm.dryMatterPct) > 0 && Number(phForm.dryMatterPct) < 21 && phForm.grade.toLowerCase().includes("export") && (
                    <div className="rounded-lg bg-tone-bad-bg border border-tone-bad-border p-2 text-[11px] text-badge-red-text">
                      ⚠️ Below 21% dry matter the fruit will never ripen — cannot be graded Export. Grade as Domestic or leave on the tree.
                    </div>
                  )}
                  <div>
                    <Label className="text-xs font-semibold text-wangari-gray-400">Treatment</Label>
                    <select value={phForm.treatment} onChange={e => setPhForm({ ...phForm, treatment: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm">
                      <option value="">— Select —</option>
                      <option>Hot Water Treatment (HWT)</option><option>Vapour Heat Treatment (VHT)</option><option>Fungicide dip</option><option>Waxing</option><option>None</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-wangari-gray-400">A traceability batch code is generated automatically. Cooling, packing and dispatch are tracked on the batch afterwards.</p>
                </div>
              )}

              {activeModal === "soiltest" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Date</Label><Input type="date" value={soilForm.date} onChange={e => setSoilForm({ ...soilForm, date: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Lab</Label><Input placeholder="e.g. KALRO lab" value={soilForm.labName} onChange={e => setSoilForm({ ...soilForm, labName: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">pH</Label><Input type="number" step="0.1" placeholder="e.g. 6.2" value={soilForm.ph} onChange={e => setSoilForm({ ...soilForm, ph: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">Organic Matter %</Label><Input type="number" step="0.1" placeholder="e.g. 3.5" value={soilForm.organicMatterPct} onChange={e => setSoilForm({ ...soilForm, organicMatterPct: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">N</Label><select value={soilForm.nitrogen} onChange={e => setSoilForm({ ...soilForm, nitrogen: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm"><option value="">—</option><option>low</option><option>medium</option><option>high</option></select></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">P</Label><select value={soilForm.phosphorus} onChange={e => setSoilForm({ ...soilForm, phosphorus: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm"><option value="">—</option><option>low</option><option>medium</option><option>high</option></select></div>
                    <div><Label className="text-xs font-semibold text-wangari-gray-400">K</Label><select value={soilForm.potassium} onChange={e => setSoilForm({ ...soilForm, potassium: e.target.value })} className="w-full h-9 rounded-lg border border-wangari-border px-2 text-sm"><option value="">—</option><option>low</option><option>medium</option><option>high</option></select></div>
                  </div>
                  <div><Label className="text-xs font-semibold text-wangari-gray-400">Recommendation</Label><Input placeholder="e.g. Apply lime 2t/ha before planting" value={soilForm.recommendation} onChange={e => setSoilForm({ ...soilForm, recommendation: e.target.value })} className="h-9 rounded-lg text-sm" /></div>
                  {Number(soilForm.ph) > 0 && Number(soilForm.ph) < 5.2 && (
                    <div className="rounded-lg bg-tone-warn-bg border border-tone-warn-border p-2 text-[11px] text-tone-warn-text">⚠️ pH below 5.2 is too acidic for most crops (beans need 5.8–6.5) — lime recommended.</div>
                  )}
                </div>
              )}

              {activeModal === "batches" && (
                <div className="space-y-5 max-h-[65vh] overflow-y-auto -mx-2 px-2">
                  <div>
                    <p className="text-[11px] font-bold text-wangari-gray-500 uppercase mb-2">📦 Post-Harvest Batches — {modalCrop.cropType} chain</p>
                    {phBatches.length === 0 ? <p className="text-xs text-wangari-gray-400">No batches yet — create one with “Post-Harvest”.</p> : (
                      <div className="space-y-3">
                        {phBatches.map((b: any) => (
                          <div key={b.id} className={`rounded-xl border p-3 text-xs ${b.status === "rejected" ? "border-tone-bad-border bg-tone-bad-bg" : "border-wangari-border bg-wangari-gray-50/50"}`}>
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-bold text-wangari-gray-900">{b.batchCode}</span>
                              <span className="font-bold text-wangari-gray-700">{Number(b.quantityKg).toFixed(0)} kg{b.grade ? ` · ${b.grade}` : ""}</span>
                            </div>
                            <BatchTimeline status={b.status} />
                            <div className="mt-2 text-wangari-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                              {b.dryMatterPct ? <span>💧 {Number(b.dryMatterPct)}% DM</span> : null}
                              {b.treatment ? <span>🧪 {b.treatment}</span> : null}
                              {b.cooledAt ? <span>❄️ {Number(b.storageTempC ?? "—")}°C</span> : null}
                              {b.packedQtyKg ? <span>📦 {Number(b.packedQtyKg).toFixed(0)} kg{b.cartons ? ` · ${b.cartons} cartons` : ""}</span> : null}
                              {b.destination ? <span>→ {b.destination}</span> : null}
                              {b.phytoCertNo ? <span>🧾 Phyto {b.phytoCertNo}</span> : null}
                            </div>
                            {b.status !== "dispatched" && b.status !== "rejected" && (
                              <button onClick={() => advanceBatch(b)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-wangari-green-800 hover:underline cursor-pointer">
                                Advance to next stage <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-wangari-gray-500 uppercase mb-2">🧪 Soil Tests — fertility history</p>
                    {soilTests.length === 0 ? <p className="text-xs text-wangari-gray-400">No soil tests yet.</p> : (
                      <div className="space-y-2">
                        {soilTests.map((t: any) => (
                          <div key={t.id} className="rounded-xl border border-wangari-gray-100 p-3 text-xs">
                            <div className="flex justify-between font-bold text-wangari-gray-900"><span>{new Date(t.date).toLocaleDateString()}</span><span>{t.ph ? `pH ${Number(t.ph)}` : ""}{t.organicMatterPct ? ` · OM ${Number(t.organicMatterPct)}%` : ""}</span></div>
                            <div className="text-wangari-gray-500 mt-0.5">{[t.labName && `Lab: ${t.labName}`, t.nitrogen && `N ${t.nitrogen}`, t.phosphorus && `P ${t.phosphorus}`, t.potassium && `K ${t.potassium}`].filter(Boolean).join(" · ") || "—"}</div>
                            {t.recommendation && <div className="text-wangari-gray-400 mt-0.5">💡 {t.recommendation}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {activeModal !== "batches" && (
                  <Button onClick={activeModal === "harvest" ? handleHarvest : activeModal === "health" ? handleHealth : activeModal === "apply" ? handleApply : activeModal === "postharvest" ? handlePostHarvest : handleSoilTest}
                    className="flex-1 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">Save</Button>
                )}
                <Button variant="outline" onClick={closeModal} className="cursor-pointer">{activeModal === "batches" ? "Close" : "Cancel"}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {ToastComponent}
    </div>
  );
}
