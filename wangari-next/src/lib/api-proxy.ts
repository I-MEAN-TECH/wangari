/**
 * Proxies API requests to the Express backend server.
 * Used because Vercel can't reach PostgreSQL directly (Azure NSG blocks port 5432).
 */

const BACKEND_URL = process.env.BACKEND_URL || "https://api.wangari.imeantech.com";

export async function proxyToBackend(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${BACKEND_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  // Forward Authorization header if present
  // (useful for authenticated proxy calls)

  const res = await fetch(url, {
    ...options,
    headers,
  });

  return res;
}

/**
 * Stream a response body straight through to the browser.
 *
 * Split from proxyToBackend because the two have different obligations. The
 * buffered version can return the Response as-is; this one must not, because
 * reading the body before returning it defeats SSE entirely — the farmer
 * would wait for the whole run and then watch it replay instantly.
 *
 * The backend's status and content-type are preserved so the client can
 * still tell a 503 (no provider configured) from a real stream. Errors are
 * passed through as-is rather than rewrapped, which keeps the client's
 * error handling honest instead of turning every failure into "unknown".
 */
export async function proxyToBackendStream(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${BACKEND_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, { ...options, headers });
  } catch {
    // The backend being unreachable is the common case in local dev.
    return new Response(JSON.stringify({ error: "AI service unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the failure through with its status intact so a 503 still reads
    // as "not configured" on the client.
    const text = await upstream.text().catch(() => "");
    return new Response(text || JSON.stringify({ error: `Upstream ${upstream.status}` }), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells nginx not to buffer; without it the stream arrives in one lump.
      "X-Accel-Buffering": "no",
    },
  });
}
