"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  X,
  MapPin,
  DollarSign,
  Package,
  Heart,
  Shield,
  Target,
  Phone,
  FileText,
  User,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/toast";

import { speciesFor } from "@/lib/species-resolve";
import { BTN_CANCEL, BTN_TOOL } from "@/components/ui/patterns";

interface EditFlockFormProps {
  flock: any;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

type FormSection = "basic" | "location" | "supply" | "feed" | "vet" | "target" | "insurance";

const allSections: FormSection[] = ["basic", "location", "supply", "feed", "vet", "target", "insurance"];

const sectionLabels: Record<FormSection, { label: string; icon: any }> = {
  basic: { label: "Basic Info", icon: User },
  location: { label: "Location & Housing", icon: MapPin },
  supply: { label: "Source & Cost", icon: Package },
  feed: { label: "Feed Plan", icon: FileText },
  vet: { label: "Veterinarian & Health", icon: Heart },
  target: { label: "Production Target", icon: Target },
  insurance: { label: "Insurance & Notes", icon: Shield },
};

export function EditFlockForm({ flock, onSubmit, onCancel }: EditFlockFormProps) {
  const { showToast, ToastComponent } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [expandedSections, setExpandedSections] = React.useState<Set<FormSection>>(
    new Set(["basic"])
  );
  const species = speciesFor(flock);
  const [inventoryFeeds, setInventoryFeeds] = React.useState<string[]>([]);

  React.useEffect(() => {
    import("@/lib/api-client").then(({ default: api }) => {
      api.get("/api/inventory").then((res: any) => {
        const items = Array.isArray(res) ? res : res?.items || [];
        const names = items.map((i: any) => i.itemName || i.name).filter(Boolean);
        setInventoryFeeds(Array.from(new Set(names)));
      }).catch(() => {});
    });
  }, []);

  const [form, setForm] = React.useState({
    name: flock.name || "",
    breed: flock.breed || "",
    status: flock.status || "active",
    currentCount: (flock.currentCount || 0).toString(),
    mortality: (flock.mortality || 0).toString(),
    purpose: flock.purpose || "production",
    gender: flock.gender || "mixed",
    genderRatio: flock.genderRatio || "",
    location: flock.location || "",
    housingType: flock.housingType || "",
    source: flock.source || "",
    supplierContact: flock.supplierContact || flock.supplier || "",
    costPerAnimal: (flock.costPerAnimal || flock.costPerHead || "").toString(),
    targetMarket: flock.targetMarket || "",
    feedType: flock.feedType || "",
    feedSupplier: flock.feedSupplier || "",
    feedCostPerMonth: (flock.feedCostPerMonth || flock.feedCostMonthly || "").toString(),
    vetName: flock.vetName || "",
    vetPhone: flock.vetPhone || "",
    healthOnArrival: flock.healthOnArrival || "",
    insurancePolicy: flock.insurancePolicy || "",
    expectedYield: flock.expectedYield || flock.targetOutput || "",
    expectedRevenue: (flock.expectedRevenue || flock.targetRevenue || "").toString(),
    expectedWeight: flock.expectedWeight || "",
    notes: flock.notes || "",
  });

  const breedOptions = React.useMemo(() => {
    const list = species?.breeds || [];
    const defaults = ["Kienyeji", "Broiler", "Layer", "Sasso", "Friesian", "Ayrshire", "Jersey", "Guernsey", "Toggenburg", "Galla", "Dorper", "Kuroiler", "Rainbow Rooster", "Tilapia", "Catfish", "Other"];
    const combined = Array.from(new Set([...list, ...defaults]));
    if (form.breed && !combined.includes(form.breed)) combined.unshift(form.breed);
    return combined;
  }, [species, form.breed]);

  const feedOptions = React.useMemo(() => {
    const list = species?.feedTypes || [];
    const defaults = ["Layers Mash", "Growers Mash", "Chick Starter", "Broiler Finisher", "Dairy Meal", "Calf Starter", "Pig Feed", "Silage", "Hay"];
    const combined = Array.from(new Set([...inventoryFeeds, ...list, ...defaults]));
    if (form.feedType && !combined.includes(form.feedType)) combined.unshift(form.feedType);
    return combined;
  }, [species, inventoryFeeds, form.feedType]);
  const toggleSection = (section: FormSection) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const updateForm = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit({
        name: form.name,
        breed: form.breed,
        status: form.status,
        currentCount: Number(form.currentCount),
        mortality: Number(form.mortality),
        purpose: form.purpose,
        gender: form.gender,
        genderRatio: form.genderRatio,
        location: form.location,
        source: form.source,
        supplierContact: form.supplierContact,
        costPerAnimal: Number(form.costPerAnimal) || null,
        targetMarket: form.targetMarket,
        feedType: form.feedType,
        feedSupplier: form.feedSupplier,
        feedCostPerMonth: Number(form.feedCostPerMonth) || null,
        vetName: form.vetName,
        vetPhone: form.vetPhone,
        healthOnArrival: form.healthOnArrival,
        insurancePolicy: form.insurancePolicy,
        expectedYield: form.expectedYield,
        expectedRevenue: Number(form.expectedRevenue) || null,
        expectedWeight: form.expectedWeight,
        notes: form.notes,
      });
    } catch (err) {
      // try/finally with no catch swallowed the failure: the promise rejected,
      // the button reset, and the farmer saw nothing at all. Say what went
      // wrong and stay on the form.
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not save your changes. Check your connection and try again.";
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    {/* useToast returns the element as {ToastComponent}, not <ToastComponent />. */}
    {ToastComponent}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-wangari-gray-100">
          <div>
            <h2 className="text-lg font-bold text-wangari-gray-900">Edit {flock.name}</h2>
            <p className="text-xs text-wangari-gray-400 mt-0.5">Update flock details</p>
          </div>
          <button onClick={onCancel} className={BTN_TOOL}>
            <X className="h-5 w-5 text-wangari-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
          {allSections.map((sectionKey) => {
            const section = sectionLabels[sectionKey];
            const SectionIcon = section.icon;
            const isExpanded = expandedSections.has(sectionKey);

            return (
              <div key={sectionKey} className="border border-wangari-gray-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSection(sectionKey)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-wangari-gray-50 hover:bg-wangari-gray-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <SectionIcon className="h-4 w-4 text-wangari-gray-500" />
                    <span className="text-sm font-semibold text-wangari-gray-800">{section.label}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-wangari-gray-400" /> : <ChevronDown className="h-4 w-4 text-wangari-gray-400" />}
                </button>

                {isExpanded && (
                  <div className="px-4 py-4">
                    {sectionKey === "basic" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Flock Name</label>
                          <input value={form.name} onChange={(e) => updateForm("name", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Status</label>
                          <select value={form.status} onChange={(e) => updateForm("status", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="sold">Sold</option>
                            <option value="deceased">Deceased</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Breed</label>
                          <select value={form.breed} onChange={(e) => updateForm("breed", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all">
                            <option value="">Select breed...</option>
                            {breedOptions.map((b: string) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Current Count</label>
                          <input type="number" value={form.currentCount} onChange={(e) => updateForm("currentCount", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Deaths (Mortality)</label>
                          <input type="number" value={form.mortality} onChange={(e) => updateForm("mortality", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Purpose</label>
                          <select value={form.purpose} onChange={(e) => updateForm("purpose", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all">
                            <option value="production">Production</option>
                            <option value="breeding">Breeding</option>
                            <option value="dual_purpose">Dual Purpose</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Gender</label>
                          <select value={form.gender} onChange={(e) => updateForm("gender", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all">
                            <option value="female">All Female</option>
                            <option value="male">All Male</option>
                            <option value="mixed">Mixed</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {sectionKey === "location" && (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Location / Pen</label>
                          <input value={form.location} onChange={(e) => updateForm("location", e.target.value)} placeholder="e.g., Pen A, Barn 2" className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                      </div>
                    )}

                    {sectionKey === "supply" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Source / Supplier</label>
                          <input value={form.source} onChange={(e) => updateForm("source", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Supplier Phone</label>
                          <input value={form.supplierContact} onChange={(e) => updateForm("supplierContact", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Cost per Animal (KES)</label>
                          <input type="number" value={form.costPerAnimal} onChange={(e) => updateForm("costPerAnimal", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Target Market</label>
                          <input value={form.targetMarket} onChange={(e) => updateForm("targetMarket", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                      </div>
                    )}

                    {sectionKey === "feed" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Feed Type</label>
                          <select value={form.feedType} onChange={(e) => updateForm("feedType", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all">
                            <option value="">Select feed type...</option>
                            {feedOptions.map((ft: string) => <option key={ft} value={ft}>{ft}</option>)}
                          </select>
                          {inventoryFeeds.length === 0 && (
                            <a href="/inventory" className="text-[11px] font-semibold text-wangari-green-800 hover:underline block mt-1">
                              + No feeds found in inventory. Tap to add in Inventory
                            </a>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Feed Supplier</label>
                          <input value={form.feedSupplier} onChange={(e) => updateForm("feedSupplier", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Feed Cost/Month (KES)</label>
                          <input type="number" value={form.feedCostPerMonth} onChange={(e) => updateForm("feedCostPerMonth", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                      </div>
                    )}

                    {sectionKey === "vet" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Veterinarian</label>
                          <input value={form.vetName} onChange={(e) => updateForm("vetName", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Vet Phone</label>
                          <input value={form.vetPhone} onChange={(e) => updateForm("vetPhone", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Health on Arrival</label>
                          <input value={form.healthOnArrival} onChange={(e) => updateForm("healthOnArrival", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                      </div>
                    )}

                    {sectionKey === "target" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Expected Yield</label>
                          <input value={form.expectedYield} onChange={(e) => updateForm("expectedYield", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Expected Weight</label>
                          <input value={form.expectedWeight} onChange={(e) => updateForm("expectedWeight", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Expected Revenue</label>
                          <input value={form.expectedRevenue} onChange={(e) => updateForm("expectedRevenue", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                      </div>
                    )}

                    {sectionKey === "insurance" && (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Insurance Policy</label>
                          <input value={form.insurancePolicy} onChange={(e) => updateForm("insurancePolicy", e.target.value)} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-wangari-gray-700 block mb-1.5">Notes</label>
                          <textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} rows={3} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 transition-all resize-none" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-wangari-gray-100 bg-wangari-gray-50">
          <button onClick={onCancel} className={BTN_CANCEL}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 rounded-xl text-sm font-semibold bg-wangari-green-700 text-white hover:bg-wangari-green-800 shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </motion.div>
    </motion.div>
    </>
  );
}
