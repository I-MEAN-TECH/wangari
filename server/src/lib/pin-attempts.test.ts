import { describe, it, expect } from "vitest";
import {
  MAX_PIN_ATTEMPTS,
  LOCKOUT_MINUTES,
  attemptsLeft,
  wrongPinMessage,
} from "./pin-attempts.js";

/**
 * These are the pure parts of the lockout. The DB-backed half is exercised in
 * production smoke tests, but the arithmetic and the wording are checked here
 * because both were wrong in the first version and neither failed a test.
 */
describe("attemptsLeft", () => {
  it("counts down from the maximum", () => {
    expect(attemptsLeft(1)).toBe(4);
    expect(attemptsLeft(2)).toBe(3);
    expect(attemptsLeft(3)).toBe(2);
    expect(attemptsLeft(4)).toBe(1);
  });

  it("reaches zero exactly on the attempt that locks", () => {
    expect(attemptsLeft(MAX_PIN_ATTEMPTS)).toBe(0);
  });

  it("never goes negative if failures overshoot", () => {
    expect(attemptsLeft(99)).toBe(0);
  });

  it("allows a full set of attempts from a clean slate", () => {
    expect(attemptsLeft(0)).toBe(MAX_PIN_ATTEMPTS);
  });
});

describe("wrongPinMessage", () => {
  it("says how many tries are left while there are some", () => {
    expect(wrongPinMessage(1)).toBe("That PIN is not right. 4 attempts left.");
    expect(wrongPinMessage(4)).toBe("That PIN is not right. 1 attempt left.");
  });

  it("uses the singular for exactly one remaining attempt", () => {
    expect(wrongPinMessage(MAX_PIN_ATTEMPTS - 1)).toContain("1 attempt left.");
    expect(wrongPinMessage(MAX_PIN_ATTEMPTS - 1)).not.toContain("attempts left");
  });

  it("drops the count once the lockout has started", () => {
    expect(wrongPinMessage(MAX_PIN_ATTEMPTS)).toBe("That PIN is not right.");
  });

  it("never promises a retry that does not exist", () => {
    expect(wrongPinMessage(MAX_PIN_ATTEMPTS + 3)).not.toMatch(/\d+ attempts? left/);
  });
});

describe("lockout constants", () => {
  it("allows five tries then closes for fifteen minutes", () => {
    // A sweep of all 10,000 PINs at five per fifteen minutes would take
    // 10,000/5 * 15 = 30,000 minutes. If either number shrinks, re-derive this.
    const minutesToExhaust = (10000 / MAX_PIN_ATTEMPTS) * LOCKOUT_MINUTES;
    expect(minutesToExhaust).toBe(30000);
  });
});