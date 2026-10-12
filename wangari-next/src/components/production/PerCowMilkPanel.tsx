"use client";

import * as React from "react";
import {
  Milk, Moon, Sun, Trash2, AlertTriangle, Info, Baby, CalendarDays, Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

/**
 * PerCowMilkPanel — WHICH cow gave the milk, and how much of the flock's milk
 * that actually explains.
 *
 * Why the coverage line is the most important thing here: the flock total and
 * the per-cow rows are different grains of fact (see
 * server/src/lib/per-cow-yield.ts). A farmer who records per-cow milkings for
 * three of five cows has NOT got a herd average — dividing 22 litres by three
 * cows would produce a confident wrong number. So this panel never invents a
 * per-cow figure from the flock total; it shows the gap and names the cows that
 * still need recording. A number the farmer cannot trust is worse than no
 * number, which is the rule the rest of this app already holds.
 *
 * The reproduction strip is here for the same reason: breeding records a farmer
 * has ALREADY entered (mating date, expected and actual birth) were sitting
 * unused. Days-in-milk and calving interval are pure arithmetic over that data
 * — no new table, and no invented benchmark to grade the farmer against.
 */

const SESSIONS: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "morning", label: "Morning", icon: Sun },
  { value: "evening", label: "Evening", icon: Moon },
  { value: "full_day", label: "Whole day", icon: Milk },
];

const SESSION_LABEL: Record<string, string> = {
  morning: "morning",
  evening: "evening",
  full_day: "whole day",
};

interface CowYield {
  animalId: number;
  label: string;
  flockId: number | null;
  daysRecorded: number;
  totalLitres: number;
  avgLitresPerRecordedDay: number | null;
  avgLitresPerWindowDay: number | null;
  lastRecordedOn: string | null;
  species: string | null;
  breed: string | null;
  flockName: string | null;
}

interface Coverage {
  attributedLitres: number;
  flockTotalLitres: number;
  unattributedLitres: number;
  coveragePct: number | null;
  cowsRecorded: number;
  cowsInHerd: number;
  cowsNotRecorded: number[];
  exceedsFlockTotal: boolean;
}

interface MilkingRow {
  id: number;
  animalId: number;
  date: string;
  session: string;
  milkLitres: number;
  notes: string | null;
}

interface PerCow {
  days: number;
  cows: CowYield[];
  herdTotalLitres: number;
  herdAvgPerRecordedDay: number | null;
  topCowAnimalId: number | null;
  coverage: Coverage;
  recent: MilkingRow[];
}

interface ReproCow {
  damName: string;
  daysInMilk: number | null;
  calvingIntervalsDays: number[];
  servicesPerConception: number | null;
  pendingServices: unknown[];
  calvingSoon: boolean;
}

interface Repro {
  herd: {
    cowCount: number;
    cowsWithCalvingRecord: number;
    meanCalvingIntervalDays: number | null;
    meanServicesPerConception: number | null;
    cowsPendingService: string[];
  };
  cows: ReproCow[];
}

/** Which animals are worth offering as a milk cow. */
const MILK_WORDS = /cattle|cow|dairy|goat|sheep|buffalo|sahiwal|friesian|jersey|boran/i;

function milkable(cows: CowYield[]): CowYield[] {
  // Anything the farmer already milks, plus anything whose species reads as a
  // dairy animal. A 300-bird house must not clutter this list — but on a small
  // mixed farm we would rather offer everyone than hide the cow behind a guess.
  const smallHerd = cows.length <= 8;
  return cows.filter(
    (c) => c.daysRecorded > 0 || smallHerd || MILK_WORDS.test(`${c.species ?? ""} ${c.breed ?? ""} ${c.flockName ?? ""}`)
  );
}

const litres = (n: number) => `${Math.round(Number(n) * 100) / 100} L`;

