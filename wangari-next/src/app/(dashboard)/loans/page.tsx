"use client";

import * as React from "react";
import { Landmark, Plus, Trash2, Wallet, CalendarDays, Link2 } from "lucide-react";
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
 * The farmer's OWN debt (farmer-requested gaps §3 C2).
 *
 * This is the opposite direction from `Credit`, which is money owed TO the farm
 * by its customers. Nothing in the app modelled the farmer's own borrowing — the
 * SACCO loan, the AFC facility, the agrovet's input credit — which is the most
 * emotive money problem in the sector and, until this page existed, could not even
 * be expressed.
 *
 * The posture is the same one `farm-record.ts` already takes in code:
 * *Wangari is the proof, the lender is the decision.* We record what was borrowed,
 * what was repaid and what a deduction from a delivery paid down. We never score,
 * never price risk and never decide anything.
 */

const kes = (n: unknown) => `KES ${Math.round(Number(n) || 0).toLocaleString("en-KE")}`;

const LOAN_TYPES = [
  { id: "sacco", label: "SACCO" },
  { id: "afc", label: "AFC / bank" },
  { id: "input_credit", label: "Input credit (agrovet)" },
  { id: "personal", label: "Personal / chama" },
  { id: "other", label: "Other" },
];

export default function LoansPage() {
  const [loans, setLoans] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [repayFor, setRepayFor] = React.useState<number | null>(null);
  const [repayAmount, setRepayAmount] = React.useState("");
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    lender: "",
    loanType: "sacco",
    principal: "",
    interestRatePct: "",
    disbursedAt: "",
    firstInstalmentDue: "",
    instalmentCount: "",
    instalmentAmount: "",
    notes: "",
  });

  const load = React.useCallback(() => {
    api
      .get("/api/farm-loans")
      .then((d: any) => {
        setLoans(Array.isArray(d) ? d : Array.isArray(d?.loans) ? d.loans : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(load, [load]);

  const submit = async () => {
    if (!form.lender.trim() || !form.principal) {
      showToast("Enter the lender and how much was borrowed");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/farm-loans", {
        lender: form.lender,
        loanType: form.loanType,
        principal: Number(form.principal),
        interestRatePct: form.interestRatePct || undefined,
        disbursedAt: form.disbursedAt || undefined,
        firstInstalmentDue: form.firstInstalmentDue || undefined,
        instalmentCount: form.instalmentCount || undefined,
        instalmentAmount: form.instalmentAmount || undefined,
        notes: form.notes || undefined,
      });
      showToast("Loan recorded", "success");
      setShowForm(false);
      setForm({
        lender: "", loanType: "sacco", principal: "", interestRatePct: "", disbursedAt: "",
        firstInstalmentDue: "", instalmentCount: "", instalmentAmount: "", notes: "",
      });
      load();
    } catch (err: any) {
      showToast(err?.message || "Could not save the loan");
    } finally {
      setSaving(false);
    }
  };

  const repay = async (id: number) => {
    const amount = Number(repayAmount);
    if (!amount || amount <= 0) {
      showToast("Enter how much you repaid");
      return;
    }
    try {
      await api.post(`/api/farm-loans/${id}/repayments`, { amount, source: "cash" });
      showToast("Repayment recorded", "success");
      setRepayFor(null);
      setRepayAmount("");
      load();
    } catch (err: any) {
      showToast(err?.message || "Could not record the repayment");
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/farm-loans/${id}`);
      load();
    } catch {
      showToast("Could not remove the loan");
    }
  };

  // The route spreads its summary onto the loan row (`...summary`), so the
  // balance is `balance` and the money already collected at source is
  // `deductionPaid`. Reading a nested `summary.outstanding` here would render a
  // confident KES 0 for every loan a farmer has — the exact kind of number this
  // page exists to stop them believing.
  const active = loans.filter((l) => l.status === "active");
  const totalOwed = active.reduce((s, l) => s + Number(l.balance ?? 0), 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {ToastComponent}
      <PageHeader
        title="What I owe"
        description="Your loans, their instalments and what a deduction from your milk has already repaid"
        action={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            Add a loan
          </Button>
        }
      />

      {loans.length > 0 && (
        <div className="rounded-2xl border border-wangari-border bg-wangari-cream p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-wangari-muted">Still to repay</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-wangari-heading">{kes(totalOwed)}</p>
          <p className="mt-1 text-[11px] text-wangari-muted">
            Across {active.length} active loan{active.length === 1 ? "" : "s"}. This is the lender&apos;s arithmetic on
            your records — not a credit decision by us.
          </p>
        </div>
      )}

      {showForm && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>Who lent it?</Label>
                <Input
                  placeholder="e.g. Githunguri SACCO, AFC, Kilimo agrovet"
                  value={form.lender}
                  onChange={(e) => setForm({ ...form, lender: e.target.value })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={form.loanType}
                  onChange={(e) => setForm({ ...form, loanType: e.target.value })}
                  className="h-10 w-full rounded-lg border border-wangari-border bg-white px-3 text-sm"
                >
                  {LOAN_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Amount borrowed (KES)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 150000"
                  value={form.principal}
                  onChange={(e) => setForm({ ...form, principal: e.target.value })}
                />
              </div>
              <div>
                <Label>Interest % a year (optional)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 12"
                  value={form.interestRatePct}
                  onChange={(e) => setForm({ ...form, interestRatePct: e.target.value })}
                />
              </div>
              <div>
                <Label>Money arrived (optional)</Label>
                <Input type="date" value={form.disbursedAt} onChange={(e) => setForm({ ...form, disbursedAt: e.target.value })} />
              </div>
              <div>
                <Label>First instalment due (optional)</Label>
                <Input
                  type="date"
                  value={form.firstInstalmentDue}
                  onChange={(e) => setForm({ ...form, firstInstalmentDue: e.target.value })}
                />
              </div>
              <div>
                <Label>How many instalments (optional)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 24"
                  value={form.instalmentCount}
                  onChange={(e) => setForm({ ...form, instalmentCount: e.target.value })}
                />
              </div>
              <div>
                <Label>Each instalment (optional)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 7500"
                  value={form.instalmentAmount}
                  onChange={(e) => setForm({ ...form, instalmentAmount: e.target.value })}
                />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <p className="text-[11px] text-wangari-muted">
              The instalment dates feed your forward view, so a month where a loan falls due is not a surprise.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save loan"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-wangari-muted">Loading your loans…</p>
      ) : loans.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-8 w-8" />}
          title="No loans recorded"
          description="Add the money you owe a SACCO, a bank or an agrovet. A loan you can see beside your milk income is a loan you can plan around."
        />
      ) : (
        <div className="space-y-3">
          {loans.map((l) => {
            const outstanding = Number(l.balance ?? 0);
            const settled = l.status === "settled" || outstanding <= 0.01;
            const schedule = Array.isArray(l.schedule) ? l.schedule : [];
            const paidCount = schedule.filter((x: any) => x.paid).length;
            const remaining = schedule.filter((x: any) => !x.paid);
            return (
              <Card key={l.id} className={settled ? "border-tone-good-border" : undefined}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-wangari-heading">{l.lender}</p>
                      <p className="text-xs text-wangari-muted">
                        {kes(l.principal)} borrowed
                        {l.interestRatePct ? ` · ${Number(l.interestRatePct)}% a year` : ""}
                        {l.loanType ? ` · ${String(l.loanType).replace(/_/g, " ")}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-lg font-bold tabular-nums ${settled ? "text-tone-good-text" : "text-tone-warn-text"}`}>
                        {settled ? "Settled" : kes(outstanding)}
                      </p>
                      <p className="text-[11px] text-wangari-muted">
                        {kes(l.totalPaid ?? l.amountPaid)} repaid
                        {schedule.length ? ` · ${paidCount}/${schedule.length} instalments` : ""}
                      </p>
                    </div>
                  </div>

                  {l.nextInstalmentDue && !settled && (
                    <p className="flex items-center gap-1.5 text-xs text-wangari-muted">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Next instalment {kes(l.instalmentAmount)} due{" "}
                      {new Date(l.nextInstalmentDue).toLocaleDateString("en-KE")}
                      {remaining.length ? ` · ${remaining.length} to go` : ""}
                    </p>
                  )}

                  {/* Arrears only against a date the lender actually set. A loan
                      with no plan is principal-minus-paid and nothing more. */}
                  {Number(l.missedInstalments ?? 0) > 0 && (
                    <p className="rounded-xl border border-tone-warn-border bg-tone-warn-bg px-3 py-2 text-xs font-medium text-tone-warn-text">
                      {l.missedInstalments} instalment{l.missedInstalments === 1 ? "" : "s"} past the date you were given
                      {l.daysInArrears != null ? ` — the oldest by ${l.daysInArrears} days` : ""}.
                    </p>
                  )}

                  {/* A loan collected at source is already being repaid by the
                      co-op. Saying so prevents a farmer paying twice. */}
                  {Number(l.deductionPaid ?? 0) > 0 && (
                    <p className="flex items-center gap-1.5 rounded-xl border border-wangari-border bg-wangari-sunken px-3 py-2 text-xs text-wangari-muted">
                      <Link2 className="h-3.5 w-3.5" />
                      {kes(l.deductionPaid)} of this has already been repaid by deductions taken off your
                      deliveries — recorded there, and already counted in the balance above.
                    </p>
                  )}

                  {repayFor === l.id ? (
                    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-3">
                      <div className="w-40">
                        <Label>Amount repaid (KES)</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={repayAmount}
                          onChange={(e) => setRepayAmount(e.target.value)}
                        />
                      </div>
                      <Button onClick={() => repay(l.id)}>Save repayment</Button>
                      <Button variant="ghost" onClick={() => { setRepayFor(null); setRepayAmount(""); }}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {!settled && (
                        <Button size="sm" variant="outline" onClick={() => setRepayFor(l.id)}>
                          <Wallet className="mr-1 h-3.5 w-3.5" />
                          Record a repayment
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove(l.id)} aria-label={`Remove the ${l.lender} loan`}>
                        <Trash2 className="h-3.5 w-3.5 text-tone-bad-text" />
                      </Button>
                    </div>
                  )}

                  {/* The schedule the lender's own plan implies — no plan means no
                      schedule, and this section simply does not appear. */}
                  {remaining.length > 0 && (
                    <ul className="divide-y border-t border-wangari-border/50">
                      {remaining.slice(0, 4).map((x: any) => (
                        <li key={x.index} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                          <span className={x.missed ? "font-medium text-tone-warn-text" : "text-wangari-muted"}>
                            Instalment {x.index} · {new Date(x.dueDate).toLocaleDateString("en-KE")}
                          </span>
                          <span className="font-mono tabular-nums text-wangari-heading">
                            {x.amount != null ? kes(x.amount) : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
