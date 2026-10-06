"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bell, AlertTriangle, Clock, Check, Syringe, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import api from "@/lib/api-client";

interface VaccinationReminder {
  id: number;
  flockId: number;
  flockName: string;
  flockType: string;
  vaccineName: string;
  scheduledDate: string;
  completedDate: string | null;
  status: string;
  notes: string | null;
  daysUntil: number;
}

interface VaccinationRemindersProps {
  onSelectFlock?: (flockId: number) => void;
  /** Restrict to one flock. This panel is rendered INSIDE a single flock's
   *  detail page, so listing every other flock's vaccines there made the page
   *  claim this herd was due for vaccines that belonged to a different herd. */
  flockId?: number;
}

export function VaccinationReminders({ onSelectFlock, flockId }: VaccinationRemindersProps) {
  const [reminders, setReminders] = React.useState<VaccinationReminder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "overdue" | "today" | "week">("all");

  React.useEffect(() => {
    const load = async () => {
      try {
        const [flocks, vaxData] = await Promise.all([
          api.get("/api/flocks"),
          api.get("/api/vaccinations"),
        ]);

        const flockMap = new Map<number, any>();
        (Array.isArray(flocks) ? flocks : []).forEach((f: any) => flockMap.set(f.id, f));

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const items: VaccinationReminder[] = (Array.isArray(vaxData) ? vaxData : [])
          .filter((v: any) => v.status === "pending")
          .filter((v: any) => (flockId === undefined ? true : v.flockId === flockId))
          .map((v: any) => {
            const schedDate = new Date(v.scheduledDate);
            const schedDay = new Date(schedDate.getFullYear(), schedDate.getMonth(), schedDate.getDate());
            const daysUntil = Math.ceil((schedDay.getTime() - today.getTime()) / 86400000);
            const flock = flockMap.get(v.flockId);
            return {
              id: v.id,
              flockId: v.flockId,
              flockName: flock?.name || "Unknown",
              flockType: flock?.type || "",
              vaccineName: v.vaccineName,
              scheduledDate: v.scheduledDate,
              completedDate: v.completedDate,
              status: v.status,
              notes: v.notes,
              daysUntil,
            };
          })
          .sort((a: VaccinationReminder, b: VaccinationReminder) => a.daysUntil - b.daysUntil);

        setReminders(items);
      } catch (err) {
        console.error("Failed to load reminders:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [flockId]);

  const filtered = reminders.filter((r) => {
    if (filter === "overdue") return r.daysUntil < 0;
    if (filter === "today") return r.daysUntil === 0;
    if (filter === "week") return r.daysUntil >= 0 && r.daysUntil <= 7;
    return true;
  });

  const overdueCount = reminders.filter((r) => r.daysUntil < 0).length;
  const todayCount = reminders.filter((r) => r.daysUntil === 0).length;
  const weekCount = reminders.filter((r) => r.daysUntil >= 0 && r.daysUntil <= 7).length;

  const handleMarkDone = async (vaxId: number) => {
    try {
      await api.patch(`/api/vaccinations/${vaxId}`, {
        status: "completed",
        completedDate: new Date().toISOString(),
      });
      setReminders((prev) => prev.filter((r) => r.id !== vaxId));
    } catch (err) {
      console.error("Failed to mark as done:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 rounded-full border-2 border-wangari-green-200 border-t-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alert Summary */}
      {(overdueCount > 0 || todayCount > 0) && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-tone-warn-bg border border-wangari-amber-100">
          <AlertTriangle className="h-5 w-5 text-wangari-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-wangari-amber-800">
              {overdueCount > 0 && `${overdueCount} overdue`}
              {overdueCount > 0 && todayCount > 0 && " • "}
              {todayCount > 0 && `${todayCount} due today`}
            </p>
            <p className="text-xs text-wangari-amber-600">Vaccinations need attention</p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { key: "all" as const, label: "All", count: reminders.length },
          { key: "overdue" as const, label: "Overdue", count: overdueCount, color: "text-wangari-red-600" },
          { key: "today" as const, label: "Today", count: todayCount, color: "text-wangari-amber-600" },
          { key: "week" as const, label: "This Week", count: weekCount, color: "text-wangari-green-600" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
              filter === tab.key
                ? "bg-wangari-green-700 text-white shadow-sm"
                : "bg-wangari-gray-100 text-wangari-gray-600 hover:bg-wangari-border"
            )}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Reminders List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Check className="h-8 w-8 text-wangari-green-300 mb-2" />
          <p className="text-sm text-wangari-gray-400">
            {filter === "all" ? "No pending vaccinations" : `No ${filter} vaccinations`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isOverdue = r.daysUntil < 0;
            const isToday = r.daysUntil === 0;
            const isSoon = r.daysUntil > 0 && r.daysUntil <= 3;

            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all",
                  isOverdue
                    ? "border-tone-bad-border bg-tone-bad-bg/50"
                    : isToday
                    ? "border-tone-warn-border bg-tone-warn-bg/50"
                    : "border-wangari-gray-100 bg-white hover:bg-wangari-gray-50"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
                  isOverdue ? "bg-badge-red-bg text-wangari-red-600" : isToday ? "bg-wangari-amber-100 text-wangari-amber-600" : "bg-wangari-green-50 text-wangari-green-600"
                )}>
                  <Syringe className="h-4 w-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-wangari-gray-900">{r.vaccineName}</span>
                    {isOverdue && (
                      <Badge className="text-[9px] bg-badge-red-bg text-badge-red-text border-tone-bad-border">
                        {Math.abs(r.daysUntil)}d overdue
                      </Badge>
                    )}
                    {isToday && (
                      <Badge className="text-[9px] bg-wangari-amber-100 text-tone-warn-text border-tone-warn-border">
                        Due today
                      </Badge>
                    )}
                    {isSoon && !isToday && (
                      <Badge className="text-[9px] bg-badge-blue-bg text-badge-blue-text border-wangari-blue-200">
                        {r.daysUntil}d
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-wangari-gray-400">{r.flockName}</span>
                    {r.notes && <span className="text-[10px] text-wangari-gray-300">• {r.notes}</span>}
                  </div>
                </div>

                {/* Date */}
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-medium text-wangari-gray-700">
                    {new Date(r.scheduledDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {onSelectFlock && (
                    <button
                      onClick={() => onSelectFlock(r.flockId)}
                      className="p-1.5 rounded-lg hover:bg-wangari-gray-100 text-wangari-gray-400 cursor-pointer"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleMarkDone(r.id)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-wangari-green-500 text-white hover:bg-wangari-green-600 transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
