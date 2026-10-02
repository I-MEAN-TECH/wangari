"use client";

import * as React from "react";
import { Tag, Download, X, Plus } from "lucide-react";
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
 *  - After that the farmer only ever LOOKS at them.
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

const STATUS_SW: Record<string, string> = {
  active: "Farm",
  sold: "Imezuzwa",
  moved: "Imehamishwa",
  died: "Imekufa",
  missing: "Haipo",
};

const STATUS_EMOJI: Record<string, string> = {
  active: "🐄",
  sold: "💸",
  moved: "🚚",
  died: "⚰️",
  missing: "❓",
};

export function FlockAnimalsPanel({ flockId }: { flockId?: number }) {
  const [animals, setAnimals] = React.useState<Animal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [tag, setTag] = React.useState<AnitracTagValue>({
    tagNumber: "141",
    mode: "exact",
  });

  const load = React.useCallback(async () => {
    try {
      const res = await api.get<{ animals: Animal[] }>(
        `/animals${flockId ? `?flockId=${flockId}` : ""}`
      );
      setAnimals(res.animals || []);
    } catch {
      setError("Could not load tags. Try again.");
    } finally {
      setLoading(false);
    }
  }, [flockId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body =
        tag.mode === "range"
          ? { tagStart: tag.tagNumber, tagEnd: tag.rangeEnd, flockId: flockId ?? null }
          : { tagNumber: tag.tagNumber, flockId: flockId ?? null };
      const res = await api.post<{ created?: number; animal?: Animal }>(
        "/animals",
        body
      );
      setNotice(
        tag.mode === "range"
          ? `${res.created} tags created`
          : "Tags saved"
      );
      setTag({ tagNumber: "141", mode: "exact" });
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
      await api.patch(`/animals/${id}`, { status });
      await load();
    } catch {
      setError("Imeshindikana kubadilisha hali ya mnyama.");
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
      setError("Imeshindikana kupakua orodha.");
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

          <div className="flex gap-2">
            {animals.length > 0 ? (
              <Button variant="outline" size="sm" onClick={downloadList}>
                <Download className="h-4 w-4" aria-hidden />
                Orodha
              </Button>
            ) : null}
            {!adding ? (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                  Add tags
              </Button>
            ) : null}
          </div>
        </div>

        {/* One calm line explaining why this is not extra daily work. */}
        <p className="text-sm text-wangari-muted">
          Enter a tag once. Then you keep recording the herd as a count,
          kawaida.
        </p>

        {notice ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
            ✅ {notice}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {adding ? (
          <div className="rounded-3xl border border-wangari-green-200 bg-wangari-green-50/40 p-3">
            <AnitracTagInput
              value={tag}
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-wangari-border bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-wangari-green-900">
                    {a.tagNumber}
                  </p>
                  <p className="truncate text-xs text-wangari-muted">
                    {a.breed || a.species || "Mnyama"}
                    {a.flock ? ` · ${a.flock.name}` : ""}
                  </p>
                </div>
                <StatusChip
                  tone={toneForStatus(a.status)}
                  emoji={STATUS_EMOJI[a.status]}
                  label={STATUS_SW[a.status]}
                />
              </li>
            ))}
          </ul>
        )}

        {animals.length > 0 ? (
          <p className="text-center text-xs text-wangari-muted">
            Tap the list to download a record of every tag — use it with your buyer
            au afisa wa wilaya.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default FlockAnimalsPanel;
