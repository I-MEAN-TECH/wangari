"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, LogIn, LogOut, Trash2, Users, Calendar, DollarSign, AlertTriangle, Plus, X, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

export default function AttendancePage() {
  const [records, setRecords] = React.useState<any[]>([]);
  const [workers, setWorkers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [showAddWorker, setShowAddWorker] = React.useState(false);
  const [newWorker, setNewWorker] = React.useState({ name: "", role: "", phone: "", dailyWage: "" });
  const { showToast, ToastComponent } = useToast();

  const load = () => {
    Promise.all([api.get("/api/attendance"), api.get("/api/workers")])
      .then(([a, w]) => { setRecords(Array.isArray(a) ? a : []); setWorkers(Array.isArray(w) ? w : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const isToday = selectedDate === new Date().toISOString().split("T")[0];
  const dayRecords = records.filter(r => new Date(r.date).toISOString().split("T")[0] === selectedDate);
  const activeWorkers = workers.filter(w => !w.status || w.status.toLowerCase() === "active");
  const present = dayRecords.filter(r => r.checkIn).length;
  const checkedOut = dayRecords.filter(r => r.checkOut).length;
  const absent = Math.max(0, activeWorkers.length - present);

  // Wage calculation for the day
  const dayWages = dayRecords.reduce((s, r) => s + (r.worker?.dailyWage ? Number(r.worker.dailyWage) : 0), 0);

  const handleClockInOut = async (workerId: number) => {
    try {
      await api.post("/api/attendance", { workerId, date: new Date().toISOString() });
      const worker = workers.find(w => w.id === workerId);
      const existing = dayRecords.find(r => r.workerId === workerId);
      showToast(existing?.checkIn && !existing?.checkOut ? `${worker?.name || "Worker"} clocked out!` : `${worker?.name || "Worker"} clocked in!`);
      load();
    } catch {
      showToast("Failed to record clock in/out. Try again.");
    }
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorker.name.trim()) return;
    try {
      const added: any = await api.post("/api/workers", {
        name: newWorker.name,
        role: newWorker.role || "Farm Hand",
        phone: newWorker.phone || null,
        dailyWage: newWorker.dailyWage ? Number(newWorker.dailyWage) : null,
      });
      setNewWorker({ name: "", role: "", phone: "", dailyWage: "" });
      setShowAddWorker(false);
      showToast(`${added.name || "Worker"} added successfully!`);
      load();
    } catch {
      showToast("Failed to add worker.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this record?")) return;
    await api.delete("/api/attendance/" + id);
    load();
  };

  // Date navigation
  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  return (
    <div className="space-y-6">
      {ToastComponent}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader
          title="Attendance"
          description="Track worker clock in and out"
          action={
            <Button onClick={() => setShowAddWorker(!showAddWorker)} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer font-bold">
              <UserPlus className="h-4 w-4 mr-2" /> Add Worker
            </Button>
          }
        />
      </motion.div>

      {/* Add Worker Inline Modal/Card */}
      {showAddWorker && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <Card className="border border-wangari-green-800/30 bg-wangari-green-50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-wangari-heading">Add New Farm Worker</h3>
                <button onClick={() => setShowAddWorker(false)} className="text-wangari-muted hover:text-wangari-heading"><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={handleAddWorker} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-wangari-muted">Worker Name *</Label>
                  <Input required placeholder="e.g. John Kamau" value={newWorker.name} onChange={e => setNewWorker({ ...newWorker, name: e.target.value })} className="h-10 bg-white" />
                </div>
                <div>
                  <Label className="text-xs text-wangari-muted">Role / Title</Label>
                  <Input placeholder="e.g. Feeder, Milker, General" value={newWorker.role} onChange={e => setNewWorker({ ...newWorker, role: e.target.value })} className="h-10 bg-white" />
                </div>
                <div>
                  <Label className="text-xs text-wangari-muted">Phone (Optional)</Label>
                  <Input placeholder="0712345678" value={newWorker.phone} onChange={e => setNewWorker({ ...newWorker, phone: e.target.value })} className="h-10 bg-white" />
                </div>
                <div>
                  <Label className="text-xs text-wangari-muted">Daily Wage (KES)</Label>
                  <Input type="number" placeholder="500" value={newWorker.dailyWage} onChange={e => setNewWorker({ ...newWorker, dailyWage: e.target.value })} className="h-10 bg-white" />
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2 mt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddWorker(false)}>Cancel</Button>
                  <Button type="submit" className="bg-wangari-green-800 hover:bg-wangari-green-900">Save Worker</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Date picker */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border border-wangari-border">
          <CardContent className="flex items-center justify-between p-4">
            <button onClick={() => changeDate(-1)} className="px-3 py-2 rounded-xl bg-wangari-sunken text-wangari-muted text-sm font-bold cursor-pointer hover:bg-tone-neutral-border">Prev</button>
            <div className="text-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-wangari-green-800" />
                <p className="text-sm font-bold text-wangari-heading">{new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>
              </div>
              {isToday && <p className="text-[10px] text-wangari-green-800 font-bold mt-0.5">Today</p>}
            </div>
            <button onClick={() => changeDate(1)} disabled={isToday} className="px-3 py-2 rounded-xl bg-wangari-sunken text-wangari-muted text-sm font-bold cursor-pointer disabled:opacity-30 hover:bg-tone-neutral-border">Next</button>
          </CardContent>
        </Card>
      </motion.div>

      {/* KPIs */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { title: "Present", value: String(present), icon: <CheckCircle2 className="h-5 w-5" />, color: "bg-wangari-green-500" },
          { title: "Absent", value: String(absent), icon: <AlertTriangle className="h-5 w-5" />, color: absent > 0 ? "bg-wangari-amber-500" : "bg-wangari-green-800" },
          { title: "Checked Out", value: String(checkedOut), icon: <LogOut className="h-5 w-5" />, color: "bg-wangari-green-800" },
          { title: "Day Wages", value: `KES ${dayWages.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-wangari-green-600" },
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

      {/* Quick clock in/out — only show on today */}
      {isToday && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-wangari-green-800" />
                  <p className="text-sm font-extrabold text-wangari-heading">Quick Clock In / Out</p>
                </div>
                <Button size="sm" onClick={() => setShowAddWorker(true)} className="bg-wangari-green-800 text-white text-xs font-bold hover:bg-wangari-green-900">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Worker
                </Button>
              </div>

              {activeWorkers.length === 0 ? (
                <div className="text-center py-8 px-4 bg-tone-neutral-bg rounded-2xl border border-dashed border-wangari-border space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mx-auto">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-wangari-heading">No Farm Workers Found</p>
                    <p className="text-xs text-wangari-muted mt-1 max-w-sm mx-auto">Add workers to your farm profile to clock them in and out each day.</p>
                  </div>
                  <Button onClick={() => setShowAddWorker(true)} className="bg-wangari-green-800 hover:bg-wangari-green-900 font-bold text-xs">
                    <Plus className="h-4 w-4 mr-1.5" /> Add Worker Now
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeWorkers.map(w => {
                    const todayRec = dayRecords.find(r => r.workerId === w.id);
                    const isCheckedIn = todayRec?.checkIn && !todayRec?.checkOut;
                    const isDone = todayRec?.checkIn && todayRec?.checkOut;
                    return (
                      <div key={w.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-tone-neutral-bg border border-wangari-border hover:border-wangari-green-200 transition-all">
                        <div className="flex items-center gap-3">
                          <Avatar name={w.name} size="sm" />
                          <div>
                            <p className="text-sm font-bold text-wangari-heading">{w.name}</p>
                            <p className="text-[11px] text-wangari-muted">{w.role || "Farm Hand"}</p>
                          </div>
                        </div>
                        {isDone ? (
                          <div className="text-right">
                            <Badge className="bg-wangari-gray-100 text-wangari-muted border-wangari-border">Shift Done</Badge>
                            <p className="text-[10px] text-wangari-subtle mt-0.5">{todayRec.checkIn} - {todayRec.checkOut}</p>
                          </div>
                        ) : isCheckedIn ? (
                          <button onClick={() => handleClockInOut(w.id)}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-tone-warn-bg text-tone-warn-text text-xs font-bold border border-tone-warn-border hover:bg-wangari-amber-100 cursor-pointer min-h-[44px]">
                            <LogOut className="h-4 w-4" /> Clock Out
                          </button>
                        ) : (
                          <button onClick={() => handleClockInOut(w.id)}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-wangari-green-800 text-white text-xs font-bold hover:bg-wangari-green-900 cursor-pointer min-h-[44px] shadow-xs">
                            <LogIn className="h-4 w-4" /> Clock In
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Records for selected date */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <p className="text-xs font-bold text-wangari-muted uppercase tracking-wider">Records ({dayRecords.length})</p>
      </motion.div>

      {dayRecords.length === 0 ? <EmptyState title="No records" description={isToday ? "Use the clock in buttons above." : "No attendance on this date."} /> : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-2">
          {dayRecords.map(r => (
            <motion.div key={r.id} variants={fadeUp}>
              <Card className="border border-wangari-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.worker?.name || "?"} size="md" />
                      <div>
                        <p className="text-sm font-bold text-wangari-heading">{r.worker?.name || "Unknown"}</p>
                        <p className="text-[10px] text-wangari-subtle">{r.worker?.role || "Worker"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={r.checkOut ? "bg-wangari-gray-100 text-wangari-muted border-wangari-border" : "bg-wangari-green-50 text-wangari-green-800 border-wangari-green-200"}>{r.checkOut ? "Completed" : "Present"}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-[9px] text-wangari-subtle">In</p>
                        <p className="text-sm font-bold text-wangari-green-800">{r.checkIn || "--:--"}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-wangari-subtle">Out</p>
                        <p className="text-sm font-bold text-wangari-muted">{r.checkOut || "--:--"}</p>
                      </div>
                      {r.worker?.dailyWage && (
                        <div className="text-center">
                          <p className="text-[9px] text-wangari-subtle">Wage</p>
                          <p className="text-sm font-bold text-wangari-heading">KES {Number(r.worker.dailyWage).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleDelete(r.id)} className="text-wangari-subtle hover:text-wangari-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {ToastComponent}
    </div>
  );
}
