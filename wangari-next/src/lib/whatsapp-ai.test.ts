import { describe, it, expect } from "vitest";
import { isAiQuestion } from "../lib/whatsapp-ai.js";

/**
 * WhatsApp AI question classifier (Free Core read-only path).
 *
 * The existing WhatsApp bot at lib/whatsapp.ts handles fixed commands
 * ("eggs 50", "balance", "stock"). Anything that doesn't match falls
 * through to a generic "I don't understand" reply. The new path: if
 * the message LOOKS like a question, the webhook forwards it to the
 * AI chat endpoint and replies with the answer. Writes are still
 * blocked by the existing AI gate — this is read-only on Free Core.
 *
 * The classifier is the single point of decision. It must be loose
 * enough to catch natural-language questions ("how much did I make
 * this week?", "did I sell anything?") and tight enough to let the
 * fixed commands keep their first-class behaviour.
 */

describe("isAiQuestion", () => {
  it("classifies a question with a question mark as an AI question", () => {
    expect(isAiQuestion("How much did I make this week?")).toBe(true);
  });

  it("classifies a question starting with 'ask' as an AI question", () => {
    expect(isAiQuestion("ask how much feed I bought last month")).toBe(true);
  });

  it("classifies a question starting with 'ai' as an AI question", () => {
    expect(isAiQuestion("ai what is my best selling item")).toBe(true);
  });

  it("classifies a 'what' question as an AI question", () => {
    expect(isAiQuestion("what did I spend on feed this month")).toBe(true);
  });

  it("classifies a 'did' question as an AI question", () => {
    expect(isAiQuestion("did I sell anything yesterday")).toBe(true);
  });

  it("classifies a 'how much' question as an AI question", () => {
    expect(isAiQuestion("how much is owed to me")).toBe(true);
  });

  it("does NOT classify a fixed command (eggs 50) as an AI question", () => {
    expect(isAiQuestion("eggs 50")).toBe(false);
  });

  it("does NOT classify the help command as an AI question", () => {
    expect(isAiQuestion("help")).toBe(false);
  });

  it("does NOT classify a short non-question as an AI question", () => {
    expect(isAiQuestion("stock")).toBe(false);
    expect(isAiQuestion("balance")).toBe(false);
    expect(isAiQuestion("milk 12")).toBe(false);
  });

  it("does NOT classify empty / whitespace as an AI question", () => {
    expect(isAiQuestion("")).toBe(false);
    expect(isAiQuestion("   ")).toBe(false);
  });

  it("handles a question with leading whitespace", () => {
    expect(isAiQuestion("   how much did I make")).toBe(true);
  });
});
