import { describe, it, expect } from "vitest";
import {
  RESEND_COOLDOWN_MS,
  VERIFICATION_TTL_MS,
  shouldSendVerificationEmail,
} from "./verification-cooldown.js";

/**
 * Regression tests for the "it keeps emailing me a code" bug: /login issued a
 * code on every attempt and verify-email issued a second one on mount, so one
 * sign-in produced two emails and every retry produced two more.
 */
const NOW = new Date("2026-10-04T10:00:00.000Z");

const fresh = (ageMs: number) => ({
  createdAt: new Date(NOW.getTime() - ageMs),
  expiresAt: new Date(NOW.getTime() + VERIFICATION_TTL_MS),
  usedAt: null,
});

describe("shouldSendVerificationEmail", () => {
  it("sends when the user has no code at all", () => {
    expect(shouldSendVerificationEmail(null, NOW)).toBe(true);
    expect(shouldSendVerificationEmail(undefined, NOW)).toBe(true);
  });

  it("does NOT resend seconds after a code was just emailed", () => {
    // This is the regression: login sends, verify-email page sends again 1s later.
    expect(shouldSendVerificationEmail(fresh(1_000), NOW)).toBe(false);
    expect(shouldSendVerificationEmail(fresh(30_000), NOW)).toBe(false);
  });

  it("does not resend right up to the cooldown boundary", () => {
    expect(shouldSendVerificationEmail(fresh(RESEND_COOLDOWN_MS - 1), NOW)).toBe(false);
  });

  it("allows an explicit resend once the cooldown has passed", () => {
    expect(shouldSendVerificationEmail(fresh(RESEND_COOLDOWN_MS), NOW)).toBe(true);
    expect(shouldSendVerificationEmail(fresh(10 * 60_000), NOW)).toBe(true);
  });

  it("resends when the existing code has already been used", () => {
    const used = { ...fresh(5_000), usedAt: new Date(NOW.getTime() - 1_000) };
    expect(shouldSendVerificationEmail(used, NOW)).toBe(true);
  });

  it("resends when the existing code has expired", () => {
    const expired = {
      createdAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() - 1_000),
      usedAt: null,
    };
    expect(shouldSendVerificationEmail(expired, NOW)).toBe(true);
  });

  it("does not resend for an old-but-still-valid code inside the window", () => {
    // Guards the exact boundary a farmer experiences: code arrives, they open
    // the page again straight away — no second email.
    const justUnderTtl = {
      createdAt: new Date(NOW.getTime() - VERIFICATION_TTL_MS + 5_000),
      expiresAt: new Date(NOW.getTime() + 5_000),
      usedAt: null,
    };
    // Older than the cooldown, so a resend is allowed and that's correct:
    expect(shouldSendVerificationEmail(justUnderTtl, NOW)).toBe(true);
  });
});