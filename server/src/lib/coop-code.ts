/**
 * Co-op join codes and invite codes (gap-analysis row 17).
 *
 * ── Why a code at all ────────────────────────────────────────────────────────
 * Bulk onboarding has to work for people who are not yet in the app, on
 * handsets that may not have signal. So a chair cannot send a link — they hand
 * over a code that is read out in a meeting and typed once.
 *
 * That constraint sets the alphabet. No 0/O and no 1/I/L, because a code read
 * aloud across a room and typed into a phone keypad has to survive both the
 * person saying it and the person typing it. 23 characters, one keypress per
 * character, no ambiguity.
 */

/** Unambiguous alphabet: no 0, O, 1, I or L. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Characters excluded from every generated code, for the test that proves it. */
export const AMBIGUOUS = "01OIL";

/** Invite codes are 6 characters: long enough not to guess, short enough to say. */
export const INVITE_CODE_LENGTH = 6;

/** Same unambiguous letters as the invite alphabet, in alphabetical order. */
export const JOIN_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";

export function makeJoinCode(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += JOIN_LETTERS[Math.floor(rand() * JOIN_LETTERS.length)];
  }
  const n = Math.floor(rand() * 10000);
  return `${out}-${String(n).padStart(4, "0")}`;
}

export function makeInviteCode(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Normalise what a farmer typed: uppercase, dashes and spaces removed.
 *
 * The letter test uses the SAME alphabet the generator uses, not `[A-Z]`. An
 * earlier version used `[A-Z]` and so accepted "KILMBO-1234" — a code we never
 * issued — as though it were a valid one. Rejecting unknown letters is what
 * makes a typo fail loudly instead of silently failing to match anything.
 */
export function normaliseJoinCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (!/^[A-Z]{4}\d{4}$/.test(cleaned)) return null;
  const letters = cleaned.slice(0, 4);
  for (const ch of letters) {
    if (!JOIN_LETTERS.includes(ch)) return null;
  }
  return `${letters}-${cleaned.slice(4)}`;
}

export function normaliseInviteCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toUpperCase();
  return new RegExp(`^[${CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`).test(cleaned) ? cleaned : null;
}

/** Shannon-ish estimate, used to judge whether a generated code is varied. */
export function codeEntropy(length: number): number {
  return length * Math.log2(CODE_ALPHABET.length);
}