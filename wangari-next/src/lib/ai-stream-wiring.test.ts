/**
 * streamAI's error wiring — regression tests that the transport actually
 * routes provider text through humaniseError.
 *
 * These exist because unit-testing humaniseError on its own was not enough.
 * The function was correct and tested, but the bug it fixes travelled on the
 * SSE event path: the stream answers 200 and then delivers the failure as an
 * event, which bypasses the `!res.ok` branch entirely. A farmer saw the
 * literal text "UnoRouter: 429" because nothing between the socket and the
 * panel called the mapper. These tests stub fetch and assert the message that
 * reaches onEvent, so a future refactor cannot quietly bypass it again.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { streamAI, parseSSE, type StreamEvent } from "./ai-stream";

/** A raw SSE body, given verbatim so the event name can be controlled. */
function rawSse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("streamAI error wiring", () => {
  it("turns a rate-limit error delivered as an SSE EVENT into a farmer sentence", async () => {
    // The exact shape a provider's rate cap produces, delivered the way the
    // stream delivers it: HTTP 200, then an error event.
    globalThis.fetch = vi.fn(async () =>
      rawSse(`event: error\ndata: ${JSON.stringify({ message: "UnoRouter: 429" })}\n\n`),
    ) as unknown as typeof fetch;

    const seen: StreamEvent[] = [];
    await streamAI([{ role: "user", content: "hi" }], (e) => seen.push(e));

    const err = seen.find((e) => e.type === "error");
    expect(err, "an error event was delivered").toBeDefined();
    expect((err as { message: string }).message).toMatch(/busy right now/i);
    // The specific regression: raw provider text reaching the panel.
    expect((err as { message: string }).message).not.toMatch(/unorouter|429/i);
  });

  it("turns a non-OK response body into a farmer sentence", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "rate limit exceeded" }), { status: 429 }),
    ) as unknown as typeof fetch;

    const seen: StreamEvent[] = [];
    await streamAI([{ role: "user", content: "hi" }], (e) => seen.push(e));

    const err = seen.find((e) => e.type === "error") as { message: string } | undefined;
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/busy right now/i);
    expect(err!.message).not.toMatch(/rate limit/i);
  });

  it("still delivers the good path untouched", async () => {
    // Guards against the mapper being applied so eagerly that a normal
    // streamed answer gets rewritten.
    globalThis.fetch = vi.fn(async () =>
      rawSse(
        `event: start\ndata: ${JSON.stringify({ provider: "unorouter", model: "m" })}\n\n` +
          `event: message\ndata: ${JSON.stringify({ content: "You have 3 flocks." })}\n\n` +
          `event: done\ndata: ${JSON.stringify({ steps: 1, truncatedByBudget: false })}\n\n`,
      ),
    ) as unknown as typeof fetch;

    const seen: StreamEvent[] = [];
    await streamAI([{ role: "user", content: "how many flocks" }], (e) => seen.push(e));

    const msg = seen.find((e) => e.type === "message") as { content: string } | undefined;
    expect(msg?.content).toBe("You have 3 flocks.");
    expect(seen.some((e) => e.type === "error")).toBe(false);
  });

  it("sends the bearer token, because the backend will not read localStorage", async () => {
    const spy = vi.fn(async () => rawSse(`event: done\ndata: ${JSON.stringify({ steps: 0 })}\n\n`));
    globalThis.fetch = spy as unknown as typeof fetch;
    // The suite runs in the `node` environment, where there is no
    // localStorage. streamAI guards on `typeof localStorage`, so without a
    // stub it correctly sends no token and this would assert nothing.
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
    store.set("wangari_token", "test-token");

    await streamAI([{ role: "user", content: "hi" }], () => {});

    const headers = (spy.mock.calls[0] as unknown as [string, RequestInit])[1]
      .headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    delete (globalThis as Record<string, unknown>).localStorage;
  });
});

describe("parseSSE frame safety", () => {
  it("holds back a frame split across chunk boundaries", () => {
    // A tool result dropped because the split landed badly is the failure this
    // guards, and it is invisible in a demo you control.
    const whole = `event: tool_end\ndata: {"tool":"create_sale","ok":true}\n\n`;
    const cut = whole.slice(0, 20);
    expect(parseSSE(cut).events).toHaveLength(0);
    const rest = cut + whole.slice(20);
    expect(parseSSE(rest).events).toHaveLength(1);
  });

  it("joins a data payload split across lines", () => {
    const frame = 'event: error\ndata: {"message":\ndata: "UnoRouter: 429"}\n\n';
    const { events } = parseSSE(frame);
    expect(events).toHaveLength(1);
    expect((events[0] as { message: string }).message).toBe("UnoRouter: 429");
  });
});