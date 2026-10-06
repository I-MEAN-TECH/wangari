"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Hexagon,
  Plus,
  Crown,
  Bug,
  X,
  Check,
  Loader2,
  Birdhouse,
  Droplets,
  Search,
  Egg,
  CircleAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusChip, toneForStatus } from "@/components/farmer-ui/status-chip";
import { Stepper } from "@/components/farmer-ui/stepper";
import api from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * HivePanel — beekeeping, where the unit is the COLONY, never the bee.
 *
 * A hive holds tens of thousands of bees and no beekeeper counts, tags or
 * identifies an individual bee. So this mirrors exactly how a flock works for
 * poultry: you register the box once (a beekeeper paints a number on it),
 * then log one short row per inspection.
 *
 * What gets recorded is what an apiary logbook actually tracks: colony
 * strength (brood frames), stores, whether the queen was seen, queen cells
 * (swarm risk), varroa counts, and honey harvested.
 */

interface Hive {
  id: number;
  name: string;
  hiveType: string | null;
  status: string;
  queenYear: number | null;
  queenStatus: string | null;
  frames: number | null;
  location: string | null;
  inspections: Inspection[];
}

interface Inspection {
  id: number;
  inspectedAt: string;
  broodFrames: number | null;
  storesFrames: number | null;
  queenSeen: boolean | null;
  queenCells: number | null;
  varroaCount: number | null;
  honeyKg: number | null;
  actionTaken: string | null;
}

const HIVE_TYPE_LABELS: Record<string, string> = {
  langstroth: "Langstroth",
  topbar: "Top bar",
  traditional: "Traditional",
  flow: "Flow",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Working",
  weak: "Weak",
  swarm: "Swarmed",
  dead: "Dead",
  requeened: "Requeened",
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  active: Birdhouse,
  weak: CircleAlert,
  swarm: Droplets,
  dead: X,
  requeened: Crown,
};

const HIVE_TYPE_ICON: Record<string, React.ReactNode> = {
  langstroth: <Hexagon className="h-4 w-4" aria-hidden />,
  topbar: <Hexagon className="h-4 w-4" aria-hidden />,
  traditional: <Hexagon className="h-4 w-4" aria-hidden />,
  flow: <Hexagon className="h-4 w-4" aria-hidden />,
};

