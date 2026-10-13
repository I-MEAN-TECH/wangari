"use client";

import * as React from "react";
import {
  ArrowLeftRight, CalendarClock, PiggyBank, Boxes, Plus, Trash2, Check, AlertTriangle, Info,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

/**
 * Money tools — the four gaps on the finance side of
 * docs/farmer-requested-gaps.md that were backend-only until now:
 *
 *   C3  matching an M-Pesa receipt to the delivery it settled
 *   C4  a forward view, and the plan it projects from
 *   C7  the chama ledger, per member
 *   C8  the herd and the tools as capital
 *
 * They share a page because they share a posture: every one of them is built
 * from records the farmer already keeps, and every one of them refuses to
 * assert something the data cannot support. Overdue money is never counted as
 * income. A payout is never presented as the farmer's loss. A book value is
 * never presented as a sale price.
 */

const kes = (n: unknown) => `KES ${Math.round(Number(n) || 0).toLocaleString("en-KE")}`;

type Tab = "reconcile" | "forward" | "savings" | "assets";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "reconcile", label: "Payments", icon: ArrowLeftRight },
  { id: "forward", label: "Forward view", icon: CalendarClock },
  { id: "savings", label: "Chama", icon: PiggyBank },
  { id: "assets", label: "What I own", icon: Boxes },
];

export default function MoneyPage() {
  const [tab, setTab] = React.useState<Tab>("reconcile");
  const { showToast, ToastComponent } = useToast();

  return (
    <div className="space-y-6 p-4 md:p-6">
      {ToastComponent}
      <PageHeader
        title="Money tools"
        description="Match payments to what they paid for, see the months ahead, track the chama, and know what your herd is worth"
      />

      <div className="flex flex-wrap gap-1 rounded-xl bg-wangari-sunken p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                active ? "bg-white text-wangari-green-800 shadow-sm" : "text-wangari-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "reconcile" && <Reconcile showToast={showToast} />}
      {tab === "forward" && <ForwardView showToast={showToast} />}
      {tab === "savings" && <Savings showToast={showToast} />}
      {tab === "assets" && <Assets />}
    </div>
  );
}

/* ── C3: matching money to what it settled ───────────────────────────────── */

