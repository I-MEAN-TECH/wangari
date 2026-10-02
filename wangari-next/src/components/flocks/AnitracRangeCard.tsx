"use client";

import * as React from "react";
import { Tag, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveTagRange } from "@/lib/tag-range";
import { BigKeypad } from "@/components/farmer-ui/big-keypad";

/**
 * AnitracRangeCard — record the tags for a WHOLE herd with three numbers.
 *
 * This is the answer to "what if I have 500 animals?". A farmer does not tap
 * 500 numbers. They tap the first tag, the last tag, and Wangari works out the
 * rest — storing three values on the flock and generating the individual
 * numbers only when a buyer or county officer asks for the list.
 *
 * Deliberately OPTIONAL and COLLAPSED by default, because most farmers have no
 * tags at all and tagging must never slow down creating a flock. The common
 * path (count your animals, move on) stays exactly as fast as it was.
 *
 * DESIGN (one accent only): the card is an optional aside, not a co-equal
 * step, so it stays quiet — dashed neutral rule, no filled background — until
 * the farmer opens it. Status is the only place colour appears, because colour
 * there carries meaning rather than decoration.
 *
 * The mismatch warning is advisory, not a blocker: a farmer who mistypes a
 * count should be told plainly, not locked out of saving.
 */

export interface AnitracRangeValue {
  tagFrom: string;
  tagTo: string;
}

export function AnitracRangeCard({
  value,
  onChange,
  headCount,
  compact = false,
}: {
  value: AnitracRangeValue;
  onChange: (v: AnitracRangeValue) => void;
  /** The flock's stated head count, used to catch a mistyped range. */
  headCount?: number | null;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(() =>
    Boolean(value.tagFrom || value.tagTo)
  );
  const [which, setWhich] = React.useState<"tagFrom" | "tagTo">("tagFrom");

  // The client helper takes a single object (the server twin takes positional
  // args) — keep the shape straight or the two drift apart.
  const range = resolveTagRange({
    tagFrom: value.tagFrom || null,
    tagTo: value.tagTo || null,
    count: headCount ?? null,
  });

  const ready = range.span > 0 && range.consistent;

  return (
    <div className="rounded-2xl border border-dashed border-wangari-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3",
          "text-left transition-colors duration-200",
          "hover:bg-wangari-cream active:bg-wangari-green-50"
        )}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-wangari-heading">
          <Tag className="h-4 w-4 text-wangari-muted" aria-hidden />
          ANITRAC tags
          {range.span > 0 ? (
            <span className="rounded-full bg-wangari-green-100 px-2 py-0.5 text-xs font-medium tabular-nums text-wangari-green-800">
              {range.span}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-wangari-muted">
          {open ? "Hide" : "Add tags"}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </span>
      </button>

      {!open ? (
        <p className="px-4 pb-3 text-xs leading-relaxed text-wangari-muted">
          No tags? Skip this section. If your animals are tagged, enter only the
          first and last number — you never tag each one.
        </p>
      ) : (
        <div className="space-y-3 border-t border-wangari-border px-4 py-3">
          <p className="text-xs leading-relaxed text-wangari-muted">
            Enter the first and last tag number. Every tag between them belongs
            to this group.
            {headCount ? ` You said this group has ${headCount} animals.` : ""}
          </p>

          {/* Two big entry slots. The farmer taps a slot, then the digits. */}
          <div className="grid grid-cols-2 gap-2">
            {(["tagFrom", "tagTo"] as const).map((slot) => {
              const active = which === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setWhich(slot)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left",
                    "transition-colors duration-200 active:scale-[0.99]",
                    active
                      ? "border-wangari-green-600 bg-wangari-green-50"
                      : "border-wangari-border bg-wangari-card hover:border-wangari-green-300"
                  )}
                >
                  <span className="block text-[11px] font-medium tracking-wide text-wangari-muted">
                    {slot === "tagFrom" ? "First tag" : "Last tag"}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block font-mono text-sm font-semibold tabular-nums",
                      value[slot] ? "text-wangari-heading" : "text-wangari-subtle"
                    )}
                  >
                    {value[slot] || "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {!compact && (
            <BigKeypad
              value={value[which]}
              onChange={(v) => onChange({ ...value, [which]: v })}
              label={which === "tagFrom" ? "First tag number" : "Last tag number"}
              maxLength={15}
            />
          )}

          {/* Status: colour + icon first, so it reads without reading. */}
          {value.tagFrom || value.tagTo ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-xl border px-3 py-2",
                "text-xs font-medium",
                ready
                  ? "border-tone-good-border bg-tone-good-bg text-tone-good-text"
                  : "border-tone-warn-border bg-tone-warn-bg text-tone-warn-text"
              )}
            >
              {ready ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>
                {range.span > 0
                  ? `${range.span} tags in this range.`
                  : "Enter both numbers."}
                {range.note ? ` ${range.note}` : ""}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default AnitracRangeCard;