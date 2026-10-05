"use client";

/**
 * A question Wangari asks with buttons instead of typing.
 *
 * ── what it does ─────────────────────────────────────────
 * Renders the question she asked and the answers she offered. A tap becomes the
 * farmer's next message — exactly the word on the button, nothing wrapped around
 * it — which is how the answer reaches the conversation and gets folded into the
 * form that opens afterwards.
 *
 * There is always a way to type instead. A list is a guide, not a cage: the breed
 * Wangari did not think of still exists, and a card that makes it impossible to
 * say so produces a wrong record rather than a missing one.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  answerFromTap,
  choicePrompt,
  customAnswerHint,
  isUsableChoice,
  usableOptions,
  type FarmerChoice,
} from "@/lib/ai-choice";

export interface ChoiceCardProps {
  choice: FarmerChoice;
  /** Sends the farmer's answer as their next turn. */
  onAnswer: (answer: string) => void;
  /** True while a run is in progress, so a second tap cannot double-send. */
  busy?: boolean;
}

export function ChoiceCard({ choice, onAnswer, busy = false }: ChoiceCardProps) {
  const [typing, setTyping] = React.useState(false);
  const [own, setOwn] = React.useState("");

  // A question that cannot be answered by tapping renders as plain text rather
  // than as a card with nothing in it, which reads as a broken app.
  if (!isUsableChoice(choice)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-wangari-border bg-white p-4"
      >
        <p className="text-sm font-bold text-wangari-heading">{choice?.question}</p>
      </motion.div>
    );
  }

  const options = usableOptions(choice.options);
  const send = (answer: string) => {
    const text = answerFromTap(answer);
    if (!text || busy) return;
    onAnswer(text);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-wangari-green-200 bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-extrabold leading-snug text-wangari-heading">
        {choice.question}
      </p>
      <p className="mt-0.5 text-xs text-wangari-muted">{choicePrompt(choice)}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value + option.label}
            type="button"
            disabled={busy}
            onClick={() => send(option.label)}
            className={cn(
              "min-h-[44px] rounded-xl border border-wangari-border bg-wangari-cream/60 px-4 py-2 text-[15px] font-semibold text-wangari-heading",
              "transition-colors hover:border-wangari-green-600 hover:bg-wangari-green-50",
              "disabled:opacity-50",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {choice.allowCustom && (
        <div className="mt-3 border-t border-wangari-border pt-3">
          {!typing ? (
            <button
              type="button"
              onClick={() => setTyping(true)}
              className="text-xs font-semibold text-wangari-green-700 underline underline-offset-2"
            >
              {customAnswerHint()}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={own}
                onChange={(e) => setOwn(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    send(own);
                    setOwn("");
                    setTyping(false);
                  }
                }}
                placeholder="Type your answer"
                aria-label="Your own answer"
                className="h-11 flex-1 rounded-xl border border-wangari-border px-3 text-[15px] text-wangari-heading placeholder:text-wangari-subtle focus:border-wangari-green-600 focus:outline-none"
              />
              <button
                type="button"
                disabled={busy || !own.trim()}
                onClick={() => {
                  send(own);
                  setOwn("");
                  setTyping(false);
                }}
                className="min-h-[44px] rounded-xl bg-wangari-green-700 px-4 text-sm font-bold text-white disabled:bg-wangari-border disabled:text-wangari-subtle"
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default ChoiceCard;