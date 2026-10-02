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

const HIVE_TYPE_SW: Record<string, string> = {
  langstroth: "Langstroth",
  topbar: "Top bar",
  traditional: "Kiasili",
  flow: "Flow",
};

const STATUS_SW: Record<string, string> = {
  active: "Inafanya kazi",
  weak: "Dhaifu",
  swarm: "Imetoka",
  dead: "Imefufa",
  requeened: "Malki mpya",
};

const STATUS_EMOJI: Record<string, string> = {
  active: "🐝",
  weak: "😟",
  swarm: "🧊",
  dead: "⚰️",
  requeened: "👑",
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
        "/hives"
      );
      setHives(res.hives || []);
      setTotals({
        totalHives: res.totalHives || 0,
        activeHives: res.activeHives || 0,
        totalHoneyKg: Number(res.totalHoneyKg || 0),
      });
    } catch {
      setError("Imeshindikana kupakia vizima.");
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
      await api.post("/hives", {
        name: form.name.trim(),
        hiveType: form.hiveType,
        frames: form.frames ? Number(form.frames) : null,
        location: form.location || null,
      });
      setForm({ name: "", hiveType: "langstroth", frames: "", location: "" });
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Kizima hakikijajazwa.");
    } finally {
      setSaving(false);
    }
  };

  const saveInspection = async (hiveId: number) => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/hives/${hiveId}/inspections`, insp);
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
      setError(e?.message || "Ukaguzi haujawekwa.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: number, status: string) => {
    try {
      await api.patch(`/hives/${id}`, { status });
      await load();
    } catch {
      setError("Imeshindikana kubadilisha hali ya kizima.");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Hexagon className="h-5 w-5 text-amber-600" aria-hidden />
            <h3 className="font-bold text-gray-900">Vizima</h3>
            <StatusChip
              tone={totals.activeHives > 0 ? "good" : "neutral"}
              label={`${totals.activeHives}/${totals.totalHives}`}
              emoji="🐝"
            />
          </div>
          {!adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Ongeza kizima
            </Button>
          ) : null}
        </div>

        {/* The colony is the unit. Say so plainly, it prevents the wrong mental model. */}
        <p className="text-sm text-gray-500">
          Unarekodi kizima, si nyuki. Kila kizima hana namba yake
          kwenye sanduku.
        </p>

        {totals.totalHives > 0 ? (
          <div className="flex gap-2">
            <StatusChip tone="good" emoji="🍯" label={`${totals.totalHoneyKg} kg asali`} />
            <StatusChip tone="neutral" emoji="🔍" label={`Ukaguzi: ${hives.reduce((n, h) => n + (h.inspections?.length || 0), 0)}`} />
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {adding ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-600">
                🔢 Namba ya kizima *
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="mfano 1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-12 rounded-xl text-lg"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-600">🛖 Aina</Label>
              <select
                value={form.hiveType}
                onChange={(e) => setForm({ ...form, hiveType: e.target.value })}
                className="w-full h-12 rounded-xl border border-gray-200 px-3"
              >
                <option value="langstroth">Langstroth</option>
                <option value="topbar">Top bar</option>
                <option value="traditional">Kiasili</option>
                <option value="flow">Flow</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-600">🪵 Frame</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.frames}
                  onChange={(e) => setForm({ ...form, frames: e.target.value })}
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-600">📍 Eneo</Label>
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
                Hifadhi kizima
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500">Inapakia vizima...</p>
        ) : hives.length === 0 ? (
          <EmptyState
            icon={<Hexagon className="h-8 w-8" />}
            title="Hakuna vizima bado"
            description="Ongeza kizima la kwanza, kisha rekodi ukaguzi wake."
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Ongeza kizima
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
                  className="rounded-2xl border border-gray-200 bg-white"
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-lg font-bold text-amber-700">
                        {h.name}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-gray-900">
                          Kizima {h.name}
                          {h.hiveType
                            ? ` · ${HIVE_TYPE_SW[h.hiveType] ?? h.hiveType}`
                            : ""}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {last
                            ? `Ukaguzi: ${last.broodFrames ?? 0} brood · ${last.storesFrames ?? 0} stores${
                                last.honeyKg ? ` · ${last.honeyKg} kg` : ""
                              }`
                            : "Hakuna ukaguzi bado"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusChip
                        tone={toneForStatus(h.status)}
                        emoji={STATUS_EMOJI[h.status]}
                        label={STATUS_SW[h.status]}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setInspecting(inspecting === h.id ? null : h.id)}
                      >
                        Ukaguzi
                      </Button>
                    </div>
                  </div>

                  {inspecting === h.id ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-4 py-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Stepper
                          label="Brood frames"
                          emoji="🥚"
                          value={insp.broodFrames}
                          onChange={(v) => setInsp({ ...insp, broodFrames: v })}
                        />
                        <Stepper
                          label="Stores (chakula)"
                          emoji="🍯"
                          value={insp.storesFrames}
                          onChange={(v) => setInsp({ ...insp, storesFrames: v })}
                        />
                        <Stepper
                          label="Varroa (mites)"
                          emoji="🕷️"
                          value={insp.varroaCount}
                          onChange={(v) => setInsp({ ...insp, varroaCount: v })}
                        />
                        <Stepper
                          label="Asali (kg)"
                          emoji="🍯"
                          step={0.5}
                          value={insp.honeyKg}
                          onChange={(v) => setInsp({ ...insp, honeyKg: v })}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setInsp({ ...insp, queenSeen: !insp.queenSeen })
                          }
                          className={cn(
                            "flex h-14 items-center gap-2 rounded-2xl px-4 text-sm font-bold",
                            insp.queenSeen
                              ? "bg-green-600 text-white"
                              : "bg-white text-gray-600 border border-gray-200"
                          )}
                        >
                          <Crown className="h-5 w-5" aria-hidden />
                          Malki imeonekana
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setInsp({ ...insp, queenCells: insp.queenCells ? 0 : 1 })
                          }
                          className={cn(
                            "flex h-14 items-center gap-2 rounded-2xl px-4 text-sm font-bold",
                            insp.queenCells
                              ? "bg-amber-500 text-white"
                              : "bg-white text-gray-600 border border-gray-200"
                          )}
                        >
                          <Bug className="h-5 w-5" aria-hidden />
                          Seli za malki
                        </button>
                      </div>

                      <Button
                        className="w-full"
                        onClick={() => saveInspection(h.id)}
                        disabled={saving}
                      >
                        {saving ? "Inaweka..." : "Hifadhi ukaguzi"}
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