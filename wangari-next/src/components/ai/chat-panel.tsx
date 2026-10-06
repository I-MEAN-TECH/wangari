"use client";

/**
 * Wangari's conversation.
 *
 * ── what was wrong, and why this shape fixes it ───────────
 * This panel used to be a small card floating in the middle of a page that
 * also scrolled, containing its own `max-h-[46vh]` scroller. Two scrolling
 * surfaces nested inside each other is the single most hostile thing you can
 * hand a farmer on a phone: their thumb lands on the chat, the chat scrolls,
 * the page underneath does not move, and they cannot tell which surface they
 * are on. Answering Lewis's question directly — no, it did not flow with the
 * conversation, and it broke once you had more than a screenful of words.
 *
 * The shape below is the one Gemini uses, measured in the browser rather than
 * guessed at: the page NEVER scrolls (`document.body.scrollHeight` equals the
 * viewport height, always), the conversation sits in a flex column of a fixed
 * height, and exactly ONE element scrolls — the message list. The composer is
 * pinned by flex, not by `position: fixed`, so it can never float over a
 * message or drift away from it.
 *
 * ── what was kept on purpose ─────────────────────────────
 *   ❹ one column, ~768px. Past that, answers get unreadable.
 *   ❺ streaming / complete / error / retry as distinct visuals.
 *   ❼ Stop always reachable while running. A farmer who mis-spoke must be
 *      able to halt it without hunting for a menu.
 *   tool transparency, moved. The step feed used to sit ABOVE the whole
 *      conversation, so after three exchanges it was a wall of scrollback the
 *      farmer had to read past to reach the newest words. It now renders in
 *      the stream, immediately above the reply it caused, which is both where
 *      Gemini puts its thinking indicator and where the farmer is already
 *      looking.
 *   follow-the-bottom, but only at the bottom. Yanking the view while someone
 *      is reading an earlier answer is the worst thing a streaming chat does,
 *      so once they scroll up we stop following and offer a jump control.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  WifiOff,
  ArrowDown,
  Mic,
} from "lucide-react";
import { WangariMark } from "./wangari-mark";
import { RichText } from "./rich-text";
import { QuickActions, type QuickAction } from "./quick-actions";
import { useWangariPresence, PRESENCE_LINE, PRESENCE_VERB, waitLine, type Presence } from "@/lib/wangari-presence";
import { cn } from "@/lib/utils";
import { BTN_REMOVE } from "@/components/ui/patterns";

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
  // Adding animals opens a form the farmer answers; it never writes straight
  // away, so the line must not read like a completed action.
  start_flock_intake: "Opened the livestock form",
  delete_flock: "Removed a flock",
  list_flocks: "Read your flocks",
  record_production: "Recorded your production",
  list_production: "Read your production records",
  create_transaction: "Recorded the money",
  delete_transaction: "Removed a record",
  list_transactions: "Read your money records",
  create_sale: "Recorded your sale",
  delete_sale: "Removed a sale",
  list_sales: "Read your sales",
  create_invoice: "Made your invoice",
  list_invoices: "Read your invoices",
  create_inventory_item: "Added stock",
  delete_inventory_item: "Removed stock",
  list_inventory: "Read your stock",
  create_worker: "Added your worker",
  delete_worker: "Removed a worker",
  list_workers: "Read your workers",
  create_customer: "Added your customer",
  delete_customer: "Removed a customer",
  list_customers: "Read your customers",
  create_vaccination: "Recorded the vaccination",
  list_vaccinations: "Read your vaccinations",
  record_attendance: "Recorded the attendance",
  list_attendance: "Read the attendance",
  create_crop: "Registered your crop field",
  list_crops: "Read your crop fields",
  get_weather: "Checked the weather",
  get_dashboard: "Read your farm summary",
  undo_last_action: "Undid that",
};

export function toolLabel(tool: string): string {
  return TOOL_LABEL[tool] ?? tool;
}

export function ChatPanel({
  turns,
  pending,
  steps,
  running,
  offline,
  error,
  onSend,
  onStop,
  onRetry,
  onQuickAction,
  composer,
  gaze,
  pace = 0,
  wordTick = 0,
  presenceOverride,
  waitSeconds = null,
  intake = null,
  choice = null,
}: {
  turns: Turn[];
  /** Tool steps currently executing, so progress shows before it lands. */
  pending: Pending[];
  /** Tool steps that finished, rendered inline above the reply they caused. */
  steps: { tool: string; ok: boolean; result?: string; error?: string }[];
  running: boolean;
  /** True when the browser reports no connection. */
  offline: boolean;
  /** Run-level failure, shown once above the composer. */
  error?: string;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  /** A chip was tapped; the page sends its prompt. */
  onQuickAction: (action: QuickAction) => void;
  /** The composer itself, rendered by the page so it owns the textarea. */
  composer: React.ReactNode;
  /** Caret-tracking bias, -1..1 per axis, forwarded to the avatar. */
  gaze?: { x: number; y: number };
  /** 0..1 typing speed, forwarded to the avatar. */
  pace?: number;
  /** Bumped per completed word; the avatar pulses on each bump. */
  wordTick?: number;
