"use client";

import * as React from "react";
import {
  Layers,
  Plus,
  Minus,
  ArrowRightLeft,
  GitMerge,
  X,
  CheckCircle2,
  CircleHelp,
  CalendarDays,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import api from "@/lib/api-client";

/**
 * FlockBatchesPanel — sub-groups inside ONE flock.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The question farmers actually ask is not "normalise my schema". It is:
 *
 *   "I have 300 chickens. I bought 200 more. I want them in the same place,
 *    but I still need to tell the two apart later."
 *
 * Before this panel there were two ways to answer, and both were wrong for
 * somebody. Creating a second flock works, but then the farm list shows two
 * rows and no single total — so the farmer who thinks "I have 500 birds" has
 * to add them up by hand. Or lumping them into one number loses the fact that
 * the 200 arrived in October, which is the fact that decides when they are
 * sold, when they are vaccinated, and whether the second batch paid for itself.
 *
 * So: ONE flock, ONE total, and optional named batches inside it. The batch is
 * strictly additive — a farmer who never opens this panel sees exactly the
 * screen they saw before.
 *
 * ── Design rules (from the research in docs, not taste) ───────────────────
 *  - Ask the farmer's question back to them: "Are these new animals, or are
 *    you naming animals you already had?" — because the two need DIFFERENT
 *    writes and getting that wrong silently corrupts the total.
 *  - Show the total and the parts together, always. 300 + 200 = 500 in one
 *    glance, never two numbers the farmer must reconcile themselves.
 *  - If the parts do not add up to the total, SAY SO. A quiet discrepancy is
 *    how a farm record stops being believable to a buyer or a county officer.
 *  - Adding new animals to a batch records the purchase in the same server
 *    call, so a lost signal can never leave a batch of 200 inside a flock
 *    still totalling 300.
 */

interface Batch {
  id: number;
  name: string;
  currentCount: number;
  acquiredOn: string | null;
  sourceFlockName: string | null;
  notes: string | null;
  status: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function fmtDay(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Offline, `api.post` returns this instead of a server response. */
function isQueued(res: any): boolean {
  return !!res && res.queued === true;
}

export function FlockBatchesPanel({
  flock,
  onChanged,
}: {
  flock: any;
  onChanged: () => void;
}) {
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Separate from `error` on purpose: "saved on this device, will sync later"
  // is good news. Rendering it in the red error slot would teach a farmer with
  // no signal that they had done something wrong.
  const [notice, setNotice] = React.useState<string | null>(null);

  // "add" has two shapes and the farmer picks which one with a switch, because
  // they are genuinely different events. See the note in routes/flocks.ts.
  const [showAdd, setShowAdd] = React.useState(false);
  const [isNewStock, setIsNewStock] = React.useState(true);
  const [addForm, setAddForm] = React.useState({
    name: "",
    count: "",
    acquiredOn: today(),
    notes: "",
    // Bought is the common case but not the only honest one — a farmer whose
    // layers hatched a clutch is recording a birth, and calling it a purchase
    // puts a cost against an animal that cost nothing, which then reads wrong
    // in the profit figures.
    reason: "purchase",
  });

  const [showMove, setShowMove] = React.useState(false);
  const [moveForm, setMoveForm] = React.useState({ fromId: "", toId: "", count: "" });

  const [showMerge, setShowMerge] = React.useState(false);
  const [mergeForm, setMergeForm] = React.useState({ sourceId: "", targetId: "" });

  // Add or remove animals in ONE named group — the action that keeps the parts
  // adding up to the whole. Recording a death against the flock alone was the
  // drift: the total dropped, every group kept its old number, and nothing
  // could reconcile them afterwards because moving head BETWEEN groups never
  // changes their sum.
  const [adjustFor, setAdjustFor] = React.useState<Batch | null>(null);
  const [adjustForm, setAdjustForm] = React.useState({
    direction: "in" as "in" | "out",
    amount: "",
    reason: "purchase",
    movedAt: today(),
    notes: "",
  });

  // What can actually happen to a group's head, split by direction. "Split"
  // is deliberately absent: that is what Move between groups is for, and
  // offering it here would let the same event be recorded two ways.
  const IN_REASONS = [
    { value: "purchase", label: "Bought" },
    { value: "birth", label: "Born on the farm" },
    { value: "adjustment", label: "Correction" },
  ];
  const OUT_REASONS = [
    { value: "sale", label: "Sold" },
    { value: "death", label: "Died" },
    { value: "adjustment", label: "Correction" },
  ];

  const flockTotal = Number(flock?.currentCount ?? 0);
  const batchTotal = batches.reduce((sum, b) => sum + (b.currentCount || 0), 0);
  // Only meaningful once we know the flock actually uses batches. A flock with
  // no batches is not "out of balance", it is simply unbatched.
  const isBalanced = batches.length === 0 || batchTotal === flockTotal;

  const load = React.useCallback(async () => {
    try {
      const res = await api.get<any>(`/api/flocks/${flock.id}/batches`);
      setBatches(Array.isArray(res?.batches) ? res.batches : []);
    } catch {
      // Keep the empty list rather than blocking the panel — batches are an
      // optional extra, and a farmer with no signal must still see the flock.
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [flock.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const fail = (message: string) => {
    setNotice(null);
    setError(message);
  };
  const say = (message: string) => {
    setError(null);
    setNotice(message);
  };

  const resetForms = () => {
    setShowAdd(false);
    setShowMove(false);
    setShowMerge(false);
    setAdjustFor(null);
    setAddForm({ name: "", count: "", acquiredOn: today(), notes: "", reason: "purchase" });
    setMoveForm({ fromId: "", toId: "", count: "" });
    setMergeForm({ sourceId: "", targetId: "" });
    setAdjustForm({ direction: "in", amount: "", reason: "purchase", movedAt: today(), notes: "" });
    setIsNewStock(true);
  };

  /** Create a batch — either naming existing head, or recording an arrival. */
  async function saveAdd(e: React.FormEvent) {
    e.preventDefault();
    const count = Number(addForm.count);
    if (!addForm.name.trim()) return fail("Give this group a name, e.g. \"Bought in October\".");
    if (!Number.isInteger(count) || count < 0) return fail("Enter how many animals are in this group.");
    if (isNewStock && count === 0) return fail("Enter how many animals arrived. To only name a group you already have, switch off \"new animals\".");

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<any>(`/api/flocks/${flock.id}/batches`, {
        name: addForm.name.trim(),
        count,
        acquiredOn: addForm.acquiredOn,
        notes: addForm.notes.trim(),
        // The one field that decides whether the flock total moves. Getting it
        // wrong is the difference between "I bought 200" and "I mislabelled
        // 200 I already had", so the farmer chose it explicitly above.
        ...(isNewStock ? { addToFlock: true, reason: addForm.reason } : {}),
      });
      if (isQueued(res)) {
        say("Saved on this device. The new group will appear when you're back online.");
      } else {
        resetForms();
        await load();
        onChanged();
      }
    } catch (err: any) {
      fail(err?.message || "Could not save that group. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Move head between two batches of this same flock. */
  async function saveMove(e: React.FormEvent) {
    e.preventDefault();
    const fromId = Number(moveForm.fromId);
    const toId = Number(moveForm.toId);
    const count = Number(moveForm.count);
    if (!fromId || !toId) return fail("Pick the group they are leaving and the group they are joining.");
    if (fromId === toId) return fail("Pick two different groups.");
    if (!Number.isInteger(count) || count <= 0) return fail("Enter how many are moving.");

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<any>("/api/flocks/batches/transfer", {
        fromBatchId: fromId,
        toBatchId: toId,
        count,
      });
      if (isQueued(res)) {
        say("Saved on this device. The move will be applied when you're back online.");
      } else {
        resetForms();
        await load();
        onChanged();
      }
    } catch (err: any) {
      fail(err?.message || "Could not move those animals. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Fold two batches into one, keeping the survivor's name. */
  async function saveMerge(e: React.FormEvent) {
    e.preventDefault();
    const sourceId = Number(mergeForm.sourceId);
    const targetId = Number(mergeForm.targetId);
    if (!sourceId || !targetId) return fail("Pick which group to fold away and which to keep.");
    if (sourceId === targetId) return fail("Pick two different groups.");

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<any>("/api/flocks/batches/merge", {
        sourceBatchId: sourceId,
        targetBatchId: targetId,
      });
      if (isQueued(res)) {
        say("Saved on this device. The groups will be combined when you're back online.");
      } else {
        resetForms();
        await load();
        onChanged();
      }
    } catch (err: any) {
      fail(err?.message || "Could not combine those groups. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Add or remove animals in ONE named group.
   *
   * This is the write that keeps the parts adding up to the whole: the flock
   * total and the group's own count move together, in one server call. Doing
   * it against the flock alone is exactly how the two drift apart, and once
   * they have, nothing on this panel can put them back — moving head between
   * groups never changes their sum.
   */
  async function saveAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustFor) return;
    const n = Number(adjustForm.amount);
    if (!Number.isInteger(n) || n <= 0) return fail("Enter how many animals.");

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<any>(`/api/flocks/${flock.id}/count`, {
        // Signed by direction, clamped server-side the same way the flock's
        // own count is, so the two cannot diverge at the point of writing.
        delta: adjustForm.direction === "in" ? n : -n,
        reason: adjustForm.reason,
        movedAt: adjustForm.movedAt,
        notes: adjustForm.notes.trim(),
        batchId: adjustFor.id,
      });
      if (isQueued(res)) {
        say("Saved on this device. The change will be applied when you're back online.");
      } else {
        resetForms();
        await load();
        onChanged();
      }
    } catch (err: any) {
      fail(err?.message || "Could not save that change. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Dissolve a batch. The animals stay in the flock — only the label goes. */
  async function dissolve(batch: Batch) {
    if (
      !window.confirm(
        `Remove the group "${batch.name}"?\n\nIts ${batch.currentCount} animals stay in ${flock.name} — they just stop being tracked separately.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/flocks/batches/${batch.id}`);
      await load();
      onChanged();
    } catch (err: any) {
      fail(err?.message || "Could not remove that group. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectClass =
    "h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm";
  const inputClass = "h-11 w-full rounded-xl border border-wangari-border px-3 text-sm";

  return (
    <Card className="border border-wangari-gray-100 bg-white">
      <CardContent className="p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-gray-400">
            <Layers className="h-3.5 w-3.5" aria-hidden /> Groups inside this flock
            <button
              type="button"
              className="text-wangari-gray-300 hover:text-wangari-gray-500"
              aria-label="What is a group inside a flock?"
              title={
                "Keep several groups under one flock and one total — for example the original 300 birds\n" +
                "and the 200 you bought later. The flock total stays correct; this only changes how\n" +
                "those animals are organised inside it."
              }
            >
              <CircleHelp className="h-3.5 w-3.5" aria-hidden />
            </button>
          </h3>
          {batches.length > 0 ? (
            <span className="text-xs font-semibold text-wangari-gray-500">
              {batches.length} {batches.length === 1 ? "group" : "groups"} · {batchTotal} of {flockTotal}{" "}
              {flock?.category === "poultry" ? "birds" : "head"}
            </span>
          ) : null}
        </div>

        <p className="mb-3 text-xs text-wangari-muted">
          One flock, one total — but you can still tell your groups apart. Useful when different
          animals arrived on different dates, from different sellers, or need separate care.
        </p>

        {error ? (
          <p className="mb-3 rounded-xl border border-tone-bad-border bg-tone-bad-bg px-3 py-2 text-xs font-medium text-tone-bad-text">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-3 flex items-center gap-1.5 rounded-xl border border-wangari-green-200 bg-wangari-green-50 px-3 py-2 text-xs font-medium text-wangari-green-800">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> {notice}
          </p>
        ) : null}

        {/* ── The groups ─────────────────────────────────────────────────── */}
        {loading ? (
          <p className="py-4 text-center text-xs text-wangari-muted">Loading…</p>
        ) : batches.length === 0 ? (
          <EmptyState
            icon={<Layers className="h-8 w-8" />}
            title="One group so far"
            description={
              flockTotal > 0
                ? `All ${flockTotal} animals are in one group. Split them only if you need to tell some apart — by arrival date, seller, or age.`
                : "You can keep several groups under this flock, each with its own count."
            }
            action={
              <Button
                onClick={() => {
                  resetForms();
                  setShowAdd(true);
                }}
                className="bg-wangari-green-700 hover:bg-wangari-green-800 cursor-pointer font-bold"
              >
                <Plus className="h-4 w-4" aria-hidden /> Add another group
              </Button>
            }
            className="py-8"
          />
        ) : (
          <>
            {!isBalanced ? (
              // Say WHICH direction the gap runs and what to tap. An earlier
              // version pointed at "Move between groups", which cannot fix
              // this: moving head between two batches leaves their sum exactly
              // where it was, so the farmer would tap it and nothing would
              // change.
              <p className="mb-3 rounded-xl border border-tone-warn-border bg-tone-warn-bg px-3 py-2 text-xs font-medium text-tone-warn-text">
                The groups add up to {batchTotal}, but {flock.name} totals {flockTotal} —{" "}
                {flockTotal > batchTotal
                  ? `${flockTotal - batchTotal} animals are not in any group yet.`
                  : `the groups claim ${batchTotal - flockTotal} more than the flock has.`}{" "}
                Use <strong>Add or remove</strong> on a group below to put it right.
              </p>
            ) : null}

            <ul className="space-y-2">
              {batches.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-3 rounded-xl border border-wangari-gray-100 bg-wangari-gray-50/50 px-3 py-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wangari-green-50 text-sm font-bold text-wangari-green-700">
                    {b.currentCount}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-wangari-gray-800">{b.name}</p>
                    <p className="truncate text-xs text-wangari-gray-400">
                      {[
                        fmtDay(b.acquiredOn) ? `Since ${fmtDay(b.acquiredOn)}` : null,
                        b.sourceFlockName ? `Came from ${b.sourceFlockName}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No date recorded"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetForms();
                      setAdjustFor(b);
                    }}
                    disabled={busy}
                    className="rounded-lg border border-wangari-border bg-white px-2.5 py-1.5 text-xs font-semibold text-wangari-gray-600 hover:border-wangari-green-300 hover:text-wangari-green-700 disabled:opacity-40"
                    aria-label={`Add or remove animals in ${b.name}`}
                    title="Record animals born, bought, sold or lost in this group."
                  >
                    Add or remove
                  </button>
                  <button
                    type="button"
                    onClick={() => dissolve(b)}
                    disabled={busy}
                    className="rounded-lg p-2 text-wangari-gray-300 hover:bg-tone-bad-bg hover:text-tone-bad-text disabled:opacity-40"
                    aria-label={`Remove the group ${b.name}`}
                    title="Stop tracking this group separately. The animals stay in the flock."
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ── The actions ────────────────────────────────────────────────── */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const next = !showAdd;
              resetForms();
              setShowAdd(next);
            }}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-wangari-green-600 hover:text-wangari-green-700"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add a group
          </Button>
          <Button
            onClick={() => {
              const next = !showMove;
              resetForms();
              setShowMove(next);
            }}
            disabled={batches.length < 2}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-wangari-blue-600 hover:text-wangari-blue-700"
          >
            <ArrowRightLeft className="h-4 w-4" aria-hidden /> Move between groups
          </Button>
          <Button
            onClick={() => {
              const next = !showMerge;
              resetForms();
              setShowMerge(next);
            }}
            disabled={batches.length < 2}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-wangari-gray-500 hover:text-wangari-gray-700"
          >
            <GitMerge className="h-4 w-4" aria-hidden /> Combine two groups
          </Button>
        </div>

        {batches.length < 2 ? (
          <p className="mt-1.5 text-xs text-wangari-muted">
            Add a second group to move animals between groups or combine them.
          </p>
        ) : null}

        {/* ── Add a group ────────────────────────────────────────────────── */}
        {showAdd ? (
          <form onSubmit={saveAdd} className="mt-3 space-y-3 rounded-2xl border border-wangari-green-200 bg-wangari-green-50/40 p-3">
            <p className="text-xs font-semibold text-wangari-green-900">What are you adding?</p>
            <div className="flex gap-2">
              {(
                [
                  { on: true, label: "New animals I bought or bred" },
                  { on: false, label: "A name for animals I already have" },
                ] as const
              ).map((opt) => (
                <button
                  key={String(opt.on)}
                  type="button"
                  onClick={() => setIsNewStock(opt.on)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                    isNewStock === opt.on
                      ? "border-wangari-green-800 bg-wangari-green-800 text-white"
                      : "border-wangari-border bg-white text-wangari-green-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <input
              className={inputClass}
              placeholder='Group name, e.g. "Bought in October"'
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              aria-label="Group name"
            />
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className={inputClass}
              placeholder={isNewStock ? "How many animals arrived?" : "How many are in this group?"}
              value={addForm.count}
              onChange={(e) => setAddForm((f) => ({ ...f, count: e.target.value }))}
              aria-label="How many animals"
            />
            <label className="flex items-center gap-2 text-xs text-wangari-gray-600">
              <CalendarDays className="h-4 w-4 text-wangari-gray-400" aria-hidden />
              {isNewStock ? "Date they arrived" : "Date this group started"}
              <input
                type="date"
                className="ml-auto h-10 rounded-xl border border-wangari-border px-2 text-xs"
                value={addForm.acquiredOn}
                onChange={(e) => setAddForm((f) => ({ ...f, acquiredOn: e.target.value }))}
              />
            </label>
            <input
              className={inputClass}
              placeholder="Note (optional) — seller, age, price"
              value={addForm.notes}
              onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
              aria-label="Note"
            />
            {isNewStock ? (
              <label className="flex items-center gap-2 text-xs text-wangari-gray-600">
                How did they arrive?
                <select
                  className="ml-auto h-10 rounded-xl border border-wangari-border bg-white px-2 text-xs"
                  value={addForm.reason}
                  onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))}
                  aria-label="How did they arrive?"
                >
                  <option value="purchase">Bought</option>
                  <option value="birth">Born on the farm</option>
                  <option value="transfer_in">Moved from another group</option>
                </select>
              </label>
            ) : null}
            <p className="text-xs text-wangari-muted">
              {isNewStock
                ? `${flock.name} will go up by ${Number(addForm.count) || 0}, and the flock total will include these animals.`
                : `This only names animals already counted in ${flock.name}. The total does not change.`}
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1 bg-wangari-green-700 hover:bg-wangari-green-800">
                {busy ? "Saving…" : isNewStock ? "Add these animals" : "Create the group"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForms} aria-label="Cancel">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── Add or remove animals in one group ──────────────────────── */}
        {adjustFor ? (
          <form
            onSubmit={saveAdjust}
            className="mt-3 space-y-3 rounded-2xl border border-wangari-green-200 bg-wangari-green-50/40 p-3"
          >
            <p className="text-xs font-semibold text-wangari-green-900">
              What happened in {adjustFor.name}?
            </p>
            <div className="flex gap-2">
              {(
                [
                  { on: "in", label: "Animals added" },
                  { on: "out", label: "Animals removed" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.on}
                  type="button"
                  // Switch the direction AND snap the reason to that
                  // direction's first option. Otherwise the farmer picks
                  // "removed" while "Bought" is still selected and silently
                  // records a purchase as a death.
                  onClick={() =>
                    setAdjustForm((f) => ({
                      ...f,
                      direction: opt.on,
                      reason: opt.on === "in" ? IN_REASONS[0].value : OUT_REASONS[0].value,
                    }))
                  }
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    adjustForm.direction === opt.on
                      ? "border-wangari-green-800 bg-wangari-green-800 text-white"
                      : "border-wangari-border bg-white text-wangari-green-900"
                  }`}
                >
                  {opt.on === "in" ? (
                    <Plus className="h-4 w-4" aria-hidden />
                  ) : (
                    <Minus className="h-4 w-4" aria-hidden />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              placeholder="How many?"
              value={adjustForm.amount}
              onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
              aria-label="How many animals"
            />
            <select
              className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
              aria-label="Reason"
            >
              {(adjustForm.direction === "in" ? IN_REASONS : OUT_REASONS).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              value={adjustForm.movedAt}
              onChange={(e) => setAdjustForm((f) => ({ ...f, movedAt: e.target.value }))}
              aria-label="Date"
            />
            <input
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              placeholder="Note (optional)"
              value={adjustForm.notes}
              onChange={(e) => setAdjustForm((f) => ({ ...f, notes: e.target.value }))}
              aria-label="Note"
            />
            <p className="text-xs text-wangari-muted">
              {flock.name} and {adjustFor.name} both change, so the groups keep adding up to the
              flock total.
            </p>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={busy}
                className="flex-1 bg-wangari-green-700 hover:bg-wangari-green-800"
              >
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForms} aria-label="Cancel">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── Move between groups ────────────────────────────────────────── */}
        {showMove ? (
          <form onSubmit={saveMove} className="mt-3 space-y-3 rounded-2xl border border-wangari-blue-200 bg-wangari-blue-50/40 p-3">
            <p className="text-xs font-semibold text-wangari-blue-900">
              Move animals from one group to another — the flock total stays the same.
            </p>
            <select
              className={selectClass}
              value={moveForm.fromId}
              onChange={(e) => setMoveForm((f) => ({ ...f, fromId: e.target.value }))}
              aria-label="Move from"
            >
              <option value="">From which group?</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currentCount})
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={moveForm.toId}
              onChange={(e) => setMoveForm((f) => ({ ...f, toId: e.target.value }))}
              aria-label="Move to"
            >
              <option value="">To which group?</option>
              {batches.filter((b) => b.id !== Number(moveForm.fromId)).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currentCount})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className={inputClass}
              placeholder="How many are moving?"
              value={moveForm.count}
              onChange={(e) => setMoveForm((f) => ({ ...f, count: e.target.value }))}
              aria-label="How many are moving"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1 bg-wangari-blue-600 hover:bg-wangari-blue-700">
                {busy ? "Moving…" : "Move them"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForms} aria-label="Cancel">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── Combine two groups ─────────────────────────────────────────── */}
        {showMerge ? (
          <form onSubmit={saveMerge} className="mt-3 space-y-3 rounded-2xl border border-wangari-border bg-wangari-gray-50/50 p-3">
            <p className="text-xs font-semibold text-wangari-gray-700">
              Fold one group into another. Both keep their history — the absorbed group simply stops
              being listed on its own.
            </p>
            <select
              className={selectClass}
              value={mergeForm.sourceId}
              onChange={(e) => setMergeForm((f) => ({ ...f, sourceId: e.target.value }))}
              aria-label="Group to fold away"
            >
              <option value="">Fold away…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currentCount})
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={mergeForm.targetId}
              onChange={(e) => setMergeForm((f) => ({ ...f, targetId: e.target.value }))}
              aria-label="Group to keep"
            >
              <option value="">Keep…</option>
              {batches.filter((b) => b.id !== Number(mergeForm.sourceId)).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currentCount})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">
                {busy ? "Combining…" : "Combine groups"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForms} aria-label="Cancel">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default FlockBatchesPanel;
