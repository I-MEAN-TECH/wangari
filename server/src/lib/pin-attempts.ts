import { prisma } from "../db.js";

/**
 * Failed-PIN lockout, per phone number.
 *
 * ── Why this is in the database and not a Map ───────────────────────────────
 * The first version kept `phone -> { count, until }` in a module-level Map. It
 * passed its unit tests and it looked right in review. It did not work in
 * production, and the failure was only visible by actually running it: the API
 * runs under pm2 in cluster mode with two workers, each with its own module
 * instance and therefore its own Map. Five guesses at one account were split
 * across two maps, neither of which ever reached the threshold, and the correct
 * PIN still worked after five wrong ones. The entire defence of a 4-digit PIN
 * was absent. A restart would also have wiped it.
 *
 * One row per phone number in Postgres is shared by every worker, survives a
 * restart, and is the smallest thing that actually holds.
 */

/** Failed PIN attempts before the phone is temporarily locked out. */
export const MAX_PIN_ATTEMPTS = 5;

/** Lockout length. Long enough to make a 10,000-PIN sweep impractical. */
export const LOCKOUT_MINUTES = 15;

/**
 * How many attempts remain after a given number of failures.
 *
 * Pure, so the arithmetic — which is where the first version was wrong (it
 * reported 3 left after the first of 5 failures) — is tested directly rather
 * than inferred from an HTTP response.
 */
export function attemptsLeft(failures: number): number {
  return Math.max(0, MAX_PIN_ATTEMPTS - failures);
}

/**
 * The message a farmer reads after a wrong PIN.
 *
 * Say how many tries are left while there are tries to spare; once there are
 * none, say only that the PIN was wrong. Telling someone their account is now
 * closed for 15 minutes turns one mistyped digit into a support call.
 */
export function wrongPinMessage(failures: number): string {
  const left = attemptsLeft(failures);
  if (left === 0) return "That PIN is not right.";
  return `That PIN is not right. ${left} attempt${left === 1 ? "" : "s"} left.`;
}

export interface LockoutState {
  locked: boolean;
  /** Whole minutes until the lock lifts, at least 1 while still locked. */
  minutesLeft: number;
}

/** Is this phone currently locked out? An expired lock counts as not locked. */
export async function getLockout(phone: string): Promise<LockoutState> {
  const row = await prisma.phonePinAttempt.findUnique({ where: { phone } });
  if (!row?.lockedUntil) return { locked: false, minutesLeft: 0 };
  const ms = row.lockedUntil.getTime() - Date.now();
  if (ms <= 0) return { locked: false, minutesLeft: 0 };
  return { locked: true, minutesLeft: Math.max(1, Math.ceil(ms / 60000)) };
}

/**
 * Count one failure against a phone number and return the new total.
 *
 * On the attempt that reaches MAX_PIN_ATTEMPTS the lock is set and the counter
 * resets to zero, so the lockout window starts clean rather than immediately
 * re-arming the moment it expires.
 */
export async function recordFailure(phone: string): Promise<number> {
  const row = await prisma.phonePinAttempt.upsert({
    where: { phone },
    create: { phone, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (row.count >= MAX_PIN_ATTEMPTS) {
    const until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    await prisma.phonePinAttempt.update({
      where: { phone },
      data: { count: 0, lockedUntil: until },
    });
    return MAX_PIN_ATTEMPTS;
  }

  return row.count;
}

/** A correct PIN wipes the slate. */
export async function clearFailures(phone: string): Promise<void> {
  await prisma.phonePinAttempt.deleteMany({ where: { phone } });
}