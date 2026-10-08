"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  GitMerge,
  Plus,
  Minus,
  History,
  X,
  CheckCircle2,
  CircleHelp,
  PawPrint,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/farmer-ui/status-chip";
import api from "@/lib/api-client";

/**
 * FlockHerdPanel — moving stock between your own groups, combining two groups,
 * and the ledger that proves what happened.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * A flock's head count was a single number edited in place, and there was no
 * way to move animals between groups at all. So a farmer who split a herd, or
 * moved twenty cattle from one paddock group to another, either retyped counts
 * (losing the history) or left the records wrong — and a wrong head count is
 * the first thing a buyer or county officer checks.
 *
 * ── Design rules ───────────────────────────────────────────────────────────
 *  - Three plain questions: how many changed, which group they went to, and why.
 *  - A transfer writes BOTH groups in one action, so the two can never disagree.
 *  - A merge ARCHIVES the group it absorbs, never deletes it — its history stays
 *    readable and the ledger row survives.
 *  - The ledger is read-only. It is a record, not a form.
 */

const IN_REASONS = [
  { value: "purchase", label: "Bought" },
  { value: "birth", label: "Born on the farm" },
  { value: "split_in", label: "Split from another group" },
  { value: "adjustment", label: "Correction" },
];

const OUT_REASONS = [
  { value: "sale", label: "Sold" },
  { value: "death", label: "Died" },
  { value: "split_out", label: "Split into another group" },
  { value: "adjustment", label: "Correction" },
];

const ALL_LABELS: Record<string, string> = {
  purchase: "Bought",
  birth: "Born",
  transfer_in: "Moved in",
  transfer_out: "Moved out",
  merged_in: "Combined in",
  merged_out: "Combined out",
  split_in: "Split in",
  split_out: "Split out",
  sale: "Sold",
  death: "Died",
  adjustment: "Correction",
};

