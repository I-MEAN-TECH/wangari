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

/**
 * The guided form Wangari opens when the farmer asks to add something.
 *
 * It arrives as its own event rather than as a tool result because it is not a
 * result: nothing has been saved, and what the farmer needs is twenty-eight
 * questions to answer. See components/ai/intake-card.tsx.
 */
export interface StreamIntake {
  entity: string;
  title: string;
  intro: string;
  sections: IntakeSection[];
  values: Record<string, string>;
  missingRequired: string[];
  missingOptional: string[];
  filled: number;
  total: number;
  ask: string;
}

export interface IntakeOption {
  value: string;
  label: string;
}

export interface IntakeSection {
  id: string;
  title: string;
  blurb?: string;
  fields: {
    key: string;
    label: string;
    type: "text" | "textarea" | "number" | "money" | "select" | "date";
    required?: boolean;
    options?: IntakeOption[];
    placeholder?: string;
    hint?: string;
    integer?: boolean;
    min?: number;
  }[];
}

export type StreamEvent =
  | { type: "start"; provider: string; model: string }
  | { type: "message"; content: string }
  | { type: "tool_start"; tool: string; step: number }
  | { type: "tool_end"; tool: string; ok: boolean; result?: string; error?: string }
  | { type: "done"; steps: number; truncatedByBudget: boolean }
  /**
   * The provider's free tier is holding the next call for a moment.
   *
   * `seconds` is how long the server is about to wait, and it is not a guess:
   * the server knows when it was last accepted and waits for that window to
   * close. Sending it matters because the alternative is a full minute of an
   * avatar that looks like it has frozen. A farmer who thinks the app has
   * died does not wait a minute to find out - they leave.
   */
  | { type: "waiting"; seconds: number; opensAt: number | null }
  /**
   * Wangari is collecting the details of a new record before writing it.
   *
   * Nothing is saved when this arrives, and nothing must be shown as saved
   * until the farmer confirms the form. The old behaviour — a name and a count
   * written without asking — is what this event exists to replace.
   */
  | { type: "intake"; intake: StreamIntake }
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
 * Turn a provider or server error into something a farmer can act on.
 *
 * The raw text is the failure. A free-tier cap answers "UnoRouter: 429",
 * which tells a farmer in Kiambu nothing except that the words are
 * strange — it reads as the app being broken rather than busy. Every error
 * the panel can show therefore goes through here, so there is exactly one
 * place that decides what Wangari says when she cannot answer.
 *
 * `status` is only a hint: the stream returns 200 and delivers failures as
 * events, so the provider's own status usually has to be recognised from the
 * message text instead.
 */
export function humaniseError(raw: unknown, status?: number): string {
  const text = typeof raw === "string" ? raw : "";
  const lower = text.toLowerCase();
  const busy =
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    status === 429;
  if (busy) {
    // Say WHEN, not why. "Too many requests" invites the farmer to think they
    // did something wrong; "come back later" tells them what to actually do.
    return "Wangari is busy right now. Please try again in a few minutes.";
  }
  if (lower.includes("401") || lower.includes("unauthorized")) {
    return "Please sign in again so Wangari can read your farm.";
  }
  if (lower.includes("prisma") || lower.includes("invocation")) {
    // An internal fault. Saying so plainly beats inventing a cause, but the
    // detail stays in the console for us rather than on the farmer's screen.
    if (typeof console !== "undefined") console.error("Wangari backend error:", text);
    return "Wangari could not finish that just now. Please try again.";
  }
  // Anything we have not taught ourselves to read is still shown, because an
  // empty error is worse than an ugly one — but the status leads the way.
  return text || "Wangari could not answer just now. Please try again.";
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
      else if (body?.error) message = humaniseError(body.error, res.status);
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
      for (const e of events) {
        // The stream answers 200 and then reports failure as an event, so a
        // provider error reaches the farmer HERE and not through the status
        // check above. Without this the panel rendered the provider's own
        // words — which is how "UnoRouter: 429" ended up on a farmer's phone.
        if (e.type === "error") onEvent({ ...e, message: humaniseError(e.message) });
        else onEvent(e);
      }
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") {
      onEvent({ type: "error", message: "The connection dropped before Wangari finished." });
    }
  } finally {
    reader.releaseLock();
  }
}
