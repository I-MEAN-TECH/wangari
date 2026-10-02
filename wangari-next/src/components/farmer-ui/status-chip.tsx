"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * StatusChip — one status language for the whole app.
 *
 * A farmer who cannot read still understands a green tick and a red cross.
 * Colour + icon is the message; the word is a second layer only.
 *
 * Meaning is FIXED app-wide so it can be learned once:
 *   good     = green, check    → paid, saved, done, healthy
 *   warn     = amber, triangle → due, low, pending attention
 *   bad      = red, x          → overdue, lost, failed
 *   neutral  = grey, dashed    → not started, no data
 */

export type StatusTone = "good" | "warn" | "bad" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  good: "bg-green-50 text-green-800 border-green-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-gray-50 text-gray-600 border-gray-200",
};

const TONE_ICON: Record<StatusTone, React.ComponentType<{ className?: string }>> = {
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
  neutral: CircleDashed,
};

export interface StatusChipProps {
  tone?: StatusTone;
  /** Swahili label shown next to the icon. */
  label?: string;
  /** Optional emoji, used instead of the lucide icon when provided. */
  emoji?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StatusChip({
  tone = "neutral",
  label,
  emoji,
  size = "md",
  className,
}: StatusChipProps) {
  const Icon = TONE_ICON[tone];
  const sizing =
    size === "lg"
      ? "px-4 py-2 text-base gap-2"
      : size === "sm"
        ? "px-2 py-0.5 text-xs gap-1"
        : "px-3 py-1 text-sm gap-1.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold",
        TONE_CLASS[tone],
        sizing,
        className
      )}
    >
      {emoji ? (
        <span aria-hidden className="leading-none">
          {emoji}
        </span>
      ) : (
        <Icon
          className={cn("shrink-0", size === "lg" ? "h-5 w-5" : "h-4 w-4")}
        />
      )}
      {label ? <span className="whitespace-nowrap">{label}</span> : null}
    </span>
  );
}

/** Map a domain status string onto the fixed tone language. */
export function toneForStatus(status?: string | null): StatusTone {
  const s = (status || "").toLowerCase();
  if (["paid", "completed", "active", "healthy", "good", "closed"].includes(s))
    return "good";
  if (["pending", "due", "partial", "scheduled", "low", "overdue"].includes(s))
    return s === "overdue" ? "bad" : "warn";
  if (["disputed", "failed", "cancelled", "dead", "missing", "sold", "moved"].includes(s))
    return "bad";
  return "neutral";
}

export default StatusChip;
