"use client";

/**
 * Wangari's conversation.
 *
 * ── the interface is the product ─────────────────────────
 * The agent is not the hard part; the 31 farm tools are done and tested
 * server-side. What decides whether a farmer keeps using this is whether
 * they can SEE that something happened to their farm. Every decision below
 * exists for that reason.
 *
 * The patterns are the ones that held up across Claude, ChatGPT and Cursor:
 *
 *   ❹ message stream   one column, capped around 768px. Past that, long
 *                       answers become unreadable and the eye loses its place.
 *   ❺ streaming states  streaming / complete / error / retry as DISTINCT
 *                       visuals. A reply that fails looks nothing like a
 *                       reply that finished.
 *   ❼ stop control      always reachable while running. Non-negotiable —
 *                       a farmer who sent the wrong thing must be able to
 *                       halt it without hunting for a menu.
 *   tool transparency   the tool feed sits INSIDE the stream, next to the
 *                       words it caused, rather than in a side panel the
 *                       farmer has to notice.
 *
 * ── one deliberate departure from the reference UIs ─────
 * Those interfaces assume a reader. This one does not (§0 R1: no typing as
 * the primary path, icon before word). So the composer's send button is a
 * 56px target, the step feed is icons-first, and nothing in the running
 * state requires reading to follow — you can watch the ticks appear.
 *
 * There is deliberately NO markdown renderer here. A farmer gets short
 * plain sentences; letting a model emit raw markdown into a farmer's screen
 * is how you get "**Total:** KES 4,500" read aloud as asterisks.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Loader2,
  WifiOff,
} from "lucide-react";
import { AgentPresence, type AgentActivity, type AgentStep } from "./agent-presence";
import type { WireMessage } from "@/lib/ai-stream";

/** One line of conversation. */
export interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** True while tokens are still arriving. */
  streaming?: boolean;
  /** Set when this turn failed; renders as recoverable, never as silence. */
  error?: string;
}

/** A tool step that is currently running, shown before its result lands. */
interface Pending {
  tool: string;
}

let seq = 0;
const nextId = () => `t${++seq}`;

/** Swahili-first tool labels. A farmer may not read long tool names. */
const TOOL_LABEL: Record<string, string> = {
  create_flock: "Added flock",
  delete_flock: "Removed flock",
  list_flocks: "Read flocks",
  record_production: "Recorded production",
  list_production: "Read production",
  create_transaction: "Recorded transaction",
  delete_transaction: "Removed transaction",
  list_transactions: "Read transactions",
  create_sale: "Recorded sale",
  delete_sale: "Deleted sale",
  list_sales: "Read sales",
  create_invoice: "Created invoice",
  list_invoices: "Read invoices",
  create_inventory_item: "Added stock",
  delete_inventory_item: "Removed stock",
  list_inventory: "Read stock",
  create_worker: "Added worker",
  delete_worker: "Removed worker",
  list_workers: "Read workers",
  create_customer: "Added customer",
  delete_customer: "Removed customer",
  list_customers: "Read customers",
  create_vaccination: "Recorded vaccination",
  list_vaccinations: "Read vaccinations",
  record_attendance: "Recorded attendance",
  list_attendance: "Read attendance",
  create_crop: "Registered crop field",
  list_crops: "Read crops",
  get_weather: "Checked weather",
  get_dashboard: "Read farm summary",
  undo_last_action: "Undid last action",
};

export function toolLabel(tool: string): string {
  return TOOL_LABEL[tool] ?? tool;
}

