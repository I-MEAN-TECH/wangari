"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Plus, Trash2, Tag, AlertTriangle, Clock, Wallet } from "lucide-react";
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

export default function InsurancePage() {
  const [policies, setPolicies] = React.useState<any[]>([]);
  const [summary, setSummary] = React.useState<any>(null);
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { showToast, ToastComponent } = useToast();

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
    Promise.all([api.get("/api/insurance"), api.get("/api/insurance/summary"), api.get("/api/flocks")])
      .then(([p, s, f]) => {
        setPolicies(Array.isArray(p?.policies) ? p.policies : []);
        setSummary(s);
        setFlocks(Array.isArray(f) ? f : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
    </div>
  );
}