/**
 * Kenyan phone numbers, normalised.
 *
 * A farmer typing their number will type "0712345678", "+254712345678",
 * "254 712 345 678" or "0712 345 678" across four screens and two keyboards.
 * All of those are the same person, and if we store whatever arrives, then
 * `0712345678` and `254712345678` become two accounts and a farmer who signs up
 * twice has lost their whole farm.
 *
 * Stored form is E.164: `+254712345678`. Kenyan numbers only — a farmer in the
 * market Wangari serves has a Kenyan number, and restricting the domain means we
 * never have to reason about NANP length rules or ambiguous trunk prefixes.
 */

/** Kenyan country code, and the trunk prefix local numbers start with. */
export const KE_PREFIX = "+254";

/**
 * A Kenyan mobile number is 9 digits once the trunk 0 is removed.
 *   0712 345 678 -> 712345678  (7-series, the long-standing Safaricom/Airtel range)
 *   0112 345 678 -> 112345678  (1-series, newer allocations)
 * A landline is 9 digits too (e.g. 20xxxxxxx for Nairobi), so length alone is
 * not enough — hence the leading-digit test rather than a bare 9-digit check.
 */
const LOCAL_RE = /^[17]\d{8}$/;

export type PhoneError =
  | "empty"
  | "too_short"
  | "too_long"
  | "bad_start"
  | "not_mobile";

/**
 * Normalise a farmer-typed number to E.164, or return why we cannot.
 *
 * Rejects landline-shaped Kenyan numbers on purpose. Safaricom and Airtel
 * dominate the smallholder market and the extra digits a landline carries buy
 * the farmer nothing here — every farmer-facing feature (OTP, co-op invite,
 * WhatsApp) is SMS/WhatsApp-shaped, and a number that cannot receive those is a
 * support ticket waiting to happen.
 */
export function normalisePhone(raw: unknown): string | PhoneError {
  if (typeof raw !== "string") return "empty";

  // Strip everything that is not a digit or a leading plus. This handles spaces,
  // dashes, brackets, and the "  " a phone keyboard can paste in.
  const trimmed = raw.trim();
  if (!trimmed) return "empty";

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "empty";

  // Kenya's trunk code: 0723456789 -> 254723456789
  let local = digits;
  if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else if (digits.startsWith("254")) {
    local = digits.slice(3);
    // "+254 0712..." is a real typo — a farmer copying their local number and
    // adding 254 in front. Rejecting it sends them to support for something we
    // can obviously read, so drop the stray trunk 0 instead.
    if (local.startsWith("0")) local = local.slice(1);
  } else if (hasPlus && !digits.startsWith("254")) {
    // Explicitly international but not Kenya: we do not guess another country.
    return "bad_start";
  } else if (digits.startsWith("7") || digits.startsWith("1")) {
    // Bare Kenyan mobile with no trunk prefix, e.g. "712345678".
    local = digits;
  } else {
    return "bad_start";
  }

  if (local.length < 9) return "too_short";
  if (local.length > 9) return "too_long";
  if (!LOCAL_RE.test(local)) {
    // Right length, wrong leading digit: a Kenyan landline.
    return "not_mobile";
  }

  return `${KE_PREFIX}${local}`;
}

/**
 * True when the input is a usable Kenyan mobile number.
 *
 * NOTE: this cannot be `typeof n === "string"`. `normalisePhone` returns either
 * a number or an error CODE, and every error code is a non-empty string — so
 * that naive check returns true for "071234", which is the exact input we must
 * reject. Hence the explicit `+254` prefix test.
 */
export function isValidPhone(raw: unknown): boolean {
  const n = normalisePhone(raw);
  return typeof n === "string" && n.startsWith(KE_PREFIX);
}

/**
 * Render a stored number the way a Kenyan farmer would read it aloud:
 * `+254712345678` -> `0712 345 678`. Used in the UI so a number we hold is
 * recognisable to the person who gave it to us.
 */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164 || !e164.startsWith(KE_PREFIX)) return "";
  const local = e164.slice(KE_PREFIX.length);
  if (local.length !== 9) return e164;
  // Kenyan grouping is 3-3-3 within the local number: 0712 345 678.
  return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Human-readable explanation of a rejection, safe to show on a form. */
export function phoneErrorMessage(err: PhoneError): string {
  switch (err) {
    case "empty":
      return "Enter your phone number";
    case "too_short":
      return "That number is too short. A Kenyan mobile number has 9 digits after 07.";
    case "too_long":
      return "That number is too long. Check for an extra digit.";
    case "not_mobile":
      return "Enter a mobile number, not a landline.";
    case "bad_start":
    default:
      return "Enter a Kenyan number like 0712 345 678";
  }
}

/**
 * Mask for display where the full number is not needed: `+254712345678` ->
 * `+254•••••678`. Used in the co-op invite list and anywhere a chair sees
 * members' numbers — a chair needs enough to recognise a member, not enough to
 * use their number.
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164 || !e164.startsWith(KE_PREFIX) || e164.length < KE_PREFIX.length + 4) return "";
  return `${KE_PREFIX}•••••${e164.slice(-3)}`;
}