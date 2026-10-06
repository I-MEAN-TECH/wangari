"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Syringe, Plus, X, CheckCircle2, Clock, AlertTriangle, Trash2, Calendar, ChevronRight, DollarSign, User, Hash, Edit3, Check } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import { speciesTemplates } from "@/lib/species-templates";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

type FormMode = "schedule" | "record";

export default function VaccinationsPage() {
  const [records, setRecords] = React.useState<any[]>([]);
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("schedule");
  const [filter, setFilter] = React.useState<"all" | "pending" | "completed">("all");
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    flockId: "",
    vaccineName: "",
    scheduledDate: "",
    completedDate: "",
    notes: "",
    costPerDose: "",
    vetName: "",
    batchNumber: "",
    dosesGiven: "",
  });

  const load = () => {
    Promise.all([api.get("/api/vaccinations"), api.get("/api/flocks")])
      .then(([v, f]) => { setRecords(Array.isArray(v) ? v : []); setFlocks(Array.isArray(f) ? f : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const selectedFlock = flocks.find((f: any) => String(f.id) === form.flockId);
  const speciesTemplate = selectedFlock ? Object.values(speciesTemplates).find((t: any) => t.id === selectedFlock.type) : null;
  const suggestedVaccines = speciesTemplate ? speciesTemplate.vaccinationSchedule : [];

  const resetForm = () => {
    setForm({ flockId: "", vaccineName: "", scheduledDate: "", completedDate: "", notes: "", costPerDose: "", vetName: "", batchNumber: "", dosesGiven: "" });
    setEditingId(null);
  };

  const handleSubmit = async () => {
    const payload: any = {
      flockId: Number(form.flockId),
      vaccineName: form.vaccineName,
      scheduledDate: form.scheduledDate || new Date().toISOString(),
      status: formMode === "record" ? "completed" : "pending",
      completedDate: formMode === "record" ? (form.completedDate || new Date().toISOString()) : null,
      notes: [
        form.notes,
        form.costPerDose ? `Cost: KES ${form.costPerDose}` : "",
        form.vetName ? `Vet: ${form.vetName}` : "",
        form.batchNumber ? `Batch: ${form.batchNumber}` : "",
        form.dosesGiven ? `Doses: ${form.dosesGiven}` : "",
      ].filter(Boolean).join(" | ") || null,
    };

    if (editingId) {
      await api.patch(`/api/vaccinations/${editingId}`, payload);
      showToast("Vaccination updated!");
    } else {
      await api.post("/api/vaccinations", payload);
      showToast(formMode === "record" ? "Vaccination recorded!" : "Vaccination scheduled!");
    }

    resetForm();
    setShowForm(false);
    load();
  };

  const handleEdit = (record: any) => {
    setEditingId(record.id);
    setFormMode(record.status === "completed" ? "record" : "schedule");
    // Parse notes back into fields
    const notes = record.notes || "";
    const costMatch = notes.match(/Cost: KES (\d+)/);
    const vetMatch = notes.match(/Vet: ([^|]+)/);
    const batchMatch = notes.match(/Batch: ([^|]+)/);
    const dosesMatch = notes.match(/Doses: ([^|]+)/);

    setForm({
      flockId: String(record.flockId),
      vaccineName: record.vaccineName,
      scheduledDate: record.scheduledDate ? new Date(record.scheduledDate).toISOString().split("T")[0] : "",
      completedDate: record.completedDate ? new Date(record.completedDate).toISOString().split("T")[0] : "",
      notes: notes.replace(/ \| Cost:.*\| Vet:.*\| Batch:.*\| Doses:.*/, "").trim(),
      costPerDose: costMatch?.[1] || "",
      vetName: vetMatch?.[1]?.trim() || "",
      batchNumber: batchMatch?.[1]?.trim() || "",
      dosesGiven: dosesMatch?.[1]?.trim() || "",
    });
    setShowForm(true);
  };

  const handleComplete = async (id: number) => {
    await api.patch(`/api/vaccinations/${id}`, { status: "completed", completedDate: new Date().toISOString() });
    showToast("Done!");
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete?")) return;
    await api.delete("/api/vaccinations/" + id); load();
  };

  const pending = records.filter(r => r.status === "pending");
  const completed = records.filter(r => r.status === "completed");
  const now = new Date();
  const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcoming = pending.filter(r => { const d = new Date(r.scheduledDate); return d >= now && d <= next7; });
  const overdue = pending.filter(r => new Date(r.scheduledDate) < now);

  const totalCost = records.reduce((s, r) => {
    const costMatch = (r.notes || "").match(/Cost: KES (\d+)/);
    return s + (costMatch ? Number(costMatch[1]) : 0);
  }, 0);

  const filtered = records.filter(r => {
    if (filter === "pending" && r.status !== "pending") return false;
    if (filter === "completed" && r.status !== "completed") return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Vaccinations" description="Schedule or record vaccinations for your livestock"
          action={
            <div className="flex gap-2">
              <Button onClick={() => { resetForm(); setFormMode("schedule"); setShowForm(!showForm); }}
                variant="outline" className="border-wangari-green-800 text-wangari-green-800 cursor-pointer">
                <Clock className="h-4 w-4 mr-1" />Schedule
              </Button>
              <Button onClick={() => { resetForm(); setFormMode("record"); setShowForm(!showForm); }}
                className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">
                <Check className="h-4 w-4 mr-1" />Record Done
              </Button>
            </div>
          } />
      </motion.div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border border-wangari-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-wangari-heading">
                      {editingId ? "Edit Vaccination" : formMode === "record" ? "Record Vaccination Done" : "Schedule Vaccination"}
                    </h3>
                    {/* Mode toggle */}
                    {!editingId && (
                      <div className="flex bg-wangari-sunken rounded-lg p-0.5">
                        <button onClick={() => setFormMode("schedule")}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${formMode === "schedule" ? "bg-white text-wangari-green-800 shadow-sm" : "text-wangari-muted"}`}>
                          <Clock className="h-3 w-3 inline mr-1" />Schedule
                        </button>
                        <button onClick={() => setFormMode("record")}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${formMode === "record" ? "bg-white text-wangari-green-800 shadow-sm" : "text-wangari-muted"}`}>
                          <Check className="h-3 w-3 inline mr-1" />Already Done
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="text-wangari-subtle hover:text-wangari-muted cursor-pointer"><X className="h-4 w-4" /></button>
                </div>

                <div className="space-y-3">
                  {/* Flock selection */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-wangari-muted">Which group? *</Label>
                    <select value={form.flockId} onChange={e => setForm({ ...form, flockId: e.target.value, vaccineName: "" })} className="w-full h-11 rounded-xl border border-wangari-border px-3 text-sm">
                      <option value="">Select group</option>
                      {flocks.map((f: any) => <option key={f.id} value={f.id}>{f.name} ({f.breed || f.type || "unknown"})</option>)}
                    </select>
                  </div>

                  {/* Quick-pick from species template */}
                  {suggestedVaccines.length > 0 && !form.vaccineName && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-wangari-muted">Quick pick — {speciesTemplate?.name} vaccines</Label>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {suggestedVaccines.map((v: any, i: number) => (
                          <button key={i} onClick={() => {
                            const base = selectedFlock?.hatchDate ? new Date(selectedFlock.hatchDate) : new Date();
                            const sched = new Date(base.getTime() + v.daysFromStart * 86400000);
                            setForm({ ...form, vaccineName: v.vaccine, scheduledDate: sched.toISOString().split("T")[0], notes: v.description, costPerDose: String(v.cost || "") });
                          }}
                            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-wangari-green-50 border border-wangari-green-200 hover:bg-wangari-green-100 text-left cursor-pointer transition-all">
                            <div>
                              <p className="text-xs font-bold text-wangari-heading">{v.vaccine}</p>
                              <p className="text-[10px] text-wangari-muted">{v.ageLabel} — KES {v.cost}/dose</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-wangari-green-800" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vaccine name — always editable, never blocked */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-wangari-muted">Vaccine name *</Label>
                    <Input placeholder="e.g. Newcastle Disease, FMD, Deworming..." value={form.vaccineName} onChange={e => setForm({ ...form, vaccineName: e.target.value })} className="h-11 rounded-xl" />
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-wangari-muted">{formMode === "record" ? "Date given *" : "Scheduled date *"}</Label>
                      <Input type="date" value={formMode === "record" ? (form.completedDate || form.scheduledDate) : form.scheduledDate}
                        onChange={e => formMode === "record" ? setForm({ ...form, completedDate: e.target.value }) : setForm({ ...form, scheduledDate: e.target.value })}
                        className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-wangari-muted">Doses given</Label>
                      <Input type="number" placeholder="e.g. 500" value={form.dosesGiven} onChange={e => setForm({ ...form, dosesGiven: e.target.value })} className="h-11 rounded-xl" />
                    </div>
                  </div>

                  {/* Cost, Vet, Batch */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-wangari-muted"><DollarSign className="h-3 w-3 inline" />Cost/dose (KES)</Label>
                      <Input type="number" placeholder="0" value={form.costPerDose} onChange={e => setForm({ ...form, costPerDose: e.target.value })} className="h-10 rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-wangari-muted"><User className="h-3 w-3 inline" />Veterinarian</Label>
                      <Input placeholder="Dr. ..." value={form.vetName} onChange={e => setForm({ ...form, vetName: e.target.value })} className="h-10 rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-wangari-muted"><Hash className="h-3 w-3 inline" />Batch #</Label>
                      <Input placeholder="e.g. ND-2024-01" value={form.batchNumber} onChange={e => setForm({ ...form, batchNumber: e.target.value })} className="h-10 rounded-xl text-sm" />
                    </div>
                  </div>

                  {/* Cost summary */}
                  {form.costPerDose && form.dosesGiven && (
                    <div className="rounded-xl bg-wangari-green-50 border border-wangari-green-200 p-3 text-center">
                      <p className="text-[10px] text-wangari-muted">Total cost</p>
                      <p className="text-lg font-extrabold text-wangari-green-800">KES {(Number(form.costPerDose) * Number(form.dosesGiven)).toLocaleString()}</p>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-wangari-muted">Notes (optional)</Label>
                    <Input placeholder="e.g. Given via drinking water, 2nd dose" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-10 rounded-xl text-sm" />
                  </div>

                  <Button onClick={handleSubmit} disabled={!form.flockId || !form.vaccineName}
                    className="w-full h-12 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer disabled:opacity-50 font-bold">
                    {editingId ? "Update" : formMode === "record" ? "✓ Record Vaccination" : "📅 Schedule Vaccination"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reminders */}
      {(overdue.length > 0 || upcoming.length > 0) && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-wangari-green-800" />
                <p className="text-xs font-bold text-wangari-heading">Upcoming (next 7 days)</p>
              </div>
              {overdue.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {overdue.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl bg-red-50 border border-red-200">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        <div>
                          <p className="text-xs font-bold text-red-700">{r.vaccineName}</p>
                          <p className="text-[10px] text-red-500">{r.flock?.name} — overdue</p>
                        </div>
                      </div>
                      <button onClick={() => handleComplete(r.id)} className="px-3 py-1.5 rounded-lg bg-wangari-green-800 text-white text-[10px] font-bold cursor-pointer">Mark Done</button>
                    </div>
                  ))}
                </div>
              )}
              {upcoming.length > 0 ? (
                <div className="space-y-1.5">
                  {upcoming.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <div>
                          <p className="text-xs font-bold text-amber-800">{r.vaccineName}</p>
                          <p className="text-[10px] text-amber-600">{r.flock?.name} — {new Date(r.scheduledDate).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button onClick={() => handleComplete(r.id)} className="px-3 py-1.5 rounded-lg bg-wangari-green-800 text-white text-[10px] font-bold cursor-pointer">Done</button>
                    </div>
                  ))}
                </div>
              ) : overdue.length === 0 && <p className="text-xs text-wangari-subtle text-center py-2">No upcoming vaccinations</p>}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* KPIs */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { title: "Total", value: String(records.length), icon: <Syringe className="h-5 w-5" />, color: "bg-wangari-green-800" },
          { title: "Pending", value: String(pending.length), icon: <Clock className="h-5 w-5" />, color: pending.length > 0 ? "bg-amber-500" : "bg-wangari-green-800" },
          { title: "Done", value: String(completed.length), icon: <CheckCircle2 className="h-5 w-5" />, color: "bg-emerald-500" },
          { title: "Total Cost", value: `KES ${totalCost.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-blue-500" },
        ].map(kpi => (
          <motion.div key={kpi.title} variants={fadeUp}>
            <Card className="border border-wangari-border">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mb-2">{kpi.icon}</div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-wangari-muted">{kpi.title}</p>
                <p className="text-xl font-extrabold text-wangari-heading">{kpi.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "pending", "completed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize ${filter === f ? "bg-wangari-green-800 text-white" : "bg-wangari-sunken text-wangari-muted"}`}>{f}</button>
        ))}
      </div>

      {/* Vaccination cards */}
      {filtered.length === 0 ? <EmptyState title="No vaccinations" description="Schedule or record vaccinations for your groups." /> : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-2">
          {filtered.map(r => {
            const isPending = r.status === "pending";
            const isOverdue = isPending && new Date(r.scheduledDate) < now;
            const costMatch = (r.notes || "").match(/Cost: KES (\d+)/);
            const vetMatch = (r.notes || "").match(/Vet: ([^|]+)/);
            const batchMatch = (r.notes || "").match(/Batch: ([^|]+)/);
            const cleanNotes = (r.notes || "").replace(/ \| Cost:.*$/, "").trim();
            return (
              <motion.div key={r.id} variants={fadeUp}>
                <Card className={`border ${isOverdue ? "border-red-300 bg-red-50/30" : isPending ? "border-amber-200" : "border-wangari-border"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={isPending ? (isOverdue ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200") : "bg-wangari-green-50 text-wangari-green-800 border-wangari-green-200"}>
                            {isPending ? "Pending" : "Done"}
                          </Badge>
                          <span className="text-[10px] text-wangari-subtle">
                            {isPending ? new Date(r.scheduledDate).toLocaleDateString() : (r.completedDate ? new Date(r.completedDate).toLocaleDateString() : "")}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-wangari-heading">{r.vaccineName}</p>
                        <p className="text-[10px] text-wangari-muted">{r.flock?.name || "Unknown group"}</p>
                        {/* Metadata chips */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {costMatch && <span className="inline-flex items-center gap-1 text-[9px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"><DollarSign className="h-2.5 w-2.5" />KES {costMatch[1]}/dose</span>}
                          {vetMatch && <span className="inline-flex items-center gap-1 text-[9px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full"><User className="h-2.5 w-2.5" />{vetMatch[1].trim()}</span>}
                          {batchMatch && <span className="inline-flex items-center gap-1 text-[9px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"><Hash className="h-2.5 w-2.5" />{batchMatch[1].trim()}</span>}
                        </div>
                        {cleanNotes && <p className="text-[10px] text-wangari-subtle mt-1">{cleanNotes}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleEdit(r)} className="p-1.5 rounded-lg text-wangari-subtle hover:bg-gray-100 hover:text-wangari-muted cursor-pointer">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        {isPending && (
                          <button onClick={() => handleComplete(r.id)} className="px-3 py-2 rounded-xl bg-wangari-green-800 text-white text-xs font-bold hover:bg-wangari-green-900 cursor-pointer">Done</button>
                        )}
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg text-wangari-subtle hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {ToastComponent}
    </div>
  );
}
