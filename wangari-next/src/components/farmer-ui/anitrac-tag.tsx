"use client";

import * as React from "react";
import { Tag, CheckCircle2, AlertTriangle, ScanLine } from "lucide-react";
import { BigKeypad } from "./big-keypad";
import { cn } from "@/lib/utils";

/**
 * AnitracTag — enter an ANITRAC ear-tag number without reading or typing.
 *
 * RESEARCH (Oct 2026, Kenya): the government launched ANITRAC in July 2026.
 * Every cattle, sheep and goat carries a number of **not more than 15 digits
 * that starts with the 141 country prefix** (visual tag on the left ear, RFID
 * microchip on the right). So a tag is pure digits — which is why this is
 * built on a keypad, not a keyboard.
 *
 * HOW A FARMER ACTUALLY USES IT:
 *  - They have the tag number on the animal (or the paperwork).
 *  - They tap the digits on the big keypad. 15 taps, no typing, no reading.
 *  - `141` is pre-filled because it is the same for every animal in Kenya, so
 *    the farmer only ever enters the 12 digits that actually differ.
 *  - A range mode handles the common "I bought 40 tags, 1410001 to 1410040"
 *    case, so nobody taps 600 times.
 *
 * This screen is ALSO the answer to "how do we record data on most animals at
 * once" — see the note at the bottom.
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

export function AnitracTagInput({
  value,
  onChange,
  onConfirm,
  allowRange = true,
  className,
}: AnitracTagInputProps) {
  const [advanced, setAdvanced] = React.useState(value.mode === "range");
  const check = validateTag(value.tagNumber);
  const endCheck = validateTag(value.rangeEnd || "");

  // Start every farmer from the correct Kenya prefix so they only tap the 12
  // digits that differ between animals. A farmer can clear it if they must.
  const setDigits = React.useCallback(
    (digits: string, which: "tagNumber" | "rangeEnd" = "tagNumber") => {
      const clean = digits.replace(/\D/g, "").slice(0, ANITRAC_MAX_DIGITS);
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

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2 rounded-2xl bg-wangari-green-50 px-4 py-3">
        <Tag className="h-6 w-6 text-wangari-green-800" aria-hidden />
        <p className="text-sm font-semibold text-wangari-green-900">
          ANITRAC tag number
        </p>
      </div>

      <BigKeypad
        value={value.tagNumber}
        onChange={(v) => setDigits(v)}
        onConfirm={ready ? onConfirm : undefined}
        label={`Starts with ${ANITRAC_PREFIX}`}
        maxLength={ANITRAC_MAX_DIGITS}
        confirmLabel="Save tag"
      />

      {/* Status is colour + icon first, so it reads without reading. */}
      {value.tagNumber ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-2xl border px-4 py-3",
            check.tone === "good" &&
              "border-tone-good-border bg-tone-good-bg text-tone-good-text",
            check.tone === "warn" &&
              "border-tone-warn-border bg-tone-warn-bg text-tone-warn-text",
            check.tone === "bad" &&
              "border-tone-bad-border bg-tone-bad-bg text-tone-bad-text"
          )}
        >
          {check.tone === "good" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          )}
          <p className="text-sm font-medium">{check.message}</p>
        </div>
      ) : null}

      {allowRange ? (
        <div className="rounded-2xl border border-dashed border-wangari-green-300 bg-white p-3">
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
              "flex w-full items-center justify-center gap-2 rounded-2xl py-3",
              "text-sm font-bold transition-colors",
              advanced
                ? "bg-wangari-green-800 text-white"
                : "bg-wangari-cream text-wangari-green-800 hover:bg-wangari-green-50"
            )}
          >
            <ScanLine className="h-5 w-5" aria-hidden />
            {advanced ? "Single tag" : "More (tag range)"}
          </button>

          {advanced ? (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-center text-xs text-wangari-muted">
                Enter the first and last number — for example 1410001 to
                1410040
              </p>
              <BigKeypad
                value={value.rangeEnd || ""}
                onChange={(v) => setDigits(v, "rangeEnd")}
                onConfirm={ready ? onConfirm : undefined}
                label="Last number"
                maxLength={ANITRAC_MAX_DIGITS}
                confirmLabel="Save all"
              />
              {value.rangeEnd ? (
                <p
                  className={cn(
                    "text-center text-sm font-semibold",
                    endCheck.ok ? "text-tone-good-text" : "text-tone-bad-text"
                  )}
                >
                  {endCheck.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Why this is simple enough to actually be used. */}
      <p className="px-1 text-center text-xs leading-relaxed text-wangari-muted">
        You only enter a tag once. After that you keep recording the herd as
        a count — the way you already count the group.
      </p>
    </div>
  );
}

export default AnitracTagInput;
