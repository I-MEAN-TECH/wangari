"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertTriangle, Wrench } from "lucide-react";
import { WangariAvatar, type AvatarState } from "./wangari-avatar";

/**
 * Wangari's presence in the AI panel.
 *
 * The farmer should feel they are talking to something that is paying
 * attention, not typing into a box. Wangari is the eye: it turns toward
 * the cursor, so the panel reads as alive before she is even connected,
 * and it blinks on its own when nothing is happening.
 *
 * What she's DOING is carried by the eye's own geometry rather than by a
 * second decoration. She grows and turns more while the agent runs tools,
 * which is the difference between "a picture of an assistant" and "an
 * assistant you can see working".
 */

export type AgentActivity =
  | "idle"
  | "typing"
  | "listening"
  | "reasoning"
  | "working"
  | "waiting"
  | "speaking"
  | "done"
  | "error";

const ACTIVITY_COPY: Record<AgentActivity, { label: string; tone: string }> = {
  idle: { label: "Ask Wangari anything about your farm", tone: "text-wangari-muted" },
  typing: { label: "Tell Wangari what you need…", tone: "text-wangari-muted" },
  listening: { label: "Listening…", tone: "text-wangari-green-700" },
  reasoning: { label: "Wangari is thinking…", tone: "text-wangari-green-700" },
  working: { label: "Wangari is working on your farm…", tone: "text-wangari-green-700" },
  // Not an error, and not silence. The provider's free tier allows one
  // request a minute, and a two-step farm question spends two - so this is a
  // queue, not a fault, and saying so is what stops a farmer from giving up
  // and reloading at second forty.
  waiting: { label: "Waiting for a free slot…", tone: "text-wangari-green-700" },
  speaking: { label: "Wangari is speaking…", tone: "text-wangari-green-700" },
  done: { label: "Done", tone: "text-wangari-green-700" },
  error: { label: "Something went wrong", tone: "text-tone-bad-text" },
};

/**
 * Map the panel's activity onto the avatar's states.
 *
 * `done` is deliberately `idle` rather than a celebration: a farmer who
 * just recorded a week of sales does not want confetti, and reusing idle
 * means there is exactly one resting look.
 */
const AVATAR_STATE: Record<AgentActivity, AvatarState> = {
  idle: "idle",
  typing: "typing",
  listening: "listening",
  reasoning: "reasoning",
  working: "working",
  // She is still working; the model is simply not ready yet. The spinner and
  // the thinking face both stay on.
  waiting: "reasoning",
  speaking: "speaking",
  done: "idle",
  error: "error",
};

/**
 * How large Wangari is in each state.
 *
 * She grows slightly while working so the change of activity is felt
 * before it is read, and shrinks a touch while reasoning so she reads as
 * stepping back rather than concentrating harder.
 */
const PRESENCE_SIZE: Record<AgentActivity, number> = {
  idle: 72,
  typing: 76,
  listening: 82,
  reasoning: 74,
  working: 92,
  waiting: 80,
  speaking: 86,
  done: 84,
  error: 84,
};

/** One tool step from the agent's run, as streamed by /api/ai/stream. */
export interface AgentStep {
  tool: string;
  ok: boolean;
  /** Short human line, e.g. "Recorded sale — KES 4,500". */
  result?: string;
  error?: string;
}

/** Swahili-friendly labels. The farmer may not read long tool names. */
const TOOL_LABELS: Record<string, string> = {
  create_flock: "Added flock",
  delete_flock: "Removed flock",
  list_flocks: "Read flocks",
  record_production: "Recorded production",
  list_production: "Read production",
  create_transaction: "Recorded transaction",
  delete_transaction: "Deleted transaction",
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
  get_farm_status: "Read the whole farm",
  search_web: "Looked it up on the internet",
  undo_last_action: "Undid last action",
};

function labelFor(step: AgentStep): string {
  return TOOL_LABELS[step.tool] ?? step.tool;
}

