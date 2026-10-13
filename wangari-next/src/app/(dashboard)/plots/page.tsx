"use client";

import * as React from "react";
import { MapPin, Plus, Trash2, Leaf, History, Crosshair, FileCheck } from "lucide-react";
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
 * The plots page (farmer-requested gaps §2 B1/B2, plus B4 and B6).
 *
 * A crop farm is not one record with an acreage — it is several distinct plots
 * with different soil, crops and pest pressure, and almost every agronomy gap
 * followed from the missing plot. The backend and the migration for it already
 * existed; nothing rendered them, and no form sent a `plotId`, so the model was
 * unreachable from the app. This page and the crop form's picker are that last
 * mile.
 *
 * Two honesty rules carried over from the API, both visible here:
 *  - GPS is captured by tapping "use my location", never typed. A typo'd
 *    coordinate is worse than none: it looks like a traceable plot.
 *  - Yield is the farmer's OWN harvest against their OWN expected figure, and the
 *    word "estimate" is on the number. No variety potential from a research
 *    station is imported, because that is guidance for a district, not a target
 *    for this farmer.
 */

const kilos = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("en-KE")} kg`;

export default function PlotsPage() {
  const [plots, setPlots] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [history, setHistory] = React.useState<any>(null);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    name: "",
    areaValue: "",
    areaUnit: "acre",
    soilType: "",
    latitude: "",
    longitude: "",
    notes: "",
  });

  const load = React.useCallback(() => {
    api
      .get("/api/plots")
      .then((d: any) => {
        setPlots(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(load, [load]);

  const openHistory = async (id: number) => {
    setSelected(id);
    setHistoryLoading(true);
    setHistory(null);
    try {
      setHistory(await api.get(`/api/plots/${id}/history`));
    } catch {
      showToast("Could not load this plot's history");
    } finally {
      setHistoryLoading(false);
    }
  };

  /**
   * The farmer's own device location. Never typed by hand — a mistyped
   * coordinate is a plot that claims to be traceable and isn't.
   */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      showToast("This phone cannot give a location — you can leave this blank");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        showToast("Location captured", "success");
      },
      () => showToast("Could not read your location — you can leave this blank")
    );
  };

  const submit = async () => {
    if (!form.name.trim()) {
      showToast("Give the plot a name, e.g. Coffee block C");
      return;
    }
    setSaving(true);
    try {
      // Latitude and longitude travel as a PAIR or not at all: the server rejects
      // a lone coordinate, because one number is a point in the Indian Ocean.
      await api.post("/api/plots", {
        name: form.name,
        areaValue: form.areaValue || undefined,
        areaUnit: form.areaUnit,
        soilType: form.soilType || undefined,
        notes: form.notes || undefined,
        latitude: form.latitude || undefined,
        longitude: form.longitude || undefined,
      });
      showToast("Plot saved", "success");
      setShowForm(false);
      setForm({ name: "", areaValue: "", areaUnit: "acre", soilType: "", latitude: "", longitude: "", notes: "" });
      load();
    } catch (err: any) {
      showToast(err?.message || "Could not save the plot — please try again");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/plots/${id}`);
      if (selected === id) {
        setSelected(null);
        setHistory(null);
      }
      load();
    } catch {
      showToast("Could not remove the plot");
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {ToastComponent}
      <PageHeader
        title="My plots"
        description="Each piece of ground on its own — what grows there, in what order, and what it gave"
        action={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            Add a plot
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>What do you call this plot?</Label>
                <Input
                  placeholder="e.g. Coffee block C, Upper field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Size</Label>
                <Input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="e.g. 2.5"
                  value={form.areaValue}
                  onChange={(e) => setForm({ ...form, areaValue: e.target.value })}
                />
              </div>
              <div>
                <Label>Unit</Label>
                <select
                  value={form.areaUnit}
                  onChange={(e) => setForm({ ...form, areaUnit: e.target.value })}
                  className="h-10 w-full rounded-lg border border-wangari-border bg-white px-3 text-sm"
                >
                  <option value="acre">acres</option>
                  <option value="hectare">hectares</option>
                </select>
              </div>
              <div>
                <Label>Soil (optional)</Label>
                <Input
                  placeholder="e.g. loam, red clay"
                  value={form.soilType}
                  onChange={(e) => setForm({ ...form, soilType: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Location</Label>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button variant="outline" onClick={useMyLocation} type="button">
                    <Crosshair className="mr-2 h-4 w-4" />
                    Use my location
                  </Button>
                  <span className="text-xs text-wangari-muted">
                    {form.latitude && form.longitude
                      ? `${form.latitude}, ${form.longitude}`
                      : "Not recorded — tap while standing on the plot"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-wangari-muted">
                  A plot with a location is one a buyer can be shown. A typed coordinate that is wrong is worse
                  than none, which is why this is only ever captured from the phone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? "Saving…" : "Save plot"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-wangari-muted">Loading your plots…</p>
      ) : plots.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-8 w-8" />}
          title="No plots yet"
          description="Add the pieces of ground you farm. Crops, harvests and pest reports then hang off a real place instead of a name you typed once."
        />
      ) : (
        <div className="space-y-3">
          {plots.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-wangari-heading">{p.name}</p>
                    <p className="text-xs text-wangari-muted">
                      {p.areaValue ? `${Number(p.areaValue)} ${p.areaUnit === "hectare" ? "hectares" : "acres"}` : "size not set"}
                      {p.soilType ? ` · ${p.soilType}` : ""}
                      {p.latitude && p.longitude ? ` · ${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}` : " · no location"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openHistory(p.id)}>
                      <History className="mr-1 h-3.5 w-3.5" />
                      History
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>
                      <Trash2 className="h-3.5 w-3.5 text-tone-bad-text" />
                    </Button>
                  </div>
                </div>

                {(p.crops ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {p.crops.map((c: any) => (
                      <Badge key={c.id} variant="outline" className="text-[10px]">
                        <Leaf className="mr-1 h-3 w-3" />
                        {c.name}
                        {c.status !== "active" ? ` · ${c.status}` : ""}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-wangari-muted">
                    Nothing is growing here yet. Link a crop to this plot from the Crops page and its harvests
                    show up here.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* The history panel — rotation order and yield against the farmer's own
          expectation. Both are queries over records they already keep. */}
      {selected != null && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-wangari-heading">
                  {history?.plot?.name ?? "Plot"} · history
                </p>
                {history?.plot?.areaAcres != null && (
                  <p className="text-xs text-wangari-muted">
                    {history.plot.areaAcres} acres
                    {history.plot.areaUnit !== "acre" ? ` (${history.plot.areaValue} ${history.plot.areaUnit} as you recorded it)` : ""}
                  </p>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setSelected(null); setHistory(null); }}>
                Close
              </Button>
            </div>

            {historyLoading ? (
              <p className="py-4 text-center text-sm text-wangari-muted">Loading…</p>
            ) : !history ? (
              <p className="py-4 text-center text-sm text-wangari-muted">Nothing to show for this plot yet.</p>
            ) : (
              <>
                {(history.rotation?.steps ?? []).length === 0 ? (
                  <p className="text-sm text-wangari-muted">
                    No crops are linked to this plot yet, so there is no rotation to show.
                  </p>
                ) : (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-wangari-heading">What has grown here, in order</p>
                    <ol className="space-y-2">
                      {history.rotation.steps.map((s: any, i: number) => (
                        <li key={s.cropId} className="flex items-start gap-3 rounded-xl border border-wangari-border px-3 py-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-wangari-sunken text-[10px] font-bold text-wangari-muted">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-wangari-heading">
                              {s.name}
                              <span className="ml-2 text-[11px] font-normal text-wangari-muted">{s.cropType}</span>
                            </p>
                            <p className="text-[11px] text-wangari-muted">
                              {s.plantingDate ? `planted ${new Date(s.plantingDate).toLocaleDateString("en-KE")}` : "planting date not recorded"}
                              {s.harvestedKg > 0 ? ` · harvested ${kilos(s.harvestedKg)}` : " · nothing harvested"}
                              {s.fallowDays != null ? ` · ${s.fallowDays} days after the previous crop` : ""}
                            </p>
                            {s.repeatsPrevious && (
                              <p className="mt-0.5 text-[11px] text-tone-warn-text">
                                Same crop as the season before it — worth asking an agronomist about.
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {(history.yields ?? []).length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-wangari-heading">Harvest against what you expected</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wider text-wangari-subtle">
                            <th className="py-1 font-bold">Crop</th>
                            <th className="py-1 text-right font-bold">Harvested</th>
                            <th className="py-1 text-right font-bold">You expected</th>
                            <th className="py-1 text-right font-bold">Per acre (est.)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.yields.map((y: any) => (
                            <tr key={y.cropId} className="border-t border-wangari-border/50">
                              <td className="py-1.5 font-bold text-wangari-heading">{y.name}</td>
                              <td className="py-1.5 text-right tabular-nums">{kilos(y.harvestedKg)}</td>
                              <td className="py-1.5 text-right tabular-nums text-wangari-muted">
                                {y.expectedKg != null ? kilos(y.expectedKg) : "not stated"}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-wangari-muted">
                                {y.perAcreKg != null ? `${kilos(y.perAcreKg)}${y.perAcreBasis === "plot" ? " †" : ""}` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1 text-[11px] text-wangari-muted">
                      Estimates from your own records. † divided by the whole plot&apos;s area because the crop has no
                      acreage of its own.
                    </p>
                  </div>
                )}

                {history.basis && <p className="text-[11px] text-wangari-subtle">{history.basis}</p>}

                <div className="flex flex-wrap gap-2 border-t border-wangari-border pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const trace = await api.get(`/api/plots/${selected}/trace`);
                        const missing: string[] = trace?.missing ?? [];
                        showToast(
                          missing.length
                            ? `Traceability needs: ${missing.join(", ")}`
                            : `${trace?.harvestTotalKg ?? 0} kg traceable from this plot`,
                          missing.length ? "error" : "success"
                        );
                      } catch {
                        showToast("Could not build the trace");
                      }
                    }}
                  >
                    <FileCheck className="mr-2 h-4 w-4" />
                    What a buyer can trace
                  </Button>
                  <span className="self-center text-[11px] text-wangari-muted">
                    Your EUDR deadline is the day your buyer asks, not a date the EU serves on you.
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
