"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Thermometer, Plus, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
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
 * Cold chain readings (gap-analysis row 15).
 *
 * A batch used to hold one temperature, written once. An avocado export is
 * rejected for an excursion nobody measured, so the buyer asks for the curve.
 *
 * This page shows that curve and the three things a farmer actually needs from
 * it: did it ever go too warm, how long from harvest to cold, and is the load
 * sellable. Readings are appended, never edited — a deletable temperature is
 * not evidence.
 */

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const STATE_STYLE: Record<string, { variant: any; icon: any; label: string }> = {
  clean: { variant: "success", icon: CheckCircle2, label: "Chain held" },
  excursion: { variant: "warning", icon: AlertTriangle, label: "Wobbled" },
  broken: { variant: "danger", icon: XCircle, label: "Broken" },
  unknown: { variant: "outline", icon: Clock, label: "No readings" },
};

export default function ColdChainPage() {
  const [crops, setCrops] = React.useState<any[]>([]);
  const [cropId, setCropId] = React.useState("");
  const [batches, setBatches] = React.useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [temp, setTemp] = React.useState("");
  const [stage, setStage] = React.useState("coldroom");
  const [saving, setSaving] = React.useState(false);
  const { showToast, ToastComponent } = useToast();

  const loadCrops = React.useCallback(() => {
    api
      .get("/api/crops")
      .then((c) => {
        const list = Array.isArray(c) ? c : [];
        setCrops(list);
        setLoading(false);
        if (list.length > 0) setCropId(String(list[0].id));
      })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadCrops();
  }, [loadCrops]);

  const loadBatches = React.useCallback((id: string) => {
    if (!id) {
      setBatches([]);
      return;
    }
    api
      .get(`/api/crops/${id}/post-harvest`)
      .then((b) => {
        const list = Array.isArray(b) ? b : [];
        setBatches(list);
        // Default to the newest batch: the one that just came out of the field
        // is the one whose temperature matters today.
        setSelectedBatch(list.length > 0 ? list[0].id : null);
        setDetail(null);
      })
      .catch(() => setBatches([]));
  }, []);

  React.useEffect(() => {
    loadBatches(cropId);
  }, [cropId, loadBatches]);

  const loadDetail = React.useCallback((id: number) => {
    api.get(`/api/cold-chain/${id}`).then(setDetail).catch(() => setDetail(null));
  }, []);

  React.useEffect(() => {
    if (selectedBatch) loadDetail(selectedBatch);
  }, [selectedBatch, loadDetail]);

  const addReading = async () => {
    const value = Number(temp);
    if (!Number.isFinite(value)) return;
    setSaving(true);
    try {
      const res = await api.post(`/api/cold-chain/${selectedBatch}`, { tempC: value, stage });
      // The server re-assesses on write and returns the current state, so the
      // card updates without a second round trip.
      setDetail((d: any) => (d ? { ...d, assessment: res.assessment, readings: [...d.readings, res.reading] } : d));
      setTemp("");
      showToast("Reading added", "success");
    } catch (err: any) {
      showToast(err?.message ?? "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const assessment = detail?.assessment;
  const style = STATE_STYLE[assessment?.state ?? "unknown"];

  return (
    <div className="space-y-6">
      {ToastComponent}
      <PageHeader
        title="Cold chain"
        description="The temperature history a buyer asks for, not a single number."
      />

      {crops.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="crop">Crop</Label>
          <select
            id="crop"
            value={cropId}
            onChange={(e) => setCropId(e.target.value)}
            className="flex h-11 w-full max-w-xs rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm text-wangari-heading focus-visible:outline-none focus-visible:border-wangari-green-500"
          >
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {batches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {batches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBatch(b.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                selectedBatch === b.id
                  ? "bg-wangari-green-800 text-white"
                  : "border border-wangari-border bg-white text-wangari-muted"
              }`}
            >
              {b.batchCode}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-wangari-border/40" />
      ) : batches.length === 0 ? (
        <EmptyState
          icon={<Thermometer className="h-8 w-8" />}
          title="No harvest batches yet"
          description="Create a batch on a crop after harvesting, then record its temperatures here."
        />
      ) : (
        detail && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
            <Card className={assessment?.state === "broken" ? "border-badge-red-text/40" : ""}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <Thermometer className="h-5 w-5" />
                  {detail.batch.batchCode}
                  <span className="text-sm font-normal text-wangari-muted">
                    {detail.batch.crop?.name} · {Number(detail.batch.quantityKg ?? 0).toLocaleString("en-KE")} kg
                  </span>
                  <Badge variant={style.variant}>{style.label}</Badge>
                </CardTitle>
                <CardDescription>{assessment?.message}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-wangari-muted">Warmest</p>
                    <p className="text-lg font-bold text-wangari-heading">
                      {assessment?.peakTempC != null ? `${assessment.peakTempC}°C` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-wangari-muted">Average</p>
                    <p className="text-lg font-bold text-wangari-heading">
                      {assessment?.averageTempC != null ? `${assessment.averageTempC}°C` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-wangari-muted">Above 8°C</p>
                    <p className="text-lg font-bold text-wangari-heading">
                      {assessment?.hoursAboveThreshold ?? 0} hrs
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-wangari-muted">Time to cool</p>
                    <p className="text-lg font-bold text-wangari-heading">
                      {assessment?.hoursToCool != null ? `${assessment.hoursToCool} hrs` : "—"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-wangari-border pt-4">
                  <Label htmlFor="temp">Record a reading</Label>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-2">
                      <Input
                        id="temp"
                        type="number"
                        inputMode="decimal"
                        value={temp}
                        onChange={(e) => setTemp(e.target.value)}
                        placeholder="e.g. 5"
                        className="w-32"
                      />
                    </div>
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                      aria-label="Where the reading was taken"
                      className="flex h-11 rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm text-wangari-heading focus-visible:outline-none focus-visible:border-wangari-green-500"
                    >
                      <option value="field">Field</option>
                      <option value="truck">Truck</option>
                      <option value="coldroom">Cold room</option>
                      <option value="store">Store</option>
                    </select>
                    <Button onClick={addReading} disabled={saving || !temp}>
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Readings</CardTitle>
                <CardDescription>
                  Newest last. A batch that never broke 8°C is export-ready; one that did is a conversation with your
                  buyer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(detail.readings ?? []).length === 0 ? (
                  <p className="text-sm text-wangari-muted">
                    No readings yet. Take one when the batch reaches the cold room.
                  </p>
                ) : (
                  detail.readings.map((r: any) => {
                    const t = Number(r.tempC);
                    const hot = t > 8;
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                          hot ? "bg-badge-red-bg/50" : "bg-wangari-green-50/60"
                        }`}
                      >
                        <span className="font-medium text-wangari-heading">{t}°C</span>
                        <span className="text-xs text-wangari-muted">
                          {r.stage} ·{" "}
                          {new Date(r.recordedAt).toLocaleString("en-KE", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </motion.div>
        )
      )}
    </div>
  );
}