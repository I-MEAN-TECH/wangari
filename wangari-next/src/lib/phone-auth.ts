"use client";

import api from "@/lib/api-client";
import { setToken, setUser } from "@/lib/auth-client";

/**
 * Phone + PIN auth client (gap-analysis row 0, GAP 1).
 *
 * The server already normalises and validates the number (lib/phone.ts). This
 * mirrors ONLY the client-side affordances a farmer needs before the round trip:
 * a numeric keypad, live formatting as they type, and a PIN field limited to
 * four digits. It deliberately does NOT re-implement validation — two copies of
 * "what is a valid Kenyan number" is two copies to drift apart, and the one that
 * matters for correctness is the one on the server.
 */

/** Group digits 3-3-3, the way Kenyan phone numbers are written aloud. */
function group3(local: string): string {
  return (
    local.slice(0, 3) +
    (local.length > 3 ? " " + local.slice(3, 6) : "") +
    (local.length > 6 ? " " + local.slice(6, 9) : "")
  );
}

/**
 * Format a number as the farmer types, without fighting them.
 *
 * Works on the LOCAL 9 digits and puts the trunk 0 or the 254 in front, rather
 * than grouping whatever they happen to have typed so far. The first version
 * grouped the raw keystrokes 4-3-2, which rendered 0712345678 as
 * "07123 456 78" — not a shape any Kenyan farmer has ever seen written down.
 */
export function formatPhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (!d) return "";

  // A paste of something far too long: keep the last 13 digits, which is the
  // widest a Kenyan number can legitimately be written.
  if (d.length > 13) d = d.slice(-13);

  if (d.startsWith("0")) return "0" + group3(d.slice(1, 10));
  if (d.startsWith("254")) return "254 " + group3(d.slice(3, 12));
  return group3(d.slice(0, 9));
}

/** Trim a masked or formatted number down to just digits before sending. */
export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Keep only digits, capped at four. Used on every PIN keystroke. */
export function sanitisePin(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4);
}

export interface PhoneAuthResult {
  token: string;
  user: { id: number; name: string; phone?: string | null; email?: string | null; role: string };
  farmId: number | null;
  coopJoined?: string;
}

/** Sign up with a phone number and a 4-digit PIN. */
export async function registerWithPhone(input: {
  phone: string;
  pin: string;
  name?: string;
  farmName?: string;
  email?: string;
  coopCode?: string;
}): Promise<PhoneAuthResult> {
  const res = await api.post("/api/auth/register-phone", {
    phone: phoneDigitsOnly(input.phone),
    pin: input.pin,
    name: input.name,
    farmName: input.farmName,
    email: input.email,
    coopCode: input.coopCode,
  });
  const data = res as PhoneAuthResult;
  setToken(data.token);
  // A phone-only account has no real email. The client store types email as
  // required, so store the empty string rather than undefined: anything reading
  // it must handle "no email", which is the honest state for this account.
  setUser({
    id: data.user.id,
    name: data.user.name,
    email: data.user.email ?? "",
    role: data.user.role,
  });
  return data;
}

/** Sign in with a phone number and a 4-digit PIN. */
export async function loginWithPhone(input: { phone: string; pin: string }): Promise<PhoneAuthResult> {
  const res = await api.post("/api/auth/login-phone", {
    phone: phoneDigitsOnly(input.phone),
    pin: input.pin,
  });
  const data = res as PhoneAuthResult;
  setToken(data.token);
  setUser({
    id: data.user.id,
    name: data.user.name,
    email: data.user.email ?? "",
    role: data.user.role,
  });
  return data;
}