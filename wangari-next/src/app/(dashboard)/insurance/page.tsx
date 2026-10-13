"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Plus, Trash2, Tag, AlertTriangle, Clock, Wallet, FileText, HandCoins, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

/**
 * Insurance policy register (gap-analysis row 13).
 *
 * A register, not a product: we store what the farmer was sold and what they
 * paid. No risk pricing, no payout estimates — that is insurance business, and
 * a farmer disputing a claim should be arguing with their insurer, not with
 * our arithmetic.
 *
 * The value is the ANITRAC linkage, so the page leads with the honest gap: a
 * policy over untagged animals is a piece of paper. Saying so is the product.
 */

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const PRODUCT_TYPES = [
  { id: "index", label: "Index (rainfall)" },
  { id: "livestock", label: "Livestock" },
  { id: "crop", label: "Crop" },
  { id: "comprehensive", label: "Comprehensive" },
];

const kes = (n: unknown) => `KES ${Number(n ?? 0).toLocaleString("en-KE")}`;

const EVENT_TYPES = [
  { id: "drought", label: "Drought" },
  { id: "flood", label: "Flood" },
  { id: "pest", label: "Pest" },
  { id: "disease", label: "Disease" },
  { id: "fire", label: "Fire" },
  { id: "price", label: "Price crash" },
  { id: "other", label: "Other" },
];

const CLAIM_STATUS = [
  { id: "submitted", label: "Filed" },
  { id: "approved", label: "Approved" },
  { id: "paid", label: "Money received" },
  { id: "rejected", label: "Rejected" },
];

const OUTCOME_CLS: Record<string, string> = {
  awaiting: "border-wangari-border text-wangari-muted",
  approved: "border-tone-good-border text-tone-good-text",
  paid: "border-tone-good-border text-tone-good-text",
  rejected: "border-tone-bad-border text-tone-bad-text",
};