export function PerCowMilkPanel() {
  const [data, setData] = React.useState<PerCow | null>(null);
  const [repro, setRepro] = React.useState<Repro | null>(null);
  const [days, setDays] = React.useState(30);
  const [loading, setLoading] = React.useState(true);
  const [animalId, setAnimalId] = React.useState("");
  const [session, setSession] = React.useState("full_day");
  const [amount, setAmount] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<number | null>(null);
  const { showToast, ToastComponent } = useToast();

  const load = React.useCallback(async (d: number) => {
    setLoading(true);
    // allSettled: a farm with no breeding records must still get the milk half.
    const [c, r] = await Promise.allSettled([
      api.get(`/api/production/animals?days=${d}`),
      api.get("/api/production/repro"),
    ]);
    setData(c.status === "fulfilled" ? (c.value as PerCow) : null);
    setRepro(r.status === "fulfilled" ? (r.value as Repro) : null);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load(days);
  }, [days, load]);

  const cows = data?.cows ?? [];
  const options = React.useMemo(() => milkable(cows), [cows]);
  const byId = React.useMemo(
    () => new Map(cows.map((c) => [c.animalId, c])),
    [cows]
  );

  const save = async () => {
    const id = Number(animalId);
    if (!id) {
      showToast("Pick which cow gave the milk first");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/production/animal", {
        animalId: id,
        date: new Date().toISOString().split("T")[0],
        session,
        milkLitres: Number(amount || 0),
      });
      setAmount("");
      showToast("Milk recorded for that cow");
      await load(days);
    } catch (err: any) {
      showToast(err?.message || "Could not save — please try again");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setRemovingId(id);
    try {
      await api.delete(`/api/production/animal/${id}`);
      await load(days);
    } catch {
      showToast("Could not remove that record");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          {/* The heading stays while loading: a bare spinner leaves the farmer
              unsure which panel is fetching. */}
          <div className="flex items-center gap-2">
            <Milk className="h-5 w-5 text-wangari-green-800" aria-hidden />
            <h2 className="text-lg font-semibold text-wangari-heading">Per-cow milk</h2>
          </div>
          <p className="py-4 text-center text-sm text-wangari-muted">Loading per-cow records…</p>
        </CardContent>
      </Card>
    );
  }

  // No animals at all: the panel is not broken, it has nothing to record
  // against. Say so instead of showing an empty table.
  if (cows.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <div className="flex items-center gap-2">
            <Milk className="h-4 w-4 text-wangari-green-800" aria-hidden />
            <p className="font-semibold text-wangari-heading">Per-cow milk</p>
          </div>
          <p className="text-xs text-wangari-muted">
            Add the animals in your herd and you can record which cow gave the milk — the detail the
            flock total cannot tell you.
          </p>
        </CardContent>
      </Card>
    );
  }

  const cov = data?.coverage;
  const reproHerd = repro?.herd;
  const reproCows = (repro?.cows ?? []).filter(
    (c) => c.daysInMilk != null || c.pendingServices.length > 0
  );

  return (
    <Card>
      {ToastComponent}
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Milk className="h-5 w-5 text-wangari-green-800" aria-hidden />
            <h2 className="text-lg font-semibold text-wangari-heading">Per-cow milk</h2>
          </div>
          <div className="flex gap-1 rounded-xl bg-wangari-sunken p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`cursor-pointer rounded-lg px-3 py-1 text-[11px] font-bold transition-all ${
                  days === d ? "bg-white text-wangari-green-800 shadow-sm" : "text-wangari-muted"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Coverage — the honesty line. Never a per-cow figure invented from
            the flock total; always the gap, stated plainly. */}
        {cov ? (
          <div
            className={`rounded-xl border px-4 py-3 ${
              cov.exceedsFlockTotal ? "border-tone-warn-border bg-tone-warn-bg" : "border-wangari-border bg-wangari-cream"
            }`}
          >
            <div className="flex items-center gap-2">
              {cov.exceedsFlockTotal ? (
                <AlertTriangle className="h-4 w-4 text-tone-warn-text" aria-hidden />
              ) : (
                <Info className="h-4 w-4 text-wangari-muted" aria-hidden />
              )}
              <p className="text-sm font-semibold text-wangari-heading">
                {cov.cowsRecorded} of {cov.cowsInHerd} cows recorded
                {cov.coveragePct != null ? ` · ${cov.coveragePct}% of the flock total` : ""}
              </p>
            </div>
            {cov.exceedsFlockTotal ? (
              <p className="mt-1 text-xs text-tone-warn-text">
                The per-cow figures add up to more than the flock total you logged for these {data?.days}{" "}
                days. One of the two was entered wrongly — check before you quote either number.
              </p>
            ) : cov.coveragePct == null ? (
              <p className="mt-1 text-xs text-wangari-muted">
                No flock total was logged in this window, so there is nothing to compare the per-cow
                figures against yet.
              </p>
            ) : cov.unattributedLitres > 0.01 ? (
              <p className="mt-1 text-xs text-wangari-muted">
                {litres(cov.unattributedLitres)} of the {litres(cov.flockTotalLitres)} flock total is not
                attributed to a cow. Record those cows to trust a per-cow average.
              </p>
            ) : (
              <p className="mt-1 text-xs text-tone-good-text">
                Every litre in the flock total is attributed to a cow.
              </p>
            )}
          </div>
        ) : null}

        {/* Capture — one cow, one milking. Re-posting the same cow and session
            corrects the figure rather than adding a second one. */}
        <div className="space-y-2 rounded-xl border border-dashed p-3">
          <p className="text-sm font-medium">Record today&apos;s milk for one cow</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="per-cow-animal">Which cow</Label>
              <select
                id="per-cow-animal"
                value={animalId}
                onChange={(e) => setAnimalId(e.target.value)}
                className="h-10 w-full rounded-lg border border-wangari-border bg-white px-3 text-sm"
              >
                <option value="">Choose a cow…</option>
                {options.map((c) => (
                  <option key={c.animalId} value={c.animalId}>
                    {c.label}
                    {c.flockName ? ` · ${c.flockName}` : ""}
                    {c.daysRecorded > 0 ? ` · avg ${litres(c.avgLitresPerRecordedDay ?? 0)}/day` : " · no records yet"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="per-cow-litres">Litres</Label>
              <Input
                id="per-cow-litres"
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder="e.g. 8.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1 rounded-xl bg-wangari-sunken p-1">
              {SESSIONS.map((s) => {
                const Icon = s.icon;
                const active = session === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSession(s.value)}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                      active ? "bg-white text-wangari-green-800 shadow-sm" : "text-wangari-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <Button
              onClick={save}
              disabled={saving || !animalId}
              className="bg-wangari-green-800 font-bold hover:bg-wangari-green-900"
            >
              {saving ? "Saving…" : "Save milk"}
            </Button>
          </div>
        </div>

        {/* Today's (and recent) rows, so a mistake is visible and fixable. */}
        {(data?.recent ?? []).length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-wangari-heading">Recent milkings</p>
            <ul className="divide-y">
              {(data?.recent ?? []).slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {byId.get(r.animalId)?.label ?? `Animal #${r.animalId}`} · {litres(r.milkLitres)}
                    </p>
                    <p className="text-xs text-wangari-muted">
                      {new Date(r.date).toLocaleDateString("en-KE")} · {SESSION_LABEL[r.session] ?? r.session}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    disabled={removingId === r.id}
                    aria-label={`Remove the ${litres(r.milkLitres)} record`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-tone-bad-text" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-wangari-muted">
            No per-cow milkings yet in this window. The flock total above stays the daily record —
            this is the bit that tells you which cow is paying for her feed.
          </p>
        )}

        {/* Per-cow table — the best producer first, unrecorded cows kept. */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="pb-1 text-left text-xs font-semibold text-wangari-heading">
              Each cow over the last {data?.days} days
            </caption>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-wangari-subtle">
                <th className="py-1 font-bold">Cow</th>
                <th className="py-1 text-right font-bold">Total</th>
                <th className="py-1 text-right font-bold">Per day recorded</th>
                <th className="py-1 text-right font-bold">Days</th>
                <th className="py-1 text-right font-bold">Last</th>
              </tr>
            </thead>
            <tbody>
              {cows.slice(0, 12).map((c) => (
                <tr key={c.animalId} className="border-t border-wangari-border/50">
                  <td className="py-1.5 font-bold text-wangari-heading">
                    {c.label}
                    {c.animalId === data?.topCowAnimalId ? (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold text-tone-good-text">
                        <Check className="h-3 w-3" aria-hidden /> top
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{litres(c.totalLitres)}</td>
                  <td className="py-1.5 text-right tabular-nums text-wangari-muted">
                    {c.avgLitresPerRecordedDay != null ? litres(c.avgLitresPerRecordedDay) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-wangari-muted">{c.daysRecorded}</td>
                  <td className="py-1.5 text-right text-wangari-muted">
                    {c.lastRecordedOn ? new Date(c.lastRecordedOn).toLocaleDateString("en-KE") : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reproduction — pure arithmetic over breeding rows already entered. */}
        {reproCows.length > 0 ? (
          <div className="space-y-2 border-t border-wangari-border pt-3">
            <div className="flex items-center gap-2">
              <Baby className="h-4 w-4 text-wangari-green-800" aria-hidden />
              <p className="text-sm font-semibold text-wangari-heading">Breeding timeline</p>
            </div>
            {reproHerd && (reproHerd.meanCalvingIntervalDays != null || reproHerd.meanServicesPerConception != null) ? (
              <p className="text-xs text-wangari-muted">
                {/* The farmer's OWN figures. No target, no grade — the comparison
                    is theirs to make, not ours to assert. */}
                {reproHerd.meanCalvingIntervalDays != null
                  ? `Average calving interval ${reproHerd.meanCalvingIntervalDays} days`
                  : "No calving interval yet"}
                {reproHerd.meanServicesPerConception != null
                  ? ` · ${reproHerd.meanServicesPerConception} services per conception`
                  : ""}
                {reproHerd.cowsPendingService.length > 0
                  ? ` · ${reproHerd.cowsPendingService.length} waiting on a service`
                  : ""}
              </p>
            ) : null}
            <ul className="divide-y">
              {reproCows.slice(0, 8).map((c) => (
                <li key={c.damName} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.damName}</p>
                    <p className="text-xs text-wangari-muted">
                      {c.daysInMilk != null ? `${c.daysInMilk} days in milk` : "no birth recorded yet"}
                      {c.calvingIntervalsDays.length > 0
                        ? ` · last interval ${c.calvingIntervalsDays[c.calvingIntervalsDays.length - 1]} days`
                        : ""}
                    </p>
                  </div>
                  {c.calvingSoon ? (
                    <span className="shrink-0 rounded-full border border-tone-good-border bg-tone-good-bg px-2 py-0.5 text-[10px] font-bold text-tone-good-text">
                      calving soon
                    </span>
                  ) : c.pendingServices.length > 0 ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-tone-warn-border bg-tone-warn-bg px-2 py-0.5 text-[10px] font-bold text-tone-warn-text">
                      <CalendarDays className="h-3 w-3" aria-hidden />
                      service pending
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-wangari-muted">
              Worked out from the breeding records you already keep. A date you have not recorded is
              left blank rather than guessed.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default PerCowMilkPanel;
