"use client";

import * as React from "react";
import { Tag, ChevronRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveTagRange } from "@/lib/tag-range";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AnitracTagInput, shouldWarnRange, type AnitracTagValue } from "@/components/farmer-ui/anitrac-tag";

/**
 * AnitracRangeCard — record the tags for a WHOLE herd with three numbers.
 *
 * ── Why the entry lives in a dialog ────────────────────────────────────────
 * This started as an inline expanding panel. A 3x4 keypad is roughly 500px
 * tall, and dropping that into a two-column form pushed the Review button off
 * the bottom of a modal that was already scrolling — the farmer landed on a
 * form with a number pad in the middle of it and a scrollbar they had to
 * discover. Tag entry is a SEPARATE, FOCUSED TASK: three numbers, then done.
 * It does not belong wedged between "cost per head" and "total investment".
 *
 * So the card is now a single compact summary row, exactly the height of its
 * neighbours, that opens a dialog for the keypad. The farmer sees a normal
 * form; tags are one tap away and never deform the form.
 *
 * ── Why it stays optional ───────────────────────────────────────────────────
 * Tagging must never slow down creating a flock. Most Kenyan farmers have no
 * tags at all, so the default state is one quiet row that says so plainly and
 * costs one tap to skip. Nothing about the common path got slower.
 *
 * The range warning is advisory, not a blocker: a farmer who mistypes a count
 * should be told plainly, not locked out of saving.
 */

export interface AnitracRangeValue {
  tagFrom: string;
  tagTo: string;
}

export function AnitracRangeCard({
  value,
  onChange,
  headCount,
}: {
  value: AnitracRangeValue;
  onChange: (v: AnitracRangeValue) => void;
  /** The flock's stated head count, used to catch a mistyped range. */
  headCount?: number | null;
}) {
  const [open, setOpen] = React.useState(false);

  // The client helper takes a single object (the server twin takes positional
  // args) — keep the shape straight or the two drift apart.
  const range = resolveTagRange({
    tagFrom: value.tagFrom || null,
    tagTo: value.tagTo || null,
    count: headCount ?? null,
  });

  const ready = range.span > 0 && range.consistent;
  const hasTags = range.span > 0;

  // The tag input owns its own value so the dialog can be dismissed without
  // writing half-typed digits into the flock.
  const [draft, setDraft] = React.useState<AnitracTagValue>({
    tagNumber: value.tagFrom || "",
    mode: value.tagTo ? "range" : "exact",
    rangeEnd: value.tagTo || "",
  });

  const save = () => {
    onChange({
      tagFrom: draft.tagNumber,
      tagTo: draft.mode === "range" ? draft.rangeEnd || "" : "",
    });
    setOpen(false);
  };

  const clear = () => {
    onChange({ tagFrom: "", tagTo: "" });
    setDraft({ tagNumber: "", mode: "exact", rangeEnd: "" });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border p-3 text-left",
          "transition-colors duration-200",
          hasTags
            ? "border-tone-good-border bg-tone-good-bg"
            : "border-wangari-border bg-wangari-card hover:border-wangari-green-300 hover:bg-wangari-cream"
        )}
      >
        <Tag
          className={cn(
            "h-4 w-4 shrink-0",
            hasTags ? "text-tone-good-text" : "text-wangari-muted"
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-wangari-heading">
            ANITRAC tags
            {hasTags ? (
              <span className="ml-2 font-mono text-xs tabular-nums text-tone-good-text">
                {range.span === 1 ? "1 tag" : `${range.span} tags`}
              </span>
            ) : null}
          </span>
          <span className="block text-xs text-wangari-muted">
            {hasTags
              ? // A single tag has no "to" — "141… to " with nothing after it
                // reads as a half-entered record, which is exactly the doubt
                // this row is supposed to remove.
                value.tagTo
                ? `${value.tagFrom} to ${value.tagTo}`
                : `Tag ${value.tagFrom}`
              : "Optional. Skip if your animals are not tagged."}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-wangari-subtle" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-md flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>ANITRAC tags</DialogTitle>
            <DialogDescription>
              Enter the first and last tag number. Every tag between them belongs
              to this group
              {/* "1 animals" is the kind of thing a farmer notices and stops
                  trusting. Spelling it right costs nothing. */}
              {headCount ? ` (${headCount} animal${headCount === 1 ? "" : "s"})` : ""}
              .
            </DialogDescription>
          </DialogHeader>

          <AnitracTagInput
            value={draft}
            onChange={setDraft}
            onConfirm={save}
            allowRange
            className="min-h-0 flex-1 overflow-y-auto pr-1"
          />

          {shouldWarnRange(draft) ? (
            <p className="flex items-start gap-2 rounded-lg border border-tone-warn-border bg-tone-warn-bg px-3 py-2 text-xs text-tone-warn-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Check the numbers. The last tag should be the same as, or higher
                than, the first.
              </span>
            </p>
          ) : null}

          <div className="flex shrink-0 gap-2">
            {hasTags ? (
              <button
                type="button"
                onClick={clear}
                className="rounded-full px-4 text-sm font-semibold text-wangari-muted transition-colors hover:text-tone-bad-text"
              >
                Remove tags
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 flex-1 rounded-full border border-wangari-border text-sm font-semibold text-wangari-text transition-colors hover:bg-wangari-cream"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!draft.tagNumber}
              className="h-11 flex-1 rounded-full bg-wangari-green-800 text-sm font-semibold text-white transition-colors hover:bg-wangari-green-900 disabled:opacity-40"
            >
              Save tags
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AnitracRangeCard;