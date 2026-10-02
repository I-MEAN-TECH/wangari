"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stepper — "how many today?"
 *
 * THE most-used control in the product. Production logging is a count, and a
 * count should never be typed. Two large buttons, the number in the middle as
 * big as possible, so a farmer who cannot read still recognises the number
 * shape.
 *
 * SIZING: the keys are h-16 (64px) rather than the house h-10, and the value is
 * text-4xl rather than text-xl. That is deliberate and is the one place this
 * component steps outside the app's standard sizing — it is a counting control
 * used one-handed, often in sun, sometimes with gloves on. It still follows the
 * house system for colour (tokens only), radius (rounded-2xl) and spacing; only
 * the touch target is scaled up, because shrinking a count key makes the
 * primary daily action slower and error-prone. 64px is well clear of the 44px
 * minimum touch target, so nothing here breaks accessibility.
 *
 * Defaults to integers because egg/bird/head counts are whole numbers; pass
 * `step={0.5}` for milk litres or kg weights.
 */

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  /**
   * Optional subject icon (a lucide component) shown before the label, to say
   * what is being counted. Icons, never emoji: emoji render differently per
   * platform, ignore the text colour, and cannot be sized to match an icon set.
   */
  icon?: React.ComponentType<{ className?: string }>;
  step?: number;
  min?: number;
  max?: number;
  /** Unit shown after the number, e.g. "trays", "litres", "kg". */
  unit?: string;
  disabled?: boolean;
  className?: string;
}

export function Stepper({
  value,
  onChange,
  label,
  icon: Icon,
  step = 1,
  min = 0,
  max = 1_000_000,
  unit,
  disabled = false,
  className,
}: StepperProps) {
  const round = (n: number) => Number(n.toFixed(2));

  const bump = (dir: 1 | -1) => {
    if (disabled) return;
    const next = round(value + dir * step);
    onChange(Math.min(max, Math.max(min, next)));
  };

  // Long-press repeats, because counting 50 eggs one tap at a time is absurd.
  // Holding "+" adds 10x the step, which is how a farmer actually counts.
  const holdTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRepeat = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startHold = () => {
    holdTimer.current = setTimeout(() => {
      holdRepeat.current = setInterval(() => {
        const next = round(valueRef.current + 10 * step);
        onChangeRef.current(Math.min(max, Math.max(min, next)));
      }, 90);
    }, 450);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (holdRepeat.current) clearInterval(holdRepeat.current);
    holdTimer.current = null;
    holdRepeat.current = null;
  };
  // Refs so the interval always sees fresh values without re-binding handlers.
  const valueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;
  React.useEffect(() => endHold, []);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-wangari-border bg-wangari-card p-4",
        className
      )}
    >
      {label ? (
        <div className="flex items-center gap-2 text-center">
          {Icon ? (
            <Icon className="h-4 w-4 shrink-0 text-wangari-muted" aria-hidden />
          ) : null}
          <span className="text-sm font-semibold text-wangari-muted">{label}</span>
        </div>
      ) : null}

      <div className="flex w-full items-center gap-3">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => bump(-1)}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          aria-label={`Reduce ${label ?? "amount"}`}
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl",
            "border border-tone-bad-border bg-tone-bad-bg text-tone-bad-text",
            "transition-transform active:scale-95 disabled:opacity-40"
          )}
        >
          <Minus className="h-8 w-8" aria-hidden />
        </button>

        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-wangari-cream px-2 py-3">
          <span className="font-mono text-4xl font-bold tabular-nums text-wangari-heading">
            {value}
          </span>
          {unit ? (
            <span className="text-xs font-medium text-wangari-muted">{unit}</span>
          ) : null}
        </div>

        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => bump(1)}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          aria-label={`Increase ${label ?? "amount"}`}
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl",
            "bg-wangari-green-800 text-white transition-transform active:scale-95",
            "disabled:opacity-40"
          )}
        >
          <Plus className="h-8 w-8" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default Stepper;