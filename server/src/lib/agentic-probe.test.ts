import { describe, it, expect } from "vitest";
import { probeAgentic } from "./agentic-probe.js";

/**
 * The probe is what stops a broken model from reaching a farmer, so it has to
 * fail for the right reasons. Every case here is a model that looked fine
 * and was not:
 *
 *  - stopped after ONE tool call (the space-bunny-alpha-on-OpenRouter case)
 *  - sent arguments the executor cannot use
 *  - never called a tool at all, just wrote a nice sentence
 */
const BASE = "https://example.test/v1";
const KEY = "test-key";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const toolCall = (name: string, args: unknown, id = "call_1") => ({
  choices: [{ message: { content: null, tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }] } }],
});

/** Builds a fetch that answers calls in order, and records what it was sent. */
function fakeFetch(responses: Array<Response | (() => Response)>) {
  const sent: any[] = [];
  const impl = (async (_url: any, init: any) => {
    sent.push(JSON.parse(init.body));
    const next = responses.shift();
    if (!next) throw new Error("probe asked for more calls than the test expected");
    return typeof next === "function" ? next() : next;
  }) as unknown as typeof fetch;
  return { impl, sent };
}

describe("the agentic probe", () => {
  it("passes a model that chains a second tool call", async () => {
    const { impl, sent } = fakeFetch([
      jsonRes(toolCall("create_transaction", { amount_kes: 4500 })),
      jsonRes(toolCall("get_dashboard", {})),
    ]);
    const r = await probeAgentic("m", KEY, BASE, impl);
    expect(r.passed, r.reason).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("fails a model that stops after one tool call", async () => {
    // The exact failure that retired the previous default: it answered the
    // first half of the job and went quiet.
    const { impl } = fakeFetch([
      jsonRes(toolCall("create_transaction", { amount_kes: 4500 })),
      jsonRes({ choices: [{ message: { content: "Done!", tool_calls: [] } }] }),
    ]);
    const r = await probeAgentic("m", KEY, BASE, impl);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("stopped after one tool call");
  });

  it("fails a model that never calls a tool", async () => {
    const { impl } = fakeFetch([jsonRes({ choices: [{ message: { content: "You have 1 flock.", tool_calls: [] } }] })]);
    const r = await probeAgentic("m", KEY, BASE, impl);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("no tool call");
  });

  it("fails a model whose arguments cannot be used", async () => {
    // "null" parses as valid JSON and would still blow up in the executor,
    // so a parse-only check would wave this through.
    const { impl } = fakeFetch([
      jsonRes({ choices: [{ message: { tool_calls: [{ id: "c", function: { name: "create_transaction", arguments: "null" } }] } }] }),
    ]);
    const r = await probeAgentic("m", KEY, BASE, impl);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("unusable arguments");
  });

  it("reports the status instead of throwing when the provider refuses", async () => {
    const { impl } = fakeFetch([jsonRes({}, 429)]);
    const r = await probeAgentic("m", KEY, BASE, impl);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("429");
  });

  it("never throws, whatever happens", async () => {
    const impl = (() => {
      throw new Error("network gone");
    }) as unknown as typeof fetch;
    const r = await probeAgentic("m", KEY, BASE, impl);
    expect(r.passed).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it("sends the tool RESULT back for step 2, not a fresh conversation", async () => {
    const { impl, sent } = fakeFetch([
      jsonRes(toolCall("create_transaction", { amount_kes: 4500 })),
      jsonRes(toolCall("get_dashboard", {})),
    ]);
    await probeAgentic("m", KEY, BASE, impl);
    const second = sent[1].messages;
    expect(second.some((m: any) => m.role === "tool")).toBe(true);
    expect(sent[1].messages.length).toBeGreaterThan(sent[0].messages.length);
  });

  it("strips a trailing slash from the base URL", async () => {
    const seen: string[] = [];
    const impl = (async (url: any) => {
      seen.push(String(url));
      return jsonRes(toolCall("create_transaction", {}));
    }) as unknown as typeof fetch;
    await probeAgentic("m", KEY, `${BASE}/`, impl);
    expect(seen[0]).toBe(`${BASE}/chat/completions`);
  });
});