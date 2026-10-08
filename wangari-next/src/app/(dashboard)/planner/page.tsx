"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CalendarRange, BellPlus, Check, ChevronDown, Sprout, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api-client";
import { useToast } from "@/components/shared/toast";

const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

interface Stage {
  name: string; icon: string; startDay: number; endDay: number;
  tasks: string; state: "upcoming" | "current" | "done";
  startDate: string; endDate: string;
}
interface Plan {
  cropId: number; name: string; cropType: string; variety?: string | null;
  areaAcres?: number | null; plantingDate?: string; daysSincePlanting?: number | null;
  kind?: "annual" | "perennial";
  currentStage: Stage | null; nextStage: Stage | null; stages: Stage[]; hasTemplate: boolean;
}

export default function PlannerPage() {
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [reminding, setReminding] = React.useState<number | null>(null);
  const [done, setDone] = React.useState<Set<number>>(new Set());
  const { showToast, ToastComponent } = useToast();

  const load = React.useCallback(() => {
    setLoading(true);
    api.get("/api/crops/planner")
      .then((d: any) => setPlans(d.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const createReminders = async (cropId: number) => {
    setReminding(cropId);
    try {
      const r = await api.post(`/api/crops/planner/${cropId}/reminders`, {});
      showToast(`${r.count} reminder${r.count === 1 ? "" : "s"} created — see them under Worker Tasks`);
      setDone(new Set([...done, cropId]));
    } catch (err: any) {
      showToast(err?.message || "Could not create reminders");
    } finally {
      setReminding(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" />
      </div>
    );
  }

  const withTemplates = plans.filter(p => p.hasTemplate && p.stages.length > 0);
  const noTemplate = plans.filter(p => !p.hasTemplate);

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader
          title="Season Planner"
          description="Every crop's life cycle from planting to money in your pocket — where each crop is today and what comes next"
          action={<Button onClick={load} variant="outline" className="cursor-pointer gap-1.5"><RefreshCw className="h-4 w-4" /> Refresh</Button>}
        />
      </motion.div>

      {plans.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <CalendarRange className="h-12 w-12 mx-auto text-wangari-gray-300 mb-3" />
            <p className="font-bold text-wangari-gray-900">No crops registered yet</p>
            <p className="text-sm text-wangari-gray-500 mt-1">Register your first crop and the planner builds its full season calendar automatically.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {withTemplates.map((plan) => {
          const isOpen = expanded === plan.cropId;
          const pct = plan.daysSincePlanting != null && plan.stages.length
            ? Math.min(100, Math.round(((plan.daysSincePlanting - plan.stages[0].startDay) / (plan.stages[plan.stages.length - 1].endDay - plan.stages[0].startDay)) * 100))
            : 0;
          return (
            <motion.div key={plan.cropId} initial="hidden" animate="visible" variants={fadeUp}>
              <Card className="border border-wangari-border overflow-hidden">
                {/* Summary row */}
                <button onClick={() => setExpanded(isOpen ? null : plan.cropId)} className="w-full text-left p-5 flex items-center gap-4 hover:bg-wangari-gray-50/70 transition-colors cursor-pointer">
                  <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl bg-wangari-green-50 text-2xl shrink-0">
                    {plan.currentStage?.icon || <Sprout className="h-6 w-6 text-wangari-green-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-wangari-gray-900 truncate">
                      {plan.name} <span className="text-xs font-semibold text-wangari-gray-400">· {plan.cropType}{plan.variety ? ` (${plan.variety})` : ""}{plan.areaAcres ? ` · ${plan.areaAcres} acre${plan.areaAcres !== 1 ? "s" : ""}` : ""}</span>
                    </p>
                    {plan.currentStage ? (
                      <p className="text-xs text-wangari-gray-500 mt-0.5">
                        <span className="font-bold text-wangari-green-700">Now: {plan.currentStage.name}</span>
                        {plan.nextStage && <> · Next: {plan.nextStage.name} ({new Date(plan.nextStage.startDate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })})</>}
                        {plan.daysSincePlanting != null && <> · day {plan.daysSincePlanting}</>}
                      </p>
                    ) : (
                      <p className="text-xs text-wangari-gray-400 mt-0.5">Add a planting date to unlock the calendar</p>
                    )}
                    {/* Stage progress bar */}
                    <div className="mt-2 flex items-center gap-1">
                      {plan.stages.map((s, i) => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full ${s.state === "done" ? "bg-wangari-green-500" : s.state === "current" ? "bg-wangari-green-300 animate-pulse" : "bg-wangari-border"}`} title={s.name} />
                      ))}
                    </div>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-wangari-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Expanded calendar */}
                {isOpen && (
                  <CardContent className="pt-0 pb-5 px-5 border-t border-wangari-gray-100">
                    <div className="mt-4 relative pl-6 space-y-5">
                      {plan.stages.map((s, i) => (
                        <div key={i} className="relative">
                          {/* Timeline dot + line */}
                          <div className={`absolute -left-6 top-1 h-4 w-4 rounded-full border-2 ${s.state === "done" ? "bg-wangari-green-500 border-wangari-green-500" : s.state === "current" ? "bg-white border-wangari-green-500 ring-4 ring-wangari-green-100" : "bg-wangari-gray-100 border-wangari-gray-300"}`} />
                          {i < plan.stages.length - 1 && <div className={`absolute -left-[18px] top-5 h-full w-0.5 ${s.state === "done" ? "bg-wangari-green-300" : "bg-wangari-border"}`} />}
                          <div className={`${s.state === "current" ? "bg-wangari-green-50/80 border border-wangari-green-200 rounded-xl p-3" : ""} ${s.state === "upcoming" ? "opacity-70" : ""}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-lg">{s.icon}</span>
                              <p className={`text-sm font-extrabold ${s.state === "current" ? "text-wangari-green-900" : "text-wangari-gray-800"}`}>{s.name}</p>
                              {s.state === "current" && <span className="rounded-full bg-wangari-green-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">Now</span>}
                              <span className="text-[10px] text-wangari-gray-400">
                                {new Date(s.startDate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })} – {new Date(s.endDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "2-digit" })}
                              </span>
                            </div>
                            <ul className="mt-1.5 space-y-0.5">
                              {(Array.isArray(s.tasks) ? s.tasks : typeof s.tasks === "string" ? s.tasks.split(" • ") : []).map((t, j) => (
                                <li key={j} className="flex gap-1.5 text-xs text-wangari-gray-600"><span className="text-wangari-green-500">▸</span> {t}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex items-center gap-2">
                      <Button
                        onClick={() => createReminders(plan.cropId)}
                        disabled={reminding === plan.cropId || done.has(plan.cropId)}
                        className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer gap-1.5"
                        size="sm"
                      >
                        {done.has(plan.cropId) ? <><Check className="h-4 w-4" /> Reminders created</> : <><BellPlus className="h-4 w-4" /> {reminding === plan.cropId ? "Creating..." : "Create reminders for upcoming stages"}</>}
                      </Button>
                      <p className="text-[10px] text-wangari-gray-400">Creates worker tasks for every stage starting in the next 60 days.</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>

      {noTemplate.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-bold text-wangari-gray-900">Crops without a season template</p>
            <p className="text-xs text-wangari-gray-500 mt-0.5 mb-2">These are tracked but have no calendar yet — add a planting date, or their crop type isn't templated yet.</p>
            <div className="flex flex-wrap gap-1.5">
              {noTemplate.map(p => (
                <span key={p.cropId} className="rounded-full bg-wangari-gray-100 px-2.5 py-1 text-xs font-semibold text-wangari-gray-600">{p.name}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {ToastComponent}
    </div>
  );
}
