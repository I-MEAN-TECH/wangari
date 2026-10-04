import { NextRequest } from "next/server";
import { proxyToBackendStream } from "@/lib/api-proxy";

/**
 * POST /api/ai/stream — proxies the agent's SSE stream from the Express
 * backend to the browser.
 *
 * This route is what makes Wangari actually work. Without it the client's
 * fetch to /api/ai/stream 404s inside Next before it ever reaches the
 * agent, and the panel looks alive while doing nothing — which is exactly
 * the failure mode this route exists to prevent.
 *
 * The body must be streamed straight through, NOT buffered with
 * res.json()/res.text(): buffering defeats the entire point of SSE, and the
 * farmer would stare at a spinner for the whole run and then get every
 * token at once.
 *
 * `dynamic = "force-dynamic"` because this is a POST that must never be
 * prerendered or cached.
 */
export const dynamic = "force-dynamic";
// Node runtime, not edge: the stream is long-lived and the runtime needs to
// keep the connection open across many chunks.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let messages: unknown;
  try {
    ({ messages } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Messages array required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return proxyToBackendStream("/api/ai/stream", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages }),
  });
}
