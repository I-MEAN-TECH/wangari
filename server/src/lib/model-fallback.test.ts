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
    const main = /export function isModelGone\(status: number, body: string\): boolean \{([\s\S]*?)\n\}/.exec(src);
    expect(main, "isModelGone is a small pure function we can evaluate").toBeTruthy();
    // isModelGone delegates the 503 case to a helper, so both have to be in
    // scope. Each is reassembled with its own signature, which also keeps the
    // locals inside separate scopes - both bodies use `b`.
    const helper = /function isChannelExhausted\(body: string\): boolean \{([\s\S]*?)\n\}/.exec(src);
    expect(helper, "the exhausted-channel helper must exist and stay pure").toBeTruthy();
    const source =
      `function isChannelExhausted(body) {${helper![1]}\n}` +
      `\nfunction isModelGone(status, body) {${main![1]}\n}` +
      `\nreturn isModelGone(status, body);`;
    // eslint-disable-next-line no-new-func
    return new Function("status", "body", source)(status, body);
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

  it("treats an exhausted free-tier channel as the model being unavailable", () => {
    // The live failure. UnoRouter answers 503 `get_channel_failed` when every
    // provider behind a model is rate-limited at once — which is exactly what a
    // free tier looks like at peak. The status alone is not distinguishable from
    // a hiccup, but the body is, and the body is the whole signal.
    //
    // This is why the assistant was returning "UnoRouter: 503" to farmers while
    // a verified fallback sat unused in the environment: the guard read the 503,
    // saw it was not 404, and stayed put on a model with no channels left.
    const body = JSON.stringify({
      error: {
        code: "get_channel_failed",
        message:
          'All providers for model "space-bunny-alpha:free" are busy right now ' +
          "(they hit their rate limit). This is not a spelling error. Please try again in a little while, or switch to another model.",
      },
    });
    expect(gone(503, body)).toBe(true);
  });

  it("recognises the exhausted channel however the body is phrased", () => {
    const variants = [
      "get_channel_failed",
      "All providers for model are busy right now",
      "all_providers_busy",
      "no available channel for this model",
      "no channels available",
    ];
    for (const v of variants) {
      expect(gone(503, v), `"${v}" should count as the model being unavailable`).toBe(true);
    }
  });

  it("still refuses to move on a 503 that is a plain upstream failure", () => {
    // The distinction that keeps this safe. A generic 503 with no channel
    // language is a server hiccup: the same model will answer in seconds, and
    // swapping would trade a probe-verified model for an unverified one over
    // nothing. Only the exhausted-channel body justifies the hop.
    for (const body of [
      "upstream",
      "Service Unavailable",
      '{"error":{"code":"internal_error","message":"upstream timeout"}}',
      "bad gateway",
    ]) {
      expect(gone(503, body), `"${body}" must NOT trigger a fallback`).toBe(false);
    }
  });

  it("does not treat a 429 as exhaustion no matter how it is worded", () => {
    // UnoRouter's 429 is the account-wide per-minute cap and the retry loop
    // already handles it by waiting. Jumping models here would defeat the
    // window calculation in lib/rate-limit-window.ts.
    expect(gone(429, "get_channel_failed")).toBe(false);
    expect(gone(429, "All providers for model are busy right now")).toBe(false);
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
  });it("carries the remaining backups forward, so two dead models still answer", () => {
    // Without threading the tail, one dead backup just moves the failure.
    // `settings` is threaded through the recursive call as well: the retry budget
    // has to survive a fallback hop, or a model that dies mid-conversation would
    // hand the next one an unlimited number of free retries.
    //
    // `caller` rides along too. A fallback hop is still the same farmer's
    // question, so the usage log has to attribute the answer to them — a hop
    // that dropped the caller would file the work under nobody.
    expect(src).toMatch(/\{\s*\.\.\.config, model: next \}, onWait, rest, settings, caller\)/);
  });

  it("picks a healthy model BEFORE calling, rather than only after a failure", () => {
    // The old behaviour was: try the pinned model, and reach for a backup only
    // once it had already returned 404 or an exhausted-channel 503. That costs
    // one farmer-facing failure per change of model, for as long as the
    // condition lasts — minutes on a free tier, which is how the assistant
    // showed farmers "UnoRouter: 503" all afternoon with a working backup idle.
    const fn = src.slice(src.indexOf("async function callOpenAICompatible"));
    expect(fn).toContain("healthyModel(");
    expect(fn).toMatch(/healthyModel\(\[preferred, \.\.\.remainingFallbacks\], modelHealth\.snapshot\(\)/);
    // And the reactive path stays, so a model that dies between the choice and
    // the response is still caught. The two cover each other.
    expect(fn.indexOf("healthyModel(")).toBeLessThan(fn.indexOf("isModelGone(res.status, err)"));
  });

  it("learns from every response, including the ones it does not fall back on", () => {
    const fn = src.slice(src.indexOf("async function callOpenAICompatible"));
    // The 429 is observed even though it deliberately does not move selection:
    // the panel has to be able to say a model was rate limited, not infer it.
    expect(fn).toMatch(/modelHealth\.observe\(config\.model, res\.status, err, Date\.now\(\)\)/);
    expect(fn).toMatch(/modelHealth\.observe\(config\.model, res\.status, "", Date\.now\(\)\)/);
    expect(fn).toContain("modelHealth.recordUse(");
  });

  it("records WHO the answer was for, which is the only useful question about a failure", () => {
    // "This model is broken" is not actionable. "This model is broken, and it
    // broke 40 farmers from 6 addresses" is. So the caller identity travels
    // with the call rather than being looked up inside it.
    expect(src).toMatch(/caller: AiCaller = \{ userId: null, ip: null \}/);
    expect(src).toMatch(/userId: req\.user!\.userId \?\? null,\s*\n\s*ip: req\.ip \?\? null/);
  });

  it("keeps the retry loop and the fallback on the same path", () => {
    // Falling back must not skip the rate-limit handling, or the backup gets
    // refused for the same 429 the pinned model was.
    expect(src.indexOf("isModelGone(res.status, err)")).toBeGreaterThan(src.indexOf("RATE_LIMIT_MAX_RETRIES"));
  });
});