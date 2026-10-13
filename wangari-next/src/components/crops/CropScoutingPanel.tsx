"use client";

import * as React from "react";
import { Bug, Plus, X, Trash2, CalendarClock, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

/**
 * Structured pest scouting (gap report §2 B3).
 *
 * "Severity: high" is a feeling. "14 of 50 plants, larvae" is a number the
 * farmer can compare with last week's number, and that comparison is the whole
 * value of walking a field twice.
 *
 * Two rules carried from the API, both visible here:
 *  - NO action threshold. Whether to spray depends on crop, pest, stage and the
 *    price of the crop, and a threshold this app invented would be agronomic
 *    advice we are not qualified to give. We count and compare. The farmer and
 *    the agronomist decide.
 *  - Counts that do not add up (60 affected of 50 sampled) are SHOWN, not
 *    corrected. Clamping it would hide a data-entry habit that keeps recurring.
 */

const ISSUES = [
  { id: "pest", label: "Pest" },
  { id: "disease", label: "Disease" },
  { id: "weed", label: "Weed" },
  { id: "nutrient", label: "Nutrient" },
];

const STAGES = ["", "egg", "egg_mass", "larva", "nymph", "adult", "other"];

const TREND: Record<string, { label: string; cls: string }> = {
  rising: { label: "worse than last time", cls: "border-tone-bad-border text-tone-bad-text" },
  falling: { label: "better than last time", cls: "border-tone-good-border text-tone-good-text" },
  flat: { label: "about the same", cls: "border-wangari-border text-wangari-muted" },
  unknown: { label: "first count", cls: "border-wangari-border text-wangari-subtle" },
};

const ISSUE_LABEL: Record<string, string> = Object.fromEntries(ISSUES.map((i) => [i.id, i.label]));

export function CropScoutingPanel({ crops }: { crops: any[] }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    cropId: "",
    date: new Date().toISOString().slice(0, 10),
    issueType: "pest",
    description: "",
    severity: "low",
    sampleSize: "",
    affectedCount: "",
    pestStage: "",
    treatment: "",
    followUpOn: "",
  });

  const load = React.useCallback(() => {
    api
      .get("/api/scouting")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  React.useEffect(load, [load]);

  const save = async () => {
    if (!form.cropId) {
      showToast("Which crop did you walk?");
      return;
    }
    if (!form.description.trim()) {
      showToast("Say what you saw, in your own words");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/scouting", {
        cropId: Number(form.cropId),
        date: form.date,
        issueType: form.issueType,
        description: form.description.trim(),
        severity: form.severity,
        // Empty stays empty: a field nobody filled is not a zero count.
        sampleSize: form.sampleSize === "" ? null : Number(form.sampleSize),
        affectedCount: form.affectedCount === "" ? null : Number(form.affectedCount),
        pestStage: form.pestStage || null,
        treatment: form.treatment.trim() || null,
        followUpOn: form.followUpOn || null,
      });
      showToast("Walk recorded", "success");
      setShowForm(false);
      setForm((f) => ({ ...f, description: "", sampleSize: "", affectedCount: "", pestStage: "", treatment: "", followUpOn: "" }));
      load();
    } catch (err: any) {
      showToast(err?.message || "Could not save the walk");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/scouting/${id}`);
      load();
    } catch {
      showToast("Could not delete the record");
    }
  };

  const pressure: any[] = data?.crops ?? [];
  const followUps: any[] = data?.followUpsDue ?? [];
  const records: any[] = data?.records ?? [];

  return (
    <Card className="border border-wangari-border">
      {ToastComponent}
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Bug className="mt-0.5 h-4 w-4 text-wangari-green-800" />
            <div>
              <p className="text-sm font-bold text-wangari-gray-900">Pest scouting</p>
              <p className="text-[11px] text-wangari-gray-400">
                Write down how many out of how many. That is the only way this week's number can be compared with last
                week's — and we never tell you whether that means spray.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
            {showForm ? <X className="mr-1 h-3.5 w-3.5" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            {showForm ? "Close" : "Record a walk"}
          </Button>
        </div>

        {showForm && (
          <div className="space-y-3 rounded-xl border border-dashed border-wangari-border p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Which crop?</Label>
                <select
                  value={form.cropId}
                  onChange={(e) => setForm({ ...form, cropId: e.target.value })}
                  className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                >
                  <option value="">Choose…</option>
                  {crops.filter((c) => c.status !== "harvested").map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cropType})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">When did you walk it?</Label>
                <Input type="date" className="h-11 rounded-xl" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">What kind of problem?</Label>
                <select
                  value={form.issueType}
                  onChange={(e) => setForm({ ...form, issueType: e.target.value })}
                  className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                >
                  {ISSUES.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs">What did you see?</Label>
              <Input
                placeholder="e.g. fall armyworm on the whorls, three rows at the river end"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {/* The two counts are the entire point of the form. Kept side by
                side so a farmer reading them back can see the ratio at a glance. */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <Label className="text-xs">Plants you checked</Label>
                <Input type="number" inputMode="numeric" placeholder="e.g. 50" value={form.sampleSize} onChange={(e) => setForm({ ...form, sampleSize: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Of those, affected</Label>
                <Input type="number" inputMode="numeric" placeholder="e.g. 14" value={form.affectedCount} onChange={(e) => setForm({ ...form, affectedCount: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">How bad does it look?</Label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Stage (if you know)</Label>
                <select
                  value={form.pestStage}
                  onChange={(e) => setForm({ ...form, pestStage: e.target.value })}
                  className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                >
                  {STAGES.map((s) => (
                    <option key={s || "none"} value={s}>{s ? s.replace("_", " ") : "not sure"}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">What did you do about it?</Label>
                <Input placeholder="e.g. sprayed the lower block, called the vet" value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Look again on</Label>
                <Input type="date" className="h-11 rounded-xl" value={form.followUpOn} onChange={(e) => setForm({ ...form, followUpOn: e.target.value })} />
              </div>
            </div>

            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save the walk"}
            </Button>
          </div>
        )}

        {/* Follow-ups first: a date the farmer set themselves is the most
            actionable thing on this panel. */}
        {followUps.length > 0 && (
          <div className="rounded-xl border border-tone-warn-border bg-tone-warn-bg px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-tone-warn-text">
              <CalendarClock className="h-3.5 w-3.5" />
              You said you would look again
            </p>
            <ul className="mt-1 space-y-0.5">
              {followUps.slice(0, 4).map((r) => (
                <li key={r.id} className="text-[11px] text-wangari-muted">
                  {r.cropName} · {r.description} · due {new Date(r.followUpOn).toLocaleDateString("en-KE")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="h-16 animate-pulse rounded-xl bg-wangari-border/40" />
        ) : pressure.length === 0 ? (
          <EmptyState
            icon={<Bug className="h-7 w-7" />}
            title="No walks recorded yet"
            description="Record what you saw and how many plants you looked at. A crop you have not walked does not appear here at all — not looked at is not the same as nothing found."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-wangari-gray-100 text-left text-[10px] uppercase tracking-wider text-wangari-gray-400">
                  <th className="pb-2 pr-3">Block</th>
                  <th className="pb-2 pr-3">Last walked</th>
                  <th className="pb-2 pr-3">Found</th>
                  <th className="pb-2 pr-3 text-right">Of</th>
                  <th className="pb-2 pr-3 text-right">Share</th>
                  <th className="pb-2 pr-3">Compared with last time</th>
                  <th className="pb-2 text-right">To look at</th>
                </tr>
              </thead>
              <tbody>
                {pressure.map((c) => {
                  const t = TREND[c.latestTrend] ?? TREND.unknown;
                  const rows = records.filter((r) => r.cropId === c.cropId);
                  const latest = rows.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                  return (
                    <tr key={c.cropId} className="border-b border-wangari-gray-50 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-bold text-wangari-gray-900">{c.cropName}</span>
                        {c.cropType && <span className="ml-1.5 capitalize text-wangari-gray-400">{c.cropType}</span>}
                      </td>
                      <td className="py-2 pr-3 text-wangari-gray-500">
                        {c.latestDate ? new Date(c.latestDate).toLocaleDateString("en-KE") : "—"}
                      </td>
                      <td className="py-2 pr-3 text-wangari-gray-700">
                        {ISSUE_LABEL[c.latestIssue] ?? c.latestIssue}
                        {c.latestStage ? ` · ${String(c.latestStage).replace("_", " ")}` : ""}
                      </td>
                      <td className="py-2 pr-3 text-right text-wangari-gray-500">
                        {latest?.affectedCount != null ? latest.affectedCount : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-wangari-gray-500">
                        {latest?.sampleSize != null ? latest.sampleSize : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {c.latestIncidence != null ? (
                          <span className="font-bold text-wangari-gray-900">{c.latestIncidence}%</span>
                        ) : (
                          <span className="text-wangari-gray-300">no counts</span>
                        )}
                        <Badge variant="outline" className={`ml-2 text-[10px] ${t.cls}`}>{t.label}</Badge>
                      </td>
                      <td className="py-2 text-right text-wangari-gray-500">
                        {c.open > 0 ? <span className="font-bold text-tone-warn-text">{c.open}</span> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* The impossible pair, shown rather than corrected. */}
        {records.some((r) => r.affectedCount != null && r.sampleSize != null && r.affectedCount > r.sampleSize) && (
          <p className="flex items-start gap-1.5 rounded-xl bg-wangari-sunken px-3 py-2 text-[11px] text-wangari-muted">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tone-warn-text" />
            One entry says more plants were affected than were checked. It is kept exactly as recorded so you can fix the
            typo — nothing here silently corrects your numbers.
          </p>
        )}

        {records.length > 6 && (
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-wangari-gray-400">Recent walks</p>
            <ul className="divide-y divide-wangari-gray-50">
              {records.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-wangari-muted">
                    {new Date(r.date).toLocaleDateString("en-KE")} · {r.cropName} · {r.description}
                  </span>
                  <button onClick={() => remove(r.id)} aria-label="Delete walk" className="shrink-0 cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5 text-tone-bad-text" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CropScoutingPanel;