interface Movement {
  id: number;
  delta: number;
  reason: string;
  counterpartyName: string | null;
  countBefore: number;
  countAfter: number;
  movedAt: string;
  notes: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Offline, `api.post` returns `{ queued: true, offline: true }` instead of a
 * server response — the write is saved on the device and replayed later. The
 * notices must say that plainly rather than interpolating `undefined` into a
 * sentence, which is what an offline farmer would otherwise read.
 */
function isQueued(res: any): boolean {
  return !!res && res.queued === true;
}

export function FlockHerdPanel({
  flock,
  flocks,
  onChanged,
  onThisGroupRemoved,
}: {
  flock: any;
  /** Every group on the farm, so the pickers can offer the other ones. */
  flocks: any[];
  onChanged: () => void;
  /** Called when a merge absorbs THIS group, so the screen can close it. */
  onThisGroupRemoved?: () => void;
}) {
  const [mode, setMode] = React.useState<null | "count" | "transfer" | "merge">(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [movements, setMovements] = React.useState<Movement[]>([]);
  const [loadingLedger, setLoadingLedger] = React.useState(true);

  // Only live groups can be a counterparty — a merged one is archived remains.
  const others = React.useMemo(
    () => (flocks || []).filter((f) => f.id !== flock.id && f.status !== "merged"),
    [flocks, flock.id]
  );

  const [countForm, setCountForm] = React.useState({
    direction: "in" as "in" | "out",
    amount: "",
    reason: "purchase",
    movedAt: today(),
    notes: "",
  });
  const [transferForm, setTransferForm] = React.useState({
    toFlockId: "",
    count: "",
    movedAt: today(),
    notes: "",
  });
  const [mergeForm, setMergeForm] = React.useState({
    otherId: "",
    keep: "this" as "this" | "other",
    confirmMixedSpecies: false,
  });

  const loadLedger = React.useCallback(async () => {
    setLoadingLedger(true);
    try {
      const res = await api.get<{ movements: Movement[] }>(`/api/flocks/${flock.id}/movements`);
      setMovements(res.movements || []);
    } catch {
      // The forms still work without history — never block on a failed read.
    } finally {
      setLoadingLedger(false);
    }
  }, [flock.id]);

  React.useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  const resetForms = () => {
    setMode(null);
    setError(null);
    setCountForm((f) => ({ ...f, amount: "", notes: "" }));
    setTransferForm((f) => ({ ...f, toFlockId: "", count: "", notes: "" }));
    setMergeForm((f) => ({ ...f, otherId: "", confirmMixedSpecies: false }));
  };

  /** Count change — add or remove head with a reason. */
  const saveCount = async () => {
    const n = Number(countForm.amount);
    const delta = countForm.direction === "in" ? n : -n;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ countAfter: number }>(`/api/flocks/${flock.id}/count`, {
        delta,
        reason: countForm.reason,
        movedAt: countForm.movedAt,
        notes: countForm.notes || undefined,
      });
      flash(
        isQueued(res)
          ? "Saved on this device. The count will update when you're back online."
          : `Saved. ${flock.name} now holds ${res?.countAfter ?? "—"}.`
      );
      resetForms();
      onChanged();
      loadLedger();
    } catch (e: any) {
      setError(e?.message || "The count was not saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveTransfer = async () => {
    const to = others.find((f) => String(f.id) === transferForm.toFlockId);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ moved: number; to: any; warning?: string }>(
        "/api/flocks/transfer",
        {
          fromFlockId: flock.id,
          toFlockId: Number(transferForm.toFlockId),
          count: Number(transferForm.count),
          movedAt: transferForm.movedAt,
          notes: transferForm.notes || undefined,
        }
      );
      flash(
        isQueued(res)
          ? `Saved on this device. ${transferForm.count} head will move to ${to?.name || "the other group"} when you're back online.`
          : `${res?.moved ?? ""} moved to ${res?.to?.name || to?.name || "the other group"}.` +
              (res?.warning ? ` ${res.warning}` : "")
      );
      resetForms();
      onChanged();
      loadLedger();
    } catch (e: any) {
      setError(e?.message || "The animals were not moved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveMerge = async () => {
    const other = others.find((f) => String(f.id) === mergeForm.otherId);
    if (!other) return;
    // "keep this" → current group survives; otherwise the picked one survives.
    const sourceFlockId = mergeForm.keep === "this" ? other.id : flock.id;
    const targetFlockId = mergeForm.keep === "this" ? flock.id : other.id;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ archived: any; target: any; warning?: string }>(
        "/api/flocks/merge",
        {
          sourceFlockId,
          targetFlockId,
          confirmMixedSpecies: mergeForm.confirmMixedSpecies,
        }
      );
      // If THIS group was the one absorbed it no longer exists, so the detail
      // screen must close rather than keep rendering a stale group. Offline we
      // cannot know that the server did the merge yet, so the screen stays put
      // and the notice says so.
      const thisGroupAbsorbed = !isQueued(res) && mergeForm.keep === "other";
      flash(
        isQueued(res)
          ? `Saved on this device. The groups will be combined when you're back online.`
          : `Combined. ${res?.archived?.name || other.name} was archived into ${
              res?.target?.name || flock.name
            }.` + (res?.warning ? ` ${res.warning}` : "")
      );
      resetForms();
      onChanged();
      if (thisGroupAbsorbed) onThisGroupRemoved?.();
      else loadLedger();
    } catch (e: any) {
      // The mixed-species refusal is a confirmation, not a dead end.
      if (e?.needsConfirmation || /different species/i.test(e?.message || "")) {
        setError(e.message);
        setMergeForm((f) => ({ ...f, confirmMixedSpecies: true }));
      } else {
        setError(e?.message || "The groups were not combined. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const current = flock.currentCount ?? 0;
  const reasonOptions = countForm.direction === "in" ? IN_REASONS : OUT_REASONS;

  return (
    <Card className="border border-wangari-gray-100 bg-white">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PawPrint className="h-5 w-5 text-wangari-green-800" aria-hidden />
            <h3 className="font-bold text-wangari-green-900">Group size &amp; movements</h3>
            <StatusChip tone={current > 0 ? "good" : "neutral"} label={`${current} head`} />
          </div>
        </div>

        <p className="text-sm text-wangari-muted">
          Move animals to another group, combine two groups, or record why this
          group&apos;s number changed. Every change is kept below.
        </p>

        {notice ? (
          <div className="flex items-start gap-2 rounded-xl border border-tone-good-border bg-tone-good-bg px-4 py-3 text-sm font-medium text-tone-good-text">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{notice}</span>
          </div>
        ) : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-tone-bad-border bg-tone-bad-bg px-4 py-3 text-sm font-medium text-tone-bad-text">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Three big actions, each one tap. */}
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            variant={mode === "count" ? "default" : "outline"}
            onClick={() => { setMode(mode === "count" ? null : "count"); setError(null); }}
            className="justify-start gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Change the count
          </Button>
          <Button
            variant={mode === "transfer" ? "default" : "outline"}
            onClick={() => { setMode(mode === "transfer" ? null : "transfer"); setError(null); }}
            className="justify-start gap-2"
            disabled={others.length === 0}
          >
            <ArrowRightLeft className="h-4 w-4" aria-hidden />
            Move to another group
          </Button>
          <Button
            variant={mode === "merge" ? "default" : "outline"}
            onClick={() => { setMode(mode === "merge" ? null : "merge"); setError(null); }}
            className="justify-start gap-2"
            disabled={others.length === 0}
          >
            <GitMerge className="h-4 w-4" aria-hidden />
            Combine two groups
          </Button>
        </div>

        {others.length === 0 ? (
          <p className="text-xs text-wangari-muted">
            You need at least two groups to move stock between them or combine them.
          </p>
        ) : null}

        {/* ── Change the count ─────────────────────────────────────────── */}
        {mode === "count" ? (
          <div className="space-y-3 rounded-2xl border border-wangari-green-200 bg-wangari-green-50/40 p-3">
            <div className="flex gap-2">
              {(["in", "out"] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  // Switch the direction AND snap the reason to that direction's
                  // first option. Otherwise a farmer taps "In" while "Sold" is
                  // still selected and silently posts a sale.
                  onClick={() =>
                    setCountForm((f) => ({
                      ...f,
                      direction: dir,
                      reason: dir === "in" ? IN_REASONS[0].value : OUT_REASONS[0].value,
                    }))
                  }
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    countForm.direction === dir
                      ? "border-wangari-green-800 bg-wangari-green-800 text-white"
                      : "border-wangari-border bg-white text-wangari-green-900"
                  }`}
                >
                  {dir === "in" ? <Plus className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
                  {dir === "in" ? "Animals added" : "Animals removed"}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              placeholder="How many?"
              value={countForm.amount}
              onChange={(e) => setCountForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <select
              className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
              value={countForm.reason}
              onChange={(e) => setCountForm((f) => ({ ...f, reason: e.target.value }))}
            >
              {reasonOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              value={countForm.movedAt}
              onChange={(e) => setCountForm((f) => ({ ...f, movedAt: e.target.value }))}
            />
            <input
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              placeholder="Note (optional)"
              value={countForm.notes}
              onChange={(e) => setCountForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={saveCount}
                disabled={busy || !countForm.amount || Number(countForm.amount) <= 0}
              >
                {busy ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" onClick={resetForms} aria-label="Cancel">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}

        {/* ── Move to another group ────────────────────────────────────── */}
        {mode === "transfer" ? (
          <div className="space-y-3 rounded-2xl border border-wangari-green-200 bg-wangari-green-50/40 p-3">
            <p className="text-xs font-semibold text-wangari-green-900">
              Moving out of {flock.name} ({current} head)
            </p>
            <select
              className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
              value={transferForm.toFlockId}
              onChange={(e) => setTransferForm((f) => ({ ...f, toFlockId: e.target.value }))}
            >
              <option value="">Move to…</option>
              {others.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.currentCount ?? 0} head)
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              placeholder="How many are moving?"
              value={transferForm.count}
              onChange={(e) => setTransferForm((f) => ({ ...f, count: e.target.value }))}
            />
            <input
              type="date"
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              value={transferForm.movedAt}
              onChange={(e) => setTransferForm((f) => ({ ...f, movedAt: e.target.value }))}
            />
            <input
              className="h-11 w-full rounded-xl border border-wangari-border px-3 text-sm"
              placeholder="Note (optional)"
              value={transferForm.notes}
              onChange={(e) => setTransferForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={saveTransfer}
                disabled={busy || !transferForm.toFlockId || !transferForm.count || Number(transferForm.count) <= 0}
              >
                {busy ? "Moving..." : "Move animals"}
              </Button>
              <Button variant="ghost" onClick={resetForms} aria-label="Cancel">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}

        {/* ── Combine two groups ───────────────────────────────────────── */}
        {mode === "merge" ? (
          <div className="space-y-3 rounded-2xl border border-wangari-green-200 bg-wangari-green-50/40 p-3">
            <div className="flex items-start gap-2 rounded-xl border border-tone-warn-border bg-tone-warn-bg px-3 py-2 text-xs font-medium text-tone-warn-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                One group is combined into the other. The group that is absorbed keeps
                its history but is archived — it will leave your active list.
              </span>
            </div>
            <select
              className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
              value={mergeForm.otherId}
              onChange={(e) => setMergeForm((f) => ({ ...f, otherId: e.target.value, confirmMixedSpecies: false }))}
            >
              <option value="">Combine with…</option>
              {others.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.currentCount ?? 0} head)
                </option>
              ))}
            </select>
            <select
              className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
              value={mergeForm.keep}
              onChange={(e) => setMergeForm((f) => ({ ...f, keep: e.target.value as "this" | "other" }))}
            >
              <option value="this">Keep {flock.name} (absorb the other group)</option>
              <option value="other">
                Keep the other group (absorb {flock.name})
              </option>
            </select>
            {mergeForm.confirmMixedSpecies ? (
              <p className="text-xs font-semibold text-tone-warn-text">
                Confirmed: these are different species. Tap Combine again to proceed.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={saveMerge} disabled={busy || !mergeForm.otherId}>
                {busy ? "Combining..." : "Combine groups"}
              </Button>
              <Button variant="ghost" onClick={resetForms} aria-label="Cancel">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}

        {/* ── The ledger (read-only) ───────────────────────────────────── */}
        <div className="rounded-2xl border border-wangari-border bg-wangari-gray-50/50 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-gray-400">
            <History className="h-3.5 w-3.5" aria-hidden /> Count history
          </h4>
          {loadingLedger ? (
            <p className="py-3 text-center text-xs text-wangari-muted">Loading…</p>
          ) : movements.length === 0 ? (
            <p className="py-3 text-center text-xs text-wangari-muted">
              No changes recorded yet. When this group&apos;s number changes, the reason appears here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-bold ${
                      m.delta >= 0
                        ? "bg-wangari-green-100 text-wangari-green-700"
                        : "bg-tone-bad-bg text-tone-bad-text"
                    }`}
                  >
                    {m.delta >= 0 ? "+" : "−"}
                  </span>
                  <span className="w-24 shrink-0 text-wangari-gray-400">
                    {new Date(m.movedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="font-semibold text-wangari-gray-800">
                    {Math.abs(m.delta)} {ALL_LABELS[m.reason] || m.reason}
                  </span>
                  {m.counterpartyName ? (
                    <span className="truncate text-wangari-gray-400">· {m.counterpartyName}</span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-wangari-gray-400">
                    {m.countBefore} → {m.countAfter}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default FlockHerdPanel;