export function ChatPanel({
  turns,
  pending,
  activity,
  steps,
  running,
  offline,
  error,
  onSend,
  onStop,
  onRetry,
  composer,
  gaze,
  pace = 0,
  wordTick = 0,
}: {
  turns: Turn[];
  /** Tool steps currently executing, so progress shows before it lands. */
  pending: Pending[];
  activity: AgentActivity;
  steps: AgentStep[];
  running: boolean;
  /** True when the browser reports no connection. */
  offline: boolean;
  /** Run-level failure, shown once above the composer. */
  error?: string;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  /** The composer itself, rendered by the page so it owns the textarea. */
  composer: React.ReactNode;
  /** Caret-tracking bias, -1..1 per axis, forwarded to the avatar. */
  gaze?: { x: number; y: number };
  /** 0..1 typing speed, forwarded to the avatar. */
  pace?: number;
  /** Bumped per completed word; the avatar pulses on each bump. */
  wordTick?: number;
}) {
  const endRef = React.useRef<HTMLDivElement>(null);
  // Follow the newest token, but only when the farmer is already at the
  // bottom. Yanking the view back while they are reading an earlier answer
  // is the single most irritating thing a streaming chat can do.
  const stickRef = React.useRef(true);

  React.useEffect(() => {
    if (!stickRef.current) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  const onScroll = () => {
    const el = endRef.current?.parentElement;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <div className="flex flex-col">
      {/* ── Wangari herself ──────────────────────────────
          She is a fixed presence at the top, not a bubble: the farmer
          should always be able to see her state without scrolling back. */}
      <AgentPresence
        activity={activity}
        steps={steps}
        gaze={gaze}
        pace={pace}
        wordTick={wordTick}
      />

      {/* ── the stream ──────────────────────────────── */}
      <div
        onScroll={onScroll}
        className="max-h-[46vh] overflow-y-auto overscroll-contain px-4 py-3"
      >
        <ol className="mx-auto flex max-w-[768px] flex-col gap-4">
          {/* An empty state that teaches rather than greets. The farmer has
              not met Wangari yet; this is where they learn what she is. */}
          {turns.length === 0 && (
            <li className="py-2">
              <p className="text-sm font-semibold text-wangari-heading">
                Wangari can work your farm records.
              </p>
              <ul className="mt-3 space-y-2">
                {[
                  "Record eggs, sales and costs",
                  "Show your profit for the month",
                  "Check your flocks and stock",
                ].map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-wangari-muted">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-wangari-green-500"
                      aria-hidden
                    />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-wangari-subtle">
                Say it in your own words, or tap the microphone.
              </p>
            </li>
          )}

          <AnimatePresence initial={false}>
            {turns.map((t) => (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={t.role === "user" ? "self-end" : "self-start"}
              >
                {t.role === "user" ? (
                  /* Right-aligned and solid: the farmer's own words, so
                     they read as a thing they did rather than a thing
                     the app said to them. */
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-wangari-green-600 px-4 py-2.5 text-base text-white">
                    {t.content}
                  </div>
                ) : (
                  <div className="max-w-[92%]">
                    <p className="whitespace-pre-wrap text-base leading-relaxed text-wangari-heading">
                      {t.content}
                      {t.streaming && (
                        /* A caret, not a spinner: it says "more is
                           coming" instead of "something is happening",
                           which is the honest description. */
                        <span
                          className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-wangari-green-500"
                          aria-hidden
                        />
                      )}
                    </p>
                    {t.error && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-tone-bad-bg px-3 py-2">
                        <AlertTriangle
                          className="mt-0.5 h-4 w-4 shrink-0 text-tone-bad-text"
                          aria-hidden
                        />
                        <p className="text-sm text-tone-bad-text">{t.error}</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>

          {/* Tool steps appear in the stream, right where the words they
              caused will land. This is the transparency requirement: the
              farmer must never have to take "done" on trust. */}
          {pending.map((p, i) => (
            <motion.li
              key={`pending-${p.tool}-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-sm text-wangari-muted"
            >
              <Loader2 className="h-4 w-4 animate-spin text-wangari-green-600" aria-hidden />
              <span>{toolLabel(p.tool)}…</span>
            </motion.li>
          ))}
        </ol>
        <div ref={endRef} />
      </div>

      {/* ── run-level failure ─────────────────────────────
          Placed above the composer so it is adjacent to the thing you do
          next, with the retry in the same tap target as sending. */}
      {error && (
        <div className="mx-4 mb-2 flex items-start gap-3 rounded-2xl bg-tone-bad-bg px-4 py-3">
          {offline ? (
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-tone-bad-text" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tone-bad-text" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-tone-bad-text">{error}</p>
            <button
              onClick={onRetry}
              className="mt-2 flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3 text-sm font-bold text-tone-bad-text shadow-sm"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Try again
            </button>
          </div>
        </div>
      )}

      {/* ── the composer ─────────────────────────────── */}
      <div className="border-t border-wangari-border p-3">
        {composer}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-wangari-subtle">
            {running ? "Wangari is working…" : "Wangari replies in English and Kiswahili."}
          </p>
          {/* Stop is only ever shown while running, and it is a real target:
              a farmer must be able to halt a run they mis-spoke. */}
          {running && (
            <button
              onClick={onStop}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 text-sm font-bold text-wangari-heading"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden />
              <span className="sr-only">Stop Wangari</span>
              <span aria-hidden>Stop</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { nextId };
export default ChatPanel;
