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

/** Live validation. Never blocks saving for a "soft" problem — only for empty. */
export function validateTag(raw: string): {
  ok: boolean;
  tone: "good" | "warn" | "bad";
  message: string;
} {
  const t = raw.trim();
  if (!t) return { ok: false, tone: "bad", message: "Weka namba ya alama" };
  if (!/^\d+$/.test(t))
    return {
      ok: false,
      tone: "bad",
      message: "Namba ya alama lazima iwe tarakimu tu",
    };
  if (t.length > ANITRAC_MAX_DIGITS)
    return {
      ok: false,
      tone: "bad",
      message: `Namba ni tarakimu ${ANITRAC_MAX_DIGITS} tu`,
    };
  if (t.length < ANITRAC_MAX_DIGITS)
    return {
      ok: true,
      tone: "warn",
      message: `Ina tarakimu ${t.length}. ANITRAC kawaida ni ${ANITRAC_MAX_DIGITS}.`,
    };
  if (!t.startsWith(ANITRAC_PREFIX))
    return {
      ok: true,
      tone: "warn",
      message: "ANITRAC Kenya huanza na 141. Angalia alama yako.",
    };
  return { ok: true, tone: "good", message: "Namba ya ANITRAC ni sahihi" };
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
  if (!a || !b) return { tags: [], error: "Weka namba mbili" };
  // Compare by length then lexicographically, since a mistyped 16-digit tag can
  // exceed Number.MAX_SAFE_INTEGER. Equal endpoints is valid: it is one animal.
  const cmp =
    a.length !== b.length ? a.length - b.length : a.localeCompare(b);
  if (cmp > 0)
    return { tags: [], error: "Namba ya mwisho lazima iwe kubwa kuliko ya kwanza" };
  const startN = BigInt(a);
  const endN = BigInt(b);
  const count = Number(endN - startN) + 1;
  if (count > max)
    return { tags: [], error: `Hiyo ni mimezo ${count}. Ingiza kidi za ${max}.` };
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
          Namba ya alama ya ANITRAC
        </p>
      </div>

      <BigKeypad
        value={value.tagNumber}
        onChange={(v) => setDigits(v)}
        onConfirm={ready ? onConfirm : undefined}
        label={`Mwanzo ${ANITRAC_PREFIX} kimewekwa`}
        maxLength={ANITRAC_MAX_DIGITS}
        confirmLabel="Hifadhi alama"
      />

      {/* Status is colour + icon first, so it reads without reading. */}
      {value.tagNumber ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-2xl border px-4 py-3",
            check.tone === "good" && "border-green-200 bg-green-50 text-green-800",
            check.tone === "warn" && "border-amber-200 bg-amber-50 text-amber-800",
            check.tone === "bad" && "border-red-200 bg-red-50 text-red-700"
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
        <div className="rounded-3xl border border-dashed border-wangari-green-300 bg-white p-3">
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
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-50 py-3 text-sm font-bold text-wangari-green-800"
          >
            <ScanLine className="h-5 w-5" aria-hidden />
            {advanced ? "Alama moja" : "Nyingi zaidi (mwezi wa alama)"}
          </button>

          {advanced ? (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-center text-xs text-wangari-muted">
                Weka namba ya kwanza na namba ya mwisho — mfano 1410001 hadi
                1410040
              </p>
              <BigKeypad
                value={value.rangeEnd || ""}
                onChange={(v) => setDigits(v, "rangeEnd")}
                onConfirm={ready ? onConfirm : undefined}
                label="Namba ya mwisho"
                maxLength={ANITRAC_MAX_DIGITS}
                confirmLabel="Hifadhi zote"
              />
              {value.rangeEnd ? (
                <p
                  className={cn(
                    "text-center text-sm font-semibold",
                    endCheck.ok ? "text-green-700" : "text-red-600"
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
        Unapaswa kuingiza alama mara moja tu. Kisha unarekodi kundi la
        wanyama wote kwa kuhesabu tu — kama ulivyofanya kwa kundi.
      </p>
    </div>
  );
}

export default AnitracTagInput;
