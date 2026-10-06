"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Egg,
  Milk,
  Wheat,
  Heart,
  CheckCircle2,
  ListTodo,
  RefreshCw,
  Plus,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Check,
  Sparkles,
  ClipboardList,
  LogIn,
  LogOut,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api-client";
import { WorkerQuickLogModal } from "@/components/worker/WorkerQuickLogModal";
import { WorkerTaskCard } from "@/components/worker/WorkerTaskCard";
import { useAuth } from "@/hooks/useAuth";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function WorkerDashboardPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = React.useState<any[]>([]);
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [activities, setActivities] = React.useState<any[]>([]);
  const [attendance, setAttendance] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [clocking, setClocking] = React.useState(false);

  // Calendar State
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());

  // Quick Log Modal state
  const [modalOpen, setModalOpen] = React.useState(false);
  const [logType, setLogType] = React.useState<"eggs" | "milk" | "feed" | "mortality">("eggs");

  const fetchData = async () => {
    try {
      const [tasksRes, flocksRes, activityRes, attRes] = await Promise.allSettled([
        api.get("/api/worker/tasks"),
        api.get("/api/flocks"),
        api.get("/api/worker/my-activity"),
        api.get("/api/worker/my-attendance"),
      ]);

      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value)) {
        setTasks(tasksRes.value);
      }
      if (flocksRes.status === "fulfilled" && Array.isArray(flocksRes.value)) {
        setFlocks(flocksRes.value);
      }
      if (activityRes.status === "fulfilled" && Array.isArray(activityRes.value)) {
        setActivities(activityRes.value);
      }
      if (attRes.status === "fulfilled" && Array.isArray(attRes.value)) {
        setAttendance(attRes.value);
      }
    } catch (err) {
      console.error("Worker dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleToggleTask = async (taskId: number) => {
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t))
    );
    try {
      await api.post(`/api/worker/tasks/${taskId}/complete`, {});
      fetchData();
    } catch (err) {
      console.error("Failed to complete task:", err);
      fetchData();
    }
  };

  const openLog = (type: "eggs" | "milk" | "feed" | "mortality") => {
    setLogType(type);
    setModalOpen(true);
  };

  const handleClock = async () => {
    setClocking(true);
    try {
      await api.post("/api/worker/clock", {});
      fetchData();
    } catch (err) {
      console.error("Clock failed:", err);
    } finally {
      setClocking(false);
    }
  };

  // Attendance state derived from records
  const todayStr = new Date().toISOString().split("T")[0];
  const todayAtt = attendance.find(
    (r) => new Date(r.date).toISOString().split("T")[0] === todayStr
  );
  const clockState: "none" | "in" | "done" = todayAtt?.checkIn
    ? todayAtt?.checkOut
      ? "done"
      : "in"
    : "none";
  const daysWorked = attendance.filter((r) => r.checkIn).length;

  // Calendar Date Navigation
  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const totalTasks = tasks.length;
  // No tasks assigned = nothing to show yet, not 100% success.
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  const progressLabel =
    totalTasks === 0 ? "No tasks assigned yet" : `${completedCount} of ${totalTasks} tasks completed`;

  // Compute 7-day activity chart data from activities
  const activityChartData = React.useMemo(() => {
    const daysMap: Record<string, { day: string; eggs: number; milk: number; feed: number }> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const dayLabel = i === 0 ? "Today" : d.toLocaleDateString("en-KE", { weekday: "short" });
      daysMap[key] = { day: dayLabel, eggs: 0, milk: 0, feed: 0 };
    }

    activities.forEach((act) => {
      const dateKey = new Date(act.createdAt).toISOString().split("T")[0];
      if (daysMap[dateKey]) {
        const qty = Number(act.quantity) || 0;
        if (act.type === "eggs") daysMap[dateKey].eggs += qty;
        else if (act.type === "milk") daysMap[dateKey].milk += qty;
        else if (act.type === "feed") daysMap[dateKey].feed += qty;
      }
    });

    return Object.values(daysMap);
  }, [activities]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="h-10 w-10 text-wangari-green-800 animate-spin" />
        <p className="text-sm font-extrabold text-wangari-muted">Loading Worker Portal...</p>
      </div>
    );
  }

  return (
    <div className="w-full pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Worker Header */}
      <div className="bg-wangari-ink p-6 rounded-2xl text-white shadow-xl flex items-center justify-between lg:col-span-12">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-wangari-green-500/20 text-wangari-green-100-300 border border-wangari-green-700/30 uppercase tracking-wider">
              Worker Portal
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-2 flex items-center gap-2">
            Hello, {user?.name?.split(" ")[0] || "Worker"}!
          </h1>
          <p className="text-xs text-wangari-green-100 font-medium mt-1">
            Tap any big card below to log output or mark tasks done.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="p-3 bg-wangari-card/10 hover:bg-wangari-card/20 text-white rounded-2xl cursor-pointer transition-all"
        >
          <RefreshCw className={`h-6 w-6 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* INTERACTIVE CALENDAR WIDGET */}
      <Card className="border border-wangari-border bg-wangari-card rounded-2xl p-4 shadow-sm lg:col-span-7">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wangari-green-50 text-wangari-green-800 shrink-0">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-wangari-heading">Farm Calendar</h3>
              <p className="text-xs text-wangari-muted">
                {isToday ? "Today" : selectedDate.toLocaleDateString("en-KE", { weekday: "long" })},{" "}
                {selectedDate.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 rounded-xl border border-wangari-border hover:bg-wangari-cream text-wangari-heading cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isToday
                  ? "bg-wangari-green-800 text-white border-wangari-green-800"
                  : "bg-wangari-cream text-wangari-heading border-wangari-border hover:bg-wangari-cream"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => changeDate(1)}
              className="p-2 rounded-xl border border-wangari-border hover:bg-wangari-cream text-wangari-heading cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 7-Day Pill Selector */}
        <div className="flex justify-between gap-1 overflow-x-auto pt-1">
          {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
            const dateObj = new Date();
            dateObj.setDate(dateObj.getDate() + offset);
            const isSelected = selectedDate.toDateString() === dateObj.toDateString();
            const dayName = dateObj.toLocaleDateString("en-KE", { weekday: "short" });
            const dayNum = dateObj.getDate();

            return (
              <button
                key={offset}
                onClick={() => setSelectedDate(dateObj)}
                className={`flex-1 py-2 px-1 text-center rounded-2xl transition-all cursor-pointer border ${
                  isSelected
                    ? "bg-wangari-green-800 text-white border-wangari-green-800 shadow-sm font-black"
                    : "bg-wangari-cream text-wangari-muted border-transparent hover:bg-wangari-cream font-semibold"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wider">{dayName}</p>
                <p className="text-sm font-black mt-0.5">{dayNum}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Task Progress Summary */}
      <Card className="border-2 border-wangari-green-200 bg-wangari-green-50 rounded-2xl p-5 shadow-sm lg:col-span-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-wangari-green-800 text-white flex items-center justify-center font-black text-lg shadow-xs">
              {progressPct}%
            </div>
            <div>
              <h3 className="text-base font-black text-wangari-heading">Daily Task Progress</h3>
              <p className="text-xs font-bold text-wangari-muted">{progressLabel}</p>
            </div>
          </div>
          {progressPct === 100 && totalTasks > 0 && (
            // "All Done" badge only appears when there is at least one task
            <span className="px-3 py-1.5 bg-wangari-green-800 text-white text-xs font-extrabold rounded-full flex items-center gap-1 shadow-xs">
              <CheckCircle2 className="h-4 w-4" /> All Done
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="w-full h-3 bg-wangari-green-200 rounded-full mt-4 overflow-hidden">
          <div
            className="h-full bg-wangari-green-800 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </Card>

      {/* CLOCK IN / OUT + THIS WEEK'S ATTENDANCE */}
      <Card className="border border-wangari-border bg-wangari-card rounded-2xl p-5 shadow-sm lg:col-span-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wangari-green-50 text-wangari-green-800 shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-wangari-heading">My Attendance</h3>
              <p className="text-xs text-wangari-muted">{daysWorked} days worked in the last 7</p>
            </div>
          </div>
          {clockState === "none" && (
            <button
              onClick={handleClock}
              disabled={clocking}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-wangari-green-800 text-white text-xs font-bold hover:bg-wangari-green-900 cursor-pointer min-h-[44px] shadow-xs disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" /> Clock In
            </button>
          )}
          {clockState === "in" && (
            <button
              onClick={handleClock}
              disabled={clocking}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-tone-warn-bg text-tone-warn-text text-xs font-bold border border-tone-warn-border hover:bg-tone-warn-bg cursor-pointer min-h-[44px] disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> Clock Out
            </button>
          )}
          {clockState === "done" && (
            <span className="px-3 py-1.5 rounded-xl bg-wangari-cream text-wangari-muted text-xs font-bold">
              {todayAtt.checkIn} – {todayAtt.checkOut}
            </span>
          )}
        </div>

        {attendance.length === 0 ? (
          <p className="text-xs text-wangari-subtle text-center py-4">
            No attendance yet — clock in to start your shift.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {attendance.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl bg-wangari-cream border border-wangari-border"
              >
                <div>
                  <p className="text-xs font-extrabold text-wangari-heading">
                    {new Date(r.date).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  <p className="text-[10px] text-wangari-subtle">
                    {r.checkIn || "--:--"} – {r.checkOut || "working…"}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    r.checkOut
                      ? "bg-wangari-cream text-wangari-muted"
                      : "bg-wangari-green-50 text-wangari-green-800"
                  }`}
                >
                  {r.checkOut ? "Done" : "Present"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* GIANT QUICK LOG CARDS (No Emojis — Lucide Icons Only) */}
      <div className="lg:col-span-12">
        <h2 className="text-xs font-black text-wangari-muted uppercase tracking-wider mb-3 px-1">
          Quick Logging (Tap to Record)
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Log Eggs */}
          <motion.div
            whileTap={{ scale: 0.96 }}
            onClick={() => openLog("eggs")}
            className="p-5 rounded-2xl bg-wangari-green-800 text-white shadow-lg cursor-pointer hover:bg-wangari-green-900 transition-all flex flex-col justify-between h-36 border-2 border-wangari-green-700"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wangari-card/25 text-white shrink-0">
                <Egg className="h-6 w-6 stroke-[2.5]" />
              </div>
              <Plus className="h-6 w-6 text-white/80" />
            </div>
            <div>
              <h3 className="text-xl font-black">Log Eggs</h3>
              <p className="text-xs text-wangari-green-100 font-medium">Record egg harvest</p>
            </div>
          </motion.div>

          {/* Log Milk */}
          <motion.div
            whileTap={{ scale: 0.96 }}
            onClick={() => openLog("milk")}
            className="p-5 rounded-2xl bg-wangari-green-800 text-white shadow-lg cursor-pointer hover:bg-wangari-green-900 transition-all flex flex-col justify-between h-36 border-2 border-wangari-sky-500"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wangari-card/25 text-white shrink-0">
                <Milk className="h-6 w-6 stroke-[2.5]" />
              </div>
              <Plus className="h-6 w-6 text-white/80" />
            </div>
            <div>
              <h3 className="text-xl font-black">Log Milk</h3>
              <p className="text-xs text-wangari-green-100 font-medium">Record litres milked</p>
            </div>
          </motion.div>

          {/* Log Feed */}
          <motion.div
            whileTap={{ scale: 0.96 }}
            onClick={() => openLog("feed")}
            className="p-5 rounded-2xl bg-wangari-green-800 text-white shadow-lg cursor-pointer hover:bg-wangari-green-900 transition-all flex flex-col justify-between h-36 border-2 border-wangari-green-700"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wangari-card/25 text-white shrink-0">
                <Wheat className="h-6 w-6 stroke-[2.5]" />
              </div>
              <Plus className="h-6 w-6 text-white/80" />
            </div>
            <div>
              <h3 className="text-xl font-black">Log Feed</h3>
              <p className="text-xs text-wangari-green-100 font-medium">Record feed given</p>
            </div>
          </motion.div>

          {/* Log Loss */}
          <motion.div
            whileTap={{ scale: 0.96 }}
            onClick={() => openLog("mortality")}
            className="p-5 rounded-2xl bg-wangari-green-800 text-white shadow-lg cursor-pointer hover:bg-wangari-green-900 transition-all flex flex-col justify-between h-36 border-2 border-wangari-rose-500"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wangari-card/25 text-white shrink-0">
                <Heart className="h-6 w-6 stroke-[2.5]" />
              </div>
              <Plus className="h-6 w-6 text-white/80" />
            </div>
            <div>
              <h3 className="text-xl font-black">Log Animal Loss</h3>
              <p className="text-xs text-wangari-green-100 font-medium">Record dead animals</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* WORKER OUTPUT CHART (GOOD CHARTS) */}
      <Card className="border border-wangari-border bg-wangari-card rounded-2xl p-5 shadow-sm lg:col-span-7">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wangari-green-50 text-wangari-green-800 shrink-0">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-wangari-heading">Weekly Logged Output</h3>
              <p className="text-xs text-wangari-muted">Output trends over the past 7 days</p>
            </div>
          </div>
        </div>

        <div className="h-48 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748B" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748B" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0F172A", color: "#fff", borderRadius: "12px", border: "none" }}
              />
              <Bar dataKey="eggs" fill="#166534" radius={[6, 6, 0, 0]} name="Eggs" />
              <Bar dataKey="milk" fill="#0284C7" radius={[6, 6, 0, 0]} name="Milk (L)" />
              <Bar dataKey="feed" fill="#D97706" radius={[6, 6, 0, 0]} name="Feed (kg)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* TODAY'S TASKS LIST */}
      <div className="space-y-3 lg:col-span-5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-wangari-muted uppercase tracking-wider">
            Assigned Tasks ({tasks.length})
          </h2>
          <span className="text-xs font-bold text-wangari-green-800 bg-wangari-green-50 px-2.5 py-1 rounded-full border border-wangari-green-200">
            {completedCount} completed
          </span>
        </div>

        {tasks.length === 0 ? (
          <Card className="border-2 border-dashed border-wangari-border p-8 text-center rounded-2xl bg-wangari-cream/50">
            <ListTodo className="h-10 w-10 text-wangari-subtle mx-auto mb-2" />
            <p className="text-sm font-extrabold text-wangari-heading">No tasks assigned today</p>
            <p className="text-xs text-wangari-muted mt-1">Use the big logging cards above to record farm activity.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <WorkerTaskCard
                key={task.id}
                task={task}
                onToggleComplete={handleToggleTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* TODAY'S ACTIVITY LOG */}
      {activities.length > 0 && (
        <div className="space-y-3 pt-2 lg:col-span-12">
          <h2 className="text-xs font-black text-wangari-muted uppercase tracking-wider px-1">
            My Activity History ({activities.length})
          </h2>
          <Card className="border border-wangari-border rounded-2xl p-4 divide-y divide-wangari-border bg-wangari-card">
            {activities.map((act) => (
              <div key={act.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-wangari-green-50 text-wangari-green-800 shrink-0">
                    <Check className="h-5 w-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-wangari-heading capitalize">
                      Logged {act.quantity} {act.unit || act.type}
                    </p>
                    <p className="text-[10px] text-wangari-subtle">
                      {new Date(act.createdAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-wangari-muted bg-wangari-cream px-2.5 py-1 rounded-xl uppercase">
                  {act.type}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}
      </div>

      {/* Quick Modal */}
      <WorkerQuickLogModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        type={logType}
        flocks={flocks}
        onSuccess={fetchData}
      />
    </div>
  );
}
