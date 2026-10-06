"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Plus, DollarSign, TrendingUp, X, Trash2, Phone, Briefcase, UserCheck, UserX, Edit3, Clock, Calendar, CheckCircle2, Save, Building2, KeyRound, Copy, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const ROLES = ["Farm Manager", "Herdsman", "Farmhand", "Veterinary", "Driver", "Other"];

export default function WorkersPage() {
  const [workers, setWorkers] = React.useState<any[]>([]);
  const [attendance, setAttendance] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [step, setStep] = React.useState(1);
  const [filter, setFilter] = React.useState<"all" | "active" | "inactive">("all");
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [selectedWorker, setSelectedWorker] = React.useState<any>(null);
  const [farmCode, setFarmCode] = React.useState("");
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({ name: "", role: "Farmhand", phone: "", dailyWage: "", pin: "" });

  const load = () => {
    Promise.all([api.get("/api/workers"), api.get("/api/attendance"), api.get("/api/settings")])
      .then(([w, a, s]) => {
        setWorkers(Array.isArray(w) ? w : []);
        setAttendance(Array.isArray(a) ? a : []);
        setFarmCode(s?.farm?.code || "");
        setLoading(false);
      }).catch(() => setLoading(false));
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(farmCode);
      showToast("Farm code copied!");
    } catch {
      showToast("Could not copy code.");
    }
  };

  const regeneratePin = async (w: any) => {
    const updated: any = await api.patch(`/api/workers/${w.id}`, { pin: "" }); // empty = server generates
    setWorkers((prev) => prev.map((x) => (x.id === w.id ? { ...x, pin: updated.pin } : x)));
    if (selectedWorker?.id === w.id) setSelectedWorker((prev: any) => ({ ...prev, pin: updated.pin }));
    showToast(`New PIN: ${updated.pin} — shown once, save it now`);
  };
  React.useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ name: "", role: "Farmhand", phone: "", dailyWage: "", pin: "" }); setEditingId(null); };

  const handleSubmit = async () => {
    const payload: any = { name: form.name, role: form.role, phone: form.phone, dailyWage: Number(form.dailyWage), status: "active" };
    if (form.pin) payload.pin = form.pin;
    if (editingId) {
      await api.patch(`/api/workers/${editingId}`, payload);
      showToast("Worker updated!" + (payload.pin ? ` New PIN: ${payload.pin} — shown once` : ""));
    } else {
      const created: any = await api.post("/api/workers", payload);
      showToast(`Worker added! PIN: ${created.pin} — shown once, save it now`);
    }
    resetForm(); setStep(1); setShowForm(false); load();
  };

  const openEdit = (w: any) => {
    setEditingId(w.id);
    setForm({ name: w.name || "", role: w.role || "Farmhand", phone: w.phone || "", dailyWage: String(w.dailyWage || ""), pin: "" });
    setShowForm(true); setStep(1);
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await api.patch(`/api/workers/${id}`, { status: newStatus });
    showToast(newStatus === "active" ? "Worker activated" : "Worker deactivated");
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this worker?")) return;
    await api.delete("/api/workers/" + id); load();
    if (selectedWorker?.id === id) setSelectedWorker(null);
  };

  const filtered = workers.filter(w => {
    if (filter === "active" && w.status !== "active") return false;
    if (filter === "inactive" && w.status === "active") return false;
    return true;
  });

  const activeWorkers = workers.filter(w => w.status === "active");
  const totalDailyWages = activeWorkers.reduce((s, w) => s + Number(w.dailyWage || 0), 0);
  const monthlyCost = totalDailyWages * 30;

  // Get attendance for selected worker
  const workerAttendance = selectedWorker
    ? attendance.filter(r => r.workerId === selectedWorker.id).slice(0, 14)
    : [];

  // Worker detail view
  if (selectedWorker) {
    const w = workers.find((wr: any) => wr.id === selectedWorker.id) || selectedWorker;
    const workerAtts = attendance.filter(r => r.workerId === w.id);
    const totalDaysWorked = workerAtts.filter(r => r.checkIn).length;
    const totalWages = workerAtts.reduce((s, r) => s + Number(r.worker?.dailyWage || w.dailyWage || 0), 0);

    return (
      <div className="space-y-6">
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <button onClick={() => setSelectedWorker(null)} className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer mb-2">← Back to Workers</button>
        </motion.div>

        {/* Worker header */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={w.name} size="lg" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{w.name}</h1>
              <p className="text-sm text-gray-400">{w.role || "Worker"}{w.phone ? ` • ${w.phone}` : ""}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge className={w.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500"}>{w.status}</Badge>
            <Button onClick={() => openEdit(w)} variant="ghost" size="sm" className="gap-1 cursor-pointer"><Edit3 className="h-4 w-4" />Edit</Button>
          </div>
        </motion.div>

        {/* Worker login PIN */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-green-800/20 bg-wangari-green-50">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wangari-green-800 text-white"><KeyRound className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-wangari-green-800">Login PIN</p>
                    <p className="text-sm text-wangari-text">Worker logs in with <span className="font-bold">{farmCode || "Farm Code"}</span> + this PIN</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* PINs are hashed at rest — the plaintext is only shown once
                      at create/regenerate time, so here we show a masked state. */}
                  <div className="bg-white border-2 border-wangari-green-800 px-4 py-1.5 rounded-xl text-center">
                    <p className="text-xl font-black text-wangari-green-800 tracking-[0.3em]">••••</p>
                  </div>
                  <Button onClick={() => regeneratePin(w)} variant="outline" size="sm" className="gap-1 text-wangari-green-800 cursor-pointer"><RefreshCw className="h-4 w-4" />Regenerate PIN</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Worker stats */}
        <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { title: "Daily Wage", value: `KES ${Number(w.dailyWage || 0).toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-wangari-green-800" },
            { title: "Days Worked", value: String(totalDaysWorked), icon: <Calendar className="h-5 w-5" />, color: "bg-blue-500" },
            { title: "Total Earned", value: `KES ${totalWages.toLocaleString()}`, icon: <TrendingUp className="h-5 w-5" />, color: "bg-emerald-500" },
            { title: "Monthly Est.", value: `KES ${(Number(w.dailyWage || 0) * 30).toLocaleString()}`, icon: <Clock className="h-5 w-5" />, color: "bg-amber-500" },
          ].map(kpi => (
            <motion.div key={kpi.title} variants={fadeUp}>
              <Card className="border border-gray-100">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mb-2">{kpi.icon}</div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{kpi.title}</p>
                  <p className="text-xl font-extrabold text-gray-900">{kpi.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Attendance history */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-gray-100">
            <CardContent className="p-5">
              <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-4">Recent Attendance</h3>
              {workerAtts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No attendance records yet</p>
              ) : (
                <div className="space-y-2">
                  {workerAtts.slice(0, 14).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${r.checkOut ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                          {r.checkOut ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{new Date(r.date).toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric" })}</p>
                          <p className="text-[10px] text-gray-400">{r.checkIn || "--:--"} → {r.checkOut || "--:--"}</p>
                        </div>
                      </div>
                      <Badge className={r.checkOut ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700"}>{r.checkOut ? "Full day" : "Present"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick actions */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-gray-100">
            <CardContent className="p-5">
              <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => openEdit(w)} className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 cursor-pointer">
                  <Edit3 className="h-4 w-4" />Edit Details
                </button>
                <button onClick={() => handleToggleStatus(w.id, w.status)} className={`flex items-center gap-2 p-3 rounded-xl text-xs font-bold cursor-pointer ${w.status === "active" ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}>
                  {w.status === "active" ? <><UserX className="h-4 w-4" />Deactivate</> : <><UserCheck className="h-4 w-4" />Activate</>}
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {ToastComponent}
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Workers" description="Manage farm workers, wages, and attendance"
          action={<Button onClick={() => { resetForm(); setShowForm(!showForm); setStep(1); }} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer"><Plus className="h-4 w-4 mr-2" />Add Worker</Button>} />
      </motion.div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border border-wangari-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-wangari-heading">{editingId ? "Edit Worker" : "Add Worker"}</h3>
                    <div className="flex gap-1">{[1, 2].map(s => <div key={s} className={`h-1.5 w-8 rounded-full ${step >= s ? "bg-wangari-green-800" : "bg-gray-200"}`} />)}</div>
                  </div>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="text-wangari-subtle hover:text-wangari-muted cursor-pointer"><X className="h-4 w-4" /></button>
                </div>

                {step === 1 && (
                  <div className="space-y-3">
                    <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-muted">Full name *</Label><Input placeholder="e.g. Peter Ochieng" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-12 rounded-xl text-base" autoFocus /></div>
                    <Label className="text-xs font-semibold text-wangari-muted">Role</Label>
                    <div className="flex flex-wrap gap-2">
                      {ROLES.map(r => (
                        <button key={r} onClick={() => setForm({ ...form, role: r })}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${form.role === r ? "bg-wangari-green-800 text-white" : "bg-wangari-sunken text-wangari-muted"}`}>{r}</button>
                      ))}
                    </div>
                    <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-muted">Phone</Label><Input placeholder="+254 7XX XXX XXX" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-11 rounded-xl" /></div>
                    <Button onClick={() => form.name && setStep(2)} disabled={!form.name} className="w-full h-11 cursor-pointer">Next</Button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-3">
                    <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-muted">Daily wage (KES) *</Label><Input type="number" placeholder="e.g. 500" value={form.dailyWage} onChange={e => setForm({ ...form, dailyWage: e.target.value })} className="h-12 rounded-xl text-lg font-bold text-center" /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-muted">Login PIN (4 digits)</Label><div className="flex gap-2"><Input type="number" inputMode="numeric" placeholder="Leave blank to auto-generate" value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="h-12 rounded-xl text-base" /></div><p className="text-[10px] text-wangari-subtle">Worker uses this PIN + your Farm Code to log in from their phone.</p></div>
                    {form.dailyWage && (
                      <div className="rounded-xl bg-wangari-green-50 border border-wangari-green-200 p-3 text-center">
                        <p className="text-xs text-wangari-muted">Monthly estimate (30 days)</p>
                        <p className="text-lg font-extrabold text-wangari-green-800">KES {(Number(form.dailyWage) * 30).toLocaleString()}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={() => setStep(1)} variant="outline" className="flex-1 cursor-pointer">Back</Button>
                      <Button onClick={handleSubmit} disabled={!form.name} className="flex-1 h-11 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">{editingId ? "Update" : "Save"}</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Farm Connection Code Banner */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border-2 border-emerald-300 bg-emerald-50/80 p-5 rounded-2xl shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-wangari-green-800 text-white flex items-center justify-center font-bold shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Farm Connection Code</p>
                <p className="text-sm text-wangari-heading font-semibold mt-0.5">Share this code with your farm workers to log in from their phones:</p>
              </div>
            </div>
            <div className="bg-white border-2 border-emerald-400 px-4 py-2 rounded-xl text-center shadow-xs shrink-0">
              <p className="text-xs text-gray-400 font-bold uppercase">Farm Code</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-black text-wangari-green-800 tracking-widest">{farmCode || "…"}</p>
                <button onClick={copyCode} className="text-wangari-green-800 hover:text-wangari-green-900 cursor-pointer" title="Copy farm code"><Copy className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Form */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { title: "Active Workers", value: String(activeWorkers.length), icon: <Users className="h-5 w-5" />, color: "bg-wangari-green-800" },
          { title: "Daily Wages", value: `KES ${totalDailyWages.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-emerald-500" },
          { title: "Monthly Estimate", value: `KES ${monthlyCost.toLocaleString()}`, icon: <TrendingUp className="h-5 w-5" />, color: "bg-amber-500" },
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

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "active", "inactive"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize ${filter === f ? "bg-wangari-green-800 text-white" : "bg-wangari-sunken text-wangari-muted"}`}>{f}</button>
        ))}
      </div>

      {/* Worker cards */}
      {filtered.length === 0 ? <EmptyState title="No workers" description="Add your first worker." /> : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-2">
          {filtered.map(w => {
            const wAtts = attendance.filter(r => r.workerId === w.id);
            const daysWorked = wAtts.length;
            return (
              <motion.div key={w.id} variants={fadeUp}>
                <Card className="border border-wangari-border hover:shadow-md transition-all cursor-pointer" onClick={() => setSelectedWorker(w)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar name={w.name} size="md" />
                        <div>
                          <h3 className="text-sm font-bold text-wangari-heading">{w.name}</h3>
                          <p className="text-[10px] text-wangari-subtle">{w.role || "No role"}{w.phone ? ` • ${w.phone}` : ""}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-wangari-heading">KES {Number(w.dailyWage || 0).toLocaleString()}</p>
                        <p className="text-[9px] text-wangari-subtle">per day</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-wangari-subtle">
                      <Badge className={w.status === "active" ? "bg-wangari-green-50 text-wangari-green-800 border-wangari-green-200" : "bg-gray-100 text-wangari-muted border-gray-200"}>{w.status}</Badge>
                      <span>{daysWorked} days worked</span>
                      <span className="ml-auto text-wangari-subtle">→</span>
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
