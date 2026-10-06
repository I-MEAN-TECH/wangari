"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Egg, Milk, Wheat, Heart, X, Check, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api-client";

interface WorkerQuickLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "eggs" | "milk" | "feed" | "mortality";
  flocks: Array<{ id: number; name: string }>;
  onSuccess: () => void;
}

const TYPE_CONFIG = {
  eggs: {
    title: "Log Eggs Collected",
    icon: Egg,
    color: "bg-emerald-600 text-white",
    btnColor: "bg-emerald-600 hover:bg-emerald-700",
    presets: [1, 5, 10, 30, 50, 100],
    unit: "eggs",
  },
  milk: {
    title: "Log Milk Yield",
    icon: Milk,
    color: "bg-sky-600 text-white",
    btnColor: "bg-sky-600 hover:bg-sky-700",
    presets: [1, 2, 5, 10, 20, 50],
    unit: "litres",
  },
  feed: {
    title: "Log Feed Used",
    icon: Wheat,
    color: "bg-amber-600 text-white",
    btnColor: "bg-amber-600 hover:bg-amber-700",
    presets: [1, 2, 5, 10, 25, 50],
    unit: "kg / bags",
  },
  mortality: {
    title: "Log Animal Loss",
    icon: Heart,
    color: "bg-rose-600 text-white",
    btnColor: "bg-rose-600 hover:bg-rose-700",
    presets: [1, 2, 3, 5, 10],
    unit: "animals",
  },
};

export function WorkerQuickLogModal({
  isOpen,
  onClose,
  type,
  flocks = [],
  onSuccess,
}: WorkerQuickLogModalProps) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.eggs;
  const Icon = config.icon;

  const [quantity, setQuantity] = React.useState<number>(1);
  const [selectedFlockId, setSelectedFlockId] = React.useState<number | null>(null);
  const [notes, setNotes] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setNotes("");
      setSavedSuccess(false);
      if (flocks.length > 0) {
        setSelectedFlockId(flocks[0].id);
      }
    }
  }, [isOpen, flocks]);

  const handleIncrement = (val: number) => {
    setQuantity((prev) => Math.max(0, prev + val));
  };

  const handleSubmit = async () => {
    if (quantity <= 0) return;
    setSubmitting(true);
    try {
      await api.post("/api/worker/log-output", {
        type,
        quantity,
        unit: config.unit,
        flockId: selectedFlockId,
        notes,
      });

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Failed to submit worker log:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className={`p-5 flex items-center justify-between ${config.color}`}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-white/20">
                <Icon className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-xl font-black">{config.title}</h3>
                <p className="text-xs text-white/80 font-medium">Tap numbers to add or subtract</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {savedSuccess ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="py-12 flex flex-col items-center justify-center gap-3 text-center"
              >
                <div className="h-20 w-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                  <Check className="h-10 w-10 stroke-[3]" />
                </div>
                <h4 className="text-2xl font-black text-wangari-heading">Saved!</h4>
                <p className="text-sm font-semibold text-wangari-muted">
                  Logged {quantity} {config.unit} successfully
                </p>
              </motion.div>
            ) : (
              <>
                {/* Group / Animal selector if available */}
                {flocks.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-wangari-muted mb-2 uppercase tracking-wider">
                      Select Group / Animal
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {flocks.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setSelectedFlockId(f.id)}
                          className={`px-4 py-2.5 rounded-xl text-sm font-extrabold whitespace-nowrap cursor-pointer transition-all border-2 ${
                            selectedFlockId === f.id
                              ? "bg-wangari-green-800 text-white border-wangari-green-800 shadow-sm"
                              : "bg-gray-50 text-wangari-heading border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Giant Stepper Control */}
                <div className="bg-gray-50 p-6 rounded-3xl border-2 border-gray-100 flex flex-col items-center">
                  <span className="text-xs font-bold text-wangari-subtle uppercase mb-1">Quantity ({config.unit})</span>
                  <div className="flex items-center justify-center gap-6 my-2">
                    <button
                      onClick={() => handleIncrement(-1)}
                      className="h-16 w-16 rounded-2xl bg-white border-2 border-gray-200 text-wangari-heading flex items-center justify-center shadow-sm hover:bg-gray-100 active:scale-95 cursor-pointer text-2xl font-black"
                    >
                      <Minus className="h-8 w-8 stroke-[3]" />
                    </button>
                    <div className="min-w-[120px] text-center">
                      <span className="text-6xl font-black text-wangari-heading tracking-tight">{quantity}</span>
                    </div>
                    <button
                      onClick={() => handleIncrement(1)}
                      className="h-16 w-16 rounded-2xl bg-white border-2 border-gray-200 text-wangari-heading flex items-center justify-center shadow-sm hover:bg-gray-100 active:scale-95 cursor-pointer text-2xl font-black"
                    >
                      <Plus className="h-8 w-8 stroke-[3]" />
                    </button>
                  </div>

                  {/* Preset Quick Chips */}
                  <div className="flex flex-wrap justify-center gap-2 mt-4 w-full">
                    {config.presets.map((val) => (
                      <button
                        key={val}
                        onClick={() => handleIncrement(val)}
                        className="px-4 py-2 bg-white border-2 border-gray-200 hover:border-wangari-green-800 text-wangari-heading rounded-xl text-sm font-black shadow-2xs active:scale-95 cursor-pointer"
                      >
                        +{val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Note */}
                <div>
                  <input
                    type="text"
                    placeholder="Add a simple note (Optional)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-sm font-semibold text-wangari-heading focus:outline-none focus:border-wangari-green-800"
                  />
                </div>

                {/* Giant Save Button */}
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || quantity <= 0}
                  className={`w-full py-7 text-xl font-black rounded-2xl shadow-lg cursor-pointer transition-all active:scale-98 ${config.btnColor}`}
                >
                  {submitting ? "SAVING..." : "SAVE RECORD"}
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
