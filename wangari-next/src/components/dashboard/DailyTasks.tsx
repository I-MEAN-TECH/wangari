"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Syringe,
  Wheat,
  ClipboardList,
  Heart,
  ChevronRight,
  Bell,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import api from "@/lib/api-client";
import { speciesFor } from "@/lib/species-resolve";
import Link from "next/link";

interface Task {
  id: string;
  type: "vaccination" | "feed" | "production" | "health" | "milestone";
  priority: "urgent" | "due_soon" | "routine";
  title: string;
  description: string;
  flockName: string;
  flockId: number;
  href: string;
  dueDate?: string;
}

function getAgeDays(hatchDate: string | null): number {
  if (!hatchDate) return 0;
  return Math.floor((Date.now() - new Date(hatchDate).getTime()) / 86400000);
}

function generateTasks(flocks: any[]): Task[] {
  const tasks: Task[] = [];
  const now = new Date();

  for (const flock of flocks) {
    if (flock.status !== "active") continue;
    const species = speciesFor(flock);
    if (!species) continue;

    const hatchDate = flock.hatchDate ? new Date(flock.hatchDate) : null;
    const ageDays = getAgeDays(flock.hatchDate);

    // 1. Overdue vaccinations
    const vaccinations = flock.vaccinations || [];
    for (const vax of vaccinations) {
      if (vax.status !== "pending") continue;
      const vaxDate = new Date(vax.scheduledDate);
      const daysUntil = Math.ceil((vaxDate.getTime() - now.getTime()) / 86400000);

      if (daysUntil < 0) {
        // Overdue
        tasks.push({
          id: `vax-overdue-${vax.id}`,
          type: "vaccination",
          priority: "urgent",
          title: `Vaccination overdue: ${vax.vaccineName}`,
          description: `${flock.name} — was due ${Math.abs(daysUntil)} days ago`,
          flockName: flock.name,
          flockId: flock.id,
          href: "/vaccinations",
          dueDate: vax.scheduledDate,
        });
      } else if (daysUntil <= 7) {
        // Due soon
        tasks.push({
          id: `vax-soon-${vax.id}`,
          type: "vaccination",
          priority: "due_soon",
          title: `Vaccination due: ${vax.vaccineName}`,
          description: `${flock.name} — in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`,
          flockName: flock.name,
          flockId: flock.id,
          href: "/vaccinations",
          dueDate: vax.scheduledDate,
        });
      }
    }

    // 2. Feed type switch提醒 (check species template for feed stages)
    if (hatchDate && species.feedTypes.length > 1) {
      // Simple heuristic: check if age crosses a feed stage boundary
      // For poultry: starter (0-6w), grower (6-18w), layer (18w+)
      if (species.category === "poultry") {
        const ageWeeks = ageDays / 7;
        const milestones = [
          { week: 6, from: "Starter", to: "Grower" },
          { week: 18, from: "Grower", to: "Layer/Finisher" },
        ];
        for (const m of milestones) {
          if (Math.abs(ageWeeks - m.week) <= 1 && ageWeeks >= m.week - 1) {
            tasks.push({
              id: `feed-switch-${flock.id}-${m.week}`,
              type: "feed",
              priority: ageWeeks >= m.week ? "urgent" : "due_soon",
              title: `Switch feed: ${m.from} → ${m.to}`,
              description: `${flock.name} — ${Math.round(ageWeeks)} weeks old`,
              flockName: flock.name,
              flockId: flock.id,
              href: "/inventory",
            });
          }
        }
      }
    }

    // 3. Production recording (if no records today)
    const recentProd = flock.production || [];
    const todayStr = now.toISOString().split("T")[0];
    const hasTodayRecord = recentProd.some(
      (p: any) => new Date(p.date).toISOString().split("T")[0] === todayStr
    );

    // Only suggest production recording if animal is old enough (> 7 days for poultry, > 30 days for livestock)
    const minAgeForProduction = species.category === "poultry" ? 7 : 30;
    if (!hasTodayRecord && ageDays >= minAgeForProduction) {
      tasks.push({
        id: `production-${flock.id}`,
        type: "production",
        priority: "routine",
        title: `Record production for ${flock.name}`,
        description: `${flock.currentCount} ${species.category === "poultry" ? "birds" : "animals"} • No entry today`,
        flockName: flock.name,
        flockId: flock.id,
        href: "/production",
      });
    }

    // 4. Mortality alert
    if (flock.mortality > 0) {
      const mortalityRate = (flock.mortality / flock.initialCount) * 100;
      if (mortalityRate > 5) {
        tasks.push({
          id: `mortality-alert-${flock.id}`,
          type: "health",
          priority: "urgent",
          title: `High mortality: ${flock.name}`,
          description: `${mortalityRate.toFixed(1)}% mortality rate — ${flock.mortality} deaths`,
          flockName: flock.name,
          flockId: flock.id,
          href: "/flocks",
        });
      }
    }

    // 5. Milestone: first production expected
    if (hatchDate) {
      const prodMilestoneDays = species.growthCycleDays || 180;
      const daysUntilProd = prodMilestoneDays - ageDays;
      if (daysUntilProd > 0 && daysUntilProd <= 7) {
        tasks.push({
          id: `milestone-prod-${flock.id}`,
          type: "milestone",
          priority: "due_soon",
          title: `${species.productionMetric} expected soon: ${flock.name}`,
          description: `~${daysUntilProd} day${daysUntilProd !== 1 ? "s" : ""} until first ${species.productionMetric.toLowerCase()}`,
          flockName: flock.name,
          flockId: flock.id,
          href: `/flocks`,
        });
      }
    }
  }

  // Sort: urgent first, then due_soon, then routine
  const priorityOrder = { urgent: 0, due_soon: 1, routine: 2 };
  tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return tasks;
}

