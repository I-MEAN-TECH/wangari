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
 *
 * The colours come from `--color-tone-*` in globals.css, never from a raw
 * Tailwind palette value. That keeps the language changeable in one place
 * and guarantees a status can never drift out of step with its own meaning.
 */

export type StatusTone = "good" | "warn" | "bad" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  good: "bg-tone-good-bg text-tone-good-text border-tone-good-border",
  warn: "bg-tone-warn-bg text-tone-warn-text border-tone-warn-border",
  bad: "bg-tone-bad-bg text-tone-bad-text border-tone-bad-border",
  neutral:
    "bg-tone-neutral-bg text-tone-neutral-text border-tone-neutral-border",
};

const TONE_ICON: Record<StatusTone, React.ComponentType<{ className?: string }>> = {
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
  neutral: CircleDashed,
};

export interface StatusChipProps {
  tone?: StatusTone;
  /** Text label shown next to the icon. */
  label?: string;
  /**
   * Optional subject icon (a lucide component) shown BEFORE the tone icon, to
   * say WHAT the status is about — eggs, honey, money.
   *
   * It is additive on purpose. An earlier `emoji` prop REPLACED the tone icon,
   * which quietly destroyed the fixed colour+icon status language this
   * component exists to guarantee: an "owed" chip could render as a smiling
   * face. The tone icon always renders.
   */
  icon?: React.ComponentType<{ className?: string }>;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StatusChip({
  tone = "neutral",
  label,
  icon: SubjectIcon,
  size = "md",
  className,
}: StatusChipProps) {
  const Icon = TONE_ICON[tone];
  const iconSize = size === "lg" ? "h-5 w-5" : "h-4 w-4";
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
      {SubjectIcon ? (
        <SubjectIcon className={cn("shrink-0", iconSize)} aria-hidden />
      ) : null}
      <Icon className={cn("shrink-0", iconSize)} aria-hidden />
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
