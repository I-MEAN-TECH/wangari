"use client";

/**
 * The guided intake, drawn inside the conversation.
 *
 * ── why this is a card in the chat and not a screen ──────
 * The farmer asked Wangari to add animals. If the answer were a form on
 * another page, the conversation would stop mid-sentence and they would have to
 * remember what they asked for. So the questions arrive where they were asked.
 *
 * ── why it goes one section at a time ────────────────────
 * The livestock record holds twenty-eight answers across eight sections. Shown
 * all at once on a 390px phone it is a wall, and a wall gets abandoned halfway
 * — leaving the flock unsaved and the farmer with the impression it was done.
 * One section at a time, with the count of what is left visible, is the shape
 * that can actually be finished on a phone in a field.
 *
 * ── what it must never do ────────────────────────────────
 * Say "saved" before the server has. The whole point of asking the farmer is
 * that what gets written is what they agreed to, so the confirmation is the
 * server's answer and not this component's optimism. Everything before that is
 * a draft, and the button is labelled accordingly.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canSave,
  firstSectionNeedingAnswer,
  isAnswered,
  progressOf,
  savedSummary,
  sectionLabel,
  submitIntake,
  undoIntake,
  type IntakeCard as IntakeCardData,
  type IntakeField,
} from "@/lib/ai-intake";

export interface IntakeCardProps {
  intake: IntakeCardData;
  /** Called when the farmer abandons the form. */
  onDismiss?: () => void;
  /** Called after a successful save, with the record that was written. */
  onSaved?: (flock: { id: number; name: string }) => void;
}

type Phase = "filling" | "saving" | "saved" | "undoing" | "undone";

