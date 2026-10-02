"use client";

import * as React from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * BigKeypad — the farmer's number entry.
 *
 * WHY THIS EXISTS: our user often cannot read, let alone type. Every number
 * Wangari asks for is entered on these keys instead of a system keyboard.
 *
 * ── The one deliberate exception to house sizing ──────────────────────────
 * Everything else in the app follows the Button component (h-8/h-10/h-12).
 * These keys are h-16 (64px) and the value is text-4xl, because a number pad is
 * the one control a farmer uses one-handed, outdoors, sometimes with gloves on.
 * 64px is still above the 44px minimum touch target, so it breaks no
 * accessibility rule — it just refuses to be small.
 *
 * Everything ELSE here is house-consistent: theme tokens only (no raw palette),
 * rounded-2xl like every other card, and the confirm bar uses the same brand
 * green as the standard Button.
 *
 * Voice input is deliberately a pluggable no-op for now; it will be wired to
 * AI/WhatsApp in a later phase without changing any caller.
 */

export interface BigKeypadProps {
  /** Current value as a string so the farmer can type "0" first (e.g. a date). */
  value: string;
  onChange: (value: string) => void;
  /** Fired when the farmer hits the big confirm bar. */
  onConfirm?: () => void;
  /** Label for the field being entered, shown above the value. */
  label?: string;
  /** Allow a leading minus sign (for ranges, e.g. temperature). Off for counts. */
  allowMinus?: boolean;
  /** Max characters. Defaults to 15 — the ANITRAC tag length. */
  maxLength?: number;
  /** Label for the confirm action, e.g. "Save". */
  confirmLabel?: string;
  disabled?: boolean;
  className?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function BigKeypad({
  value,
  onChange,
  onConfirm,
  label,
  allowMinus = false,
  maxLength = 15,
  confirmLabel = "Save",
  disabled = false,
  className,
}: BigKeypadProps) {
  const press = (key: string) => {
    if (disabled) return;
    if (value.length >= maxLength) return;
    if (key === "-" && (value.length > 0 || !allowMinus)) return;
    onChange(value + key);
  };

  const backspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  // A keypad is useless without a keyboard for desktop/QA, so we also accept
  // physical digits. This does not change the mobile experience.
  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === "Enter" && onConfirm) {
        e.preventDefault();
        onConfirm();
      }
    };
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  });

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "flex flex-col gap-3 rounded-2xl bg-wangari-card p-3 outline-none border border-wangari-border",
        "focus-visible:ring-4 focus-visible:ring-wangari-green-200",
        className
      )}
    >
      {label ? (
        <div className="px-1 text-center text-sm font-semibold text-wangari-muted">
          {label}
        </div>
      ) : null}

      {/* The value, shown enormous so it can be read from arm's length. */}
      <div
        className={cn(
          "flex min-h-[72px] items-center justify-center rounded-2xl px-3 text-center",
          "font-mono text-4xl font-bold tabular-nums tracking-wider",
          value.length > 0
            ? "bg-wangari-green-50 text-wangari-green-900"
            : "bg-wangari-cream text-wangari-subtle"
        )}
      >
        {value.length > 0 ? value : "—"}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled || value.length >= maxLength}
            onClick={() => press(k)}
            aria-label={`Digit ${k}`}
            className={cn(
              "h-16 w-full rounded-2xl text-3xl font-bold",
              "bg-wangari-green-800 text-white shadow-sm",
              "transition-transform active:scale-95 active:bg-wangari-green-900",
              "disabled:opacity-40"
            )}
          >
            {k}
          </button>
        ))}

        {allowMinus ? (
          <button
            type="button"
            disabled={disabled || value.length > 0}
            onClick={() => press("-")}
            aria-label="Minus"
            className="h-16 w-full rounded-2xl bg-wangari-cream text-3xl font-bold text-wangari-text active:scale-95 disabled:opacity-40"
          >
            −
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-hidden
            className="h-16 w-full rounded-2xl bg-transparent"
          />
        )}

        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => press("0")}
          aria-label="Digit 0"
          className={cn(
            "h-16 w-full rounded-2xl text-3xl font-bold",
            "bg-wangari-green-800 text-white shadow-sm",
            "transition-transform active:scale-95 active:bg-wangari-green-900",
            "disabled:opacity-40"
          )}
        >
          0
        </button>

        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={backspace}
          aria-label="Delete"
          className={cn(
            "h-16 w-full rounded-2xl bg-tone-bad-bg text-tone-bad-text",
            "transition-transform active:scale-95 disabled:opacity-40"
          )}
        >
          <Delete className="mx-auto h-8 w-8" aria-hidden />
        </button>
      </div>

      {onConfirm ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className={cn(
            "h-16 w-full rounded-2xl text-xl font-bold",
            "bg-wangari-green-800 text-white shadow-md",
            "transition-transform active:scale-95 disabled:opacity-40"
          )}
        >
          {confirmLabel}
        </button>
      ) : null}
    </div>
  );
}

export default BigKeypad;
