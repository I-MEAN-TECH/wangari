"use client";

import * as React from "react";
import { Tag, CheckCircle2, AlertTriangle, ScanLine, Hash, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AnitracTag — enter an ANITRAC ear-tag number.
 *
 * REDESIGN (Oct 2026): replaced the full-screen BigKeypad with a compact inline
 * text input. The keypad wasted 400px+ of vertical space on a screen that also
 * has "is this a new animal?" below it. A farmer taps the input, the phone
 * keyboard appears (numeric via inputMode="numeric"), and the tag is entered in
 * half the taps. Range mode uses two side-by-side inputs instead of stacking
 * two keypads. Validation feedback is a single badge line, not a full card.
 *
 * Exported functions (validateTag, expandTagRange, shouldWarnRange) and types
 * (AnitracTagValue) are unchanged — callers and tests don't break.
 */

/** Kenya's ANITRAC prefix, and the max tag length per the 2026 rollout. */
export const ANITRAC_PREFIX = "141";
export const ANITRAC_MAX_DIGITS = 15;

export interface AnitracTagValue {
  tagNumber: string;
  /** "exact" = one animal, "range" = first..last expanded server-side. */
  mode: "exact" | "range";
  rangeEnd?: string;
}

/**
 * Should the "check the numbers" warning be shown?
 *
 * ONLY in range mode. Found by driving the real create-flock modal: the warning
 * was gated on `tagNumber && tagNumber !== rangeEnd`, and in the default
 * single-tag mode `rangeEnd` is empty — so the condition was true for every
 * valid single tag. A farmer entering one correct 15-digit tag was shown, at
 * the same time, "The ANITRAC number is correct" AND "Check the numbers. The
 * last tag should be the same as, or higher, than the first."
 *
 * There is no last tag to check. Two contradictory statements on one screen is
 * worse than no warning: a farmer cannot act on it, so all it teaches them is
 * that the app contradicts itself, right at the moment they are trying to prove
 * to a county officer that their herd is tagged.
 *
 * Exported and pure so the rule is pinned by a test rather than by a
 * screenshot someone remembers to look at.
 */
export function shouldWarnRange(v: Pick<AnitracTagValue, "tagNumber" | "mode" | "rangeEnd">): boolean {
  if (v.mode !== "range") return false;
  if (!v.tagNumber || !v.rangeEnd) return false;
  return v.tagNumber !== v.rangeEnd;
}

/** Live validation. Never blocks saving for a "soft" problem — only for empty. */
export function validateTag(raw: string): {
  ok: boolean;
  tone: "good" | "warn" | "bad";
  message: string;
} {
  const t = raw.trim();
  if (!t) return { ok: false, tone: "bad", message: "Enter a tag number" };
  if (!/^\d+$/.test(t))
    return {
      ok: false,
      tone: "bad",
      message: "The tag number must be digits only",
    };
  if (t.length > ANITRAC_MAX_DIGITS)
    return {
      ok: false,
      tone: "bad",
      message: `The number must be ${ANITRAC_MAX_DIGITS} digits only`,
    };
  if (t.length < ANITRAC_MAX_DIGITS)
    return {
      ok: true,
      tone: "warn",
      message: `This has ${t.length} digits. A full ANITRAC tag has ${ANITRAC_MAX_DIGITS}.`,
    };
  if (!t.startsWith(ANITRAC_PREFIX))
    return {
      ok: true,
      tone: "warn",
      message: "Kenyan ANITRAC tags start with 141. Check your tag.",
    };
  return { ok: true, tone: "good", message: "The ANITRAC number is correct" };
}

/**
 * Expand a tag range into individual tag numbers.
 * e.g. ("141000100000001", "141000100000040") -> 40 numbers.
 * Guarded: never expands more than `max` entries so a fat-fingered range
 * cannot generate 10,000 database rows.
 */
export function expandTagRange(
  start: string | number | null | undefined,
  end: string | number | null | undefined,
  max = 500
): { tags: string[]; error?: string } {
  // Defensive: these arrive straight from a form and may be null/undefined.
  const a = String(start ?? "").replace(/\D/g, "");
  const b = String(end ?? "").replace(/\D/g, "");
  if (!a || !b) return { tags: [], error: "Enter both numbers" };
  // Compare by length then lexicographically, since a mistyped 16-digit tag can
  // exceed Number.MAX_SAFE_INTEGER. Equal endpoints is valid: it is one animal.
  const cmp =
    a.length !== b.length ? a.length - b.length : a.localeCompare(b);
  if (cmp > 0)
    return { tags: [], error: "The last number must be greater than the first" };
  const startN = BigInt(a);
  const endN = BigInt(b);
  const count = Number(endN - startN) + 1;
  if (count > max)
    return {
      tags: [],
      error: `That is ${count} tags. Enter ${max} or fewer.`,
    };
  const tags: string[] = [];
  // BigInt() calls rather than 0n literals: the TS target here is < ES2020.
  for (let i = BigInt(0); i < BigInt(count); i++) tags.push((startN + i).toString());
  return { tags };
}

export interface AnitracTagInputProps {
  value: AnitracTagValue;
  onChange: (value: AnitracTagValue) => void;
  onConfirm?: () => void;
  /** Show the "many animals at once" range toggle. Default true. */
  allowRange?: boolean;
  className?: string;
}

/** Inline validation badge — one line, colour + icon + words. */
function ValidationBadge({ check }: { check: { ok: boolean; tone: "good" | "warn" | "bad"; message: string } }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
        check.tone === "good" && "bg-tone-good-bg text-tone-good-text",
        check.tone === "warn" && "bg-tone-warn-bg text-tone-warn-text",
        check.tone === "bad" && "bg-tone-bad-bg text-tone-bad-text",
      )}
    >
      {check.tone === "good" ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      {check.message}
    </div>
  );
}