export function AgentPresence({
  activity = "idle",
  steps = [],
  audioLevel = 0,
  gaze,
  pace = 0,
  wordTick = 0,
  className = "",
}: {
  activity?: AgentActivity;
  steps?: AgentStep[];
  /** 0..1 speech envelope; drives the avatar's speaking squash. */
  audioLevel?: number;
  /** Runtime gaze bias, -1..1 per axis. Used to track the caret while typing. */
  gaze?: { x: number; y: number };
  /** 0..1 typing speed. Makes her livelier as the farmer speeds up. */
  pace?: number;
  /** Bumped on each completed word; the avatar pulses on each bump. */
  wordTick?: number;
  className?: string;
}) {
  const copy = ACTIVITY_COPY[activity];
  const size = PRESENCE_SIZE[activity] ?? PRESENCE_SIZE.idle;
  const working = activity === "working";

  return (
    /* wangari-watch-frame marks the whole panel as the region Wangari
       watches: her eyes follow the farmer's cursor anywhere in here, and
       face front again when it leaves. A class rather than a bare
       data-orb-frame attribute, because a valueless data attribute
       serialises as "true" on the client and is dropped by the server,
       which React reports as a hydration mismatch. */
    <div className={`wangari-watch-frame ${className}`}>
      <div className="flex flex-col items-center gap-3 px-4 py-6">
        {/* The stage is the positioning context for the halo and the spin
            ring, so `inset: 0` means "around Wangari" rather than "around
            the whole panel". */}
        <div
          className="wangari-orb-stage"
          style={{ width: size + 32, height: size + 32 }}
        >
          <div className="wangari-orb-halo" aria-hidden />

          {/* A spin ring while the agent works — cheap CSS, and it reads as
              progress even on a cheap handset that drops a canvas. */}
          {working && (
            <div
              className="absolute inset-0 rounded-full border-2 border-wangari-green-200 border-t-wangari-green-500 animate-spin"
              style={{ animationDuration: "1.4s" }}
              aria-hidden
            />
          )}

          {/* Wangari. Framer animates the size change between states so the
              eye grows into the work rather than snapping to it. */}
          <motion.div
            className="wangari-orb-frame"
            animate={{ width: size, height: size }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <WangariAvatar
              state={AVATAR_STATE[activity] ?? "idle"}
              size={size}
              audioLevel={audioLevel}
              gaze={gaze}
              pace={pace}
              wordTick={wordTick}
            />
          </motion.div>
        </div>

        <div className="flex items-center gap-2 text-sm font-semibold">
          {working ? (
            <Loader2 className="h-4 w-4 animate-spin text-wangari-green-600" aria-hidden />
          ) : activity === "error" ? (
            <AlertTriangle className="h-4 w-4 text-tone-bad-text" aria-hidden />
          ) : null}
          <span className={copy.tone} role="status" aria-live="polite">
            {copy.label}
          </span>
        </div>
      </div>

      {/* ── the activity feed ────────────────────────────────
          This is the "see what the AI is doing" requirement: every
          tool the agent runs appears as it completes, so a
          three-step job reads as three steps rather than one
          delayed answer. */}
      <AnimatePresence initial={false}>
        {steps.length > 0 && (
          <motion.ol
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-4 pb-1"
            aria-label="What Wangari did"
          >
            <li className="sr-only">Actions taken by Wangari</li>
            {steps.map((step, i) => (
              <motion.li
                key={`${step.tool}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="wangari-step flex items-start gap-3 py-3 border-b border-wangari-border last:border-b-0"
              >
                <span
                  className={
                    step.ok
                      ? "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-wangari-green-100 text-wangari-green-700"
                      : "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tone-bad-bg text-tone-bad-text"
                  }
                  aria-hidden
                >
                  {step.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Wrench className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-wangari-heading">
                    {labelFor(step)}
                  </span>
                  {(step.result || step.error) && (
                    <span
                      className={
                        step.ok
                          ? "block text-xs text-wangari-muted break-words"
                          : "block text-xs text-tone-bad-text break-words"
                      }
                    >
                      {step.error || step.result}
                    </span>
                  )}
                </span>
              </motion.li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AgentPresence;