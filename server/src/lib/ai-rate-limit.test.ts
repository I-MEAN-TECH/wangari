import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * UnoRouter meters one request a minute, account-wide.
 *
 * That is not a hypothetical: a farm task is one call per tool plus one for
 * the sentence, so step 2 of "record a sale and tell me how the farm is
 * doing" returned 429 while step 1 had already written the record. The
 * farmer was told the work could not be done, after part of it had been.
 *
 * These tests hold the retry behaviour in place. They read the source
 * because the call is a bare fetch inside a module with Prisma and an API key
 * — standing that up in a unit test would need a fake model server, and the
 * part worth protecting is the decision, not the socket.
 */
const src = readFileSync(join(process.cwd(), "src", "routes", "ai.ts"), "utf8");

describe("waiting out a per-minute rate limit", () => {
  it("retries a 429 instead of failing the call", () => {
    expect(src).toContain("RATE_LIMIT_MAX_RETRIES");
    expect(src).toMatch(/res\.status !== 429/);
  });

  it("waits for the window the provider told us about, not a guessed schedule", () => {
    // This replaced a fixed [12s, 25s, 30s], and the reason is a measurement.
    // "tell me the status of the farm" took 84,388ms on one tool call, while a
    // bare exchange on the same key and model took 1,249ms. Sixty of those
    // seconds were the free tier's minute, and 67 were spent firing into it
    // three times on the strength of a guess.
    //
    // So the route must carry the window, and the decision must be delegated
    // to the function that can read a clock. The arithmetic itself is guarded
    // in rate-limit-window.test.ts against those same live numbers.
    expect(src).toMatch(/const RATE_LIMIT_WINDOW_MS = Number\(process\.env\.AI_RATE_LIMIT_WINDOW_MS \|\| 60_000\)/);
    expect(src).toContain('import { nextRetryWait } from "../lib/rate-limit-window.js"');
    expect(src).toContain("nextRetryWait({");
    expect(src).not.toContain("RATE_LIMIT_BACKOFF_MS");

    // The wait must be computed, not hardcoded at the call site.
    const retry = src.slice(src.indexOf("async function callOpenAICompatible"));
    expect(retry).toMatch(/lastAcceptedAt: lastAcceptedCallAt/);
    expect(retry).toMatch(/now: Date\.now\(\)/);
  });

  it("remembers when the key was last accepted, because that is what the limit is on", () => {
    // The free tier meters the KEY, not the request. A second farmer asking
    // at the same moment is waiting on the same minute, and needs to be told
    // the same minute - so this cannot be per-request state.
    expect(src).toMatch(/^let lastAcceptedCallAt: number \| null = null;$/m);
    const retry = src.slice(src.indexOf("async function callOpenAICompatible"));
    expect(retry).toMatch(/if \(res\.ok\) lastAcceptedCallAt = Date\.now\(\);/);
  });

  it("keeps the body identical across retries", () => {
    // The retry must re-send the SAME conversation. Re-serialising per
    // attempt would silently drop the tool results the model needs to make
    // its second decision.
    const start = src.indexOf("async function callOpenAICompatible");
    const fn = src.slice(start, src.indexOf("async function callGemini", start));
    const built = fn.match(/JSON\.stringify\(\{ model: config\.model/g) || [];
    expect(built.length, "the request body is serialised exactly once, not per attempt").toBe(1);
    expect(fn.indexOf("const body =")).toBeLessThan(fn.indexOf("for (let attempt"));
  });

  it("still gives up rather than retrying forever", () => {
    // The cap is now read off the `settings` argument so a super-admin can tune
    // it from the registry; the constant remains the default that argument
    // falls back to. Both are asserted, because the guarantee ("give up") is
    // only real if the default exists AND the call site uses it.
    expect(src).toMatch(/rateLimitMaxRetries: RATE_LIMIT_MAX_RETRIES/);
    expect(src).toMatch(/attempt <= RATE_LIMIT_MAX_RETRIES/);
    expect(src).toMatch(/if \(attempt >= settings\.rateLimitMaxRetries\) break/);
  });

  it("keeps a single wait inside nginx's 120s read timeout", () => {
    // The ceiling on one sleep, not the sum of a schedule. Past 120s the
    // farmer watches a connection die with no word, which is worse than
    // being told the wait was too long.
    const m = src.match(/const RATE_LIMIT_MAX_WAIT_MS = Number\(process\.env\.AI_RATE_LIMIT_MAX_WAIT_MS \|\| (\d[\d_]*)\)/);
    expect(m, "the ceiling is declared in one place").toBeTruthy();
    const ceiling = Number(m![1].replace(/_/g, ""));
    expect(ceiling).toBeLessThan(120_000);
  });

  it("tells the farmer when the answer is a minute away instead of going quiet", () => {
    // 60 seconds of silence is indistinguishable from a frozen app, and a
    // farmer who cannot tell will not ask a second time.
    expect(src).toContain('send("waiting"');
  });

  it("keeps a per-provider step ceiling the operator can lower", () => {
    // With one call a minute, eight steps is not reachable; the ceiling is
    // env-driven so it can be tuned per provider without a code change.
    expect(src).toMatch(/AI_MAX_STEPS \|\| 8/);
  });
});

describe("OpenRouter is gone", () => {
  it("is not in the provider table at all", () => {
    // It was the previous default and every failure it caused was traced back
    // to it: a model that failed the agentic probe, and a 50/day cap that
    // took the assistant down mid-demo. Leaving the entry in place means it
    // is one env var away from being the default again.
    const all = readFileSync(join(process.cwd(), "src", "ai-providers.ts"), "utf8");
    expect(all).not.toMatch(/openrouter:/);
    expect(all).not.toMatch(/openrouter.ai/);
  });

  it("is not the default any more", () => {
    // toContain, not a regex: `||` inside a regex literal is ALTERNATION, so
    // /... || "unorouter"/ silently matched the `process.env.AI_PROVIDER`
    // branch and passed even with the default flipped back. That is how this
    // assertion looked like it worked while proving nothing.
    const line = src.split("\n").find((l) => l.includes("const AI_PROVIDER ="));
    expect(line).toBeDefined();
    expect(line).toContain('process.env.AI_PROVIDER || "unorouter"');
  });

  it("left no discovery code behind that only worked there", () => {
    // The roster discovery filtered models by zero pricing, which is an
    // OpenRouter-shaped response. On UnoRouter it would have returned an
    // empty roster - a 404 by another route.
    expect(src).not.toMatch(/pickBestFreeModel|verifiedFreeModel|warmModelCache/);
    expect(() => readFileSync(join(process.cwd(), "src", "lib", "free-models.ts"), "utf8")).toThrow();
  });

  it("kept the probe that caught the bad model", () => {
    // Removing the roster must not remove the check that found the problem.
    expect(() =>
      readFileSync(join(process.cwd(), "src", "lib", "agentic-probe.ts"), "utf8"),
    ).not.toThrow();
  });
});

describe("UnoRouter is configured the way the vendor documents", () => {
  const providers = readFileSync(join(process.cwd(), "src", "ai-providers.ts"), "utf8");

  it("is registered with the endpoint the vendor documents", () => {
    expect(providers).toContain("unorouter:");
    expect(providers).toContain("https://api.unorouter.com/v1");
  });

  it("uses the only model id this endpoint actually serves", () => {
    // space-bunny-alpha, :paid and stealth/space-bunny-alpha all answered
    // 404 model_not_found on UnoRouter. Only the free id resolves.
    expect(providers).toMatch(/unorouter:[\s\S]*?defaultModel: "space-bunny-alpha:free"/);
  });

  it("is OpenAI-compatible, so it takes the existing code path", () => {
    expect(providers).toMatch(/unorouter:[\s\S]*?openaiCompatible: true/);
  });
});