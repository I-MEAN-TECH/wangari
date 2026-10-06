"use client";

import * as React from "react";
import {
  Tag,
  Download,
  X,
  Plus,
  Beef,
  Banknote,
  Truck,
  Skull,
  CircleHelp,
  CheckCircle2,
  ArrowRightLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusChip, toneForStatus } from "@/components/farmer-ui/status-chip";
import { AnitracTagInput, type AnitracTagValue } from "@/components/farmer-ui/anitrac-tag";
import api from "@/lib/api-client";

/**
 * FlockAnimalsPanel — ANITRAC tag identity, mounted inside the existing flocks
 * page (this is an EXTENSION of the flock screen, not a new module).
 *
 * The farmer's experience is deliberately tiny:
 *  - Flocks still get counted as a group, exactly as before. Nothing about the
 *    daily production habit changes.
 *  - Tags are registered ONCE, by tapping digits on a big keypad.
 *  - After that the farmer only ever LOOKS at them — plus, since M2, taps a
 *    tag to record where an animal went (the §20 movement ledger) and
 *    downloads the §16 register or the §6 county export.
 *
 * Kenya's ANITRAC rollout (2026) makes this worth having: cattle, sheep and
 * goats now carry a 15-digit number starting with 141, and a buyer or county
 * officer will ask for exactly the list this panel produces.
 */

interface Animal {
  id: number;
  tagNumber: string;
  species: string | null;
  breed: string | null;
  sex: string | null;
  status: string;
  flock: { id: number; name: string } | null;
  vaccinations: Array<{ id: number; vaccineName: string; status: string }>;
}

interface Movement {
  id: number;
  fromPremises: string;
  toPremises: string;
  movedAt: string;
  reason: string;
  permitRef: string | null;
}

const STATUS_EN: Record<string, string> = {
  active: "On farm",
  sold: "Sold",
  moved: "Moved",
  died: "Died",
  missing: "Missing",
};

const MOVEMENT_REASONS = [
  { value: "sale", label: "Sold" },
  { value: "transfer", label: "Moved to another farm" },
  { value: "grazing", label: "Taken to graze" },
  { value: "vet", label: "Went to the vet" },
  { value: "quarantine", label: "Quarantine" },
  { value: "other", label: "Other" },
];

/**
 * Subject icon per status, so the chip says what happened AND whether it is a
 * problem. The tone icon (tick / triangle / cross) is added by StatusChip
 * itself and is never replaced — the two together are the fixed status
 * language the farmer learns once.
 */
const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  active: Beef,
  sold: Banknote,
  moved: Truck,
  died: Skull,
  missing: CircleHelp,
};

