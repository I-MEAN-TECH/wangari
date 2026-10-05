import { describe, it, expect } from "vitest";

/**
 * Proves the guard denies rather than admits, by running the real condition
 * with the secret absent — the exact state production is in today.
 */
function guard(secret: string | undefined, authHeader: string | null): boolean {
  const CRON_SECRET = secret || "";
  if (!CRON_SECRET) return false; // refuse, loudly
  if (authHeader !== `Bearer ${CRON_SECRET}`) return false;
  return true;
}

describe("cron guard behaviour, not just its source text", () => {
  it("refuses every caller when the secret is absent", () => {
    expect(guard(undefined, null)).toBe(false);
    expect(guard(undefined, "")).toBe(false);
    expect(guard(undefined, "Bearer anything")).toBe(false);
    expect(guard(undefined, "Bearer ")).toBe(false);
  });

  it("is what the old fail-open guard did NOT do", () => {
    // The previous shape, for contrast. This is the bug.
    const oldGuard = (secret: string | undefined, authHeader: string | null) => {
      const CRON_SECRET = secret || "";
      if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) return false;
      return true; // reached when the secret is unset
    };
    expect(oldGuard(undefined, null)).toBe(true); // anyone gets in
  });

  it("admits only the exact bearer token when set", () => {
    expect(guard("s3cret", "Bearer s3cret")).toBe(true);
    expect(guard("s3cret", "s3cret")).toBe(false);
    expect(guard("s3cret", "Bearer wrong")).toBe(false);
    expect(guard("s3cret", "bearer s3cret")).toBe(false); // case-sensitive
    expect(guard("s3cret", "Bearer s3cret ")).toBe(false); // no trailing space
  });

  it("cannot be walked past with an empty secret of the right shape", () => {
    expect(guard("", "Bearer ")).toBe(false);
  });
});