"use client";

import * as React from "react";
import { Eye, EyeOff, Delete } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitisePin, formatPhoneInput, phoneDigitsOnly } from "@/lib/phone-auth";

/**
 * Shared fields for the phone + PIN screens (gap-analysis row 0).
 *
 * Sized for the farmer this feature exists for: large touch targets, a numeric
 * keypad on both fields, no paste of a password-manager icon, and error text in
 * plain language. The PIN dots are buttons as well as an input, because a farmer
 * reading a phone number off the back of an M-Pesa SIM card is going to tap
 * digits with a thumb rather than aim at a text caret.
 */

/** Large, forgiving phone field with live grouping. */
export function PhoneField({
  value,
  onChange,
  label = "Phone number",
  hint,
  error,
  autoFocus,
  id = "phone",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        // Keeps iOS from offering saved passwords for what is an identity field.
        autoCapitalize="off"
        spellCheck={false}
        placeholder="0712 345 678"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(formatPhoneInput(e.target.value))}
        className="h-14 text-lg tracking-wide"
      />
      <p className="text-xs text-wangari-muted">
        {error ?? hint ?? "The number you use for M-Pesa. No email needed."}
      </p>
    </div>
  );
}

/**
 * 4-digit PIN entry with visible dots and a numeric keypad.
 *
 * `showStrength` is off by default: for a farmer this is a habit, not a secret
 * to be strong. Where it is used (choosing a PIN at signup) it appears only as
 * a nudge away from 1111 and 1234, which are the first things anyone would try.
 */
export function PinField({
  value,
  onChange,
  label = "PIN",
  hint,
  error,
  showStrength,
  autoFocus,
  id = "pin",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  showStrength?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const [revealed, setRevealed] = React.useState(false);
  const digits = sanitisePin(value);

  const weak = showStrength && digits.length === 4 && ["1111", "1234", "0000", "2222"].includes(digits);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="flex items-center gap-1 text-xs text-wangari-muted hover:text-wangari-green-800"
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
      <Input
        id={id}
        type={revealed ? "text" : "password"}
        inputMode="numeric"
        autoComplete={showStrength ? "new-password" : "current-password"}
        maxLength={4}
        placeholder="••••"
        value={revealed ? digits : "•".repeat(digits.length)}
        autoFocus={autoFocus}
        onChange={(e) => onChange(sanitisePin(e.target.value))}
        className="h-14 text-center text-2xl tracking-[0.5em]"
      />
      <p className={`text-xs ${error ? "text-badge-red-text" : weak ? "text-wangari-green-800" : "text-wangari-muted"}`}>
        {error ??
          (weak
            ? "That is one of the first PINs anyone would try. Pick a different one."
            : (hint ?? "Four digits. You will type it every day."))}
      </p>
    </div>
  );
}

/**
 * A numeric keypad for the PIN.
 *
 * Optional: a phone with a working numeric keyboard does not need it, but a
 * cheap handset with a full QWERTY keyboard is a real category in the market
 * this serves, and tapping 4 large buttons beats hunting for the digit row.
 */
export function PinKeypad({ onDigit, onBackspace }: { onDigit: (d: string) => void; onBackspace: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Number keypad">
      {keys.map((k, i) =>
        k === "" ? (
          <span key={i} />
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => (k === "⌫" ? onBackspace() : onDigit(k))}
            aria-label={k === "⌫" ? "Delete" : k}
            className="flex h-14 items-center justify-center rounded-xl border border-wangari-border bg-white text-lg font-semibold text-wangari-heading transition-colors hover:bg-wangari-green-50 active:bg-wangari-green-100"
          >
            {k === "⌫" ? <Delete className="h-5 w-5" /> : k}
          </button>
        )
      )}
    </div>
  );
}

/** Live confirmation that a PIN matches, shown only once both are filled. */
export function PinConfirmHint({ pin, confirm }: { pin: string; confirm: string }) {
  if (!pin || !confirm || pin === confirm) return null;
  return <p className="text-xs text-badge-red-text">The two PINs do not match</p>;
}

export { phoneDigitsOnly };