export function IntakeCard({ intake, onDismiss, onSaved }: IntakeCardProps) {
  const [values, setValues] = React.useState<Record<string, string>>(() => ({ ...intake.values }));
  // Open on the first section that still needs something — see
  // firstSectionNeedingAnswer: Wangari's prefilled answers must not send the
  // farmer back to a page they have already filled in chat.
  const [index, setIndex] = React.useState(() => firstSectionNeedingAnswer(intake.sections, intake.values));
  const [phase, setPhase] = React.useState<Phase>("filling");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [flock, setFlock] = React.useState<{ id: number; name: string; currentCount?: number; breed?: string | null } | null>(null);
  /** The purchase expense the save created, so undo can remove it as well. */
  const [expenseId, setExpenseId] = React.useState<number | null>(null);
  /** Set when undo left a money row behind, so the farmer is told rather than surprised. */
  const [expenseKept, setExpenseKept] = React.useState<string | null>(null);
  const headingRef = React.useRef<HTMLParagraphElement>(null);

  const section = intake.sections[index];
  const { answered, total } = progressOf(intake.sections, values);
  const ready = canSave(intake.sections, values);

  const update = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Clear the complaint as soon as they touch the field it was attached to.
    // A red border that survives a correction reads as "still wrong" and makes
    // people press Save again to find out.
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const go = (delta: number) => {
    const next = Math.min(intake.sections.length - 1, Math.max(0, index + delta));
    if (next === index) return;
    setIndex(next);
    headingRef.current?.focus();
  };

  const save = async () => {
    if (phase !== "filling") return;
    setPhase("saving");
    setNotice(null);
    const result = await submitIntake(intake.entity, values);
    if (result.ok) {
      setFlock(result.flock);
      setExpenseId(result.alsoCreated?.expenseTransactionId ?? null);
      setPhase("saved");
      onSaved?.(result.flock);
      return;
    }
    // Back to filling so the button comes back. A form stuck on "saving" after
    // a refusal looks broken, and the farmer would press it again for nothing.
    setPhase("filling");
    setErrors(result.errors ?? {});
    setNotice(result.error);
    if (result.missingRequired?.length) {
      const owner = intake.sections.findIndex((s) =>
        s.fields.some((f) => result.missingRequired!.includes(f.key)),
      );
      if (owner >= 0) setIndex(owner);
    }
  };

  const undo = async () => {
    if (!flock || phase !== "saved") return;
    setPhase("undoing");
    const result = await undoIntake(intake.entity, flock.id, expenseId);
    if (result.ok) {
      // A kept expense is reported, not buried. Telling a farmer "nothing was
      // saved" while a purchase expense is still in their books teaches them
      // the undo button lies.
      setExpenseKept(result.expenseKeptReason ?? null);
      setPhase("undone");
      return;
    }
    setPhase("saved");
    setNotice(result.error ?? "I could not remove that.");
  };

  /* ── after it is saved ────────────────────────────────────
     A confirmation the farmer can read at a glance, plus one tap to undo.
     The undo stays on the card rather than hiding in the header: the thing it
     undoes is right here, and a control three screens away is not a control.

     BOTH saved and undoing render this panel. It was written to show only
     "saved", which meant the moment the farmer tapped undo the card fell
     through to the empty form — the screen they had just filled in vanished
     and reappeared blank, mid-action. The TypeScript narrowing caught it. */
  if ((phase === "saved" || phase === "undoing") && flock) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-tone-good-border bg-tone-good-bg p-4"
      >
        <div className="flex items-start gap-2.5">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-wangari-green-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-wangari-heading">Saved to your livestock</p>
            <p className="text-sm text-wangari-muted">{savedSummary(flock)}</p>
            <p className="mt-1 text-xs text-wangari-muted">
              {answered} of {total} details filled. You can add the rest any time from the flock.
            </p>
          </div>
        </div>
        {notice && <p className="mt-2 text-xs text-tone-bad-text">{notice}</p>}
        <button
          type="button"
          onClick={undo}
          disabled={phase === "undoing"}
          className="mt-3 flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white px-3.5 text-sm font-bold text-wangari-heading shadow-sm transition-colors hover:bg-wangari-cream disabled:opacity-50"
        >
          {phase === "undoing" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden />
          )}
          Remove this flock
        </button>
      </motion.div>
    );
  }

  if (phase === "undone") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-wangari-border bg-wangari-cream/70 p-4"
      >
        <p className="text-sm font-semibold text-wangari-heading">
          Removed. Nothing was saved for {flock?.name}.
        </p>
        {expenseKept && <p className="mt-1 text-xs text-tone-bad-text">{expenseKept}</p>}
      </motion.div>
    );
  }

  if (!section) return null;

  const last = index === intake.sections.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-wangari-border bg-white shadow-sm"
    >
      {/* ── the head: what this is, and how much is left ──
          The count is the reassurance that matters. A farmer who sees "3 of 28"
          knows it is finite; one staring at twenty-eight boxes does not. */}
      <div className="border-b border-wangari-border bg-wangari-cream/60 px-4 py-3">
        <p className="text-sm font-extrabold text-wangari-heading">{intake.title}</p>
        <p className="mt-0.5 text-xs text-wangari-muted">{intake.intro}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-wangari-border">
            <div
              className="h-full rounded-full bg-wangari-green-600 transition-[width] duration-300"
              style={{ width: `${total === 0 ? 0 : Math.round((answered / total) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-bold text-wangari-muted">
            {answered}/{total}
          </span>
        </div>
      </div>

      {/* ── this section's questions ────────────────────── */}
      <div className="px-4 py-4">
        <p
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-bold text-wangari-heading outline-none"
        >
          {sectionLabel(intake.sections, index)}
        </p>
        {section.blurb && <p className="mt-0.5 text-xs text-wangari-muted">{section.blurb}</p>}

        <div className="mt-3 space-y-3">
          {section.fields.map((field) => (
            <Field
              key={field.key}
              field={field}
              value={values[field.key] ?? ""}
              error={errors[field.key]}
              onChange={(v) => update(field.key, v)}
            />
          ))}
        </div>

        {notice && (
          <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-tone-bad-text">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {notice}
          </p>
        )}
      </div>

      {/* ── the way through ────────────────────────────────
          Save lives on the LAST section only. Putting it on every page makes a
          half-filled form look finished, and a farmer who taps it on page two
          has told us nothing about the vet, the pen or the cost. */}
      <div className="flex items-center gap-2 border-t border-wangari-border bg-wangari-cream/60 px-3 py-3">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0 || phase === "saving"}
          aria-label="Previous section"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-wangari-heading shadow-sm disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>

        {!last ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-wangari-green-700 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-wangari-green-800"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void save()}
            disabled={!ready || phase === "saving"}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-wangari-green-700 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-wangari-green-800 disabled:bg-wangari-border disabled:text-wangari-subtle disabled:shadow-none"
          >
            {phase === "saving" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {phase === "saving" ? "Saving…" : "Save this flock"}
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={phase === "saving"}
            className="min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-semibold text-wangari-muted disabled:opacity-40"
          >
            Not now
          </button>
        )}
      </div>

      {!ready && last && (
        <p className="border-t border-wangari-border px-4 py-2 text-xs text-wangari-muted">
          I still need the flock name and how many animals. Everything else can wait.
        </p>
      )}
    </motion.div>
  );
}

/** One question, rendered to its type. */
function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: IntakeField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const id = `intake-${field.key}`;
  const base = cn(
    "w-full rounded-xl border bg-white px-3.5 py-2.5 text-[15px] text-wangari-heading placeholder:text-wangari-subtle focus:outline-none focus:ring-2 focus:ring-wangari-green-600/20",
    error ? "border-tone-bad-border" : "border-wangari-border focus:border-wangari-green-600",
  );

  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-center gap-1 text-xs font-bold text-wangari-muted">
        {field.label}
        {field.required && <span className="text-tone-bad-text">*</span>}
        {!field.required && <span className="font-normal text-wangari-subtle">optional</span>}
      </label>

      {field.type === "select" ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Choose…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder={field.placeholder}
          className={cn(base, "resize-none")}
        />
      ) : (
        <input
          id={id}
          type={field.type === "date" ? "date" : field.type === "number" || field.type === "money" ? "number" : "text"}
          inputMode={field.type === "money" ? "decimal" : field.type === "number" ? "numeric" : undefined}
          min={field.min}
          step={field.type === "money" ? "any" : field.integer ? 1 : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={base}
        />
      )}

      {error ? (
        <p className="mt-1 text-xs font-semibold text-tone-bad-text">{error}</p>
      ) : field.hint ? (
        <p className="mt-1 text-xs text-wangari-subtle">{field.hint}</p>
      ) : null}
    </div>
  );
}

export default IntakeCard;