const typeIcons: Record<string, any> = {
  vaccination: Syringe,
  feed: Wheat,
  production: ClipboardList,
  health: Heart,
  milestone: Bell,
};

const priorityColors: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  urgent: {
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-200",
    icon: "bg-red-500 text-white",
  },
  due_soon: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    icon: "bg-amber-500 text-white",
  },
  routine: {
    bg: "bg-gray-50",
    text: "text-gray-700",
    border: "border-gray-100",
    icon: "bg-emerald-100 text-emerald-700",
  },
};

const priorityLabels: Record<string, string> = {
  urgent: "🔴 URGENT",
  due_soon: "🟡 DUE SOON",
  routine: "🟢 ROUTINE",
};

interface DailyTasksProps {
  flocks: any[];
  compact?: boolean; // for sidebar/widget use
}

export function DailyTasks({ flocks, compact = false }: DailyTasksProps) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [completedIds, setCompletedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setTasks(generateTasks(flocks));
  }, [flocks]);

  const visibleTasks = tasks.filter((t) => !completedIds.has(t.id));
  const grouped = visibleTasks.reduce(
    (acc, task) => {
      acc[task.priority] = acc[task.priority] || [];
      acc[task.priority].push(task);
      return acc;
    },
    {} as Record<string, Task[]>
  );

  const totalTasks = visibleTasks.length;
  const urgentCount = (grouped.urgent || []).length;

  const handleComplete = (taskId: string) => {
    setCompletedIds((prev) => new Set([...prev, taskId]));
  };

  if (totalTasks === 0) {
    return (
      <Card className="border border-emerald-100 bg-emerald-50/50">
        <CardContent className="p-5 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-emerald-800">All caught up! 🎉</p>
          <p className="text-xs text-emerald-600 mt-1">
            No urgent tasks for your livestock today
          </p>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1.5">
        {visibleTasks.slice(0, 5).map((task) => {
          const Icon = typeIcons[task.type] || Clock;
          const colors = priorityColors[task.priority];
          return (
            <Link key={task.id} href={task.href}>
              <div
                className={`flex items-center gap-2.5 p-2 rounded-lg ${colors.bg} border ${colors.border} hover:opacity-80 transition-opacity cursor-pointer`}
              >
                <div className={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
                  <Icon className="h-3 w-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-semibold ${colors.text} truncate`}>
                    {task.title}
                  </p>
                </div>
                <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
              </div>
            </Link>
          );
        })}
        {visibleTasks.length > 5 && (
          <p className="text-[10px] text-gray-400 text-center">
            +{visibleTasks.length - 5} more tasks
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-bold text-gray-900">
            Today&apos;s Tasks
          </p>
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
            {totalTasks} remaining
          </Badge>
          {urgentCount > 0 && (
            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
              {urgentCount} urgent
            </Badge>
          )}
        </div>
      </div>

      {/* Task groups */}
      {(["urgent", "due_soon", "routine"] as const).map((priority) => {
        const groupTasks = grouped[priority];
        if (!groupTasks || groupTasks.length === 0) return null;
        const colors = priorityColors[priority];

        return (
          <div key={priority}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              {priorityLabels[priority]}
            </p>
            <div className="space-y-1.5">
              {groupTasks.map((task) => {
                const Icon = typeIcons[task.type] || Clock;
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center gap-3 p-3 rounded-xl ${colors.bg} border ${colors.border}`}
                  >
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.icon}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold ${colors.text}`}>{task.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{task.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Link
                        href={task.href}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Go
                      </Link>
                      <button
                        onClick={() => handleComplete(task.id)}
                        className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors cursor-pointer"
                        title="Mark done"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