export function AnitracTagInput({
  value,
  onChange,
  onConfirm,
  allowRange = true,
  className,
}: AnitracTagInputProps) {
  const [advanced, setAdvanced] = React.useState(value.mode === "range");
  const check = validateTag(value.tagNumber);
  const endCheck = advanced ? validateTag(value.rangeEnd || "") : null;
  const inputRef = React.useRef<HTMLInputElement>(null);

  const setDigits = React.useCallback(
    (raw: string, which: "tagNumber" | "rangeEnd" = "tagNumber") => {
      const clean = raw.replace(/\D/g, "").slice(0, ANITRAC_MAX_DIGITS);
      if (which === "tagNumber") {
        onChange({ ...value, tagNumber: clean, mode: advanced ? "range" : "exact" });
      } else {
        onChange({ ...value, rangeEnd: clean });
      }
    },
    [onChange, value, advanced]
  );

  const ready =
    validateTag(value.tagNumber).ok &&
    (value.mode === "exact" || validateTag(value.rangeEnd || "").ok);

  // Auto-focus the input when mounted
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-wangari-green-100">
          <Tag className="h-4 w-4 text-wangari-green-800" aria-hidden />
        </div>
        <p className="text-sm font-bold text-wangari-green-900">
          ANITRAC tag number
        </p>
      </div>

      {/* Tag input — compact inline field with prefix hint */}
      <div className="space-y-2">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-wangari-muted">
            <Hash className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">141</span>
          </div>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={ANITRAC_MAX_DIGITS}
            placeholder="Enter tag number"
            value={value.tagNumber}
            onChange={(e) => setDigits(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready && onConfirm) onConfirm();
            }}
            className={cn(
              "h-14 w-full rounded-xl border-2 bg-white pl-16 pr-4 font-mono text-lg font-bold tabular-nums tracking-wider",
              "outline-none transition-colors",
              !value.tagNumber && "border-wangari-border focus:border-wangari-green-500",
              value.tagNumber && check.tone === "good" && "border-tone-good-border bg-tone-good-bg/30",
              value.tagNumber && check.tone === "warn" && "border-tone-warn-border bg-tone-warn-bg/30",
              value.tagNumber && check.tone === "bad" && "border-tone-bad-border bg-tone-bad-bg/30",
            )}
          />
        </div>

        {/* Validation badge */}
        {value.tagNumber ? <ValidationBadge check={check} /> : null}
      </div>

      {/* Range mode — two fields side by side */}
      {allowRange ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              const next = !advanced;
              setAdvanced(next);
              onChange({
                ...value,
                mode: next ? "range" : "exact",
                rangeEnd: next ? value.rangeEnd ?? "" : undefined,
              });
            }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5",
              "text-xs font-bold transition-colors",
              advanced
                ? "border-wangari-green-500 bg-wangari-green-50 text-wangari-green-800"
                : "border-wangari-border bg-white text-wangari-muted hover:bg-wangari-cream hover:text-wangari-green-800"
            )}
          >
            <ScanLine className="h-4 w-4" aria-hidden />
            {advanced ? "Single tag" : "More (tag range)"}
          </button>

          {advanced ? (
            <div className="space-y-2 rounded-xl border border-wangari-green-200 bg-wangari-green-50/40 p-3">
              <p className="text-xs text-wangari-muted text-center">
                Enter the first and last tag — for example 1410001 to 1410040
              </p>
              <div className="flex items-center gap-2">
                {/* First tag already entered above — show it as a read-only chip */}
                <div className="flex-1 rounded-lg border border-wangari-border bg-white px-3 py-2.5 font-mono text-sm font-semibold tabular-nums text-wangari-green-900 truncate">
                  {value.tagNumber || "First tag"}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-wangari-muted" aria-hidden />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={ANITRAC_MAX_DIGITS}
                  placeholder="Last tag"
                  value={value.rangeEnd || ""}
                  onChange={(e) => setDigits(e.target.value, "rangeEnd")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && ready && onConfirm) onConfirm();
                  }}
                  className="h-11 flex-1 rounded-lg border-2 border-wangari-border bg-white px-3 font-mono text-sm font-semibold tabular-nums tracking-wider outline-none focus:border-wangari-green-500"
                />
              </div>
              {value.rangeEnd ? <ValidationBadge check={endCheck!} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="px-1 text-center text-xs leading-relaxed text-wangari-muted">
        You only enter a tag once. After that you keep recording the herd as
        a count — the way you already count the group.
      </p>
    </div>
  );
}

export default AnitracTagInput;
