import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The October problem.
 *
 * `space-bunny-alpha` is flagged for deprecation this month, which is the
 * month of the expo. A pinned model that dies takes the assistant with it:
 * every farmer gets an error until somebody edits an env var and rebuilds.
 *
 * The fix is a fallback, and the fix is dangerous. Switching models on the
 * wrong failure trades a verified model for an unverified one over a blip,
 * so the tests below are mostly about what must NOT trigger it.
 */
const src = readFileSync(join(process.cwd(), "src", "routes", "ai.ts"), "utf8");

describe("recognising a retired model", () => {
  const gone = (status: number, body: string) => {
    const m = /export function isModelGone\(status: number, body: string\): boolean \{([\s\S]*?)\n\}/.exec(src);
    expect(m, "isModelGone is a small pure function we can evaluate").toBeTruthy();
    // eslint-disable-next-line no-new-func
    return new Function("status", "body", m![1])(status, body);
  };

  it("treats 404 as permanent", () => {
    expect(gone(404, "")).toBe(true);
  });

  it("treats a 400 model_not_found as permanent", () => {
    // UnoRouter answers a bad model id this way rather than with a bare 404.
    expect(gone(400, '{"error":{"code":"model_not_found","message":"no such model"}}')).toBe(true);
  });

  it("does NOT treat a rate limit as the model being gone", () => {
    // This is the important one. Our free plan answers 429 constantly - that
    // is the normal shape of a two-step turn. Switching models here would
    // mean swapping to an unverified model every few minutes, on a plan
    // that will be 429 again the moment it does.
    expect(gone(429, "rate limit exceeded")).toBe(false);
  });

  it("does NOT treat a server error or a dropped connection as permanent", () => {
    for (const s of [500, 502, 503, 408]) expect(gone(s, "upstream")).toBe(false);
  });

  it("does not read a 400 as permanent just because it says 'model'", () => {
    // The pin is what matters. A 400 about a bad tool schema or a too-long
    // prompt mentions the model and is entirely the caller's fault.
    expect(gone(400, "invalid request: messages must not be empty")).toBe(false);
  });
});

describe("the fallback itself", () => {
  it("is driven by env and empty by default", () => {
    // Empty by default because an unverified fallback is worse than no
    // fallback. It has to be an operator decision made with the probe.
    expect(src).toMatch(/const AI_MODEL_FALLBACKS = \(process\.env\.AI_MODEL_FALLBACKS \|\| ""\)/);
  });

  it("does not re-decide the model on every request", () => {
    // A model chosen afresh per farmer per question can vanish mid-answer.
    // Discovery produces a SHORTLIST; a human pins the winner and these
    // verified backups. Neither is recomputed at request time.
    expect(src).toMatch(/remainingFallbacks: string\[\] = AI_MODEL_FALLBACKS/);
    const roster = readFileSync(join(process.cwd(), "src", "lib", "free-model-roster.ts"), "utf8");
    expect(src).not.toMatch(/from "\.\/lib\/free-model-roster\.js"/);
    expect(roster).toMatch(/Nothing here decides the model at request time/);
  });

  it("carries the remaining backups forward, so two dead models still answer", () => {
    // Without threading the tail, one dead backup just moves the failure.
    expect(src).toMatch(/\{\s*\.\.\.config, model: next \}, onWait, rest\)/);
  });

  it("keeps the retry loop and the fallback on the same path", () => {
    // Falling back must not skip the rate-limit handling, or the backup gets
    // refused for the same 429 the pinned model was.
    expect(src.indexOf("isModelGone(res.status, err)")).toBeGreaterThan(src.indexOf("RATE_LIMIT_MAX_RETRIES"));
  });
});