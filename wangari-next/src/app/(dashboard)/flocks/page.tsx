"use client";
import * as React from "react";
import { motion } from "framer-motion";
import {
  Bird,
  Plus,
  PawPrint,
  Trash2,
  Search,
  Heart,
  Syringe,
  Calendar,
  RefreshCw,
  Beef,
  MapPin,
  DollarSign,
  Eye,
  ChevronRight,
  Droplets,
  Flower,
  Edit3,
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  Check,
  X,
  Wheat,
  Scale,
  Egg,
  BarChart3,
  Download,
  Bell,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import api from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { CreateFlockForm } from "@/components/flocks/CreateFlockForm";
import { EditFlockForm } from "@/components/flocks/EditFlockForm";
import { RecordProductionForm } from "@/components/flocks/RecordProductionForm";
import { FlockPhoto } from "@/components/flocks/FlockPhoto";
import { FlockComparison } from "@/components/flocks/FlockComparison";
import { ExportReport } from "@/components/flocks/ExportReport";
import { GrowthChart } from "@/components/flocks/GrowthChart";
import { VaccinationReminders } from "@/components/flocks/VaccinationReminders";
import { FlockAnimalsPanel } from "@/components/flocks/FlockAnimalsPanel";
import { FlockHerdPanel } from "@/components/flocks/FlockHerdPanel";
import { HivePanel } from "@/components/flocks/HivePanel";
import { BatchProduction } from "@/components/flocks/BatchProduction";
import { BreedingRecords } from "@/components/flocks/BreedingRecords";
import { PostCreateWizard } from "@/components/flocks/PostCreateWizard";
import { FlockSetupProgress } from "@/components/flocks/FlockSetupProgress";
import type { FormSection } from "@/components/flocks/EditFlockForm";
import { getSpeciesCategories, getSpeciesIconId } from "@/lib/species-templates";
import { speciesFor } from "@/lib/species-resolve";
import { SpeciesGuidanceCard } from "@/components/flocks/SpeciesGuidanceCard";

const iconMap: Record<string, any> = { bird: Bird, beef: Beef, droplets: Droplets, flower: Flower };

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

function SpeciesIcon({ speciesId }: { speciesId: string }) {
  const iconId = getSpeciesIconId(speciesId);
  const Icon = iconMap[iconId] || Bird;
  return <Icon className="h-5 w-5" />;
}

function getMortalityRating(rate: number): { label: string; color: string; bg: string } {
  if (rate <= 1) return { label: "Normal", color: "text-wangari-green-700", bg: "bg-wangari-green-50" };
  if (rate <= 3) return { label: "Acceptable", color: "text-wangari-green-700", bg: "bg-wangari-green-50" };
  if (rate <= 5) return { label: "Watch", color: "text-tone-warn-text", bg: "bg-tone-warn-bg" };
  return { label: "Critical", color: "text-badge-red-text", bg: "bg-tone-bad-bg" };
}

function getAge(hatchDate: string | null): string {
  if (!hatchDate) return "—";
  const days = Math.floor((Date.now() - new Date(hatchDate).getTime()) / 86400000);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`;
}

function getPurposeLabel(purpose: string | null): string {
  if (!purpose) return "";
  if (purpose === "production") return "Production";
  if (purpose === "breeding") return "Breeding";
  if (purpose === "dual_purpose") return "Dual Purpose";
  return purpose;
}

// Quick mortality record inline
function QuickMortality({ flock, onRecord }: { flock: any; onRecord: (deaths: number, reason: string) => Promise<void> }) {
  const [deaths, setDeaths] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [show, setShow] = React.useState(false);

  const handleRecord = async () => {
    const n = Number(deaths);
    if (!n || n <= 0) return;
    setLoading(true);
    try {
      await onRecord(n, reason);
      setDeaths("");
      setReason("");
      setShow(false);
    } finally {
      setLoading(false);
    }
  };

  if (!show) {
    return (
      <Button onClick={() => setShow(true)} variant="ghost" size="sm" className="gap-1.5 text-wangari-red-500 hover:text-wangari-red-600 hover:bg-tone-bad-bg cursor-pointer">
        <AlertTriangle className="h-4 w-4" />Record Death
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-xl border border-badge-red-bg bg-tone-bad-bg">
      <input
        type="number"
        placeholder="#"
        value={deaths}
        onChange={(e) => setDeaths(e.target.value)}
        className="w-16 rounded-lg border border-tone-bad-border px-2 py-1.5 text-xs focus:ring-2 focus:ring-wangari-red-500/20 focus:border-wangari-red-400"
        autoFocus
      />
      <input
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="flex-1 rounded-lg border border-tone-bad-border px-2 py-1.5 text-xs focus:ring-2 focus:ring-wangari-red-500/20 focus:border-wangari-red-400"
      />
      <button onClick={handleRecord} disabled={loading || !deaths} className="p-1.5 rounded-lg bg-wangari-red-500 text-white hover:bg-wangari-red-600 disabled:opacity-50 cursor-pointer">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => setShow(false)} className="p-1.5 rounded-lg hover:bg-badge-red-bg text-wangari-red-400 cursor-pointer">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function FlocksPage() {
  const router = useRouter();
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [showEditForm, setShowEditForm] = React.useState(false);
  const [showProductionForm, setShowProductionForm] = React.useState(false);
  const [filterSpecies, setFilterSpecies] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [selectedFlock, setSelectedFlock] = React.useState<any>(null);
  const [showExport, setShowExport] = React.useState(false);
  const [compareMode, setCompareMode] = React.useState(false);
  const [selectedForCompare, setSelectedForCompare] = React.useState<Set<number>>(new Set());
  const [showComparison, setShowComparison] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"card" | "list">("card");
  const [showBatchProduction, setShowBatchProduction] = React.useState(false);
  const [showWizard, setShowWizard] = React.useState(false);
  const [wizardFlock, setWizardFlock] = React.useState<any>(null);

  const loadFlocks = () => {
    api.get("/api/flocks").then(d => {
      setFlocks(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  React.useEffect(() => { loadFlocks(); }, []);

  const filtered = flocks.filter((f: any) => {
    const matchesSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || (f.breed || "").toLowerCase().includes(search.toLowerCase());
    const matchesSpecies = filterSpecies === "all" || f.category === filterSpecies;
    return matchesSearch && matchesSpecies;
  });

  const totalAnimals = flocks.reduce((s: number, f: any) => s + (f.currentCount || 0), 0);
  const totalInitial = flocks.reduce((s: number, f: any) => s + (f.initialCount || 0), 0);
  const totalMortality = flocks.reduce((s: number, f: any) => s + (f.mortality || 0), 0);
  const mortalityRate = totalInitial > 0 ? ((totalMortality / totalInitial) * 100).toFixed(1) : "0";
  const activeFlocks = flocks.filter((f: any) => f.status === "active").length;
  const uniqueCategories = [...new Set(flocks.map((f: any) => f.category))].length;
  const totalInvestment = flocks.reduce((s: number, f: any) => s + (Number(f.totalInvestment) || 0), 0);
  const categories = getSpeciesCategories();

  const handleCreate = async (data: any) => {
    const newFlock = await api.post("/api/flocks", data);
    setShowForm(false);
    loadFlocks();
    // Show the post-create wizard.
    //
    // Offline, api.post returns { queued: true, offline: true } instead of the
    // created row — there is no server response yet, only what we asked for.
    // Passing that stub straight through is what made a dairy herd get poultry
    // feed advice: the stub has no `type`, the species lookup missed, and the
    // old `|| speciesTemplates.layers` fallback answered with Layers. So merge
    // the farmer's own form data back in. We know what species they picked,
    // and their own answer is more trustworthy than a guess made from a stub.
    if (newFlock) {
      setWizardFlock({ ...data, ...newFlock });
      setShowWizard(true);
    }
  };

  const [editingFlock, setEditingFlock] = React.useState<any>(null);
  const [editSection, setEditSection] = React.useState<FormSection | undefined>(undefined);

  /** Open the flock's edit form on one panel — the checklist's feed/vet steps. */
  const openFlockSection = (flock: any, section: FormSection) => {
    setEditingFlock(flock);
    setEditSection(section);
    setShowEditForm(true);
  };

  const handleEdit = async (data: any) => {
    if (!editingFlock) return;
    await api.patch(`/api/flocks/${editingFlock.id}`, data);
    setShowEditForm(false);
    setEditingFlock(null);
    setEditSection(undefined);
    loadFlocks();
    setSelectedFlock((prev: any) => prev ? { ...prev, ...data } : prev);
  };

  const handleRecordProduction = async (data: any) => {
    await api.post("/api/production", data);
    setShowProductionForm(false);
    loadFlocks();
  };

  const handleBatchProduction = async (records: any[]) => {
    await Promise.all(records.map((r) => api.post("/api/production", r)));
    setShowBatchProduction(false);
    loadFlocks();
  };

  const handleRecordMortality = async (deaths: number, reason: string) => {
    // Update flock mortality and currentCount
    const newMortality = (selectedFlock.mortality || 0) + deaths;
    const newCount = (selectedFlock.currentCount || 0) - deaths;
    await api.patch(`/api/flocks/${selectedFlock.id}`, {
      mortality: newMortality,
      currentCount: Math.max(0, newCount),
      // Name the reason so the group's count history reads "Died", not a vague
      // correction — the server records the delta in the herd ledger.
      ledgerReason: "death",
      ledgerNote: reason || undefined,
    });
    // Also record in daily production
    await api.post("/api/production", {
      flockId: selectedFlock.id,
      date: new Date().toISOString().split("T")[0],
      mortality: deaths,
      notes: reason || null,
    });
    loadFlocks();
    setSelectedFlock((prev: any) => ({
      ...prev,
      mortality: newMortality,
      currentCount: Math.max(0, newCount),
    }));
  };

  const handleCompleteVaccination = async (vaxId: number) => {
    await api.patch(`/api/vaccinations/${vaxId}`, {
      status: "completed",
      completedDate: new Date().toISOString(),
    });
    loadFlocks();
    // Update selected flock vaccination status
    setSelectedFlock((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        vaccinations: (prev.vaccinations || []).map((v: any) =>
          v.id === vaxId ? { ...v, status: "completed", completedDate: new Date().toISOString() } : v
        ),
      };
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this flock? This will also delete all associated vaccinations and records.")) return;
    await api.delete("/api/flocks/" + id);
    loadFlocks();
    if (selectedFlock?.id === id) setSelectedFlock(null);
  };

  // Modals reached from BOTH the list view and the detail view. These used to
  // live at the bottom of the list-view return, which the detail view's early
  // `return` never reaches — so from inside a flock, "Edit" and "Batch" set
  // their state and rendered nothing. Rendered here, once, for both branches.
  const sharedModals = (
    <>
      {showEditForm && editingFlock && (
        <EditFlockForm
          flock={editingFlock}
          initialSection={editSection}
          onSubmit={handleEdit}
          onCancel={() => { setShowEditForm(false); setEditingFlock(null); setEditSection(undefined); }}
        />
      )}

      {showBatchProduction && (
        <BatchProduction
          flocks={flocks}
          onSubmit={handleBatchProduction}
          onCancel={() => setShowBatchProduction(false)}
        />
      )}

      {showComparison && (
        <FlockComparison
          flockIds={Array.from(selectedForCompare)}
          onClose={() => setShowComparison(false)}
        />
      )}
    </>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-[3px] border-wangari-green-200 border-t-emerald-600 animate-spin" />
          <PawPrint className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-wangari-green-600" />
        </div>
        <p className="text-sm text-wangari-gray-400">Loading your livestock...</p>
      </div>
    );
  }

  // ─── DETAIL VIEW ──────────────────────────────────────
  if (selectedFlock) {
    const flock = flocks.find((f: any) => f.id === selectedFlock.id) || selectedFlock;
    // speciesFor, not speciesTemplates[type]: it recovers the species from the
    // breed when the type is missing, and returns null instead of nothing.
    const species = speciesFor(flock);
    const mortality = flock.initialCount > 0 ? ((flock.mortality / flock.initialCount) * 100).toFixed(1) : "0";
    const vaccinations = flock.vaccinations || [];
    const pendingVax = vaccinations.filter((v: any) => v.status === "pending");
    const completedVax = vaccinations.filter((v: any) => v.status === "completed");
    const production = flock.production || [];

    // Calculate production stats from last 7 days
    const last7 = production.slice(0, 7);
    const avgProduction = last7.length > 0
      ? last7.reduce((s: number, p: any) => s + (p.eggsCollected || p.milkCollected || 0), 0) / last7.length
      : 0;

    // Financial summary
    const totalFeedCost = (Number(flock.feedCostPerMonth) || 0);
    const daysSinceStart = flock.hatchDate
      ? Math.floor((Date.now() - new Date(flock.hatchDate).getTime()) / 86400000)
      : 0;
    const totalFeedSpent = totalFeedCost * Math.ceil(daysSinceStart / 30);

    return (
      <div className="space-y-6">
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <button onClick={() => setSelectedFlock(null)} className="flex items-center gap-1.5 text-sm text-wangari-gray-500 hover:text-wangari-gray-700 cursor-pointer">
            <ChevronRight className="h-4 w-4 rotate-180" />Back to Livestock
          </button>
        </motion.div>

        {/* Header with photo + actions. Stacks on a phone and lets the buttons wrap:
            as one non-wrapping row the five actions ran off the right edge,
            and the page does not scroll sideways, so Edit/Batch/Export/Delete
            were unreachable on mobile. */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <FlockPhoto
              flockId={flock.id}
              inputId="flock-photo-input"
              photoUrl={flock.photoUrl || null}
              onPhotoUpdate={(url) => {
                loadFlocks();
                setSelectedFlock((prev: any) => prev ? { ...prev, photoUrl: url } : prev);
              }}
              size="lg"
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-wangari-gray-900 tracking-tight break-words">{flock.name}</h1>
              <p className="text-sm text-wangari-gray-400 mt-0.5 break-words">
                {flock.breed || species?.name || flock.type}
                {flock.purpose && ` — ${getPurposeLabel(flock.purpose)}`}
                {flock.location && ` • ${flock.location}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge variant={flock.status === "active" ? "default" : "outline"} className={
              flock.status === "active" ? "bg-wangari-green-50 text-wangari-green-700 border-wangari-green-200" : ""
            }>{flock.status}</Badge>
            <Button onClick={() => setShowProductionForm(true)} variant="ghost" size="sm" className="gap-1.5 text-wangari-green-600 hover:text-wangari-green-700 hover:bg-wangari-green-50 cursor-pointer">
              <ClipboardList className="h-4 w-4" />Record
            </Button>
            <Button onClick={() => setShowBatchProduction(true)} variant="ghost" size="sm" className="gap-1.5 text-wangari-blue-600 hover:text-badge-blue-text hover:bg-wangari-blue-50 cursor-pointer">
              <ClipboardList className="h-4 w-4" />Batch
            </Button>
            <Button onClick={() => setShowExport(true)} variant="ghost" size="sm" className="gap-1.5 text-wangari-gray-500 hover:text-wangari-gray-700 cursor-pointer">
              <Download className="h-4 w-4" />Export
            </Button>
            <Button onClick={() => { setEditingFlock(flock); setShowEditForm(true); }} variant="ghost" size="sm" className="gap-1.5 text-wangari-gray-500 hover:text-wangari-gray-700 cursor-pointer">
              <Edit3 className="h-4 w-4" />Edit
            </Button>
            <button onClick={() => handleDelete(flock.id)} className="p-2 rounded-lg hover:bg-tone-bad-bg text-wangari-gray-400 hover:text-wangari-red-500 transition-colors cursor-pointer">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        {/* Feed, vaccine and housing guidance for THIS species. This used to
            exist only in the wizard shown once at creation, so a farmer could
            never get it back — and when the species lookup missed it showed
            poultry advice for cattle. */}
        <div className="mb-4">
          <SpeciesGuidanceCard
            flock={flock}
            onEdit={() => { setEditingFlock(flock); setShowEditForm(true); }}
          />
        </div>

        {/* Quick Stats */}
        <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Current Count", value: (flock.currentCount || 0).toLocaleString(), icon: <PawPrint className="h-5 w-5" /> },
            { label: "Deaths", value: (flock.mortality || 0).toString(), icon: <Heart className="h-5 w-5" />, color: "text-wangari-red-600" },
            { label: "Mortality", value: `${mortality}%`, icon: <Syringe className="h-5 w-5" /> },
            { label: "Age", value: getAge(flock.hatchDate), icon: <Calendar className="h-5 w-5" /> },
            { label: "Investment", value: flock.totalInvestment ? `KES ${Number(flock.totalInvestment).toLocaleString()}` : "—", icon: <DollarSign className="h-5 w-5" /> },
          ].map((stat) => (
            <motion.div key={stat.label} variants={fadeUp}>
              <Card className="border border-wangari-gray-100 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-wangari-gray-400">{stat.label}</p>
                    <p className={`mt-1.5 text-2xl font-bold ${stat.color || "text-wangari-gray-900"}`}>{stat.value}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-700">{stat.icon}</div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Setup Progress (first 7 days). Each row finishes its step where the
            step actually lives instead of sending the farmer to a page that
            cannot complete it. */}
        <FlockSetupProgress
          flock={flock}
          onAction={(id) => {
            if (id === "vaccinations") return router.push("/vaccinations");
            if (id === "production") return setShowProductionForm(true);
            if (id === "feed") return openFlockSection(flock, "feed");
            if (id === "vet") return openFlockSection(flock, "vet");
            if (id === "photo") return document.getElementById("flock-photo-input")?.click();
          }}
        />

        {/* Quick Mortality Recording */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <QuickMortality flock={flock} onRecord={handleRecordMortality} />
        </motion.div>

        {/* Detail Sections */}
        <div className="grid md:grid-cols-2 gap-4">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4">Basic Information</h3>
                <div className="space-y-3">
                  {[
                    { label: "Species", value: species?.name || flock.type },
                    { label: "Breed", value: flock.breed || "—" },
                    { label: "Purpose", value: getPurposeLabel(flock.purpose) || "—" },
                    { label: "Gender", value: flock.gender ? `${flock.gender}${flock.genderRatio ? ` (${flock.genderRatio})` : ""}` : "—" },
                    { label: "Start Date", value: flock.hatchDate ? new Date(flock.hatchDate).toLocaleDateString() : "—" },
                    { label: "Status", value: flock.status },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-wangari-gray-400">{item.label}</span>
                      <span className="text-sm font-medium text-wangari-gray-700">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Location & Housing
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Location", value: flock.location || "Not assigned" },
                    { label: "Housing Type", value: species?.housingType || "—" },
                    { label: "Space Required", value: species?.spacePerAnimal || "—" },
                    { label: "Requirements", value: species?.housingRequirements || "—" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-wangari-gray-400">{item.label}</span>
                      <span className="text-sm font-medium text-wangari-gray-700 text-right max-w-[60%]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> Supply & Cost
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Source", value: flock.source || "—" },
                    { label: "Supplier Phone", value: flock.supplierContact || "—" },
                    { label: "Cost per Animal", value: flock.costPerAnimal ? `KES ${Number(flock.costPerAnimal).toLocaleString()}` : "—" },
                    { label: "Total Investment", value: flock.totalInvestment ? `KES ${Number(flock.totalInvestment).toLocaleString()}` : "—" },
                    { label: "Target Market", value: flock.targetMarket || "—" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-wangari-gray-400">{item.label}</span>
                      <span className="text-sm font-medium text-wangari-gray-700">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4">Feed Plan</h3>
                <div className="space-y-3">
                  {[
                    { label: "Feed Type", value: flock.feedType || "—" },
                    { label: "Feed Supplier", value: flock.feedSupplier || "—" },
                    { label: "Feed Cost/Month", value: flock.feedCostPerMonth ? `KES ${Number(flock.feedCostPerMonth).toLocaleString()}` : "—" },
                    { label: "Daily Requirement", value: species?.feedPerDay || "—" },
                    { label: "Water Requirement", value: species?.waterPerDay || "—" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-wangari-gray-400">{item.label}</span>
                      <span className="text-sm font-medium text-wangari-gray-700">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4 flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5" /> Veterinarian & Health
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Veterinarian", value: flock.vetName || "Not assigned" },
                    { label: "Vet Phone", value: flock.vetPhone || "—" },
                    { label: "Health on Arrival", value: flock.healthOnArrival || "—" },
                    { label: "Common Issues", value: species?.commonHealthIssues?.slice(0, 3).join(", ") || "—" },
                    { label: "Expected Mortality", value: species ? `${species.mortalityRate}%` : "—" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-wangari-gray-400">{item.label}</span>
                      <span className="text-sm font-medium text-wangari-gray-700 text-right max-w-[60%]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4">Production Targets</h3>
                <div className="space-y-3">
                  {[
                    { label: "Metric", value: species ? `${species.productionMetric} (${species.productionUnit})` : "—" },
                    { label: "Expected Yield", value: flock.expectedYield || species?.expectedYield || "—" },
                    { label: "Expected Weight", value: flock.expectedWeight || species?.breedDetails[flock.breed]?.matureWeight || "—" },
                    { label: "Expected Revenue", value: flock.expectedRevenue ? `KES ${Number(flock.expectedRevenue).toLocaleString()}` : species?.revenuePerUnit || "—" },
                    { label: "Break-even", value: species ? `~${species.breakEvenMonths} months` : "—" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-wangari-gray-400">{item.label}</span>
                      <span className="text-sm font-medium text-wangari-gray-700">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Financial Summary */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-gray-100 bg-white">
            <CardContent className="p-5">
              <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Financial Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-xl bg-wangari-gray-50">
                  <p className="text-[10px] font-bold uppercase text-wangari-gray-400">Purchase Cost</p>
                  <p className="text-lg font-bold text-wangari-gray-900 mt-1">
                    {flock.totalInvestment ? `KES ${Number(flock.totalInvestment).toLocaleString()}` : "—"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-wangari-gray-50">
                  <p className="text-[10px] font-bold uppercase text-wangari-gray-400">Feed Spent</p>
                  <p className="text-lg font-bold text-wangari-gray-900 mt-1">
                    {totalFeedSpent > 0 ? `KES ${totalFeedSpent.toLocaleString()}` : "—"}
                  </p>
                  <p className="text-[10px] text-wangari-gray-400">{Math.ceil(daysSinceStart / 30)} months</p>
                </div>
                <div className="p-3 rounded-xl bg-wangari-gray-50">
                  <p className="text-[10px] font-bold uppercase text-wangari-gray-400">Avg Daily Production</p>
                  <p className="text-lg font-bold text-wangari-green-700 mt-1">
                    {avgProduction > 0 ? avgProduction.toFixed(0) : "—"}
                  </p>
                  <p className="text-[10px] text-wangari-gray-400">last 7 days avg</p>
                </div>
                <div className="p-3 rounded-xl bg-wangari-gray-50">
                  <p className="text-[10px] font-bold uppercase text-wangari-gray-400">Days Active</p>
                  <p className="text-lg font-bold text-wangari-gray-900 mt-1">{daysSinceStart}</p>
                  <p className="text-[10px] text-wangari-gray-400">since {flock.hatchDate ? new Date(flock.hatchDate).toLocaleDateString() : "start"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Production History */}
        {production.length > 0 && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> Production History
                  </h3>
                  <Button onClick={() => setShowProductionForm(true)} variant="ghost" size="sm" className="gap-1.5 text-wangari-green-600 hover:text-wangari-green-700 cursor-pointer">
                    <Plus className="h-3.5 w-3.5" />Record
                  </Button>
                </div>
                {/* Simple bar chart for last 14 days */}
                <div className="flex items-end gap-1 h-24 mb-2">
                  {production.slice(0, 14).reverse().map((p: any, i: number) => {
                    const val = p.eggsCollected || p.milkCollected || 0;
                    const max = Math.max(...production.slice(0, 14).map((x: any) => x.eggsCollected || x.milkCollected || 0), 1);
                    const height = (val / max) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className={cn("w-full rounded-t-md transition-all", val > 0 ? "bg-wangari-green-400" : "bg-wangari-gray-100")}
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1 text-[9px] text-wangari-gray-300">
                  {production.slice(0, 14).reverse().map((p: any, i: number) => (
                    <div key={i} className="flex-1 text-center truncate">
                      {new Date(p.date).getDate()}
                    </div>
                  ))}
                </div>

                {/* Production table */}
                <div className="mt-4 space-y-1.5">
                  {production.slice(0, 10).map((p: any) => (
                    <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-wangari-gray-50 text-xs">
                      <span className="text-wangari-gray-400 w-20">{new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      {p.eggsCollected > 0 && <span className="font-medium text-wangari-gray-700">{p.eggsCollected} eggs</span>}
                      {p.milkCollected > 0 && <span className="font-medium text-wangari-gray-700">{p.milkCollected}L</span>}
                      {p.mortality > 0 && <span className="font-medium text-wangari-red-600">{p.mortality} deaths</span>}
                      {p.feedUsed > 0 && <span className="text-wangari-gray-400">{p.feedUsed}kg feed</span>}
                      {p.notes && <span className="text-wangari-gray-400 truncate flex-1">{p.notes}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Growth/Weight Chart */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-gray-100 bg-white">
            <CardContent className="p-5">
              <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Weight / Growth Tracking
              </h3>
              <GrowthChart production={production} expectedWeight={flock.expectedWeight || species?.breedDetails[flock.breed]?.matureWeight} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Herd size: move stock between your own groups, combine two groups,
            and the count ledger that records why the number changed. Sits above
            the tag panel because it is the daily habit; tagging is setup. */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <FlockHerdPanel
            flock={flock}
            flocks={flocks}
            onChanged={loadFlocks}
            onThisGroupRemoved={() => setSelectedFlock(null)}
          />
        </motion.div>

        {/* ANITRAC ear-tag identity. Additive: flocks are still counted as a
            group exactly as before, this only stores the tag the farmer
            already holds and produces the traceability list. */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <FlockAnimalsPanel flockId={flock.id} flocks={flocks} onChanged={loadFlocks} />
        </motion.div>

        {/* Vaccination Schedule */}
        {vaccinations.length > 0 && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider flex items-center gap-1.5">
                    <Syringe className="h-3.5 w-3.5" /> Vaccination Schedule
                  </h3>
                  <div className="flex items-center gap-3 text-[10px] text-wangari-gray-400">
                    <span>{completedVax.length} completed</span>
                    <span>{pendingVax.length} pending</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {vaccinations.map((vax: any) => (
                    <div key={vax.id} className="flex items-center gap-4 p-3 rounded-xl border border-wangari-gray-50 bg-wangari-gray-50/50">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0",
                        vax.status === "completed" ? "bg-wangari-green-100 text-wangari-green-600" : "bg-tone-warn-bg text-wangari-amber-600"
                      )}>
                        <Syringe className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-wangari-gray-900">{vax.vaccineName}</div>
                        {vax.notes && <div className="text-[11px] text-wangari-gray-400">{vax.notes}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-semibold text-wangari-gray-700">
                          {new Date(vax.scheduledDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </div>
                        {vax.completedDate && (
                          <div className="text-[10px] text-wangari-green-600">
                            Done {new Date(vax.completedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </div>
                        )}
                      </div>
                      {vax.status === "pending" ? (
                        <button
                          onClick={() => handleCompleteVaccination(vax.id)}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-wangari-green-500 text-white hover:bg-wangari-green-600 transition-colors cursor-pointer flex-shrink-0"
                        >
                          Mark Done
                        </button>
                      ) : (
                        <Badge variant="default" className="text-[10px] bg-wangari-green-50 text-wangari-green-700 flex-shrink-0">
                          Completed
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Breeding Records */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-gray-100 bg-white">
            <CardContent className="p-5">
              <BreedingRecords flockId={flock.id} flockName={flock.name} flockType={flock.type} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Beekeeping. Bees are never counted individually, so the hive is the
            unit — exactly as a flock is the unit for poultry. Shown for every
            farm because apiculture is a whole-farm activity alongside livestock. */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <HivePanel />
        </motion.div>

        {/* Vaccination Reminders */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-gray-100 bg-white">
            <CardContent className="p-5">
              <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-4 flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" /> Upcoming Vaccinations
              </h3>
              {/* Scoped to THIS flock. Without flockId the panel listed every
                  flock's pending vaccines on this herd's page, so it told a
                  farmer their cattle were due FMD that belonged to their poultry. */}
              <VaccinationReminders
                flockId={flock.id}
                onSelectFlock={(id) => { const f = flocks.find((fl: any) => fl.id === id); if (f) setSelectedFlock(f); }}
              />
            </CardContent>
          </Card>
        </motion.div>

        {flock.notes && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider mb-2">Notes</h3>
                <p className="text-sm text-wangari-gray-700">{flock.notes}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Edit Form rendered at component level */}

        {/* Production Recording Modal */}
        {showProductionForm && (
          <RecordProductionForm flock={flock} onSubmit={handleRecordProduction} onCancel={() => setShowProductionForm(false)} />
        )}

        {/* Export Modal */}
        {showExport && (
          <ExportReport flock={flock} onClose={() => setShowExport(false)} />
        )}

        {sharedModals}
      </div>
    );
  }

  // ─── LIST VIEW ──────────────────────────────────────
  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-wangari-gray-900 tracking-tight">Livestock</h1>
          <p className="text-sm text-wangari-gray-400 mt-0.5">Manage your livestock groups — poultry, cattle, goats, fish & more</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button onClick={loadFlocks} variant="ghost" size="sm" className="gap-1.5 text-wangari-gray-400"><RefreshCw className="h-4 w-4" /></Button>
          <Button
            onClick={() => {
              if (compareMode && selectedForCompare.size >= 2) {
                setShowComparison(true);
              } else {
                setCompareMode(!compareMode);
                setSelectedForCompare(new Set());
              }
            }}
            variant="ghost"
            size="sm"
            className={cn("gap-1.5 cursor-pointer", compareMode ? "text-wangari-green-600 bg-wangari-green-50" : "text-wangari-gray-400")}
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{compareMode ? `Compare (${selectedForCompare.size})` : "Compare"}</span>
            <span className="sm:hidden">{compareMode ? `(${selectedForCompare.size})` : "Compare"}</span>
          </Button>
          <Button onClick={() => setShowForm(true)} className="bg-wangari-green-700 hover:bg-wangari-green-800 cursor-pointer font-bold">
            <Plus className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Add Livestock</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Animals", value: totalAnimals.toLocaleString(), icon: <PawPrint className="h-5 w-5" />, change: `${activeFlocks} active groups`, positive: true },
          { label: "Species Types", value: uniqueCategories.toString(), icon: <Beef className="h-5 w-5" />, change: `${flocks.length} total flocks`, positive: true },
          { label: "Mortality Rate", value: `${mortalityRate}%`, icon: <Heart className="h-5 w-5" />, change: `${totalMortality} total deaths`, positive: Number(mortalityRate) <= 3 },
          { label: "Total Investment", value: totalInvestment > 0 ? `KES ${(totalInvestment / 1000).toFixed(0)}k` : "—", icon: <DollarSign className="h-5 w-5" />, change: `${flocks.length} flocks`, positive: true },
        ].map((kpi) => (
          <motion.div key={kpi.label} variants={fadeUp}>
            <Card className="border border-wangari-gray-100 bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-wangari-gray-400">{kpi.label}</p>
                  <p className="mt-2 text-3xl font-bold text-wangari-gray-900">{kpi.value}</p>
                  <Badge variant="default" className={`mt-2 ${kpi.positive ? "bg-wangari-green-50 text-wangari-green-700" : "bg-tone-warn-bg text-tone-warn-text"}`}>{kpi.change}</Badge>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-800">{kpi.icon}</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters + View Toggle */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFilterSpecies("all")} className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${filterSpecies === "all" ? "bg-wangari-green-700 text-white shadow-md" : "bg-wangari-gray-100 text-wangari-gray-700 hover:bg-wangari-border"}`}>
            All ({flocks.length})
          </button>
          {categories.map((cat) => {
            const count = flocks.filter((f: any) => f.category === cat.id).length;
            if (count === 0) return null;
            return (
              <button key={cat.id} onClick={() => setFilterSpecies(cat.id)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${filterSpecies === cat.id ? "bg-wangari-green-700 text-white shadow-md" : "bg-wangari-gray-100 text-wangari-gray-700 hover:bg-wangari-border"}`}>
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 bg-wangari-gray-100 rounded-lg p-1">
          <button onClick={() => setViewMode("card")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer", viewMode === "card" ? "bg-white text-wangari-gray-900 shadow-sm" : "text-wangari-gray-500 hover:text-wangari-gray-700")}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
          </button>
          <button onClick={() => setViewMode("list")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer", viewMode === "list" ? "bg-white text-wangari-gray-900 shadow-sm" : "text-wangari-gray-500 hover:text-wangari-gray-700")}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="3" rx="1"/><rect x="1" y="7" width="14" height="3" rx="1"/><rect x="1" y="12" width="14" height="3" rx="1"/></svg>
          </button>
        </div>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-gray-400" />
        <input placeholder="Search by name, breed, or species..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-12 rounded-xl border border-wangari-border pl-10 pr-4 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
      </motion.div>

      {filtered.length === 0 ? (
        /* Distinguish "you have nothing" from "your filter/search matched
           nothing" — telling a farmer with a full herd that they have "No
           livestock yet" is alarming and wrong. */
        flocks.length === 0 ? (
          <EmptyState title="No livestock yet" description="Add your first group to start tracking." />
        ) : (
          <EmptyState
            title="Nothing matches"
            description={
              search.trim()
                ? `No livestock matches "${search.trim()}". Try a different name, breed or species.`
                : `No livestock in this category. Switch back to All (${flocks.length}).`
            }
          />
        )
      ) : viewMode === "card" ? (
        /* ─── CARD VIEW ─────────────────────────── */
        <motion.div initial="hidden" animate="visible" variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f: any) => {
            const species = speciesFor(f);
            const mortality = f.initialCount > 0 ? ((f.mortality / f.initialCount) * 100).toFixed(1) : "0";
            const mortalityRating = getMortalityRating(Number(mortality));
            const pendingVax = (f.vaccinations || []).filter((v: any) => v.status === "pending").length;
            const prodCount = (f.production || []).length;

            return (
              <motion.div key={f.id} variants={fadeUp} whileHover={{ y: -4 }}>
                <Card
                  className={cn(
                    "border hover:shadow-xl transition-all duration-300",
                    compareMode && selectedForCompare.has(f.id)
                      ? "border-wangari-green-400 bg-wangari-green-50/50 ring-2 ring-wangari-green-200"
                      : "border-wangari-gray-100 hover:border-wangari-green-200"
                  )}
                >
                  <CardContent className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => {
                          if (compareMode) {
                            setSelectedForCompare((prev) => {
                              const next = new Set(prev);
                              if (next.has(f.id)) next.delete(f.id);
                              else next.add(f.id);
                              return next;
                            });
                          } else {
                            setSelectedFlock(f);
                          }
                        }}
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-700">
                          <SpeciesIcon speciesId={f.type} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-wangari-gray-900">{f.name}</h3>
                          <p className="text-xs text-wangari-gray-400">{f.breed || species?.name || f.type}</p>
                        </div>
                      </div>
                      <Badge variant={f.status === "active" ? "default" : "outline"} className={f.status === "active" ? "bg-wangari-green-50 text-wangari-green-700 border-wangari-green-200" : ""}>{f.status}</Badge>
                    </div>

                    {/* Stats */}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-wangari-gray-50 p-2.5 text-center">
                        <p className="text-lg font-bold text-wangari-gray-900">{(f.currentCount || 0).toLocaleString()}</p>
                        <p className="text-[10px] font-semibold uppercase text-wangari-gray-400">Current</p>
                      </div>
                      <div className="rounded-lg bg-wangari-gray-50 p-2.5 text-center">
                        <p className="text-lg font-bold text-wangari-red-600">{f.mortality || 0}</p>
                        <p className="text-[10px] font-semibold uppercase text-wangari-gray-400">Deaths</p>
                      </div>
                      <div className="rounded-lg bg-wangari-gray-50 p-2.5 text-center">
                        <p className="text-lg font-bold text-wangari-gray-900">{getAge(f.hatchDate)}</p>
                        <p className="text-[10px] font-semibold uppercase text-wangari-gray-400">Age</p>
                      </div>
                    </div>

                    {/* Mortality Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold uppercase text-wangari-gray-400">Mortality</span>
                        <Badge variant="default" className={`text-[10px] ${mortalityRating.bg} ${mortalityRating.color}`}>
                          {mortality}% — {mortalityRating.label}
                        </Badge>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-wangari-gray-100">
                        <div className={`h-full rounded-full transition-all ${Number(mortality) <= 3 ? "bg-wangari-green-500" : Number(mortality) <= 5 ? "bg-wangari-amber-500" : "bg-wangari-red-500"}`} style={{ width: `${Math.min(Number(mortality) * 10, 100)}%` }} />
                      </div>
                    </div>

                    {/* Info Row */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-wangari-gray-400">
                      <div className="flex items-center gap-3">
                        {f.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{f.location}</span>}
                        {f.hatchDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(f.hatchDate).toLocaleDateString()}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {prodCount > 0 && <span className="flex items-center gap-1 text-wangari-green-600"><ClipboardList className="h-3 w-3" />{prodCount}</span>}
                        {pendingVax > 0 && <span className="flex items-center gap-1 text-wangari-amber-600"><Syringe className="h-3 w-3" />{pendingVax}</span>}
                      </div>
                    </div>

                    {/* Cost & Purpose */}
                    {(f.costPerAnimal || f.purpose) && (
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-wangari-gray-400">
                        {f.costPerAnimal && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />KES {Number(f.costPerAnimal).toLocaleString()}/head</span>}
                        {f.purpose && <span className="px-1.5 py-0.5 rounded bg-wangari-gray-50">{getPurposeLabel(f.purpose)}</span>}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-4 flex items-center gap-2 border-t border-wangari-gray-100 pt-3">
                      <button
                        onClick={() => setSelectedFlock(f)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-wangari-green-50 text-wangari-green-700 text-xs font-semibold hover:bg-wangari-green-100 transition-colors cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />Details
                      </button>
                      <button
                        onClick={() => { setEditingFlock(f); setShowEditForm(true); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-wangari-gray-50 text-wangari-gray-600 text-xs font-semibold hover:bg-wangari-gray-100 transition-colors cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />Edit
                      </button>
                      <button
                        onClick={() => handleDelete(f.id)}
                        className="flex items-center justify-center p-2 rounded-lg bg-wangari-gray-50 text-wangari-gray-400 hover:bg-tone-bad-bg hover:text-wangari-red-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        /* ─── LIST VIEW ─────────────────────────── */
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-2">
          {/* List Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-wangari-gray-400">
            <div className="col-span-4">Name</div>
            <div className="col-span-1 text-center">Count</div>
            <div className="col-span-1 text-center">Deaths</div>
            <div className="col-span-1 text-center">Age</div>
            <div className="col-span-1 text-center">Mortality</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1 text-center">Production</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {filtered.map((f: any) => {
            const species = speciesFor(f);
            const mortality = f.initialCount > 0 ? ((f.mortality / f.initialCount) * 100).toFixed(1) : "0";
            const mortalityRating = getMortalityRating(Number(mortality));
            const pendingVax = (f.vaccinations || []).filter((v: any) => v.status === "pending").length;
            const prodCount = (f.production || []).length;

            return (
              <motion.div key={f.id} variants={fadeUp}>
                <div
                  className={cn(
                    "grid grid-cols-12 gap-4 items-center px-4 py-3 rounded-xl border transition-all",
                    compareMode && selectedForCompare.has(f.id)
                      ? "border-wangari-green-400 bg-wangari-green-50/50 ring-2 ring-wangari-green-200"
                      : "border-wangari-gray-100 bg-white hover:shadow-md hover:border-wangari-green-200"
                  )}
                >
                  {/* Name */}
                  <div
                    className="col-span-4 flex items-center gap-3 cursor-pointer"
                    onClick={() => {
                      if (compareMode) {
                        setSelectedForCompare((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.id)) next.delete(f.id);
                          else next.add(f.id);
                          return next;
                        });
                      } else {
                        setSelectedFlock(f);
                      }
                    }}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-700 flex-shrink-0">
                      <SpeciesIcon speciesId={f.type} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-wangari-gray-900 truncate">{f.name}</p>
                      <p className="text-[11px] text-wangari-gray-400 truncate">{f.breed || species?.name}{f.location ? ` • ${f.location}` : ""}</p>
                    </div>
                  </div>

                  {/* Count */}
                  <div className="col-span-1 text-center">
                    <p className="text-sm font-bold text-wangari-gray-900">{(f.currentCount || 0).toLocaleString()}</p>
                    <p className="text-[9px] text-wangari-gray-400">of {f.initialCount}</p>
                  </div>

                  {/* Deaths */}
                  <div className="col-span-1 text-center">
                    <p className="text-sm font-bold text-wangari-red-600">{f.mortality || 0}</p>
                  </div>

                  {/* Age */}
                  <div className="col-span-1 text-center">
                    <p className="text-sm font-medium text-wangari-gray-700">{getAge(f.hatchDate)}</p>
                  </div>

                  {/* Mortality */}
                  <div className="col-span-1 text-center">
                    <Badge variant="default" className={`text-[10px] ${mortalityRating.bg} ${mortalityRating.color}`}>
                      {mortality}%
                    </Badge>
                  </div>

                  {/* Status */}
                  <div className="col-span-1 text-center">
                    <Badge variant={f.status === "active" ? "default" : "outline"} className={`text-[10px] ${f.status === "active" ? "bg-wangari-green-50 text-wangari-green-700 border-wangari-green-200" : ""}`}>
                      {f.status}
                    </Badge>
                  </div>

                  {/* Production */}
                  <div className="col-span-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {prodCount > 0 && <span className="text-[10px] text-wangari-green-600"><ClipboardList className="h-3 w-3 inline" /> {prodCount}</span>}
                      {pendingVax > 0 && <span className="text-[10px] text-wangari-amber-600"><Syringe className="h-3 w-3 inline" /> {pendingVax}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setSelectedFlock(f)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-wangari-green-50 text-wangari-green-700 text-[11px] font-semibold hover:bg-wangari-green-100 transition-colors cursor-pointer"
                    >
                      <Eye className="h-3 w-3" />View
                    </button>
                    <button
                      onClick={() => { setEditingFlock(f); setShowEditForm(true); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-wangari-gray-50 text-wangari-gray-600 text-[11px] font-semibold hover:bg-wangari-gray-100 transition-colors cursor-pointer"
                    >
                      <Edit3 className="h-3 w-3" />Edit
                    </button>
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="p-1.5 rounded-lg bg-wangari-gray-50 text-wangari-gray-400 hover:bg-tone-bad-bg hover:text-wangari-red-500 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Post-Create Wizard */}
      {showWizard && wizardFlock && (
        <PostCreateWizard
          flock={wizardFlock}
          species={speciesFor(wizardFlock)}
          onComplete={() => {
            setShowWizard(false);
            setWizardFlock(null);
            loadFlocks();
            // Navigate to the new flock's detail view
            setSelectedFlock(wizardFlock);
          }}
          onSkip={() => {
            setShowWizard(false);
            setWizardFlock(null);
          }}
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-wangari-ink/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl">
            <CreateFlockForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
              existingNames={flocks.map((f: any) => f.name)}
            />
          </div>
        </div>
      )}

      {showProductionForm && selectedFlock && (
        <RecordProductionForm flock={selectedFlock} onSubmit={handleRecordProduction} onCancel={() => setShowProductionForm(false)} />
      )}

      {sharedModals}
    </div>
  );
}
