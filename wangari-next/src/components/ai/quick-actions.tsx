"use client";

/**
 * One-tap shortcuts.
 *
 * ── why these exist, beyond convenience ──────────────────
 * Two reasons, and the second is the one that matters.
 *
 * 1. Typing is the thing that stops a farmer reaching for this at all. §0 R1
 *    says no typing as the primary path, and every chip here removes it.
 *
 * 2. QUOTA. Wangari runs on a free model with a hard daily request cap that
 *    the whole account shares. A farmer who types "how is my farm" and then
 *    retypes it because the answer missed costs two of those requests. A chip
 *    spends exactly one, every time, with a phrasing already known to hit the
 *    right tool. These buttons are not a shortcut for the impatient — they
 *    are the cheapest way for a farmer to spend a limited resource.
 *
 * ── the prompts are written, not generated ───────────────
 * Each one is phrased the way a farmer would actually speak, and each names
 * the tool it should reach. That is deliberate: the chips are the training
 * data. A model that has seen eight tidy phrasings is far more likely to pick
 * the right one from a farmer's own messy sentence than a model given a bare
 * instruction.
 *
 * They also ASK for what they need rather than inventing it. "Record today's
 * eggs" on a farm with no flocks cannot succeed, and a chip that silently
 * fails teaches the farmer the buttons are decoration.
 */

import * as React from "react";
import {
  Egg,
  ShoppingCart,
  Banknote,
  PawPrint,
  FileText,
  ClipboardList,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickAction {
  id: string;
  /** What the farmer reads on the chip. Short, verb-first, no jargon. */
  label: string;
  /** The sentence that is sent. Never shown to the farmer. */
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "eggs",
    label: "Record eggs",
    // Asks rather than assumes. Without a flock this cannot be saved, and a
    // chip that quietly does nothing is worse than no chip.
    prompt:
      "Record today's egg production. Ask me which flock and how many eggs if you need that before saving.",
    icon: Egg,
  },
  {
    id: "sale",
    label: "Record a sale",
    prompt:
      "Record a sale for me. Ask me who I sold to, what I sold and how much they paid.",
    icon: ShoppingCart,
  },
  {
    id: "expense",
    label: "Add an expense",
    prompt:
      "Record an expense. Ask me what it was for and how much it cost.",
    icon: Banknote,
  },
  {
    id: "flock",
    label: "Add my animals",
    prompt:
      "Add a new flock to my farm. Ask me the name, the breed, whether they are layers or broilers, and how many birds, and anything else you need about them.",
    icon: PawPrint,
  },
  {
    id: "invoice",
    label: "Make an invoice",
    prompt:
      "Create an invoice. Ask me who it is for, what I am charging for, and how much.",
    icon: FileText,
  },
  {
    id: "stock",
    label: "Add feed stock",
    prompt:
      "Add a stock item. Ask me what it is, how much I have and the unit.",
    icon: Package,
  },
  {
    id: "summary",
    label: "How is my farm?",
    prompt: "How is my farm doing this month? Give me the short version.",
    icon: ClipboardList,
  },
];

/**
 * The chip row.
 *
 * Scrolls horizontally rather than wrapping: wrapped chips push the composer
 * off the bottom of a short screen, and a composer you have to scroll to
 * reach is a composer nobody uses. `shrink-0` on each chip stops the flex row
 * from squashing them into unreadable slivers.
 */
export function QuickActions({
  onPick,
  disabled = false,
  variant = "row",
  className = "",
}: {
  /** Called with the prompt to send. The chip does not send it itself. */
  onPick: (action: QuickAction) => void;
  disabled?: boolean;
  /** `grid` for the empty state, `row` for a scrolling strip mid-conversation. */
  variant?: "grid" | "row";
  className?: string;
}) {
  return (
    <div
      className={cn(
        variant === "grid"
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
          : "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="group"
      aria-label="Quick actions"
    >
      {QUICK_ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(a)}
            className={cn(
              // 52px tall: comfortably past the 44px minimum, because this is
              // the path a farmer takes instead of typing, and a chip you miss
              // costs a request.
              "flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-wangari-green-200 bg-white px-3.5 text-left",
              "text-sm font-bold text-wangari-heading shadow-sm transition-all",
              "hover:border-wangari-green-400 hover:bg-wangari-green-50 active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wangari-green-500/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
              variant === "row" ? "shrink-0 whitespace-nowrap" : "w-full",
            )}
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-wangari-green-100 text-wangari-green-800"
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default QuickActions;