export default function InsurancePage() {
  const [policies, setPolicies] = React.useState<any[]>([]);
  const [summary, setSummary] = React.useState<any>(null);
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [claims, setClaims] = React.useState<any[]>([]);
  const [claimSummary, setClaimSummary] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showClaimForm, setShowClaimForm] = React.useState(false);
  const [payingFor, setPayingFor] = React.useState<number | null>(null);
  const [payoutForm, setPayoutForm] = React.useState({ receivedAmount: "", receivedOn: new Date().toISOString().slice(0, 10), status: "paid" });
  const { showToast, ToastComponent } = useToast();

  const [claimForm, setClaimForm] = React.useState({
    policyId: "",
    incidentOn: new Date().toISOString().slice(0, 10),
    eventType: "drought",
    claimRef: "",
    measuredLossUnits: "",
    expectedAmount: "",
    notes: "",
  });

  const [form, setForm] = React.useState({
    insurer: "",
    policyNumber: "",
    productType: "index",
    flockId: "",
    unitsCovered: "",
    sumInsured: "",
    premiumPaid: "",
    startDate: "",
    endDate: "",
    triggerMetric: "",
    triggerValue: "",
    notes: "",
  });

  const load = React.useCallback(() => {
    Promise.all([
      api.get("/api/insurance"),
      api.get("/api/insurance/summary"),
      api.get("/api/flocks"),
      api.get("/api/insurance/claims").catch(() => ({ claims: [], summary: null })),
    ])
      .then(([p, s, f, c]: any) => {
        setPolicies(Array.isArray(p?.policies) ? p.policies : []);
        setSummary(s);
        setFlocks(Array.isArray(f) ? f : []);
        setClaims(Array.isArray(c?.claims) ? c.claims : []);
        setClaimSummary(c?.summary ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fileClaim = async () => {
    if (!claimForm.incidentOn) {
      showToast("When did it happen?");
      return;
    }
    try {
      await api.post("/api/insurance/claims", {
        policyId: claimForm.policyId ? Number(claimForm.policyId) : null,
        incidentOn: claimForm.incidentOn,
        eventType: claimForm.eventType,
        claimRef: claimForm.claimRef.trim() || null,
        // The farmer's own count of what was lost. Never converted into money by
        // us: valuing stock needs a market price we would have to choose for
        // them, and any figure we chose would become the number they quote.
        measuredLossUnits: claimForm.measuredLossUnits === "" ? null : Number(claimForm.measuredLossUnits),
        expectedAmount: claimForm.expectedAmount === "" ? null : Number(claimForm.expectedAmount),
        notes: claimForm.notes.trim() || null,
      });
      showToast("Claim filed", "success");
      setShowClaimForm(false);
      setClaimForm((f) => ({ ...f, claimRef: "", measuredLossUnits: "", expectedAmount: "", notes: "" }));
      load();
    } catch (err: any) {
      showToast(err?.message ?? "Could not file the claim");
    }
  };

  const savePayout = async (id: number) => {
    try {
      await api.patch(`/api/insurance/claims/${id}`, {
        status: payoutForm.status,
        receivedAmount: payoutForm.receivedAmount === "" ? null : Number(payoutForm.receivedAmount),
        receivedOn: payoutForm.receivedAmount === "" ? null : payoutForm.receivedOn,
      });
      setPayingFor(null);
      setPayoutForm({ receivedAmount: "", receivedOn: new Date().toISOString().slice(0, 10), status: "paid" });
      showToast("Claim updated", "success");
      load();
    } catch {
      showToast("Could not update the claim");
    }
  };

  const removeClaim = async (id: number) => {
    try {
      await api.delete(`/api/insurance/claims/${id}`);
      load();
    } catch {
      showToast("Could not delete the claim");
    }
  };

  React.useEffect(() => {
    load();
  }, [load]);

  const reset = () =>
    setForm({
      insurer: "",
      policyNumber: "",
      productType: "index",
      flockId: "",
      unitsCovered: "",
      sumInsured: "",
      premiumPaid: "",
      startDate: "",
      endDate: "",
      triggerMetric: "",
      triggerValue: "",
      notes: "",
    });

  const submit = async () => {
    setSaving(true);
    try {
      await api.post("/api/insurance", {
        insurer: form.insurer.trim(),
        policyNumber: form.policyNumber.trim(),
        productType: form.productType,
        flockId: form.flockId ? Number(form.flockId) : null,
        unitsCovered: form.unitsCovered === "" ? null : Number(form.unitsCovered),
        sumInsured: form.sumInsured === "" ? null : Number(form.sumInsured),
        premiumPaid: form.premiumPaid === "" ? null : Number(form.premiumPaid),
        startDate: form.startDate,
        endDate: form.endDate,
        triggerMetric: form.triggerMetric.trim() || null,
        triggerValue: form.triggerValue === "" ? null : Number(form.triggerValue),
        notes: form.notes.trim() || null,
      });
      showToast("Policy saved", "success");
      setShowForm(false);
      reset();
      load();
    } catch (err: any) {
      showToast(err?.message ?? "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: number, status: string) => {
    try {
      await api.patch(`/api/insurance/${id}`, { status });
      load();
    } catch {
      showToast("Could not update", "error");
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/insurance/${id}`);
      showToast("Policy removed", "success");
      load();
    } catch {
      showToast("Could not delete", "error");
    }
  };

  return (
    <div className="space-y-6">
      {ToastComponent}
      <PageHeader
        title="Insurance"
        description="Keep your policies here so a claim does not depend on remembering."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" />
            {showForm ? "Close" : "Add policy"}
          </Button>
        }
      />

      {summary && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">Policies in force</p>
                <p className="mt-1 text-2xl font-bold text-wangari-heading">{summary.activePolicies}</p>
                <p className="mt-1 text-xs text-wangari-muted">{kes(summary.totalSumInsured)} insured</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">Animals covered</p>
                <p className="mt-1 text-2xl font-bold text-wangari-heading">{summary.totalAnimals}</p>
                <p className="mt-1 text-xs text-wangari-muted">{kes(summary.totalPremium)} premium paid</p>
              </CardContent>
            </Card>
            <Card className={summary.untaggedAnimals > 0 ? "border-badge-orange-text/40" : ""}>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">Without tags</p>
                <p className="mt-1 text-2xl font-bold text-wangari-heading">{summary.untaggedAnimals}</p>
                <p className="mt-1 text-xs text-wangari-muted">
                  {summary.untaggedAnimals > 0
                    ? "Cannot be evidenced in a claim"
                    : "All traceable by tag"}
                </p>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {showForm && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card>
            <CardHeader>
              <CardTitle>Add a policy</CardTitle>
              <CardDescription>
                Copy the details off your certificate. We store them; we do not price anything.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="insurer">Insurer</Label>
                  <Input
                    id="insurer"
                    value={form.insurer}
                    onChange={(e) => setForm((f) => ({ ...f, insurer: e.target.value }))}
                    placeholder="e.g. APA"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="policyNumber">Policy number</Label>
                  <Input
                    id="policyNumber"
                    value={form.policyNumber}
                    onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))}
                    placeholder="From your certificate"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Type of cover</Label>
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, productType: t.id }))}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                        form.productType === t.id
                          ? "bg-wangari-green-800 text-white"
                          : "border border-wangari-border bg-white text-wangari-muted hover:border-wangari-green-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="flock">Which flock</Label>
                <select
                  id="flock"
                  value={form.flockId}
                  onChange={(e) => setForm((f) => ({ ...f, flockId: e.target.value }))}
                  className="flex h-11 w-full rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm text-wangari-heading focus-visible:outline-none focus-visible:border-wangari-green-500"
                >
                  <option value="">Not tied to one flock</option>
                  {flocks.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.currentCount ?? 0})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sumInsured">Sum insured (KES)</Label>
                  <Input
                    id="sumInsured"
                    type="number"
                    inputMode="decimal"
                    value={form.sumInsured}
                    onChange={(e) => setForm((f) => ({ ...f, sumInsured: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="premium">Premium paid (KES)</Label>
                  <Input
                    id="premium"
                    type="number"
                    inputMode="decimal"
                    value={form.premiumPaid}
                    onChange={(e) => setForm((f) => ({ ...f, premiumPaid: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Cover starts</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Cover ends</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div className="flex gap-3">
                <Button onClick={submit} disabled={saving || !form.insurer.trim() || !form.policyNumber.trim()}>
                  {saving ? "Saving" : "Save policy"}
                </Button>
                <Button variant="outline" onClick={() => { setShowForm(false); reset(); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-wangari-border/40" />
      ) : policies.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" />}
          title="No policies recorded"
          description="Add your cover once, then a claim does not depend on finding the certificate."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Add your first policy
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-wangari-heading">{p.insurer}</span>
                      <span className="font-mono text-xs text-wangari-muted">{p.policyNumber}</span>
                      <Badge variant={p.expiredNow ? "danger" : p.status === "claimed" ? "info" : "success"}>
                        {p.expiredNow ? "Expired" : p.status}
                      </Badge>
                      {p.expiringSoon && !p.expiredNow && (
                        <Badge variant="warning">
                          <Clock className="h-3 w-3 mr-1" />
                          Ending soon
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {p.evidence === "evidenced" && (
                        <Badge variant="success">
                          <Tag className="h-3 w-3 mr-1" />
                          {p.taggedAnimals} tagged animals
                        </Badge>
                      )}
                      {p.evidence === "untagged" && (
                        <Badge variant="warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          No tags on this flock
                        </Badge>
                      )}
                      {p.evidence === "no_flock" && <Badge variant="outline">Not tied to a flock</Badge>}
                    </div>

                    {p.evidence === "untagged" && p.flock && (
                      <p className="text-xs text-wangari-muted">
                        {p.flock.name} has {p.animalsInFlock} animals and no tags. An adjuster cannot match this policy
                        to a specific animal until they are tagged.
                      </p>
                    )}

                    <p className="text-xs text-wangari-muted">
                      {p.startDate ? new Date(p.startDate).toLocaleDateString("en-KE") : ""} to{" "}
                      {p.endDate ? new Date(p.endDate).toLocaleDateString("en-KE") : ""}
                      {p.sumInsured ? ` · ${kes(p.sumInsured)} insured` : ""}
                      {p.premiumPaid ? ` · ${kes(p.premiumPaid)} paid` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {p.status === "active" && (
                      <Button variant="ghost" size="sm" onClick={() => setStatus(p.id, "claimed")}>
                        Mark claimed
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => remove(p.id)} aria-label="Delete policy">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* C5: what was claimed, what was promised, and what actually arrived.
          Index cover pays on a TRIGGER — rainfall, an area yield — not on what
          happened on this farm, so the measured loss and the payout are kept
          apart on purpose. Converting one into the other is how a farmer ends
          up quoting a number their insurer never agreed to. */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HandCoins className="h-5 w-5" />
                Claims and payouts
              </CardTitle>
              <CardDescription>
                What you claimed, what you were told to expect, and what arrived. We never price a loss — valuing six dead
                cows needs a market price we would be choosing for you.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowClaimForm((s) => !s)}>
              {showClaimForm ? <X className="mr-1 h-3.5 w-3.5" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              {showClaimForm ? "Close" : "File a claim"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {claimSummary && claimSummary.claims > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-wangari-sunken px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-wangari-muted">Claims filed</p>
                  <p className="mt-0.5 text-lg font-bold text-wangari-heading">{claimSummary.claims}</p>
                </div>
                <div className="rounded-xl bg-wangari-sunken px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-wangari-muted">Money received</p>
                  <p className="mt-0.5 text-lg font-bold text-wangari-heading">{kes(claimSummary.received)}</p>
                </div>
                <div className="rounded-xl bg-wangari-sunken px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-wangari-muted">Still open</p>
                  <p className="mt-0.5 text-lg font-bold text-wangari-heading">
                    {(claimSummary.awaiting ?? 0) + (claimSummary.approved ?? 0)}
                    {claimSummary.oldestOpenDays != null && (
                      <span className="ml-2 text-[11px] font-normal text-wangari-muted">
                        longest {claimSummary.oldestOpenDays} days
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* The anti-promise line, printed rather than implied. */}
            {claimSummary?.basis && claimSummary.claims > 0 && (
              <p className="text-[11px] text-wangari-muted">
                {claimSummary.basis}
                {claimSummary.shortfall > 0 && claimSummary.shortfallPct != null
                  ? ` Across your claims the payout has been ${claimSummary.shortfallPct}% below what you were told to expect.`
                  : ""}
              </p>
            )}

            {showClaimForm && (
              <div className="space-y-3 rounded-xl border border-dashed border-wangari-border p-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Which policy</Label>
                    <select
                      value={claimForm.policyId}
                      onChange={(e) => setClaimForm((f) => ({ ...f, policyId: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                    >
                      <option value="">Not tied to one policy</option>
                      {policies.map((p) => (
                        <option key={p.id} value={p.id}>{p.insurer} · {p.policyNumber}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>When did it happen</Label>
                    <Input type="date" className="h-11 rounded-xl" value={claimForm.incidentOn} onChange={(e) => setClaimForm((f) => ({ ...f, incidentOn: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>What happened</Label>
                    <select
                      value={claimForm.eventType}
                      onChange={(e) => setClaimForm((f) => ({ ...f, eventType: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                    >
                      {EVENT_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>What you lost (your own count)</Label>
                    <Input type="number" inputMode="numeric" placeholder="head, kg, trees — not money" value={claimForm.measuredLossUnits} onChange={(e) => setClaimForm((f) => ({ ...f, measuredLossUnits: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>What you were told to expect (KES)</Label>
                    <Input type="number" inputMode="decimal" placeholder="optional" value={claimForm.expectedAmount} onChange={(e) => setClaimForm((f) => ({ ...f, expectedAmount: e.target.value }))} />
                    <p className="text-[10px] text-wangari-muted">Only if the insurer actually gave you a figure.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Claim number</Label>
                    <Input placeholder="from the insurer" value={claimForm.claimRef} onChange={(e) => setClaimForm((f) => ({ ...f, claimRef: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input placeholder="Optional" value={claimForm.notes} onChange={(e) => setClaimForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <Button onClick={fileClaim}>
                  <FileText className="mr-2 h-4 w-4" />
                  File the claim
                </Button>
              </div>
            )}

            {claims.length === 0 ? (
              <p className="text-sm text-wangari-muted">
                No claims recorded. When something happens, file it here the same day — a claim filed from memory two
                months later is a claim the insurer can argue with.
              </p>
            ) : (
              <div className="space-y-3">
                {claims.map((c) => (
                  <div key={c.id} className="rounded-xl border border-wangari-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-wangari-heading">
                          {EVENT_TYPES.find((t) => t.id === c.eventType)?.label ?? c.eventType}
                          <span className="ml-2 text-xs font-normal text-wangari-muted">
                            {new Date(c.incidentOn).toLocaleDateString("en-KE")}
                            {c.insurer ? ` · ${c.insurer}` : ""}
                            {c.claimRef ? ` · ${c.claimRef}` : ""}
                          </span>
                        </p>
                        <p className="text-xs text-wangari-muted">
                          {c.measuredLossUnits != null ? `You counted ${c.measuredLossUnits} lost` : "No loss count recorded"}
                          {c.expectedAmount != null ? ` · told to expect ${kes(c.expectedAmount)}` : ""}
                        </p>
                        {/* The one sentence the lib writes, so the screen and the
                            API can never disagree about what the numbers mean. */}
                        {c.position?.statement && (
                          <p className="mt-0.5 text-xs text-wangari-heading">{c.position.statement}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${OUTCOME_CLS[c.position?.outcome ?? "awaiting"]}`}>
                          {CLAIM_STATUS.find((s) => s.id === c.status)?.label ?? c.status}
                          {c.position?.openDays != null && c.status !== "paid" && c.status !== "rejected"
                            ? ` · ${c.position.openDays} days open`
                            : ""}
                        </Badge>
                        {c.status !== "paid" && (
                          <Button size="sm" variant="outline" onClick={() => { setPayingFor(payingFor === c.id ? null : c.id); setPayoutForm((f) => ({ ...f, receivedAmount: c.receivedAmount != null ? String(c.receivedAmount) : "" })); }}>
                            Record money
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => removeClaim(c.id)} aria-label="Delete claim">
                          <Trash2 className="h-3.5 w-3.5 text-tone-bad-text" />
                        </Button>
                      </div>
                    </div>

                    {payingFor === c.id && (
                      <div className="mt-3 grid gap-3 rounded-xl bg-wangari-sunken p-3 sm:grid-cols-4">
                        <div className="space-y-2">
                          <Label className="text-xs">What did they do?</Label>
                          <select
                            value={payoutForm.status}
                            onChange={(e) => setPayoutForm((f) => ({ ...f, status: e.target.value }))}
                            className="h-10 w-full rounded-lg border border-wangari-border bg-white px-3 text-sm"
                          >
                            {CLAIM_STATUS.map((s) => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Money received (KES)</Label>
                          <Input type="number" inputMode="decimal" placeholder="0 if nothing yet" value={payoutForm.receivedAmount} onChange={(e) => setPayoutForm((f) => ({ ...f, receivedAmount: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">When it arrived</Label>
                          <Input type="date" value={payoutForm.receivedOn} onChange={(e) => setPayoutForm((f) => ({ ...f, receivedOn: e.target.value }))} />
                        </div>
                        <div className="flex items-end">
                          <Button size="sm" onClick={() => savePayout(c.id)}>Save</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}