/** Overrides the shared presence. For tests and stories only. */
  presenceOverride?: Presence;
  /**
   * Seconds the server is waiting out the provider's rate limit, from the
   * last `waiting` event. Null whenever it is not waiting.
   *
   * A prop rather than internal state because the countdown is the server's
   * to know: it knows when the provider will accept a request again and this
   * panel does not. Ticking a number down from a guess here would promise a
   * time we do not control.
   */
  waitSeconds?: number | null;
  /**
   * The guided form Wangari opened, drawn below the tool feed.
   *
   * Inside the conversation rather than on its own screen: the farmer asked
   * for this in the middle of a reply, and a page change would strand them
   * there with nothing to say about what they asked for.
   */
  intake?: React.ReactNode;
  /**
   * A tap-to-answer question Wangari opened, drawn below the tool feed.
   *
   * Sits beside the form for the same reason: both are the farmer's to fill,
   * and answering the question may open the next form, so they share one
   * place in the flow rather than two.
   */
  choice?: React.ReactNode;
}) {
  const live = useWangariPresence();
  // Server-rendered markup always reads "idle", because the presence store is
  // a client-side store — which is correct in the browser and useless in a
  // static render test. The override is how a test can drive her states.
  const presence = presenceOverride ?? live;
  const listRef = React.useRef<HTMLDivElement>(null);
  const stickRef = React.useRef(true);
  const [showJump, setShowJump] = React.useState(false);

  const empty = turns.length === 0;

  /* Follow the newest token, but ONLY while the farmer is already at the
     bottom. Once they scroll up to re-read something, stop moving the view
     under them and offer a control to come back. */
  React.useLayoutEffect(() => {
    if (!stickRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pending, steps]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distance < 80;
    setShowJump(distance > 220);
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stickRef.current = true;
    setShowJump(false);
  };

  const status: Presence = running
    ? presence === "done"
      ? "idle"
      : presence
    : presence === "typing"
      ? "typing"
      : "idle";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── the one scroller ─────────────────────────────
          `min-h-0` is not optional: a flex child defaults to
          min-height:auto, so without it this refuses to shrink below its
          content and the page starts scrolling again — which is the exact
          bug this layout exists to remove. */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/* ── the empty state IS the onboarding ───────────
            It used to be three lines of text above a dead input. Now it is
            the character, one sentence, and seven buttons that each do
            something real — which teaches the feature by letting the farmer
            use it, rather than by describing it. */}
        {empty && (
          <div className="mx-auto flex min-h-full max-w-[768px] flex-col justify-center px-4 py-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              className="mb-5 flex flex-col items-center text-center"
            >
              {/* No drop shadow on her: WangariMark's wrapper is a square span, so a
                  shadow here drew a visible white square behind a round
                  character. The flat design has no shadow in its language
                  anyway — she reads because she is the only green thing on
                  the screen. */}
              <WangariMark size={92} />
              <p className="mt-3 text-lg font-extrabold text-wangari-heading">
                Ask Wangari about your farm
              </p>
              <p className="mt-1 max-w-xs text-sm text-wangari-muted">
                She reads and writes your real records. Tap anything below, or
                type your own words.
              </p>
            </motion.div>

            <QuickActions
              variant="grid"
              disabled={running}
              onPick={onQuickAction}
            />
          </div>
        )}

        {/* ── the conversation ─────────────────────────── */}
        {turns.length > 0 && (
          <ol className="mx-auto flex max-w-[768px] flex-col gap-5 px-4 py-5">
            <AnimatePresence initial={false}>
              {turns.map((t) => (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={t.role === "user" ? "self-end" : "self-start w-full"}
                >
                  {t.role === "user" ? (
                    /* Right-aligned and solid: the farmer's own words, so
                       they read as a thing they did rather than a thing the
                       app said to them. */
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-wangari-green-600 px-4 py-2.5 text-[15px] leading-relaxed text-white">
                      {t.content}
                    </div>
                  ) : (
                    /* Full width, no bubble, no avatar block — the shape
                       Gemini settled on. A long answer in a narrow bubble
                       wraps into a column of six words and reads like a
                       ransom note. */
                    <div className="w-full">
                      {t.content && <RichText content={t.content} streaming={t.streaming} />}
                      {/* THE one place a failure is shown.
                          It used to be rendered three times over — as the
                          bubble's own text, as a block under it, and again in
                          a run-level banner above the composer — so a farmer
                          whose daily quota ran out read "Wangari is busy"
                          three times and had no idea it was one problem.
                          Retry lives here too, beside the failure it undoes. */}
                      {t.error && (
                        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-tone-bad-bg px-4 py-3">
                          {offline ? (
                            <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-tone-bad-text" aria-hidden />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tone-bad-text" aria-hidden />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-tone-bad-text">{t.error}</p>
                            <button
                              onClick={onRetry}
                              className={BTN_REMOVE}
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden />
                              Try again
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>

            {/* ── the tool feed, inline ────────────────────
                Running steps first with a spinner, then finished ones with
                their outcome, then the reply that used them. The farmer sees
                "this is what she did" immediately above "here is what she
                found", which is the whole transparency requirement. */}
            {(pending.length > 0 || steps.length > 0) && (
              <motion.li
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-2 rounded-2xl bg-wangari-cream/70 p-3.5"
              >
                {pending.map((p, i) => (
                  <div key={`pending-${p.tool}-${i}`} className="flex items-center gap-2.5 text-sm text-wangari-muted">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-wangari-green-600" aria-hidden />
                    <span className="font-semibold">{toolLabel(p.tool)}…</span>
                  </div>
                ))}
                {steps.map((s, i) => (
                  <div key={`${s.tool}-${i}`} className="flex items-start gap-2.5 text-sm">
                    {s.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-wangari-green-600" aria-hidden />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-bad-text" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className={cn("font-semibold", s.ok ? "text-wangari-heading" : "text-tone-bad-text")}>
                        {toolLabel(s.tool)}
                      </p>
                      {s.result && (
                        <p className="text-xs text-wangari-muted">{s.result}</p>
                      )}
                    </div>
                  </div>
                ))}
              </motion.li>
            )}

            {/* ── the questions she needs answered ────────
                Between the tool feed and her reply, because it IS the reply:
                the tool said "opened the form" and this is what the farmer has
                to do next. */}
            {intake && (
              <motion.li
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
              >
                {intake}
              </motion.li>
            )}

            {choice && (
              <motion.li
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
              >
                {choice}
              </motion.li>
            )}

            {/* ── she is still here ──────────────────────
                The bare green dot this replaces said "something is
                happening" and nothing else. It was also the one part of the
                screen that did not look like Wangari, in the one place the
                farmer is already looking while they wait.

                So: her actual face, at the size that fits a line of text,
                running the same animation she runs in the header - plus the
                verb, so the state is readable as words and not only as a
                change in expression. Deliberately ONE line, and deliberately
                not the sentence form: it sits directly above the reply
                streaming in underneath it, and two sentences at once reads
                as two competing answers. */}
            {running && PRESENCE_VERB[status] && (
              <motion.li
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2.5"
              >
                <WangariMark size={26} />
                <span
                  className="text-sm font-bold text-wangari-green-700"
                  role="status"
                  aria-live="polite"
                >
                  {status === "waiting" ? waitLine(waitSeconds ?? null) : PRESENCE_VERB[status]}
                </span>
              </motion.li>
            )}
          </ol>
        )}
      </div>

      {/* ── jump to the newest message ───────────────────
          Only ever visible when the farmer has scrolled away from the
          bottom. Without it, following-the-bottom is a choice they cannot
          make, because on a phone there is nowhere else to put their thumb. */}
      <AnimatePresence>
        {showJump && !empty && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-none relative z-10 flex justify-center"
          >
            <button
              onClick={jumpToLatest}
              className="pointer-events-auto flex min-h-[40px] items-center gap-1.5 rounded-full border border-wangari-border bg-white px-3.5 text-xs font-bold text-wangari-heading shadow-md"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              New messages
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Failures render on the turn that failed (above), with the retry
          beside them. There is deliberately no second, run-level banner:
          two copies of the same sentence is how a farmer concludes the app
          is broken three times over rather than once. The `error` prop is
          kept so the page's single source of truth is unchanged. */}
      {error && turns.length === 0 && (
        <div className="shrink-0 px-4 pb-2">
          <div className="mx-auto flex max-w-[768px] items-start gap-3 rounded-2xl bg-tone-bad-bg px-4 py-3">
            {offline ? (
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-tone-bad-text" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tone-bad-text" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-tone-bad-text">{error}</p>
              <button
                onClick={onRetry}
                className={BTN_REMOVE}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── the composer dock ──────────────────────────────
          `shrink-0` keeps it pinned to the bottom of the flex column at any
          conversation length, which is the whole point of the fixed shell. */}
      <div className="shrink-0 border-t border-wangari-border bg-white/95 backdrop-blur-sm">
        {/* Chips stay reachable once the conversation starts. A farmer who
            wants to log a sale mid-chat should not have to type it. */}
        {!empty && (
          <div className="mx-auto max-w-[768px] px-3 pt-3">
            <QuickActions variant="row" disabled={running} onPick={onQuickAction} />
          </div>
        )}

        <div className="mx-auto max-w-[768px] p-3">
          {/* Wangari's line sits directly above the input rather than in a
              header, so the thing she is doing and the thing you do next are
              in the same glance. Hidden while empty, where the hero already
              says the same thing one inch above it — two identical sentences
              stacked on a phone reads as a mistake. */}
          {!empty && (
            <div className="mb-2 flex min-h-[20px] items-center gap-2">
              <WangariMark size={20} />
              <span
                className={cn(
                  "truncate text-xs font-bold",
                  running ? "text-wangari-green-700" : "text-wangari-muted",
                )}
                role="status"
                aria-live="polite"
              >
                {PRESENCE_LINE[status]}
              </span>
            </div>
          )}

          {composer}

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-wangari-subtle">
              {offline
                ? "You are offline. Wangari will answer when you are back."
                : "She answers in English and Kiswahili."}
            </p>
            {running && (
              <button
                onClick={onStop}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-wangari-heading px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-wangari-green-900"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
                Stop
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { nextId };
export default ChatPanel;