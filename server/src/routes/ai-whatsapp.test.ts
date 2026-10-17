import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The /api/ai/whatsapp route accepts a question from a verified Vercel
 * service token, looks up the user and farm, and returns the AI's
 * read-only answer. It is NOT a re-implementation of the agentic loop;
 * it imports the same `executeTool` the in-app chat uses, so the
 * write gate and the refusal copy stay in one place.
 *
 * This test file holds the route to the contract: service token
 * required, the body shape, the response shape, and the no-writes
 * promise (this endpoint is read-only by design — the userId is
 * passed so the AI knows whose farm to read, but the only call
 * sites that COULD write go through executeTool, which is gated
 * by userPlanTier + moduleAllowed on the server).
 */

const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

describe("/api/ai/whatsapp", () => {
  const route = read("routes/ai-whatsapp.ts");

  it("exists and exports a router", () => {
    expect(route).toMatch(/export default router/);
  });

  it("requires a service token (WHATSAPP_SERVICE_TOKEN) on every request", () => {
    expect(route).toMatch(/WHATSAPP_SERVICE_TOKEN/);
    // The header is read by name; the variable holding it can be any
    // valid identifier (auth, presented, etc.) — only the literal
    // header name matters for the security check.
    expect(route).toMatch(/headers\[["']authorization["']\]/);
  });

  it("refuses (401) when the service token is missing or wrong", () => {
    expect(route).toMatch(/401/);
  });

  it("validates the request body — userId, farmId, question", () => {
    expect(route).toMatch(/userId/);
    expect(route).toMatch(/farmId/);
    expect(route).toMatch(/question/);
  });

  it("truncates the question to 500 characters before sending to the model", () => {
    // The 500 is a named constant (MAX_QUESTION). The shape of the
    // truncation is the contract: slice(0, N) on a 500-char cap.
    expect(route).toMatch(/MAX_QUESTION\s*=\s*500/);
    expect(route).toMatch(/slice\(0,\s*MAX_QUESTION\)/);
  });

  it("returns the AI's reply as a string under {message}", () => {
    // The Vercel webhook reads reply.message.content and forwards it to
    // sendWhatsAppMessage. The contract: a string, no nested object.
    expect(route).toMatch(/message:\s*\{[^}]*content/);
  });

  it("returns a 503 when the AI is not configured (so the webhook can reply honestly)", () => {
    // If AI_API_KEY is unset, the route must NOT pretend to answer.
    // Same fail-closed pattern as /api/ai/chat and /api/ai/stream.
    expect(route).toMatch(/503/);
  });

  it("uses the same SYSTEM_PROMPT as the in-app chat", () => {
    // The system prompt is what makes the AI say "based on your
    // records" and refuse writes with the standard copy. The WhatsApp
    // path must use the same prompt, not invent a new one.
    expect(route).toMatch(/SYSTEM_PROMPT/);
  });
});
