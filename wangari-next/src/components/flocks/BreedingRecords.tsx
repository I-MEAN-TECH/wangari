"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { X, Plus, Heart, Baby, Calendar, Check, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { speciesTemplates } from "@/lib/species-templates";
import api from "@/lib/api-client";

interface BreedingRecord {
  id: number;
  flockId: number;
  sireName: string | null;
  sireBreed: string | null;
  damName: string | null;
  damBreed: string | null;
  matingDate: string;
  expectedBirth: string | null;
  actualBirth: string | null;
  offspringCount: number | null;
  offspringAlive: number | null;
  method: string | null;
  status: string;
  notes: string | null;
  flock?: { name: string; type: string; breed: string };
}

interface BreedingRecordsProps {
  flockId?: number;
  flockName?: string;
  flockType?: string;
  onClose?: () => void;
}

export function BreedingRecords({ flockId, flockName, flockType, onClose }: BreedingRecordsProps) {
  const [records, setRecords] = React.useState<BreedingRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editingRecord, setEditingRecord] = React.useState<BreedingRecord | null>(null);

  const loadRecords = async () => {
    try {
      const url = flockId ? `/api/breeding/flock/${flockId}` : "/api/breeding";
      const data = await api.get(url);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load breeding records:", err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { loadRecords(); }, [flockId]);

  const handleCreate = async (data: any) => {
    await api.post("/api/breeding", data);
    setShowForm(false);
    loadRecords();
  };

  const handleUpdate = async (data: any) => {
    if (!editingRecord) return;
    await api.patch(`/api/breeding/${editingRecord.id}`, data);
    setEditingRecord(null);
    loadRecords();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this breeding record?")) return;
    await api.delete(`/api/breeding/${id}`);
    loadRecords();
  };

  const handleMarkBorn = async (record: BreedingRecord) => {
    const count = prompt("How many offspring were born?");
    if (count === null) return;
    const alive = prompt("How many are alive?");
    await api.patch(`/api/breeding/${record.id}`, {
      status: "born",
      actualBirth: new Date().toISOString(),
      offspringCount: Number(count) || 0,
      offspringAlive: Number(alive) || 0,
    });
    loadRecords();
  };

  const getStatusColor = (status: string) => {
    if (status === "born") return "bg-wangari-green-50 text-wangari-green-700 border-wangari-green-200";
    if (status === "confirmed") return "bg-wangari-blue-50 text-badge-blue-text border-wangari-blue-200";
    if (status === "failed") return "bg-tone-bad-bg text-badge-red-text border-tone-bad-border";
    return "bg-tone-warn-bg text-tone-warn-text border-tone-warn-border";
  };

  const flock = flockId ? records[0]?.flock : null;

  return (
    <div className={cn("space-y-4", onClose ? "" : "")}>
      {onClose && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-wangari-gray-900 flex items-center gap-2">
            <Heart className="h-4 w-4 text-wangari-pink-500" />
            Breeding Records
          </h3>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowForm(true)} size="sm" className="bg-wangari-green-700 hover:bg-wangari-green-800 cursor-pointer">
              <Plus className="h-3.5 w-3.5 mr-1" />Add
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-wangari-gray-100 cursor-pointer">
              <X className="h-4 w-4 text-wangari-gray-400" />
            </button>
          </div>
        </div>
      )}

      {!onClose && (
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-wangari-gray-400 tracking-wider flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-wangari-pink-500" /> Breeding Records
          </h3>
          <Button onClick={() => setShowForm(true)} variant="ghost" size="sm" className="gap-1.5 text-wangari-pink-600 hover:text-wangari-pink-700 cursor-pointer">
            <Plus className="h-3.5 w-3.5" />Add Record
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-wangari-green-200 border-t-emerald-600 animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Heart className="h-8 w-8 text-wangari-border mb-2" />
          <p className="text-sm text-wangari-gray-400">No breeding records yet</p>
          <p className="text-[10px] text-wangari-gray-300 mt-1">Track matings, births, and lineage</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const daysSinceMating = Math.floor((Date.now() - new Date(r.matingDate).getTime()) / 86400000);
            const daysUntilBirth = r.expectedBirth
              ? Math.ceil((new Date(r.expectedBirth).getTime() - Date.now()) / 86400000)
              : null;

            return (
              <Card key={r.id} className="border border-wangari-gray-100 bg-white">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wangari-pink-50 text-wangari-pink-600">
                        <Heart className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-wangari-gray-900">
                          {r.sireName || "Sire"} × {r.damName || "Dam"}
                        </p>
                        <p className="text-[11px] text-wangari-gray-400">
                          {r.sireBreed || ""} {r.sireBreed && r.damBreed ? "×" : ""} {r.damBreed || ""}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn("text-[10px] capitalize", getStatusColor(r.status))}>{r.status}</Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] text-wangari-gray-400 uppercase">Mating Date</p>
                      <p className="font-medium text-wangari-gray-700 mt-0.5">
                        {new Date(r.matingDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-wangari-gray-400 uppercase">Method</p>
                      <p className="font-medium text-wangari-gray-700 mt-0.5 capitalize">{r.method || "Natural"}</p>
                    </div>
                    {r.expectedBirth && (
                      <div>
                        <p className="text-[10px] text-wangari-gray-400 uppercase">Expected Birth</p>
                        <p className="font-medium text-wangari-gray-700 mt-0.5">
                          {new Date(r.expectedBirth).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          {daysUntilBirth !== null && daysUntilBirth > 0 && (
                            <span className="text-wangari-amber-600 ml-1">({daysUntilBirth}d)</span>
                          )}
                        </p>
                      </div>
                    )}
                    {r.status === "born" && (
                      <>
                        <div>
                          <p className="text-[10px] text-wangari-gray-400 uppercase">Offspring</p>
                          <p className="font-medium text-wangari-gray-700 mt-0.5">{r.offspringCount} born, {r.offspringAlive} alive</p>
                        </div>
                      </>
                    )}
                  </div>

                  {r.notes && <p className="text-[11px] text-wangari-gray-400 mt-2 italic">{r.notes}</p>}

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-wangari-gray-50">
                    {r.status === "pending" && (
                      <button
                        onClick={() => api.patch(`/api/breeding/${r.id}`, { status: "confirmed" }).then(loadRecords)}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-wangari-blue-50 text-badge-blue-text hover:bg-badge-blue-bg transition-colors cursor-pointer"
                      >
                        Confirm Pregnant
                      </button>
                    )}
                    {r.status === "confirmed" && (
                      <button
                        onClick={() => handleMarkBorn(r)}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-wangari-green-500 text-white hover:bg-wangari-green-600 transition-colors cursor-pointer"
                      >
                        <Baby className="h-3 w-3 inline mr-1" />Mark Born
                      </button>
                    )}
                    <button
                      onClick={() => setEditingRecord(r)}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-wangari-gray-50 text-wangari-gray-600 hover:bg-wangari-gray-100 transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-wangari-red-500 hover:bg-tone-bad-bg transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {(showForm || editingRecord) && (
        <BreedingForm
          flockId={flockId}
          flockType={flockType}
          record={editingRecord}
          onSubmit={editingRecord ? handleUpdate : handleCreate}
          onCancel={() => { setShowForm(false); setEditingRecord(null); }}
        />
      )}
    </div>
  );
}

// ─── Breeding Form ─────────────────────────────────────

function BreedingForm({
  flockId,
  flockType,
  record,
  onSubmit,
  onCancel,
}: {
  flockId?: number;
  flockType?: string;
  record: BreedingRecord | null;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    flockId: record?.flockId || flockId || 0,
    sireName: record?.sireName || "",
    sireBreed: record?.sireBreed || "",
    damName: record?.damName || "",
    damBreed: record?.damBreed || "",
    matingDate: record?.matingDate?.split("T")[0] || new Date().toISOString().split("T")[0],
    expectedBirth: record?.expectedBirth?.split("T")[0] || "",
    method: record?.method || "natural",
    notes: record?.notes || "",
  });

  // Auto-calculate expected birth date based on species gestation
  const gestationDays: Record<string, number> = {
    cattle_dairy: 283, cattle_beef: 283,
    goats: 150, sheep: 147, pigs: 114,
    rabbits: 31, kienyeji: 21, layers: 21, broilers: 21,
    fish: 30, bees: 0,
  };

  React.useEffect(() => {
    if (form.matingDate && flockType && gestationDays[flockType]) {
      const mating = new Date(form.matingDate);
      mating.setDate(mating.getDate() + gestationDays[flockType]);
      setForm((prev) => ({ ...prev, expectedBirth: mating.toISOString().split("T")[0] }));
    }
  }, [form.matingDate, flockType]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit(form);
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-wangari-gray-100">
          <h3 className="text-lg font-bold text-wangari-gray-900">
            {record ? "Edit Breeding Record" : "Add Breeding Record"}
          </h3>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-wangari-gray-100 cursor-pointer">
            <X className="h-5 w-5 text-wangari-gray-400" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-wangari-gray-700 block mb-1">Sire Name</label>
              <input value={form.sireName} onChange={(e) => setForm({ ...form, sireName: e.target.value })} placeholder="Male parent" className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-wangari-gray-700 block mb-1">Sire Breed</label>
              <input value={form.sireBreed} onChange={(e) => setForm({ ...form, sireBreed: e.target.value })} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-wangari-gray-700 block mb-1">Dam Name</label>
              <input value={form.damName} onChange={(e) => setForm({ ...form, damName: e.target.value })} placeholder="Female parent" className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-wangari-gray-700 block mb-1">Dam Breed</label>
              <input value={form.damBreed} onChange={(e) => setForm({ ...form, damBreed: e.target.value })} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-wangari-gray-700 block mb-1">Mating Date *</label>
              <input type="date" value={form.matingDate} onChange={(e) => setForm({ ...form, matingDate: e.target.value })} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-wangari-gray-700 block mb-1">Expected Birth</label>
              <input type="date" value={form.expectedBirth} onChange={(e) => setForm({ ...form, expectedBirth: e.target.value })} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-wangari-gray-700 block mb-1">Breeding Method</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500">
              <option value="natural">Natural Mating</option>
              <option value="ai">Artificial Insemination</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-wangari-gray-700 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-xl border border-wangari-border px-4 py-2.5 text-sm focus:ring-2 focus:ring-wangari-green-500/20 focus:border-wangari-green-500 resize-none" placeholder="Any observations about the mating..." />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-wangari-gray-100 bg-wangari-gray-50">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium text-wangari-gray-500 hover:bg-white border border-wangari-border cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !form.matingDate} className="px-6 py-2 rounded-xl text-sm font-semibold bg-wangari-green-700 text-white hover:bg-wangari-green-800 shadow-md cursor-pointer disabled:opacity-50">
            {loading ? "Saving..." : record ? "Update" : "Create"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
