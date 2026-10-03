"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Stethoscope,
  Plus,
  X,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Tag,
  HeartPulse,
  Users,
} from "lucide-react";
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
 * Animal health and disease log (gap-analysis row 5).
 *
 * The vaccination page already existed and could point at an animal, but
 * nothing else could: a keeper with tagged cattle could record that an animal
 * was vaccinated and then had nowhere to write "she limped on Tuesday". This
 * is that place, and the outbreak panel at the top is the reason it is worth
 * having — one animal's limp is a note, the same condition on three animals in
 * a fortnight is a vet call.
 */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const TYPES = [
  { id: "observation", label: "Noticed something" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "treatment", label: "Treatment" },
  { id: "check", label: "Check-up" },
  { id: "death", label: "Death" },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.id, t.label]));

export default function HealthPage() {
  const [records, setRecords] = React.useState<any[]>([]);
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [animals, setAnimals] = React.useState<any[]>([]);
  const [outbreaks, setOutbreaks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    type: "observation",
    condition: "",
    action: "",
    vetName: "",
    flockId: "",
    animalId: "",
    cost: "",
    notes: "",
  });

  const load = React.useCallback(() => {
    Promise.all([
      api.get("/api/health-records"),
      api.get("/api/flocks"),
      api.get("/api/animals"),
      api.get("/api/health-records/outbreaks"),
    ])
      .then(([r, f, a, o]) => {
        setRecords(Array.isArray(r) ? r : []);
        setFlocks(Array.isArray(f) ? f : []);
        setAnimals(Array.isArray(a) ? a : []);
        setOutbreaks(Array.isArray(o?.candidates) ? o.candidates : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({ type: "observation", condition: "", action: "", vetName: "", flockId: "", animalId: "", cost: "", notes: "" });
  };

  const submit = async () => {
    if (!form.condition.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/health-records", {
        type: form.type,
        condition: form.condition.trim(),
        action: form.action.trim() || null,
        vetName: form.vetName.trim() || null,
        flockId: form.flockId ? Number(form.flockId) : null,
        animalId: form.animalId ? Number(form.animalId) : null,
        cost: form.cost === "" ? null : Number(form.cost),
        notes: form.notes.trim() || null,
      });
      showToast("Saved", "success");
      setShowForm(false);
      resetForm();
      load();
    } catch (err: any) {
      showToast(err?.message ?? "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (id: number) => {
    try {
      await api.patch(`/api/health-records/${id}`, { resolvedAt: new Date().toISOString() });
      load();
    } catch {
      showToast("Could not update", "error");
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/health-records/${id}`);
      showToast("Deleted", "success");
      load();
    } catch {
      showToast("Could not delete", "error");
    }
  };

  // Animals belonging to the chosen flock, so the animal picker cannot offer an
  // animal from a different flock than the one selected.
  const animalsForFlock = React.useMemo(
    () => (form.flockId ? animals.filter((a) => String(a.flockId) === form.flockId) : animals),
    [animals, form.flockId]
  );

  return (
    <div className="space-y-6">
      {ToastComponent}
      <PageHeader
        title="Animal health"
        description="What happened to each animal, and what you did about it."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" />
            {showForm ? "Close" : "Record"}
          </Button>
        }
      />

      {outbreaks.length > 0 && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border-badge-orange-text/30 bg-badge-orange-bg/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-badge-orange-text">
                <AlertTriangle className="h-5 w-5" />
                Possible outbreak
              </CardTitle>
              <CardDescription>
                The same problem on more than one animal in the last 30 days. Worth a call to your vet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {outbreaks.map((o) => (
                <div key={o.condition} className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
                  <span className="font-medium text-wangari-heading">{o.condition}</span>
                  <Badge variant="orange">
                    <Users className="h-3 w-3 mr-1" />
                    {o.animalCount} animals
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {showForm && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5" />
                Record what happened
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>What kind of record</Label>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                        form.type === t.id
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
                <Label htmlFor="condition">What is wrong</Label>
                <Input
                  id="condition"
                  value={form.condition}
                  onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                  placeholder="In your own words — foot rot, limping, not eating"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="flock">Flock</Label>
                  <select
                    id="flock"
                    value={form.flockId}
                    onChange={(e) => setForm((f) => ({ ...f, flockId: e.target.value, animalId: "" }))}
                    className="flex h-11 w-full rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm text-wangari-heading focus-visible:outline-none focus-visible:border-wangari-green-500"
                  >
                    <option value="">Whole flock</option>
                    {flocks.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="animal">One animal</Label>
                  <select
                    id="animal"
                    value={form.animalId}
                    onChange={(e) => setForm((f) => ({ ...f, animalId: e.target.value }))}
                    className="flex h-11 w-full rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm text-wangari-heading focus-visible:outline-none focus-visible:border-wangari-green-500"
                  >
                    <option value="">Not one specific animal</option>
                    {animalsForFlock.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.tagNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="action">What you did</Label>
                  <Input
                    id="action"
                    value={form.action}
                    onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                    placeholder="Drug, dose, quarantine, advice"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vet">Vet</Label>
                  <Input
                    id="vet"
                    value={form.vetName}
                    onChange={(e) => setForm((f) => ({ ...f, vetName: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cost">Cost (KES)</Label>
                <Input
                  id="cost"
                  type="number"
                  inputMode="decimal"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div className="flex gap-3">
                <Button onClick={submit} disabled={saving || !form.condition.trim()}>
                  {saving ? "Saving" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-wangari-border/40" />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Stethoscope className="h-8 w-8" />}
          title="No health records yet"
          description="Record what you notice and what you do about it. Even a short note in your own words helps."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Record the first one
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-wangari-heading">{r.condition}</span>
                      <Badge variant={r.type === "death" ? "danger" : r.resolvedAt ? "success" : "default"}>
                        {r.resolvedAt ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
                        {r.resolvedAt ? "Resolved" : TYPE_LABEL[r.type] ?? r.type}
                      </Badge>
                      {r.animal?.tagNumber && (
                        <Badge variant="info">
                          <Tag className="h-3 w-3 mr-1" />
                          {r.animal.tagNumber}
                        </Badge>
                      )}
                    </div>
                    {r.action && <p className="text-sm text-wangari-text">{r.action}</p>}
                    <p className="text-xs text-wangari-muted">
                      {new Date(r.observedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      {r.flock?.name ? ` · ${r.flock.name}` : ""}
                      {r.vetName ? ` · ${r.vetName}` : ""}
                      {r.cost ? ` · KES ${Number(r.cost).toLocaleString("en-KE")}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!r.resolvedAt && (
                      <Button variant="ghost" size="icon" onClick={() => resolve(r.id)} aria-label="Mark resolved">
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Delete">
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