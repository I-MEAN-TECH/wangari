/**
 * Wangari's error voice — regression tests for humaniseError in ai-stream.ts.
 *
 * The failure this guards is one a farmer cannot act on. When the free
 * provider's cap is hit it answers "UnoRouter: 429", and that text was
 * rendered verbatim in the chat panel. To a farmer it reads as a broken app
 * rather than a busy one, and it invites them to blame themselves for
 * "sending too many requests" they never sent.
 */
import { describe, it, expect } from "vitest";
import { humaniseError } from "./ai-stream";

describe("humaniseError", () => {
  it("turns the provider's daily-cap rejection into something actionable", () => {
    // The exact string the provider returns, and the exact one that reached a
    // farmer's screen in testing.
    expect(humaniseError("UnoRouter: 429")).toMatch(/busy right now/i);
  });

  it("recognises a rate limit however it is phrased", () => {
    for (const raw of [
      "429 Too Many Requests",
      "rate limit exceeded",
      "Rate limit reached for model",
      "too many requests",
    ]) {
      expect(humaniseError(raw), `${raw} reads as busy`).toMatch(/busy right now/i);
    }
  });

  it("trusts the HTTP status when the body says nothing useful", () => {
    expect(humaniseError("something odd", 429)).toMatch(/busy right now/i);
  });

  it("tells the farmer to try again LATER, not to stop using Wangari", () => {
    // The failure mode this prevents: a message that makes the farmer think
    // Wangari is finished, or that they did something wrong.
    const msg = humaniseError("UnoRouter: 429");
    expect(msg).toMatch(/try again/i);
    expect(msg).not.toMatch(/error|invalid|failed/i);
  });

  it("hides a backend fault instead of showing a stack trace to a farmer", () => {
    // This is the shape a Prisma failure arrives in.
    const msg = humaniseError('Invalid `prisma.transaction.create()` invocation: { data: { date: "2026-10-04" } }');
    expect(msg).not.toMatch(/prisma|invocation|data:/i);
    expect(msg).toMatch(/try again/i);
  });

  it("sends an expired session back to sign-in, not into a retry loop", () => {
    // Retrying a 401 cannot help, so telling the farmer to try again would be
    // a lie about what will happen.
    const msg = humaniseError("Unauthorized");
    expect(msg).toMatch(/sign in/i);
    expect(msg).not.toMatch(/try again/i);
  });

  it("never returns an empty message, because an empty error looks broken", () => {
    expect(humaniseError("")).toMatch(/try again/i);
    expect(humaniseError(undefined)).toMatch(/try again/i);
    expect(humaniseError(null)).toMatch(/try again/i);
  });

  it("still passes through an unknown message rather than swallowing it", () => {
    // Better a plain sentence we did not write than a blank panel.
    expect(humaniseError("The flock name was already taken")).toBe(
      "The flock name was already taken",
    );
  });
});