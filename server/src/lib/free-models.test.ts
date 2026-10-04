/**
 * Free-model discovery — tests for lib/free-models.ts.
 *
 * The behaviours guarded here are the two that silently break the product:
 * a model that cannot finish a multi-step job being accepted, and a
 * retired model being trusted because it is still hard-coded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  discoverFreeModels,
  canRunAgenticLoop,
  pickBestFreeModel,
  VERIFIED_MODELS,
} from "./free-models";

const KEY = "sk-or-v1-test";

/** A minimal OpenRouter-shaped model record. */
const model = (id: string, ctx: number, tools = true, price = "0") => ({
  id,
  context_length: ctx,
  supported_parameters: tools ? ["tools", "temperature"] : ["temperature"],
  pricing: { prompt: price, completion: price },
});

function mockFetchSequence(responses: Array<{ status?: number; body: any }>) {
  const calls: any[] = [];
  const fn = vi.fn(async (url: string, init: any) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    const status = next.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => next.body,
    } as any;
  });
  (globalThis as any).fetch = fn;
  return { fn, calls };
}

/** A two-step probe that succeeds: tool call, then a second tool call. */
const STEP1_OK = {
  choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "create_transaction", arguments: '{"amount_kes":4500}' } }] } }],
};
const STEP2_OK = {
  choices: [{ message: { tool_calls: [{ id: "c2", function: { name: "get_dashboard", arguments: "{}" } }] } }],
};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => { delete (globalThis as any).fetch; });

describe("discoverFreeModels", () => {
  it("keeps only models that are free on BOTH input and output", async () => {
    // Free to prompt but paid to complete would quietly bill the account.
    mockFetchSequence([
      { body: { data: [model("a/free", 1000), model("b/half", 1000, true, "0.00000005")] } },
    ]);
    const found = await discoverFreeModels(KEY);
    expect(found.map((m) => m.id)).toEqual(["a/free"]);
  });

  it("keeps only models that advertise tool support", async () => {
    // Without tools a model cannot record a sale; it can only talk about one.
    mockFetchSequence([{ body: { data: [model("a/tools", 1000), model("b/none", 1000, false)] } }]);
    const found = await discoverFreeModels(KEY);
    expect(found.map((m) => m.id)).toEqual(["a/tools"]);
  });

  it("throws on a failed lookup rather than returning an empty roster", async () => {
    // An empty list is indistinguishable from "nothing is available", and
    // that ambiguity is what lets a dead default quietly persist.
    mockFetchSequence([{ status: 500, body: {} }]);
    await expect(discoverFreeModels(KEY)).rejects.toThrow(/500/);
  });
});

describe("canRunAgenticLoop", () => {
  it("accepts a model that completes BOTH steps", async () => {
    mockFetchSequence([{ body: STEP1_OK }, { body: STEP2_OK }]);
    expect(await canRunAgenticLoop("good", KEY)).toBe(true);
  });

  it("rejects a model that stops after one tool", async () => {
    // THE regression: space-bunny-alpha behaves exactly like this. It looks
    // fine on a single call and then leaves the farmer mid-job.
    mockFetchSequence([{ body: STEP1_OK }, { body: { choices: [{ message: { content: "done!" } }] } }]);
    expect(await canRunAgenticLoop("stops-early", KEY)).toBe(false);
  });

  it("rejects a model whose arguments are malformed", async () => {
    // Free models emit corrupted JSON. Truncated output is the common shape:
    // the model ran out mid-object. Accepting it means the executor records
    // the wrong thing while the farmer was told it worked.
    mockFetchSequence([
      { body: { choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "create_transaction", arguments: '{"amount_kes":4500,"reas' } }] } }] } },
      { body: STEP2_OK },
    ]);
    expect(await canRunAgenticLoop("bad-json", KEY)).toBe(false);
  });

  it("rejects arguments that parse but are not an object", async () => {
    // `null` or a bare number is valid JSON and still unusable as tool args,
    // so a parse alone is not enough of a guard.
    mockFetchSequence([
      { body: { choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "create_transaction", arguments: "null" } }] } }] } },
      { body: STEP2_OK },
    ]);
    expect(await canRunAgenticLoop("null-args", KEY)).toBe(false);
  });

  it("rejects rather than throws when the model is gone (404)", async () => {
    // A retired model is a normal condition, not an exception.
    mockFetchSequence([{ status: 404, body: { error: { message: "unavailable for free" } } }]);
    expect(await canRunAgenticLoop("retired", KEY)).toBe(false);
  });

  it("rejects when the first step makes no tool call at all", async () => {
    mockFetchSequence([{ body: { choices: [{ message: { content: "I can help with that!" } }] } }]);
    expect(await canRunAgenticLoop("chatty", KEY)).toBe(false);
  });
});

describe("pickBestFreeModel", () => {
  it("uses a verified model without scanning the roster", async () => {
    // Cost control: the free tier is 50 requests a DAY account-wide, so the
    // common case must cost two calls, not twenty.
    const { calls } = mockFetchSequence([{ body: STEP1_OK }, { body: STEP2_OK }]);
    const pick = await pickBestFreeModel(KEY);
    expect(pick).toEqual({ model: VERIFIED_MODELS[0], verified: true, probed: 1 });
    expect(calls).toHaveLength(2);
  });

  it("falls back to another working model when the verified one is retired", async () => {
    // This is the outage that took the demo down last time.
    const { calls } = mockFetchSequence([
      { status: 404, body: { error: { message: "This model is unavailable for free" } } },
      { body: { data: [model("newcomer/tools", 5000)] } },
      { body: STEP1_OK },
      { body: STEP2_OK },
    ]);
    const pick = await pickBestFreeModel(KEY);
    expect(pick).toEqual({ model: "newcomer/tools", verified: false, probed: 2 });
    // The roster is only fetched AFTER the verified model fails, so the
    // discovery call sits after the 404 probe rather than first.
    expect(calls.some((c) => c.url.includes("/models"))).toBe(true);
  });

  it("returns null rather than a model that cannot finish a job", async () => {
    // The whole point of the second step. Anything less would put a model in
    // front of a farmer that stalls halfway through recording a sale.
    mockFetchSequence([
      { status: 404, body: {} },
      { body: { data: [model("only/one-step", 5000)] } },
      { body: STEP1_OK },
      { body: { choices: [{ message: { content: "all done" } }] } },
    ]);
    expect(await pickBestFreeModel(KEY)).toBeNull();
  });

  it("gives up cleanly when discovery is unreachable", async () => {
    mockFetchSequence([
      { status: 500, body: {} },
      { status: 500, body: {} },
    ]);
    expect(await pickBestFreeModel(KEY)).toBeNull();
  });

  it("honours the probe budget so discovery cannot eat the quota", async () => {
    const many = Array.from({ length: 10 }, (_, i) => model(`m${i}`, 1000 - i));
    const seq: any[] = [{ status: 404, body: {} }, { body: { data: many } }];
    for (let i = 0; i < 10; i++) seq.push({ body: STEP1_OK }, { body: STEP2_OK });
    mockFetchSequence(seq);
    const pick = await pickBestFreeModel(KEY, { maxProbes: 2 });
    expect(pick!.probed).toBeLessThanOrEqual(2);
  });
});