export function HivePanel() {
  const [hives, setHives] = React.useState<Hive[]>([]);
  const [totals, setTotals] = React.useState({
    totalHives: 0,
    activeHives: 0,
    totalHoneyKg: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [inspecting, setInspecting] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    name: "",
    hiveType: "langstroth",
    frames: "",
    location: "",
  });
  const [insp, setInsp] = React.useState({
    broodFrames: 0,
    storesFrames: 0,
    queenSeen: true,
    queenCells: 0,
    varroaCount: 0,
    honeyKg: 0,
  });

  const load = React.useCallback(async () => {
    try {
      const res = await api.get<typeof hives & { hives: Hive[]; totalHives: number; activeHives: number; totalHoneyKg: number }>(
        "/api/hives"
      );
      setHives(res.hives || []);
      setTotals({
        totalHives: res.totalHives || 0,
        activeHives: res.activeHives || 0,
        totalHoneyKg: Number(res.totalHoneyKg || 0),
      });
    } catch {
      setError("Could not load hives.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const addHive = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/hives", {
        name: form.name.trim(),
        hiveType: form.hiveType,
        frames: form.frames ? Number(form.frames) : null,
        location: form.location || null,
      });
      setForm({ name: "", hiveType: "langstroth", frames: "", location: "" });
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Hive was not saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveInspection = async (hiveId: number) => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/inspections`, insp);
      setInspecting(null);
      setInsp({
        broodFrames: 0,
        storesFrames: 0,
        queenSeen: true,
        queenCells: 0,
        varroaCount: 0,
        honeyKg: 0,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || "Inspection not saved.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: number, status: string) => {
    try {
      await api.patch(`/api/hives/${id}`, { status });
      await load();
    } catch {
      setError("Could not update hive status.");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Hexagon className="h-5 w-5 text-tone-warn-text" aria-hidden />
            <h3 className="font-bold text-wangari-heading">Hives</h3>
            <StatusChip
              tone={totals.activeHives > 0 ? "good" : "neutral"}
              label={`${totals.activeHives}/${totals.totalHives}`}
            />
          </div>
          {!adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add hive
            </Button>
          ) : null}
        </div>

        {/* The colony is the unit. Say so plainly, it prevents the wrong mental model. */}
        <p className="text-sm text-wangari-muted">
          You record the hive, not the bee. Each hive has its own number
          with its own number.
        </p>

        {totals.totalHives > 0 ? (
          <div className="flex gap-2">
            <StatusChip tone="good" icon={Droplets} label={`${totals.totalHoneyKg} kg honey`} />
            <StatusChip tone="neutral" icon={Search} label={`Inspections: ${hives.reduce((n, h) => n + (h.inspections?.length || 0), 0)}`} />
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-tone-bad-border bg-tone-bad-bg px-4 py-3 text-sm font-semibold text-tone-bad-text">
            {error}
          </div>
        ) : null}

        {adding ? (
          <div className="rounded-2xl border border-tone-warn-border bg-tone-warn-bg p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">
                Hive number *
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-12 rounded-xl text-lg"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">Type</Label>
              <select
                value={form.hiveType}
                onChange={(e) => setForm({ ...form, hiveType: e.target.value })}
                className="w-full h-12 rounded-xl border border-wangari-border px-3"
              >
                <option value="langstroth">Langstroth</option>
                <option value="topbar">Top bar</option>
                <option value="traditional">Traditional</option>
                <option value="flow">Flow</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-wangari-muted">Frame</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.frames}
                  onChange={(e) => setForm({ ...form, frames: e.target.value })}
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-wangari-muted">Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="h-12 rounded-xl"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={addHive} disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  Save hive
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm text-wangari-muted">Loading hives...</p>
        ) : hives.length === 0 ? (
          <EmptyState
            icon={<Hexagon className="h-8 w-8" />}
            title="No hives yet"
            description="Add your first hive, then record its inspections."
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Add hive
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {hives.map((h) => {
              const last = h.inspections?.[0];
              return (
                <li
                  key={h.id}
                  className="rounded-2xl border border-wangari-border bg-white"
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-wangari-green-100 text-lg font-bold text-tone-warn-text">
                        {h.name}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-wangari-heading">
                          Hive {h.name}
                          {h.hiveType
                            ? ` · ${HIVE_TYPE_LABELS[h.hiveType] ?? h.hiveType}`
                            : ""}
                        </p>
                        <p className="truncate text-xs text-wangari-muted">
                          {last
                            ? `Inspection: ${last.broodFrames ?? 0} brood · ${last.storesFrames ?? 0} stores${
                                last.honeyKg ? ` · ${last.honeyKg} kg` : ""
                              }`
                            : "No inspections yet"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusChip
                        tone={toneForStatus(h.status)}
                        icon={STATUS_ICON[h.status]}
                        label={STATUS_LABELS[h.status]}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setInspecting(inspecting === h.id ? null : h.id)}
                      >
                        Inspect
                      </Button>
                    </div>
                  </div>

                  {inspecting === h.id ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-3 border-t border-wangari-border bg-wangari-cream px-4 py-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Stepper
                          label="Brood frames"
                          icon={Egg}
                          value={insp.broodFrames}
                          onChange={(v) => setInsp({ ...insp, broodFrames: v })}
                        />
                        <Stepper
                          label="Stores (food)"
                          icon={Droplets}
                          value={insp.storesFrames}
                          onChange={(v) => setInsp({ ...insp, storesFrames: v })}
                        />
                        <Stepper
                          label="Varroa (mites)"
                          icon={Bug}
                          value={insp.varroaCount}
                          onChange={(v) => setInsp({ ...insp, varroaCount: v })}
                        />
                        <Stepper
                          label="Honey (kg)"
                          icon={Droplets}
                          step={0.5}
                          value={insp.honeyKg}
                          onChange={(v) => setInsp({ ...insp, honeyKg: v })}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={insp.queenSeen ? "default" : "outline"}
                          onClick={() => setInsp({ ...insp, queenSeen: !insp.queenSeen })}
                          aria-pressed={insp.queenSeen}
                        >
                          <Crown className="h-4 w-4" aria-hidden />
                          Queen seen
                        </Button>
                        <Button
                          type="button"
                          variant={insp.queenCells ? "default" : "outline"}
                          onClick={() =>
                            setInsp({ ...insp, queenCells: insp.queenCells ? 0 : 1 })
                          }
                          aria-pressed={!!insp.queenCells}
                        >
                          <Bug className="h-4 w-4" aria-hidden />
                          Queen cells
                        </Button>
                      </div>

                      <Button
                        className="w-full"
                        onClick={() => saveInspection(h.id)}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save inspection"}
                      </Button>
                    </motion.div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default HivePanel;