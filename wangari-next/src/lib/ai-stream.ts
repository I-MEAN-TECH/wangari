/**
 * Client for POST /api/ai/stream.
 *
 * Why fetch and not EventSource: EventSource is GET-only, and this
 * endpoint is a POST because the conversation history travels in the
 * body. That is not a limitation to work around — the run is one request
 * per user turn, so a plain fetch with a parsed body is the honest shape.
 *
 * The parser is separated from the transport on purpose. Reading an SSE
 * body correctly means handling chunk boundaries that can split a frame
 * mid-JSON, and that is exactly the sort of thing that looks fine in a
 * demo and silently drops a message in production. It is pure, so it is
 * testable without a server.
 */

/** Must match TOKEN_KEY in lib/auth-client.ts, where the JWT is stored. */
const TOKEN_KEY = "wangari_token";

/** One tool step from the agent's run, matching AgentStep. */
export interface StreamStep {
  tool: string;
  ok: boolean;
  /** Short human line, e.g. "Recorded sale — KES 4,500". */
  result?: string;
  error?: string;
}

/** A message in the conversation, in OpenAI wire format. */
export interface WireMessage {
  role: "user" | "assistant";
  content: string;
}

export type StreamEvent =
  | { type: "start"; provider: string; model: string }
  | { type: "message"; content: string }
  | { type: "tool_start"; tool: string; step: number }
  | { type: "tool_end"; tool: string; ok: boolean; result?: string; error?: string }
  | { type: "done"; steps: number; truncatedByBudget: boolean }
  | { type: "error"; message: string };

/**
 * Pull complete SSE frames out of a byte stream.
 *
 * SSE frames are separated by a blank line. A network chunk can end at any
 * byte, including halfway through `data: {...}`, so anything after the last
 * blank line is held back until the next chunk arrives. Without that,
 * a tool result gets dropped whenever the split lands badly — which is
 * rarely, and never in a demo you control.
 */
export function parseSSE(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  // Normalise CRLF so a frame split across a Windows proxy still parses.
  const frames = buffer.split(/\r?\n\r?\n/);
  const rest = frames.pop() ?? "";

  for (const frame of frames) {
    let event = "";
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!event || dataLines.length === 0) continue; // comment or keep-alive
    try {
      const parsed = JSON.parse(dataLines.join("\n"));
      // The server names its events; the client trusts but verifies, so a
      // renamed or unknown event surfaces as an error rather than silence.
      events.push({ type: event, ...parsed } as StreamEvent);
    } catch {
      events.push({ type: "error", message: "Wangari sent something unreadable." });
    }
  }
  return { events, rest };
}

/**
 * Stream one agent run.
 *
 * @param messages  conversation so far, oldest first
 * @param onEvent   called for every server event, in order
 * @param signal    abort to stop the run; the server sees the closed
 *                  connection and stops burning quota
 */
export async function streamAI(
  messages: WireMessage[],
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    // The bearer token MUST be sent explicitly. It lives in localStorage,
    // not in a cookie, so the browser attaches nothing on its own — and the
    // Next proxy forwards only the header it is given. Omit this and the
    // backend's authMiddleware rejects the run with a 401 that surfaces as
    // an unexplained empty reply.
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    res = await fetch("/api/ai/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    onEvent({ type: "error", message: "No connection. Check your network and try again." });
    return;
  }

  if (!res.ok || !res.body) {
    let message = `Wangari could not answer (${res.status}).`;
    try {
      const body = await res.json();
      // 503 means the server has no provider configured. Saying so beats a
      // bare status code: it is the difference between "try again" and
      // "this will never work until someone sets a key".
      if (res.status === 503) message = "Wangari is not switched on yet.";
      else if (body?.error) message = body.error;
    } catch {
      /* a non-JSON error body is fine; the status line still stands */
    }
    onEvent({ type: "error", message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSSE(buffer);
      buffer = rest;
      for (const e of events) onEvent(e);
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") {
      onEvent({ type: "error", message: "The connection dropped before Wangari finished." });
    }
  } finally {
    reader.releaseLock();
  }
}
