"use client";

import * as React from "react";
import { Tag, CheckCircle2, AlertTriangle } from "lucide-react";
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
 * The warning is advisory, not a blocker: a farmer who mistypes a count should
 * be told plainly in Swahili, not locked out of saving.
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

  const ready = range.tags.length > 0;

  return (
    <div className="rounded-2xl border border-dashed border-[#86EFAC] bg-[#F0FDF4]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-[#166534]">
          <Tag className="h-4 w-4" aria-hidden />
          Alama za ANITRAC
          {ready ? (
            <span className="rounded-full bg-green-200 px-2 py-0.5 text-xs">
              {range.span}
            </span>
          ) : null}
        </span>
        <span className="text-xs font-semibold text-[#166534]">
          {open ? "Funga" : "Weka alama"}
        </span>
      </button>

      {!open ? (
        <p className="px-4 pb-3 text-xs leading-relaxed text-[#166534]/80">
          Ukiwa huna alama, ruka sehemu hii. Ukiwa nazo, weka namba ya kwanza
          na ya mwisho tu — hazitaki kila mnyama.
        </p>
      ) : (
        <div className="space-y-3 border-t border-[#BBF7D0] px-4 py-3">
          <p className="text-xs leading-relaxed text-[#166534]">
            Weka namba ya alama ya kwanza na ya mwisho. Hapa ndani
            {headCount ? ` kuna wanyama ${headCount}` : ""}.
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
                  className={cn(
                    "rounded-2xl border-2 px-3 py-3 text-left transition-colors",
                    active
                      ? "border-[#166534] bg-white"
                      : "border-[#BBF7D0] bg-white/60"
                  )}
                >
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-[#166534]/70">
                    {slot === "tagFrom" ? "Kwanza" : "Mwisho"}
                  </span>
                  <span className="block font-mono text-sm font-bold text-[#166534]">
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
              label={which === "tagFrom" ? "Namba ya kwanza" : "Namba ya mwisho"}
              maxLength={15}
            />
          )}

          {/* Status: colour + icon first, so it reads without reading. */}
          {value.tagFrom || value.tagTo ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium",
                range.span > 0 && range.consistent
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              )}
            >
              {range.span > 0 && range.consistent ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>
                {range.span > 0
                  ? `Alama ${range.span}.`
                  : "Weka namba mbili."}
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