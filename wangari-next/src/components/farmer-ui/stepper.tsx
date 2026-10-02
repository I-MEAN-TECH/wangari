"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stepper — "how many today?"
 *
 * THE most-used control in the product. Production logging is a count, and a
 * count should never be typed. Two enormous buttons, the number in the middle
 * as big as possible, so a farmer who cannot read still recognises the number
 * shape and the colour.
 *
 * Defaults to integers because egg/bird/head counts are whole numbers; pass
 * `step={0.5}` for milk litres or kg weights.
 */

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  /** Emoji shown with the label (e.g. "🥚" for eggs). */
  emoji?: string;
  step?: number;
  min?: number;
  max?: number;
  /** Optional Swahili unit shown after the number (e.g. "tray", "litre", "kg"). */
  unit?: string;
  disabled?: boolean;
  className?: string;
}

export function Stepper({
  value,
  onChange,
  label,
  emoji,
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
        "flex flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm",
        className
      )}
    >
      {label ? (
        <div className="flex items-center gap-2 text-center">
          {emoji ? (
            <span aria-hidden className="text-2xl leading-none">
              {emoji}
            </span>
          ) : null}
          <span className="text-base font-semibold text-wangari-muted">
            {label}
          </span>
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
            "flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl",
            "bg-red-50 text-red-600 transition-transform active:scale-90",
            "disabled:opacity-30"
          )}
        >
          <Minus className="h-10 w-10" aria-hidden />
        </button>

        <div className="flex flex-1 flex-col items-center justify-center rounded-3xl bg-wangari-green-50 py-3">
          <span className="font-mono text-5xl font-bold tabular-nums text-wangari-green-900">
            {value}
          </span>
          {unit ? (
            <span className="text-sm font-medium text-wangari-muted">
              {unit}
            </span>
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
            "flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl",
            "bg-wangari-green-800 text-white transition-transform active:scale-90",
            "disabled:opacity-30"
          )}
        >
          <Plus className="h-10 w-10" aria-hidden />
        </button>
      </div>

      <p className="text-center text-xs text-wangari-muted">
        Shikilia + kwa muda = ongeza haraka
      </p>
    </div>
  );
}

export default Stepper;