export function FlockAnimalsPanel({ flockId }: { flockId?: number }) {
  const [animals, setAnimals] = React.useState<Animal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [tag, setTag] = React.useState<AnitracTagValue | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  // Movement ledger state: which animal's form is open, and its inputs.
  const [movementFor, setMovementFor] = React.useState<number | null>(null);
  const [movements, setMovements] = React.useState<Movement[]>([]);
  const [moveForm, setMoveForm] = React.useState({
    fromPremises: "",
    toPremises: "",
    reason: "transfer",
    movedAt: new Date().toISOString().slice(0, 10),
    permitRef: "",
  });
  const [moveSaving, setMoveSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ animals: Animal[] }>(
        `/api/animals${flockId ? `?flockId=${flockId}` : ""}`
      );
      setAnimals(res.animals || []);
    } catch {
      setError("Could not load the tags.");
    } finally {
      setLoading(false);
    }
  }, [flockId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!tag) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/animals", {
        tagNumber: tag.tagNumber,
        flockId,
      });
      setNotice("Tags saved. They now appear on the traceability list.");
      setTag(null);
      setAdding(false);
      await load();
      setTimeout(() => setNotice(null), 4000);
    } catch (e: any) {
      setError(e?.message || "Tags were not saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: number, status: string) => {
    try {
      await api.patch(`/api/animals/${id}`, { status });
      await load();
    } catch {
      setError("Could not update the animal status.");
    }
  };

  // ─── The §20 movement ledger: open an animal, see its trips, add one. ────
  const openMovements = async (id: number) => {
    if (movementFor === id) {
      setMovementFor(null);
      return;
    }
    setMovementFor(id);
    setMovements([]);
    setMoveForm({
      fromPremises: "",
      toPremises: "",
      reason: "transfer",
      movedAt: new Date().toISOString().slice(0, 10),
      permitRef: "",
    });
    try {
      const res = await api.get<{ movements: Movement[] }>(`/api/animals/${id}/movements`);
      setMovements(res.movements || []);
    } catch {
      // The form still works without history — never block the farmer on a
      // read that failed.
    }
  };

  const saveMovement = async (animalId: number) => {
    setMoveSaving(true);
    setError(null);
    try {
      await api.post(`/api/animals/${animalId}/movements`, {
        fromPremises: moveForm.fromPremises,
        toPremises: moveForm.toPremises,
        reason: moveForm.reason,
        movedAt: moveForm.movedAt,
        permitRef: moveForm.permitRef || undefined,
      });
      setNotice("Movement saved. It is now part of the animal's traceability chain.");
      setMovementFor(null);
      await load();
      setTimeout(() => setNotice(null), 4000);
    } catch (e: any) {
      setError(e?.message || "The movement was not saved. Check both places and try again.");
    } finally {
      setMoveSaving(false);
    }
  };

  /** Server-side CSV download — the server owns the register's shape. */
  const downloadCsv = async (path: string, label: string) => {
    try {
      const text = await api.get<string>(path);
      const blob = new Blob([String(text)], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the file.");
    }
  };

  const downloadList = async () => {
    try {
      const res = await api.get<{
        farm: any;
        count: number;
        generatedAt: string;
        animals: any[];
      }>("/animals/traceability/list");
      // A plain-text/CSV download keeps this dependency-free and openable on
      // any phone — a farmer can WhatsApp it straight to a buyer.
      const header = "tag_number,species,breed,sex,status,farm,county,generated";
      const rows = res.animals.map((a: any) =>
        [
          a.tagNumber,
          a.species || "",
          a.breed || "",
          a.sex || "",
          a.status,
          res.farm?.name || "",
          res.farm?.county || "",
          res.generatedAt,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      );
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wangari-anitrac-${res.farm?.code || "farm"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the list.");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-wangari-green-800" aria-hidden />
            <h3 className="font-bold text-wangari-green-900">
              ANITRAC tags
            </h3>
            <StatusChip
              tone={animals.length ? "good" : "neutral"}
              label={animals.length ? `${animals.length}` : "None"}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {animals.length > 0 ? (
              <>
                <Button variant="outline" size="sm" onClick={downloadList}>
                  <Download className="h-4 w-4" aria-hidden />
                  Export list
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("/api/animals/register.csv", "animal-register")}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  My register
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("/api/animals/county-export.csv", "county-animal-export")}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  County file
                </Button>
              </>
            ) : null}
            {!adding ? (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                  Add tags
              </Button>
            ) : null}
          </div>
        </div>

        {/* One calm line explaining why this is not extra daily work. */}<p className="text-sm text-wangari-muted">
          Enter a tag once. Then you keep recording the herd as a count.
        </p>

        {notice ? (
          <div className="flex items-start gap-2 rounded-xl border border-tone-good-border bg-tone-good-bg px-4 py-3 text-sm font-medium text-tone-good-text">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{notice}</span>
          </div>
        ) : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-tone-bad-border bg-tone-bad-bg px-4 py-3 text-sm font-medium text-tone-bad-text">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        {adding ? (
          <div className="rounded-2xl border border-wangari-green-200 bg-wangari-green-50/40 p-3">
            <AnitracTagInput
              value={tag ?? { tagNumber: "", mode: "exact" }}
              onChange={setTag}
              onConfirm={saving ? undefined : save}
            />
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1"
                onClick={save}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save tags"}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm text-wangari-muted">
                      Loading tags...
          </p>
        ) : animals.length === 0 ? (
          <EmptyState
            title="No tags yet"
            description="Add your animals' ANITRAC tags to get a traceability list."
            action={
              <Button onClick={() => setAdding(true)}>
                <Tag className="h-4 w-4" aria-hidden />
                First tag number
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {animals.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-wangari-border bg-white px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-bold text-wangari-green-900">
                      {a.tagNumber}
                    </p>
                    <p className="truncate text-xs text-wangari-muted">
                      {a.breed || a.species || "Animal"}
                      {a.flock ? ` · ${a.flock.name}` : ""}
                    </p>
                  </div>
                  <StatusChip
                    tone={toneForStatus(a.status)}
                    icon={STATUS_ICON[a.status]}
                    label={STATUS_EN[a.status] || a.status}
                  />
                </div>
                {/* §20: tap the movement icon to record where this animal went. */}
                <button
                  type="button"
                  onClick={() => openMovements(a.id)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-wangari-border px-2 py-2 text-xs font-semibold text-wangari-green-900 hover:bg-wangari-green-50"
                  aria-expanded={movementFor === a.id}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
                  {movementFor === a.id ? "Close movements" : "Movements"}
                </button>

                {movementFor === a.id ? (
                  <div className="mt-3 space-y-3 rounded-xl border border-wangari-green-200 bg-wangari-green-50/40 p-3">
                    {movements.length > 0 ? (
                      <ul className="space-y-1.5">
                        {movements.map((m) => (
                          <li key={m.id} className="text-xs text-wangari-muted">
                            {new Date(m.movedAt).toLocaleDateString()} — {m.fromPremises} →{" "}
                            {m.toPremises} ({MOVEMENT_REASONS.find((r) => r.value === m.reason)?.label || m.reason})
                            {m.permitRef ? ` · permit ${m.permitRef}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-wangari-muted">No movements recorded yet.</p>
                    )}
                    <div className="grid gap-2">
                      <input
                        className="h-11 rounded-xl border border-wangari-border px-3 text-sm"
                        placeholder="From (where it was)"
                        value={moveForm.fromPremises}
                        onChange={(e) => setMoveForm((f) => ({ ...f, fromPremises: e.target.value }))}
                      />
                      <input
                        className="h-11 rounded-xl border border-wangari-border px-3 text-sm"
                        placeholder="To (where it went)"
                        value={moveForm.toPremises}
                        onChange={(e) => setMoveForm((f) => ({ ...f, toPremises: e.target.value }))}
                      />
                      <select
                        className="h-11 rounded-xl border border-wangari-border bg-white px-3 text-sm"
                        value={moveForm.reason}
                        onChange={(e) => setMoveForm((f) => ({ ...f, reason: e.target.value }))}
                      >
                        {MOVEMENT_REASONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="h-11 rounded-xl border border-wangari-border px-3 text-sm"
                        value={moveForm.movedAt}
                        onChange={(e) => setMoveForm((f) => ({ ...f, movedAt: e.target.value }))}
                      />
                      <input
                        className="h-11 rounded-xl border border-wangari-border px-3 text-sm"
                        placeholder="Permit number (optional)"
                        value={moveForm.permitRef}
                        onChange={(e) => setMoveForm((f) => ({ ...f, permitRef: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        size="sm"
                        disabled={moveSaving || !moveForm.fromPremises.trim() || !moveForm.toPremises.trim()}
                        onClick={() => saveMovement(a.id)}
                      >
                        {moveSaving ? "Saving..." : "Save movement"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setMovementFor(null)}>
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {animals.length > 0 ? (
          <p className="text-center text-xs text-wangari-muted">
            Tap the list to download a record of every tag — use it with your buyer
            or the district officer.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default FlockAnimalsPanel;
