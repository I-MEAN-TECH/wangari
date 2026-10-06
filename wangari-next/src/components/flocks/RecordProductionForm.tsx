"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { X, Calendar, Egg, Droplets, Scale, Wheat, AlertTriangle, Check, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

import { speciesFor } from "@/lib/species-resolve";
import { BTN_CANCEL, BTN_CTA_EMERALD, BTN_TOOL } from "@/components/ui/patterns";

interface RecordProductionFormProps {
  flock: any;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function RecordProductionForm({ flock, onSubmit, onCancel }: RecordProductionFormProps) {
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const species = speciesFor(flock);

  const [form, setForm] = React.useState({
    date: new Date().toISOString().split("T")[0],
    eggsCollected: "",
    mortality: "",
    feedUsed: "",
    waterUsed: "",
    avgWeight: "",
    notes: "",
  });

  const updateForm = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Determine which fields to show based on species
  const showEggs = flock.type === "layers" || flock.type === "kienyeji";
  const showMilk = flock.type === "cattle_dairy";
  const showWeight = flock.type === "broilers" || flock.type === "cattle_beef" || flock.type === "pigs" || flock.type === "goats" || flock.type === "sheep" || flock.type === "rabbits" || flock.type === "fish";

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const data: any = {
        flockId: flock.id,
        date: form.date,
        feedUsed: Number(form.feedUsed) || 0,
        mortality: Number(form.mortality) || 0,
        notes: form.notes || null,
      };

      if (showEggs) data.eggsCollected = Number(form.eggsCollected) || 0;
      if (showMilk) data.milkCollected = Number(form.eggsCollected) || 0; // reuse field
      if (showWeight) data.avgWeight = Number(form.avgWeight) || 0;

      await onSubmit(data);
      setSubmitted(true);
      setTimeout(() => {
        // Reset for next entry
        setForm((prev) => ({
          ...prev,
          eggsCollected: "",
          mortality: "",
          feedUsed: "",
          waterUsed: "",
          avgWeight: "",
          notes: "",
        }));
        setSubmitted(false);
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  return (
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Record Daily Production</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {flock.name} — {flock.breed || species?.name}
            </p>
          </div>
          <button onClick={onCancel} className={BTN_TOOL}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Success State */}
        {submitted && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Production recorded!</p>
            <p className="text-xs text-gray-400">Ready for next entry</p>
          </div>
        )}

        {/* Form */}
        {!submitted && (
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {/* Date */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => updateForm("date", e.target.value)}
                className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Production Fields */}
            <div className="grid grid-cols-2 gap-4">
              {showEggs && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                    <Egg className="h-3 w-3" /> Eggs Collected
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.eggsCollected}
                    onChange={(e) => updateForm("eggsCollected", e.target.value)}
                    className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                  {flock.currentCount > 0 && form.eggsCollected && (
                    <p className="mt-1 text-[10px] text-gray-400">
                      {((Number(form.eggsCollected) / flock.currentCount) * 100).toFixed(1)}% collection rate
                    </p>
                  )}
                </div>
              )}

              {showMilk && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                    <Droplets className="h-3 w-3" /> Milk (liters)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.eggsCollected}
                    onChange={(e) => updateForm("eggsCollected", e.target.value)}
                    className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                  {flock.currentCount > 0 && form.eggsCollected && (
                    <p className="mt-1 text-[10px] text-gray-400">
                      {(Number(form.eggsCollected) / flock.currentCount).toFixed(1)} L per head
                    </p>
                  )}
                </div>
              )}

              {showWeight && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                    <Scale className="h-3 w-3" /> Avg Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={form.avgWeight}
                    onChange={(e) => updateForm("avgWeight", e.target.value)}
                    className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" /> Deaths Today
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={form.mortality}
                  onChange={(e) => updateForm("mortality", e.target.value)}
                  className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Feed */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center gap-1.5">
                <Wheat className="h-3 w-3" /> Feed Used (kg)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="0"
                value={form.feedUsed}
                onChange={(e) => updateForm("feedUsed", e.target.value)}
                className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              {flock.currentCount > 0 && form.feedUsed && (
                <p className="mt-1 text-[10px] text-gray-400">
                  {((Number(form.feedUsed) * 1000) / flock.currentCount).toFixed(0)}g per head
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1.5">Notes</label>
              <textarea
                placeholder="e.g., Heat stress observed, egg size smaller today..."
                value={form.notes}
                onChange={(e) => updateForm("notes", e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
              />
            </div>

            {/* Quick Summary */}
            {(form.eggsCollected || form.mortality || form.feedUsed || form.avgWeight) && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-800">Today&apos;s Summary</span>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] text-emerald-700">
                  {form.eggsCollected && showEggs && <span>{form.eggsCollected} eggs</span>}
                  {form.eggsCollected && showMilk && <span>{form.eggsCollected} liters</span>}
                  {form.avgWeight && <span>{form.avgWeight} kg avg</span>}
                  {form.mortality && <span className="text-red-600">{form.mortality} deaths</span>}
                  {form.feedUsed && <span>{form.feedUsed} kg feed</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!submitted && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button onClick={onCancel} className={BTN_CANCEL}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={BTN_CTA_EMERALD}
            >
              {loading ? "Saving..." : "Record Production"}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
