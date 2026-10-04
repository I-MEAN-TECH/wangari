"use client";

/**
 * The conversations panel — the left rail, the way Gemini has one.
 *
 * ── the rule it follows ───────────────────────────────────
 * The chat is the product. This panel is a way back to it, so it never takes
 * space from the conversation while the farmer is in one: it sits beside the
 * chat on a wide screen and slides over it on a phone, and the message column
 * keeps its width either way.
 *
 * ── what each row is ──────────────────────────────────────
 * The farmer's own first words and how long ago. Nothing else. A row that
 * needs explaining is a row nobody opens.
 */

import * as React from "react";
import { MessageSquarePlus, Trash2, X } from "lucide-react";
import {
  listConversations,
  deleteConversation,
  relativeTime,
  type Conversation,
} from "@/lib/ai-conversations";
import { cn } from "@/lib/utils";

export function ConversationList({
  activeId,
  onOpen,
  onNew,
  onClose,
  className,
}: {
  /** Which conversation is on screen right now. */
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Only rendered on a phone; the desktop rail is always visible. */
  onClose?: () => void;
  className?: string;
}) {
  /* Read synchronously, not in an effect.

     Loading in useEffect meant the panel rendered EMPTY first and filled in
     a frame later, so opening Wangari flashed "your conversations will appear
     here" at a farmer who already has six. The lazy initialiser reads during
     the first render instead, and returns nothing during server rendering,
     where localStorage does not exist and an empty panel is correct. */
  const [items, setItems] = React.useState<Conversation[]>(() => listConversations());

  // Re-read whenever the active chat changes: that is the moment a row's
  // timestamp and the newest-first order can both shift.
  React.useEffect(() => {
    setItems(listConversations());
  }, [activeId]);

  const remove = (id: string) => {
    deleteConversation(id);
    setItems(listConversations());
  };

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col border-r border-wangari-border bg-white",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-wangari-border p-3">
        <button
          onClick={onNew}
          className="flex min-h-[44px] flex-1 items-center gap-2 rounded-xl border border-wangari-green-200 bg-wangari-green-50 px-3 text-sm font-bold text-wangari-green-800 transition-colors hover:bg-wangari-green-100"
        >
          <MessageSquarePlus className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">New conversation</span>
        </button>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close the conversation list"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-wangari-muted transition-colors hover:bg-wangari-cream"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      <nav aria-label="Past conversations" className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          /* Not an apology and not an illustration: the one thing this panel
             can say when it is empty is how to fill it. */
          <p className="px-3 py-6 text-sm leading-relaxed text-wangari-muted">
            Your conversations will appear here. Anything you ask Wangari stays
            on this phone, so you can pick it up again later.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    onClick={() => onOpen(c.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 pr-10 text-left transition-colors",
                      active
                        ? "bg-wangari-green-50"
                        : "hover:bg-wangari-cream",
                    )}
                  >
                    <span
                      className={cn(
                        "truncate text-sm font-bold",
                        active ? "text-wangari-green-900" : "text-wangari-heading",
                      )}
                    >
                      {c.title}
                    </span>
                    <span className="truncate text-[11px] text-wangari-muted">
                      {relativeTime(c.updatedAt)}
                    </span>
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    aria-label={`Delete the conversation about ${c.title}`}
                    className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-lg text-wangari-subtle transition-colors hover:bg-tone-bad-bg hover:text-tone-bad-text focus-visible:opacity-100 md:opacity-0 md:group-focus-within:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}

export default ConversationList;