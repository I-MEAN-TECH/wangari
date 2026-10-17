/**
 * WhatsApp Webhook — receives messages from Meta Cloud API.
 * GET: verification handshake
 * POST: process incoming messages
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook, parseMessage, executeCommand, sendWhatsAppMessage } from "@/lib/whatsapp";
import { isAiQuestion } from "@/lib/whatsapp-ai";
import { prisma } from "@/lib/db";

// The Vercel webhook forwards free-tier questions to the backend's
// /api/ai/whatsapp, which runs the same agentic loop the in-app chat
// uses. The Vercel side authenticates with a service token; the
// backend fails CLOSED if the env var is unset (same pattern as
// CRON_SECRET on the other crons).
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";
const WHATSAPP_SERVICE_TOKEN = process.env.WHATSAPP_SERVICE_TOKEN || "";

/**
 * Forward a free-form question to the backend's /api/ai/whatsapp.
 * The backend runs the same agentic loop the in-app chat uses; writes
 * are blocked by the existing AI gate, so this is read-only on Free
 * Core. Returns the model's reply as a plain string suitable for
 * sendWhatsAppMessage.
 *
 * If WHATSAPP_SERVICE_TOKEN is not set in the Vercel env, the
 * backend will refuse with 401 and the user gets a clear "AI is not
 * configured" message. We do NOT fall through to a fake answer.
 */
async function forwardToAi(userId: number, farmId: number, text: string): Promise<string> {
  if (!WHATSAPP_SERVICE_TOKEN) {
    return "The Wangari assistant is not configured for WhatsApp yet. Try the in-app chat.";
  }
  try {
    const controller = new AbortController();
    // 25s: most replies are <2s on a healthy model. The cap is a safety
    // valve, not a budget — Meta's webhook timeout is much higher.
    const timer = setTimeout(() => controller.abort(), 25_000);
    const res = await fetch(`${BACKEND_URL}/api/ai/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({ userId, farmId, question: text }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      return "I could not answer that just now. Try again in a moment.";
    }
    const data = await res.json().catch(() => ({}));
    const reply = data?.message?.content;
    return typeof reply === "string" && reply.trim()
      ? reply
      : "I could not answer that just now. Try again in a moment.";
  } catch (e) {
    console.error("WhatsApp AI forward error:", e);
    return "The assistant is busy right now. Try again in a moment.";
  }
}

// ─── GET: Webhook verification (Meta setup) ────────────────
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode && token && challenge) {
    const result = verifyWebhook(mode, token, challenge);
    if (result) {
      return new NextResponse(result, { status: 200 });
    }
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ─── POST: Incoming message ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Meta sends entries → changes → messages
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const messages = change.value?.messages || [];
        for (const msg of messages) {
          if (msg.type !== "text") continue;

          const from = msg.from; // phone number
          const text = msg.text?.body || "";

          // Find user by phone number (match last 9 digits)
          const phoneDigits = from.replace(/\D/g, "").slice(-9);
          const user = await prisma.user.findFirst({
            where: { phone: { contains: phoneDigits } },
          });

          if (!user) {
            await sendWhatsAppMessage(from, "❌ Number not registered. Sign up at wangari.imeantech.com");
            continue;
          }

          // Get user's farm
          const farmMember = await prisma.farmMember.findFirst({
            where: { userId: user.id },
          });
          const farmId = farmMember?.farmId;
          if (!farmId) {
            await sendWhatsAppMessage(from, "❌ No farm found. Complete setup in the app.");
            continue;
          }

          // Parse and execute. If the message looks like a free-form
          // question (not a fixed command), forward it to the AI chat
          // endpoint instead. The AI gate on the backend still blocks
          // writes with the standard "Money, Stock or the weather"
          // copy, so this is read-only on Free Core.
          const command = parseMessage(text);
          let response: string;
          if (isAiQuestion(text) && command.action === "unknown") {
            response = await forwardToAi(user.id, farmId, text);
          } else {
            response = await executeCommand(command, user.id, farmId, prisma);
          }
          await sendWhatsAppMessage(from, response);

          // Log to audit
          await prisma.auditLog.create({
            data: {
              farmId,
              userId: user.id,
              action: "whatsapp_received",
              entityType: "whatsapp",
              details: {
                from,
                message: text,
                action: command.action,
                value: command.value,
                response: response.slice(0, 200),
              },
            },
          }).catch(() => {}); // non-critical
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return NextResponse.json({ status: "ok" }); // always 200 to Meta
  }
}
