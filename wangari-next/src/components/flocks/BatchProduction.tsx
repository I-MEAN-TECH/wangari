"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { X, Check, ClipboardList, Egg, Droplets, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

import api from "@/lib/api-client";
import { speciesFor } from "@/lib/species-resolve";
import { BTN_CANCEL, BTN_CTA_EMERALD, BTN_TOOL } from "@/components/ui/patterns";

interface BatchProductionProps {
  flocks: any[];
  onSubmit: (records: any[]) => Promise<void>;
  onCancel: () => void;
}

export function BatchProduction({ flocks, onSubmit, onCancel }: BatchProductionProps) {
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [selectedFlocks, setSelectedFlocks] = React.useState<Set<number>>(new Set(flocks.filter((f) => f.status === "active").map((f) => f.id)));
  const [entries, setEntries] = React.useState<Record<number, { production: string; mortality: string; feedUsed: string; notes: string }>>({});

  const updateEntry = (flockId: number, field: string, value: string) => {
    setEntries((prev) => ({
      ...prev,
      [flockId]: { ...prev[flockId], [field]: value },
    }));
  };

  const toggleFlock = (flockId: number) => {
    setSelectedFlocks((prev) => {
      const next = new Set(prev);
      if (next.has(flockId)) next.delete(flockId);
      else next.add(flockId);
      return next;
    });
  };

  const selectAll = () => {
    const active = flocks.filter((f) => f.status === "active").map((f) => f.id);
    setSelectedFlocks(new Set(active));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const records = Array.from(selectedFlocks).map((flockId) => {
        const entry = entries[flockId] || {};
        const flock = flocks.find((f) => f.id === flockId);
        const isPoultry = flock?.type === "layers" || flock?.type === "kienyeji" || flock?.type === "broilers";

        return {
          flockId,
          date,
          eggsCollected: isPoultry ? Number(entry.production) || 0 : 0,
          milkCollected: !isPoultry ? Number(entry.production) || 0 : 0,
          mortality: Number(entry.mortality) || 0,
          feedUsed: Number(entry.feedUsed) || 0,
          notes: entry.notes || null,
        };
      });

      await onSubmit(records);
      setSubmitted(true);
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-wangari-gray-100">
          <div>
            <h2 className="text-lg font-bold text-wangari-gray-900 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-wangari-green-600" />
              Batch Production Entry
            </h2>
            <p className="text-xs text-wangari-gray-400 mt-0.5">Record production for multiple flocks at once</p>
          </div>
          <button onClick={onCancel} className={BTN_TOOL}>
            <X className="h-5 w-5 text-wangari-gray-400" />
          </button>
        </div>

        {/* Success State */}
        {submitted && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-12 w-12 rounded-full bg-wangari-green-100 flex items-center justify-center">
              <Check className="h-6 w-6 text-wangari-green-600" />
            </div>
            <p className="text-sm font-semibold text-wangari-gray-900">All records saved!</p>
            <p className="text-xs text-wangari-gray-400">{selectedFlocks.size} flocks recorded for {new Date(date).toLocaleDateString()}</p>
          </div>
        )}

        {/* Form */}
        {!submitted && (
          <>
            {/* Date + Controls */}
            <div className="flex items-center justify-between px-6 py-3 bg-wangari-gray-50 border-b border-wangari-gray-100">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-wangari-gray-600">Date:</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-wangari-border px-3 py-1.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-xs text-wangari-green-600 hover:text-wangari-green-700 font-medium cursor-pointer">
                  Select All Active
                </button>
                <span className="text-xs text-wangari-gray-400">
                  {selectedFlocks.size} of {flocks.filter((f) => f.status === "active").length} selected
                </span>
              </div>
            </div>

            {/* Flock Entries */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {flocks.filter((f) => f.status === "active").map((flock) => {
                const isSelected = selectedFlocks.has(flock.id);
                const species = speciesFor(flock);
                const isPoultry = flock.type === "layers" || flock.type === "kienyeji" || flock.type === "broilers";
                const entry = entries[flock.id] || { production: "", mortality: "", feedUsed: "", notes: "" };

                return (
                  <div
                    key={flock.id}
                    className={cn(
                      "rounded-xl border p-4 transition-all",
                      isSelected ? "border-wangari-green-200 bg-wangari-green-50/30" : "border-wangari-gray-100 bg-white opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFlock(flock.id)}
                        className="h-4 w-4 rounded border-wangari-gray-300 text-wangari-green-600 focus:ring-wangari-green-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-bold text-wangari-gray-900">{flock.name}</span>
                        <span className="text-xs text-wangari-gray-400 ml-2">{flock.breed || species?.name} • {flock.currentCount} animals</span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="grid grid-cols-3 gap-3 ml-7">
                        <div>
                          <label className="text-[10px] font-semibold text-wangari-gray-500 uppercase block mb-1">
                            {isPoultry ? "Eggs Collected" : "Milk/Weight (L or kg)"}
                          </label>
                          <input
                            type="number"
                            placeholder="0"
                            value={entry.production}
                            onChange={(e) => updateEntry(flock.id, "production", e.target.value)}
                            className="w-full rounded-lg border border-wangari-border px-3 py-2 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-wangari-gray-500 uppercase block mb-1">Deaths</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={entry.mortality}
                            onChange={(e) => updateEntry(flock.id, "mortality", e.target.value)}
                            className="w-full rounded-lg border border-wangari-border px-3 py-2 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-wangari-gray-500 uppercase block mb-1">Feed (kg)</label>
                          <input
                            type="number"
                            step="0.1"
                            placeholder="0"
                            value={entry.feedUsed}
                            onChange={(e) => updateEntry(flock.id, "feedUsed", e.target.value)}
                            className="w-full rounded-lg border border-wangari-border px-3 py-2 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-wangari-gray-100 bg-wangari-gray-50">
              <button onClick={onCancel} className={BTN_CANCEL}>
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || selectedFlocks.size === 0}
                className={BTN_CTA_EMERALD}
              >
                {loading ? "Saving..." : `Save ${selectedFlocks.size} Records`}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