function Reconcile({ showToast }: { showToast: (m: string, t?: "success" | "error") => void }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<number | null>(null);

  const load = React.useCallback(() => {
    api
      .get("/api/reconciliation")
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  React.useEffect(load, [load]);

  const confirm = async (transactionId: number, deliveryId: number | null) => {
    setBusy(transactionId);
    try {
      await api.post("/api/reconciliation/confirm", { transactionId, deliveryId });
      showToast(deliveryId ? "Payment matched" : "Match removed", "success");
      load();
    } catch (err: any) {
      showToast(err?.message || "Could not save the match");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-wangari-muted">Loading…</p>;
  const summary = data?.summary ?? {};
  const proposals: any[] = data?.proposals ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          { label: "Money with no delivery behind it", value: kes(summary.unmatchedValue), note: `${summary.unmatchedTransactions ?? 0} payments` },
          { label: "Still owed to you", value: kes(summary.unmatchedDeliveryValue), note: `${summary.unmatchedDeliveries ?? 0} deliveries` },
          { label: "Already matched", value: kes(summary.matchedValue), note: `${summary.matched ?? 0} payments` },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-wangari-muted">{c.label}</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-wangari-heading">{c.value}</p>
              <p className="text-[11px] text-wangari-muted">{c.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <p className="font-semibold text-wangari-heading">Payments we think match a delivery</p>
            <p className="text-[11px] text-wangari-muted">
              Suggestions only — nothing is matched until you say so, and you can undo a match. Amounts repeat, so an
              exact figure is strong evidence and not proof.
            </p>
          </div>

          {proposals.length === 0 ? (
            <p className="text-sm text-wangari-muted">
              Nothing to match from the last {data?.windowDays ?? 180} days. Either every payment is already linked,
              or the receipts have no amount, date or reference close enough to a delivery.
            </p>
          ) : (
            <ul className="space-y-2">
              {proposals.map((p) => (
                <li key={`${p.transactionId}-${p.deliveryId}`} className="rounded-xl border border-wangari-border px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-wangari-heading">
                        {kes(p.transaction?.amount)} {p.transaction?.description ? `· ${p.transaction.description}` : ""}
                      </p>
                      {p.delivery && (
                        <p className="text-xs text-wangari-muted">
                          {p.delivery.buyer} · {String(p.delivery.commodity).replace(/_/g, " ")} on{" "}
                          {new Date(p.delivery.date).toLocaleDateString("en-KE")}
                          {p.delivery.expectedPay != null ? ` · expected ${kes(p.delivery.expectedPay)}` : ""}
                          {p.amountDifference != null && Math.abs(p.amountDifference) > 1
                            ? ` · differs by ${kes(Math.abs(p.amountDifference))}`
                            : ""}
                        </p>
                      )}
                      <ul className="mt-1 space-y-0.5">
                        {(p.reasons ?? []).map((r: any) => (
                          <li key={r.kind} className="text-[11px] text-wangari-subtle">• {r.detail}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${p.confidence === "likely" ? "border-tone-good-border text-tone-good-text" : "border-tone-warn-border text-tone-warn-text"}`}
                      >
                        {p.confidence === "likely" ? "looks right" : p.confidence === "maybe" ? "maybe" : "weak"}
                      </Badge>
                      <Button size="sm" disabled={busy === p.transactionId} onClick={() => confirm(p.transactionId, p.deliveryId)}>
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Match
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="font-semibold text-wangari-heading">Money in with nothing behind it</p>
          <p className="text-[11px] text-wangari-muted">
            This is usually why a farmer believes they were not paid: the receipt landed, but nothing says what it was
            for.
          </p>
          {(data?.unmatched ?? []).length === 0 ? (
            <p className="text-sm text-wangari-muted">Every payment in the window is accounted for.</p>
          ) : (
            <ul className="divide-y">
              {(data?.unmatched ?? []).slice(0, 6).map((t: any) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <span className="min-w-0 truncate text-wangari-muted">
                    {new Date(t.date).toLocaleDateString("en-KE")} · {t.description ?? t.reference ?? "no description"}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-wangari-heading">{kes(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── C4: the forward view and the plan ───────────────────────────────────── */

function ForwardView({ showToast }: { showToast: (m: string, t?: "success" | "error") => void }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ label: "", amount: "", dueOn: "", direction: "outflow", recurring: "once" });

  const load = React.useCallback(() => {
    api
      .get("/api/cash-flow")
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  React.useEffect(load, [load]);

  const addPlan = async () => {
    if (!form.label.trim() || !form.amount || !form.dueOn) {
      showToast("Give it a name, an amount and a date");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/cash-flow/budget", {
        label: form.label,
        amount: Number(form.amount),
        dueOn: form.dueOn,
        direction: form.direction,
        recurring: form.recurring,
      });
      setForm({ label: "", amount: "", dueOn: "", direction: "outflow", recurring: "once" });
      load();
    } catch (err: any) {
      showToast(err?.message || "Could not save the plan item");
    } finally {
      setSaving(false);
    }
  };

  const removePlan = async (id: number) => {
    try {
      await api.delete(`/api/cash-flow/budget/${id}`);
      load();
    } catch {
      showToast("Could not remove the plan item");
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-wangari-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-wangari-heading">The next {data?.horizonDays ?? 90} days</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${(data?.net ?? 0) >= 0 ? "bg-tone-good-bg text-tone-good-text" : "bg-tone-warn-bg text-tone-warn-text"}`}>
              {(data?.net ?? 0) >= 0 ? "Projected surplus" : "Projected short"} {kes(Math.abs(data?.net ?? 0))}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(data?.buckets ?? []).map((b: any) => (
              <div key={b.label} className={`rounded-xl border p-3 ${b.net < 0 ? "border-tone-warn-border bg-tone-warn-bg" : "border-wangari-border bg-wangari-cream"}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-wangari-muted">{b.label}</p>
                <p className={`mt-1 font-mono text-sm font-bold tabular-nums ${b.net < 0 ? "text-tone-warn-text" : "text-tone-good-text"}`}>
                  {b.net >= 0 ? "+" : "−"}{kes(Math.abs(b.net))}
                </p>
                <p className="text-[10px] text-wangari-muted">
                  in {kes(b.expectedIn)} · out {kes(b.expectedOut)}
                </p>
              </div>
            ))}
          </div>

          {(data?.overdue?.amount ?? 0) > 0 && (
            <div className="rounded-xl border border-tone-warn-border bg-tone-warn-bg px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-tone-warn-text">
                <AlertTriangle className="h-4 w-4" />
                {kes(data.overdue.amount)} already past the date you were promised
              </p>
              <p className="mt-0.5 text-[11px] text-wangari-muted">{data.overdue.note}</p>
            </div>
          )}

          {(data?.warnings ?? []).map((w: string) => (
            <p key={w} className="flex items-start gap-1.5 text-xs text-wangari-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </p>
          ))}

          <p className="text-[11px] text-wangari-subtle">{data?.basis}</p>

          <div className="rounded-xl bg-wangari-sunken px-3 py-2 text-[11px] text-wangari-muted">
            Built from {data?.assumptions?.owedCounted ?? 0} delivery promises, {data?.assumptions?.loansCounted ?? 0} loans
            and {data?.assumptions?.trailingCosts?.length ?? 0} cost lines averaged over the last{" "}
            {data?.assumptions?.trailingMonths ?? 3} months.
            {(data?.assumptions?.noPromiseDate ?? 0) > 0
              ? ` ${data.assumptions.noPromiseDate} deliveries have no promised date, so they are not in any month.`
              : ""}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <p className="font-semibold text-wangari-heading">Your plan</p>
            <p className="text-[11px] text-wangari-muted">
              School fees, fertiliser, a new chaff cutter. A plan is not a ledger — nothing here counts as money spent
              until you record it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label>What for?</Label>
              <Input placeholder="e.g. School fees, term 1" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" inputMode="decimal" placeholder="KES" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label>When</Label>
              <Input type="date" value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
            </div>
            <div>
              <Label>How often</Label>
              <select
                value={form.recurring}
                onChange={(e) => setForm({ ...form, recurring: e.target.value })}
                className="h-10 w-full rounded-lg border border-wangari-border bg-white px-3 text-sm"
              >
                <option value="once">Once</option>
                <option value="monthly">Every month</option>
                <option value="weekly">Every week</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value })}
              className="h-10 rounded-lg border border-wangari-border bg-white px-3 text-sm"
            >
              <option value="outflow">Money going out</option>
              <option value="inflow">Money coming in</option>
            </select>
            <Button onClick={addPlan} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              {saving ? "Saving…" : "Add to plan"}
            </Button>
          </div>

          {(data?.planned ?? []).length > 0 && (
            <ul className="divide-y border-t border-wangari-border/50">
              {(data?.planned ?? []).map((p: any) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="font-medium text-wangari-heading">{p.label}</span>
                    <span className="ml-2 text-wangari-muted">
                      {new Date(p.dueOn).toLocaleDateString("en-KE")}
                      {p.recurring && p.recurring !== "once" ? ` · ${p.recurring}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`font-mono tabular-nums ${p.direction === "inflow" ? "text-tone-good-text" : "text-wangari-heading"}`}>
                      {p.direction === "inflow" ? "+" : "−"}{kes(p.amount)}
                    </span>
                    <button onClick={() => removePlan(p.id)} aria-label={`Remove ${p.label}`} className="cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5 text-tone-bad-text" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── C7: the chama ──────────────────────────────────────────────────────── */

const ENTRY_LABELS: Record<string, string> = {
  contribution: "Paid in",
  withdrawal: "Took out",
  loan_out: "Took a loan",
  repayment: "Repaid",
};

function Savings({ showToast }: { showToast: (m: string, t?: "success" | "error") => void }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({ groupName: "", memberName: "", entryType: "contribution", amount: "", occurredOn: "" });

  const load = React.useCallback(() => {
    api
      .get("/api/savings")
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  React.useEffect(load, [load]);

  const add = async () => {
    if (!form.groupName.trim() || !form.memberName.trim() || !form.amount) {
      showToast("Enter the group, the member and the amount");
      return;
    }
    try {
      await api.post("/api/savings", {
        groupName: form.groupName,
        memberName: form.memberName,
        entryType: form.entryType,
        amount: Number(form.amount),
        occurredOn: form.occurredOn || undefined,
      });
      setForm({ ...form, amount: "" });
      showToast("Saved to the book", "success");
      load();
    } catch (err: any) {
      showToast(err?.message || "Could not save the entry");
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-wangari-muted">Loading…</p>;
  const ledgers: any[] = data?.ledgers ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <p className="font-semibold text-wangari-heading">The chama book</p>
            <p className="text-[11px] text-wangari-muted">{data?.basis}</p>
          </div>

          {ledgers.length === 0 ? (
            <EmptyState
              icon={<PiggyBank className="h-8 w-8" />}
              title="Nothing in the book yet"
              description="Record what members pay in, take out, and borrow. A member's balance is then one running sum instead of an argument."
            />
          ) : (
            ledgers.map((l) => (
              <div key={l.groupName} className="rounded-xl border border-wangari-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-wangari-heading">{l.groupName}</p>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold tabular-nums text-wangari-heading">{kes(l.pot)}</p>
                    <p className="text-[10px] text-wangari-muted">in the book</p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-wangari-muted">
                  {kes(l.totalSavings)} saved by members · {kes(l.totalOutstandingLoans)} still owed to the pot
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-wangari-subtle">
                        <th className="py-1 font-bold">Member</th>
                        <th className="py-1 text-right font-bold">Savings</th>
                        <th className="py-1 text-right font-bold">Owes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.members.map((m: any) => (
                        <tr key={m.memberName} className="border-t border-wangari-border/50">
                          <td className="py-1.5 font-bold text-wangari-heading">{m.memberName}</td>
                          <td className="py-1.5 text-right tabular-nums">{kes(m.savingsBalance)}</td>
                          <td className={`py-1.5 text-right tabular-nums ${m.outstandingLoan > 0 ? "text-tone-warn-text" : "text-wangari-muted"}`}>
                            {m.neverBorrowed ? "never borrowed" : kes(m.outstandingLoan)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          {(data?.entries ?? []).length > 0 && (
            <ul className="divide-y border-t border-wangari-border/50">
              {(data?.entries ?? []).map((e: any) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <span className="min-w-0 text-wangari-muted">
                    {new Date(e.occurredOn).toLocaleDateString("en-KE")} · {e.memberName} ·{" "}
                    {ENTRY_LABELS[e.entryType] ?? e.entryType}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-wangari-heading">{kes(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-semibold text-wangari-heading">Add a line</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div>
              <Label>Group</Label>
              <Input placeholder="e.g. Umoja Chama" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} />
            </div>
            <div>
              <Label>Member</Label>
              <Input placeholder="e.g. Grace" value={form.memberName} onChange={(e) => setForm({ ...form, memberName: e.target.value })} />
            </div>
            <div>
              <Label>What happened</Label>
              <select
                value={form.entryType}
                onChange={(e) => setForm({ ...form, entryType: e.target.value })}
                className="h-10 w-full rounded-lg border border-wangari-border bg-white px-3 text-sm"
              >
                {Object.entries(ENTRY_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" inputMode="decimal" placeholder="KES" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label>When</Label>
              <Input type="date" value={form.occurredOn} onChange={(e) => setForm({ ...form, occurredOn: e.target.value })} />
            </div>
          </div>
          <Button onClick={add}>
            <Plus className="mr-2 h-4 w-4" />
            Add to the book
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── C8: what the farm owns ─────────────────────────────────────────────── */

function Assets() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [edits, setEdits] = React.useState<Record<number, { acquiredOn: string; usefulLifeYears: string; salvageValue: string }>>({});

  const load = React.useCallback(() => {
    api
      .get("/api/assets")
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  React.useEffect(load, [load]);

  const save = async (id: number) => {
    const e = edits[id];
    if (!e) return;
    try {
      await api.patch(`/api/assets/flock/${id}`, {
        // Empty string means "clear it", which the route accepts as null — a life
        // typed onto the wrong group has to be removable.
        acquiredOn: e.acquiredOn || null,
        usefulLifeYears: e.usefulLifeYears || null,
        salvageValue: e.salvageValue || null,
      });
      load();
    } catch {
      /* the row stays editable; a failed save changes nothing */
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-wangari-muted">Loading…</p>;

  const livestock = (data?.lines ?? []).filter((l: any) => l.kind === "livestock");
  const equipment = (data?.lines ?? []).filter((l: any) => l.kind === "equipment");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Herd at cost", value: kes(data?.livestock?.cost) },
          { label: "Herd book value", value: kes(data?.livestock?.bookValue) },
          { label: "Equipment at cost", value: kes(data?.equipment?.cost) },
          { label: "Total at cost", value: kes(data?.totalCost) },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-wangari-muted">{c.label}</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-wangari-heading">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <p className="font-semibold text-wangari-heading">Your herd as capital</p>
            <p className="text-[11px] text-wangari-muted">{data?.basis}</p>
          </div>

          {livestock.length === 0 ? (
            <p className="text-sm text-wangari-muted">
              No groups to value yet. Add what you paid for a group and, if you know it, how long you expect it to
              work for you.
            </p>
          ) : (
            <ul className="space-y-2">
              {livestock.map((l: any) => (
                <li key={l.id} className="rounded-xl border border-wangari-border px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-wangari-heading">
                        {l.name} <span className="text-[11px] font-normal text-wangari-muted">{l.units} {l.unitLabel}</span>
                      </p>
                      <p className="text-[11px] text-wangari-muted">
                        {l.cost != null ? `cost ${kes(l.cost)}` : "no purchase cost recorded"}
                        {l.bookValue != null ? ` · book value ${kes(l.bookValue)}` : ""}
                        {l.ageYears != null ? ` · ${l.ageYears} years old` : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-wangari-subtle">{l.note}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {l.basis === "straight_line" ? "depreciated" : "at cost"}
                    </Badge>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    {(() => {
                      const e = edits[l.id] ?? {
                        acquiredOn: l.acquiredOn ? String(l.acquiredOn).slice(0, 10) : "",
                        usefulLifeYears: l.usefulLifeYears != null ? String(l.usefulLifeYears) : "",
                        salvageValue: l.salvageValue != null ? String(l.salvageValue) : "",
                      };
                      return (
                        <>
                          <div>
                            <Label className="text-[10px]">Bought on</Label>
                            <Input
                              type="date"
                              className="h-9 text-xs"
                              value={e.acquiredOn}
                              onChange={(ev) => setEdits({ ...edits, [l.id]: { ...e, acquiredOn: ev.target.value } })}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">Useful life (years)</Label>
                            <Input
                              type="number"
                              className="h-9 text-xs"
                              value={e.usefulLifeYears}
                              onChange={(ev) => setEdits({ ...edits, [l.id]: { ...e, usefulLifeYears: ev.target.value } })}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">End value (KES)</Label>
                            <Input
                              type="number"
                              className="h-9 text-xs"
                              value={e.salvageValue}
                              onChange={(ev) => setEdits({ ...edits, [l.id]: { ...e, salvageValue: ev.target.value } })}
                            />
                          </div>
                          <div className="flex items-end">
                            <Button size="sm" variant="outline" onClick={() => save(l.id)}>Save</Button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {equipment.length > 0 && (
            <div className="border-t border-wangari-border pt-3">
              <p className="text-sm font-semibold text-wangari-heading">Equipment and stock</p>
              <ul className="divide-y">
                {equipment.slice(0, 12).map((l: any) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                    <span className="min-w-0 truncate text-wangari-muted">
                      {l.name} · {l.units} {l.unitLabel}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-wangari-heading">
                      {l.cost != null ? kes(l.cost) : "no cost recorded"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-wangari-subtle">
                Tools are shown at cost — stock records what something cost, not when it was bought.
              </p>
            </div>
          )}

          {(data?.incomplete ?? []).length > 0 && (
            <p className="flex items-start gap-1.5 rounded-xl bg-wangari-sunken px-3 py-2 text-[11px] text-wangari-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {data.incomplete.length} line{data.incomplete.length === 1 ? "" : "s"} cannot show a book value yet — add a
              purchase date and a useful life and they will.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
