import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { resolveActiveModel } from "../lib/ai-settings.js";
import {
  SYSTEM_PROMPT,
  callAI,
  executeTool,
  summariseToolResult,
} from "./ai.js";
import { mcpTools } from "./ai.js";

/**
 * /api/ai/whatsapp — read-only AI chat from a WhatsApp message.
 *
 * The Vercel-side WhatsApp webhook forwards farmer questions here with
 * a service-token header. This route runs the SAME agentic loop and
 * the SAME tool gate the in-app chat uses — so writes are still blocked
 * by the plan gate (Free Core cannot save flocks/crops/etc. through
 * WhatsApp, only ask about them) and the refusal copy is identical.
 *
 * The route is intentionally NOT a re-implementation. It imports
 * executeTool and callAI from routes/ai.js so the write gate, the
 * species templates, the AI settings registry, and the per-model
 * fallbacks all stay in one place. A new code path here would drift
 * within a release.
 *
 * Read-only by design: the userId is passed so the AI knows whose
 * farm to read, but every write tool is gated by moduleAllowed() —
 * which is the same function the screen gate calls. The user
 * experience is the same as the in-app chat: read any free-tier
 * data, refuse any paid-tier write.
 */

const router = Router();

const SERVICE_TOKEN = process.env.WHATSAPP_SERVICE_TOKEN || "";
const MAX_QUESTION = 500;
const MAX_AGENT_STEPS = 6; // WhatsApp = 1 turn, 1 user message, no back-and-forth

/**
 * Verify the request comes from the Vercel webhook. The token is set in
 * both env files and rotated out-of-band; an unset token fails CLOSED
 * the same way the cron secret does, because this endpoint runs the
 * AI for a real farmer.
 */
function checkServiceToken(req: Request): boolean {
  if (!SERVICE_TOKEN) return false;
  const auth = req.headers["authorization"] || req.headers["x-service-token"] || "";
  if (typeof auth !== "string") return false;
  const presented = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : auth;
  return presented === SERVICE_TOKEN;
}

router.post("/", async (req: Request, res: Response) => {
  if (!checkServiceToken(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = Number(req.body?.userId);
  const farmId = Number(req.body?.farmId);
  const rawQuestion = typeof req.body?.question === "string" ? req.body.question : "";

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: "userId required" });
  }
  if (!Number.isFinite(farmId) || farmId <= 0) {
    return res.status(400).json({ error: "farmId required" });
  }
  if (!rawQuestion.trim()) {
    return res.status(400).json({ error: "question required" });
  }

  // Cap the question. A WhatsApp text is at most 4096 chars; the model
  // gets a farmer question, not a paste of last month's ledger.
  const question = rawQuestion.trim().slice(0, MAX_QUESTION);

  try {
    const resolved = await resolveActiveModel();
    if (!resolved.apiKey && resolved.provider !== "ollama") {
      return res.status(503).json({ error: "AI assistant is not configured yet." });
    }

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ];

    let reply = "";
    let steps = 0;
    let stopped = false;
    while (steps < MAX_AGENT_STEPS) {
      steps++;
      const response = await callAI(messages, mcpTools, undefined, {
        userId,
        ip: null,
      });
      reply = response.content || reply;
      if (!response.tool_calls || response.tool_calls.length === 0) break;

      const toolResults: any[] = [];
      let anyFailed = false;
      for (const tc of response.tool_calls) {
        let parsedArgs: any = {};
        try {
          parsedArgs = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch {
          anyFailed = true;
          toolResults.push({ tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify({ ok: false, result: "bad-args" }) });
          continue;
        }
        let result: any;
        try {
          result = await executeTool(tc.function.name, parsedArgs, farmId, userId);
        } catch (e: any) {
          anyFailed = true;
          result = { error: e?.message || "tool failed" };
        }
        if (result && typeof result === "object" && (result as any).intake) {
          // The model tried to open the intake form on a farmer who is
          // not in the app. Reply with the form's ask text and stop.
          reply = String((result as any).intake.ask || reply);
          stopped = true;
          break;
        }
        const ok = !(result && typeof result === "object" && (result as any).error);
        if (!ok) anyFailed = true;
        toolResults.push({
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify({ ok, result: ok ? summariseToolResult(tc.function.name, result) : (result as any).error }),
        });
      }
      if (stopped) break;
      messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
      messages.push({ role: "user", content: `Tool results:\n${toolResults.map((t) => `- ${t.name}: ${t.content}`).join("\n")}` });
      // A failed step means the model should stop and explain, not compound.
      if (anyFailed) break;
    }

    // WhatsApp text has a 4096-char limit. We trim reply so a runaway
    // model never sends something Meta rejects.
    const out = (reply || "I could not answer that just now. Try again in a moment.").slice(0, 3500);

    // Best-effort audit. The WhatsApp webhook also writes its own
    // audit row; this is the backend's view.
    prisma.auditLog.create({
      data: {
        farmId,
        userId,
        action: "ai_whatsapp",
        entityType: "ai",
        details: {
          question: question.slice(0, 200),
          replyLength: out.length,
          steps,
          stopped,
        },
      },
    }).catch(() => {});

    return res.json({ message: { content: out }, steps, stopped });
  } catch (e: any) {
    console.error("ai-whatsapp error:", e);
    return res.status(500).json({ error: "AI failed" });
  }
});

export default router;
