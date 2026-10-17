/**
 * WhatsApp AI classifier (Free Core read-only path).
 *
 * The classifier decides whether a WhatsApp message is a "command"
 * (handled by the existing parser) or a "question" (forwarded to
 * the AI). The question/command split is intentionally loose: any
 * message that looks like a question becomes an AI question. The AI
 * gate then refuses writes with the standard "Money, Stock or the
 * weather" copy on Free Core.
 *
 * Fixed commands ("eggs 50", "balance", "stock") keep their
 * first-class behaviour because the classifier rejects them:
 *   - they are short
 *   - they don't have a question mark
 *   - they don't start with "ask", "ai", "what", "did", "how much"
 *
 * Pure function: no I/O, no DB. Webhook-side state lives in the
 * caller.
 */

const QUESTION_PREFIX = /^\s*(?:ask|ai|what|when|where|who|why|how|which|did|do|does|is|are|can|could|should|would|will)\b/i;

export function isAiQuestion(text: string): boolean {
  const trimmed = (text || "").trim();
  if (trimmed.length === 0) return false;
  // Hard signal: a question mark anywhere in the message.
  if (trimmed.includes("?")) return true;
  // Soft signal: starts with a question word. The regex is anchored
  // to the start of the trimmed message and only matches on a word
  // boundary, so "eggs 50" (no boundary) and "eggs?" (no prefix
  // match but has a ? — caught above) are both correctly rejected
  // for the first-class command path.
  if (QUESTION_PREFIX.test(trimmed)) return true;
  return false;
}
