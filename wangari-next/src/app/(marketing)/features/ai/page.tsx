"use client";

import { Sparkles } from "lucide-react";
import { FeaturePage } from "@/components/feature-page";

/**
 * The AI Assistant — planned, not shipped.
 *
 * ── Why this page was rewritten ─────────────────────────────────────────────
 * It carried a testimonial attributed to a named farmer — "Mary Akinyi, Mixed
 * Farm, Kisumu" — describing her asking the assistant why her layers were
 * producing fewer eggs and getting an answer that traced it to a change in
 * feed protein. She is not a user. The assistant is not switched on:
 * `AI_API_KEY` is unset in production, so `/api/ai/chat` refuses to answer at
 * all. The page also advertised "<2s response time" and "24/7 AI Available",
 * numbers for a feature that has never run.
 *
 * That matters more than a normal copy error. This is the page an investor,
 * a Ministry official or a feed company opens, and the whole pitch rests on
 * being straight — the field plan's own rule is "never inflate, the honesty IS
 * the pitch". A named farmer vouching for a feature that does not exist is the
 * one claim that, if discovered, costs the credibility everything else is
 * built on. It is also the kind of thing a due-diligence reader checks first.
 *
 * So: no invented numbers, no invented people. What is left is the real
 * position, stated plainly — this is what it will do, this is what it will be
 * grounded in, and it is not available today. Telling a partner the truth
 * about today's build is what earns them the right to believe tomorrow's.
 */
export default function AIFeaturePage() {
  return (
    <FeaturePage
      icon={Sparkles}
      badge="In development — not available yet"
      title="An assistant that reads your own records"
      subtitle="Planned: ask questions about your farm in English or Swahili and get answers grounded in your actual production, costs and sales — never generic advice."
      description="Wangari's AI assistant is planned to answer questions like 'Which flock is most profitable?' or 'How much feed should I order this week?' using the records the farmer has already kept. It is not switched on today. This page describes what it is being built to do, and it will say so here until it is genuinely live — we would rather show you an honest roadmap than a demo of something that does not work."
      highlights={[
        "Planned: answers grounded in YOUR farm's records, not generic advice",
        "Planned: English and Swahili, typed or spoken",
        "Planned: production trends, feed efficiency and cost analysis",
        "Planned: market-price context for timing a sale",
        "Planned: every answer shows the numbers behind it",
        "Not available today — no key is configured in production",
      ]}
      capabilities={[
        { title: "Grounded in your data", desc: "The design rule is that every answer cites the farmer's own records — their real costs and revenue, never industry averages. That is also the moat: records a competitor cannot retroactively collect." },
        { title: "Plain language, either way", desc: "Questions in English or Swahili, the way a farmer would actually say them. No commands, no menus, no jargon to learn first." },
        { title: "Shows its working", desc: "A number with no explanation is a rumour. Every answer is meant to show the records behind it, so the farmer can check the reasoning rather than trust a black box." },
        { title: "Advisory, never automatic", desc: "It proposes; the farmer decides. Automation that silently changes a farm's records is how you lose a user's trust permanently, so nothing gets written without them." },
        { title: "Costs money to run", desc: "AI is an expense per user, so cheap models go where they suffice and expensive ones only where the value is proven. It has to earn its keep per farm." },
        { title: "Honest when it does not know", desc: "Saying what is missing is the rule this product is built on. If the record does not support an answer, it says so rather than inventing one." },
      ]}
      farmerExperience={{
        heading: "What a farmer would be able to do",
        steps: [
          { title: "Ask it the way you'd say it", desc: "'Why are my eggs smaller this month?' No commands, no menus — English or Swahili, at six in the morning." },
          { title: "It reads your records, not the internet", desc: "Feed batches, production trends, expenses and sales — and it shows you which records it used." },
          { title: "Follow-ups welcome", desc: "'Would charging 10 more shillings have hurt sales?' — checked against the price changes already in the records." },
          { title: "It flags rather than nags", desc: "A cost creeping up, a flock underperforming, a vaccination window closing. Surfaced in the action centre, reversible, and never acted on without you." },
        ],
      }}
    />
  );
}
