"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  HandCoins, FileWarning, TrendingDown, TrendingUp, Wheat, Package, Syringe, Baby,
  ShieldAlert, CalendarX, ClipboardList, ListTodo, CalendarClock, ChevronRight,
  RefreshCw, Sparkles, AlertOctagon, CircleCheck,
} from "lucide-react";
import { CARD_PANEL_P5 } from "@/components/ui/patterns";

const ICONS: Record<string, any> = {
  HandCoins, FileWarning, TrendingDown, TrendingUp, Wheat, Package, Syringe, Baby,
  ShieldAlert, CalendarX, ClipboardList, ListTodo, CalendarClock,
};

const PRIORITY_STYLES: Record<string, { ring: string; chip: string; label: string }> = {
  critical: { ring: "border-tone-bad-border bg-tone-bad-bg/60", chip: "bg-wangari-red-600 text-white", label: "Act now" },
  high: { ring: "border-tone-warn-border bg-tone-warn-bg/60", chip: "bg-wangari-amber-500 text-white", label: "Today" },
  medium: { ring: "border-wangari-sky-200 bg-wangari-sky-50/50", chip: "bg-wangari-sky-600 text-white", label: "This week" },
  info: { ring: "border-wangari-stone-200 bg-wangari-stone-50/70", chip: "bg-wangari-stone-500 text-white", label: "FYI" },
};

interface Action {
  id: string;
  priority: "critical" | "high" | "medium" | "info";
  icon: string;
  title: string;
  detail: string;
  moneyImpact?: string;
  href: string;
  cta: string;
}

export function ActionCenter() {
  const [actions, setActions] = React.useState<Action[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    import("@/lib/api-client").then(({ default: api }) =>
      api.get("/api/dashboard/actions")
        .then((d: any) => setActions(d.actions || []))
        .catch(() => {})
        .finally(() => setLoading(false))
    );
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Refresh when the farm's data changes elsewhere (payments, production saves)
  React.useEffect(() => {
    const refetch = () => load();
    window.addEventListener("wangari:subscription_updated", refetch);
    return () => window.removeEventListener("wangari:subscription_updated", refetch);
  }, [load]);

  if (loading) {
    return (
      <div className={CARD_PANEL_P5}>
        <div className="flex items-center gap-2 text-sm font-bold text-wangari-muted">
          <Sparkles className="h-4 w-4 text-wangari-green-600 animate-pulse" />
          Analyzing your farm...
        </div>
      </div>
    );
  }

  // Nothing to act on — celebrate it, briefly
  if (actions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-wangari-green-200 bg-gradient-to-r from-wangari-green-50 to-wangari-teal-50 p-5"
      >
        <div className="flex items-center gap-3">
          <CircleCheck className="h-6 w-6 text-wangari-green-600" />
          <div>
            <p className="text-sm font-extrabold text-wangari-green-900">All clear — nothing needs your attention right now</p>
            <p className="text-xs text-wangari-green-700">Keep recording daily and the Action Center will flag money, health and harvest decisions the moment they matter.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const criticalCount = actions.filter(a => a.priority === "critical").length;
  const shown = expanded ? actions : actions.slice(0, 4);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-wangari-border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-wangari-border bg-gradient-to-r from-wangari-green-50/80 to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-wangari-green-800 text-white">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-black text-wangari-heading flex items-center gap-2">
              Action Center
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-wangari-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white animate-pulse">
                  <AlertOctagon className="h-3 w-3" /> {criticalCount} urgent
                </span>
              )}
            </p>
            <p className="text-[11px] text-wangari-muted">What your farm data says to do next — ranked by money at stake</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-xl hover:bg-wangari-green-50 text-wangari-muted cursor-pointer" title="Re-analyze">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Actions */}
      <div className="divide-y divide-wangari-border/70">
        <AnimatePresence initial={false}>
          {shown.map((a, i) => {
            const Icon = ICONS[a.icon] || ClipboardList;
            const style = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.medium;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={`flex items-start gap-3 px-5 py-3.5 border-l-4 ${style.ring}`}
                style={{ borderLeftColor: a.priority === "critical" ? "var(--color-wangari-red-600)" : a.priority === "high" ? "var(--color-wangari-amber-500)" : a.priority === "medium" ? "var(--color-wangari-sky-600)" : "var(--color-wangari-stone-400)" }}
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-wangari-border/60">
                  <Icon className="h-4.5 w-4.5 text-wangari-heading" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${style.chip}`}>
                      {style.label}
                    </span>
                    <p className="text-sm font-extrabold text-wangari-heading leading-snug">{a.title}</p>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-wangari-muted">{a.detail}</p>
                  {a.moneyImpact && (
                    <p className="mt-1 inline-flex items-center rounded-md bg-wangari-green-50 px-1.5 py-0.5 text-[10px] font-bold text-wangari-green-800">
                      {a.moneyImpact}
                    </p>
                  )}
                </div>
                <Link href={a.href} className="mt-1 flex shrink-0 items-center gap-0.5 rounded-xl bg-wangari-green-800 px-3 py-2 text-[11px] font-extrabold text-white hover:bg-wangari-green-700 transition-colors cursor-pointer">
                  {a.cta} <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {actions.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2.5 text-center text-xs font-bold text-wangari-green-700 hover:bg-wangari-green-50 transition-colors cursor-pointer"
        >
          {expanded ? "Show less" : `Show ${actions.length - 4} more action${actions.length - 4 === 1 ? "" : "s"}`}
        </button>
      )}
    </motion.div>
  );
}
