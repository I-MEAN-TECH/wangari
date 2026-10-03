/**
 * Resend cooldown for email-verification codes.
 *
 * Extracted from routes/auth.ts so the decision is testable without a database.
 *
 * Why this exists: /login mailed a fresh code on every attempt with the right
 * password, and the verify-email screen auto-sent a second one on mount. A
 * single sign-in produced two emails, every retry produced two more, and each
 * call deleted the previous code — so the code already in the farmer's inbox
 * stopped working while new ones kept arriving.
 */

/** Minimum gap between two verification emails for the same account. */
export const RESEND_COOLDOWN_MS = 60_000;

/** How long a verification code stays usable. */
export const VERIFICATION_TTL_MS = 15 * 60_000;

export interface LiveVerificationCode {
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date | null;
}

/**
 * True when a NEW email must be sent — i.e. the caller should not reuse an
 * existing code. False means "a code was just emailed and is still valid",
 * so sending again would only spam the farmer and invalidate what they have.
 */
export function shouldSendVerificationEmail(
  live: LiveVerificationCode | null | undefined,
  now: Date = new Date()
): boolean {
  if (!live) return true;
  if (live.usedAt) return true;
  if (live.expiresAt.getTime() <= now.getTime()) return true;
  return now.getTime() - live.createdAt.getTime() >= RESEND_COOLDOWN_MS;
}