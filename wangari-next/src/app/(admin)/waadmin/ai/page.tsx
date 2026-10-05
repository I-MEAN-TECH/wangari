"use client";

import * as React from "react";
import { adminApi } from "@/lib/admin-client";
import {
  Bot, Plus, Play, CheckCircle2, XCircle, AlertTriangle, Trash2, Rocket,
  RefreshCw, Search, Settings2, KeyRound, Gauge, ShieldCheck,
} from "lucide-react";
import {
  canActivate, activateBlockedReason, latencyBand, formatSeconds, canDelete,
  costLabel, sourceLabel, validateSettings, parseSetting,
} from "@/lib/ai-admin-decisions";

/**
 * Super-admin AI control room.
 *
 * Two ideas drive the whole layout:
 *
 * 1. NOTHING IS ACTIVATABLE UNTIL IT HAS PASSED A TEST. The server enforces
 *    this too — this UI mirrors the rule rather than inventing it. A model
 *    that cannot chain two tool calls answers a chat fine and then leaves the
 *    screen quiet halfway through recording a sale, and that failure should
 *    never be discovered by a farmer during a demo.
 *
 * 2. SPEED IS SHOWN AS A MEASUREMENT, NOT A FEELING. Two numbers per model:
 *    the probe time (one synthetic two-step call) and the live latency from
 *    real farmer traffic. A model can pass its probe and still be too slow in
 *    production, and the probe alone would hide that.
 */

interface AiModelRow {
  id: number;
  provider: string;
  model: string;
  label: string | null;
  role: string;
  costInPerM: number | null;
  costOutPerM: number | null;
  isFree: boolean;
  contextLength: number | null;
  probeState: string;
  probeReason: string | null;
  probedAt: string | null;
  probeMs: number | null;
  lastLatencyMs: number | null;
  successCount: number;
  failureCount: number;
  lastUsedAt: string | null;
  enabled: boolean;
  hasKey: boolean;
  keyHint: string | null;
}

interface AiData {
  models: AiModelRow[];
  active: { provider: string; model: string; baseUrl: string; fallbacks: string[]; fromEnv: boolean; hasKey: boolean };
  settings: { searchesPerTurn: number; rateLimitWindowMs: number; maxSteps: number; allowPaidModels: boolean };
  defaults: { searchesPerTurn: number; rateLimitWindowMs: number; maxSteps: number; allowPaidModels: boolean };
  providers: Array<{ id: string; name: string; baseUrl: string; defaultModel: string; creditCard: boolean; rateLimit: string; setupUrl: string }>;
}

const card = "rounded-2xl border border-wangari-border bg-white";
const inputCls =
  "w-full rounded-lg border border-wangari-border bg-white px-3 py-2 text-sm text-wangari-text outline-none focus:border-wangari-green-500";
const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btn} bg-wangari-green-700 text-white hover:bg-wangari-green-800`;
const btnGhost = `${btn} border border-wangari-border text-wangari-text hover:bg-wangari-cream`;
const btnDanger = `${btn} border border-badge-red-border text-badge-red-text hover:bg-badge-red-bg`;

/** Tailwind class for a speed band. Kept next to PROBE_META so the two read
 *  the same way in the table. */
const TONE_CLS: Record<string, string> = {
  good: "text-badge-green-text",
  ok: "text-amber-700",
  slow: "text-orange-700",
  bad: "text-badge-red-text",
  unknown: "text-wangari-subtle",
};

const PROBE_META: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  passing: { label: "Passed", cls: "bg-badge-green-bg text-badge-green-text", Icon: CheckCircle2 },
  failing: { label: "Failed", cls: "bg-badge-red-bg text-badge-red-text", Icon: XCircle },
  untested: { label: "Not tested", cls: "bg-wangari-cream text-wangari-muted", Icon: AlertTriangle },
  error: { label: "Error", cls: "bg-badge-red-bg text-badge-red-text", Icon: XCircle },
};

export default function WaAdminAiPage() {
  const [data, setData] = React.useState<AiData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<number | "settings" | "discover" | null>(null);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [showAdd, setShowAdd] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showDiscover, setShowDiscover] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      setData(await adminApi.get<AiData>("/ai"));
    } catch (e: any) {
      setError(e?.message || "Could not load AI configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const flash = (tone: "ok" | "err", text: string) => {
    setNotice({ tone, text });
    window.setTimeout(() => setNotice(null), 6000);
  };

  const run = async <T,>(id: number | "settings" | "discover", fn: () => Promise<T>) => {
    setBusy(id);
    try {
      const r = await fn();
      await load();
      return r;
    } catch (e: any) {
      flash("err", e?.message || "That did not work");
      throw e;
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-wangari-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-wangari-green-200 border-t-wangari-green-600" />
        Loading AI configuration…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`${card} p-5`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-badge-red-text" />
          <div>
            <div className="font-semibold text-wangari-heading">Could not load AI configuration</div>
            <p className="mt-1 text-sm text-wangari-muted">{error}</p>
            <button onClick={load} className={`${btnGhost} mt-3`}><RefreshCw className="h-4 w-4" /> Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const primary = data.models.find((m) => m.role === "primary");
  const fallback = data.models.find((m) => m.role === "fallback");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-wangari-heading">
            <Bot className="h-5 w-5 text-wangari-green-700" /> AI Models
          </h1>
          <p className="mt-1 text-sm text-wangari-muted">
            Choose the model Wangari answers with, and the one that takes over if it is retired.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => setShowDiscover((v) => !v)}>
            <Search className="h-4 w-4" /> Discover models
          </button>
          <button className={btnGhost} onClick={() => setShowSettings((v) => !v)}>
            <Settings2 className="h-4 w-4" /> Settings
          </button>
          <button className={btnPrimary} onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4" /> Add model
          </button>
        </div>
      </div>

      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          notice.tone === "ok"
            ? "border-badge-green-border bg-badge-green-bg text-badge-green-text"
            : "border-badge-red-border bg-badge-red-bg text-badge-red-text"}`}>
          {notice.text}
        </div>
      )}

      {/* Live state — what the assistant is using right now, and whether that
          came from this registry or from the environment. */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={<Rocket className="h-4 w-4" />} label="Live model" tone="green"
          title={data.active.model}
          detail={`${data.active.provider} · ${sourceLabel(data.active.fromEnv)}`}
        />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4" />} label="Backup model" tone={fallback ? "green" : "slate"}
          title={data.active.fallbacks[0] || "None"}
          detail={data.active.fallbacks[0] ? "Takes over if the live model is retired" : "No backup — the assistant has nowhere to go"}
        />
        <StatCard
          icon={<Gauge className="h-4 w-4" />} label="Live speed"          tone={latencyBand(primary?.lastLatencyMs ?? null).tone === "bad" ? "red" : "slate"}
          title={formatSeconds(primary?.lastLatencyMs ?? null)}
          detail={primary?.lastLatencyMs != null ? `Last real farmer request · ${latencyBand(primary.lastLatencyMs).label}` : "No traffic recorded yet"}
        />
      </div>

      {showSettings && <SettingsPanel data={data} busy={busy === "settings"} onSave={(patch) => run("settings", () => adminApi.patch("/ai/settings", patch))} />}
      {showDiscover && <DiscoverPanel providers={data.providers} busy={busy === "discover"} onAdd={(m) => run("discover", () => adminApi.post("/ai/models", m))} />}
      {showAdd && <AddModelPanel providers={data.providers} allowPaid={data.settings.allowPaidModels} busy={busy === 0} onAdd={(m) => run(0, () => adminApi.post("/ai/models", m))} onDone={() => setShowAdd(false)} />}

      <ModelTable
        models={data.models}
        busy={busy}
        onTest={(m) => run(m.id, () => adminApi.post(`/ai/models/${m.id}/test`))}
        onActivate={(m, role) => run(m.id, () => adminApi.post(`/ai/models/${m.id}/activate`, { role }))}
        onDeactivate={(m) => run(m.id, () => adminApi.post(`/ai/models/${m.id}/deactivate`))}
        onDelete={(m) => run(m.id, () => adminApi.delete(`/ai/models/${m.id}`))}
      />

      {/* Releasing is separate from "remove role" on purpose: promoting a model
          here makes it the single source of truth, and without an explicit way
          back to the server's own configuration that choice would be
          irreversible from this screen. */}
      {(primary || fallback) && (
        <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div>
            <div className="text-sm font-semibold text-wangari-heading">Hand control back to the server</div>
            <p className="mt-0.5 text-sm text-wangari-muted">
              Clears {primary ? "the primary" : ""}{primary && fallback ? " and " : ""}{fallback ? "the backup" : ""} set here, so Wangari uses the model configured in the server environment again — the same state every server was in before this page existed.
            </p>
          </div>
          <button
            className={btnGhost}
            disabled={busy === "settings"}
            onClick={async () => {
              if (!window.confirm("Release the model set here and use the server's configuration again?")) return;
              await run("settings", async () => {
                if (primary) await adminApi.post("/ai/release", { role: "primary" });
                if (fallback) await adminApi.post("/ai/release", { role: "fallback" });
                return true;
              });
            }}
          >
            Release to environment
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, title, detail, tone }: { icon: React.ReactNode; label: string; title: string; detail: string; tone: "green" | "red" | "slate" }) {
  const ring = tone === "green" ? "text-wangari-green-700 bg-wangari-green-50" : tone === "red" ? "text-badge-red-text bg-badge-red-bg" : "text-wangari-muted bg-wangari-cream";
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-wangari-subtle">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${ring}`}>{icon}</span>{label}
      </div>
      <div className="mt-2 truncate font-mono text-sm font-semibold text-wangari-heading" title={title}>{title}</div>
      <div className="mt-0.5 text-xs text-wangari-muted">{detail}</div>
    </div>
  );
}

function SettingsPanel({ data, busy, onSave }: { data: AiData; busy: boolean; onSave: (patch: any) => Promise<unknown> }) {
  const [searches, setSearches] = React.useState(String(data.settings.searchesPerTurn));
  const [window_, setWindowMs] = React.useState(String(data.settings.rateLimitWindowMs));
  const [steps, setSteps] = React.useState(String(data.settings.maxSteps));
  const [paid, setPaid] = React.useState(data.settings.allowPaidModels);
  const [formError, setFormError] = React.useState<string | null>(null);

  const save = () => {
    const parsed = {
      searchesPerTurn: parseSetting(searches),
      rateLimitWindowMs: parseSetting(window_),
      maxSteps: parseSetting(steps),
    };
    const problem = validateSettings(parsed);
    setFormError(problem);
    if (problem) return; // the server bounds these too; this just puts the
    // message next to the field instead of in a toast after a round trip.
    onSave({ ...parsed, allowPaidModels: paid });
  };

  return (
    <div className={`${card} space-y-4 p-5`}>
      <div>
        <h2 className="font-semibold text-wangari-heading">Assistant settings</h2>
        <p className="mt-0.5 text-sm text-wangari-muted">Leave a field as it is to keep the current value.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-wangari-text">Searches per turn</span>
          <input className={`${inputCls} mt-1`} type="number" min={0} max={10} value={searches} onChange={(e) => setSearches(e.target.value)} />
          <span className="mt-1 block text-xs text-wangari-muted">Default {data.defaults.searchesPerTurn}. Each search costs a provider call.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-wangari-text">Rate-limit window (ms)</span>
          <input className={`${inputCls} mt-1`} type="number" min={1000} max={300000} step={1000} value={window_} onChange={(e) => setWindowMs(e.target.value)} />
          <span className="mt-1 block text-xs text-wangari-muted">Default {data.defaults.rateLimitWindowMs}. UnoRouter&apos;s free tier is 60,000.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-wangari-text">Max agent steps</span>
          <input className={`${inputCls} mt-1`} type="number" min={1} max={20} value={steps} onChange={(e) => setSteps(e.target.value)} />
          <span className="mt-1 block text-xs text-wangari-muted">Default {data.defaults.maxSteps}. Higher means longer answers and more calls.</span>
        </label>
      </div>
      <label className="flex items-start gap-2 rounded-lg bg-wangari-cream p-3 text-sm">
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="mt-0.5" />
        <span>
          <span className="font-medium text-wangari-text">Allow paid models</span>
          <span className="mt-0.5 block text-xs text-wangari-muted">
            Off by default. Turning this on lets billable models be registered and activated — the provider account will be charged per token.
          </span>
        </span>
      </label>
      {formError && (
        <div className="rounded-lg bg-badge-red-bg px-3 py-2 text-sm text-badge-red-text">{formError}</div>
      )}
      <button className={btnPrimary} disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

function DiscoverPanel({ providers, busy, onAdd }: { providers: AiData["providers"]; busy: boolean; onAdd: (m: any) => Promise<unknown> }) {
  const [provider, setProvider] = React.useState("unorouter");
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [rejected, setRejected] = React.useState<Record<string, number> | null>(null);
  const [total, setTotal] = React.useState<number | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const discover = async () => {
    setErr(null); setRows(null);
    try {
      const r = await adminApi.post("/ai/discover", { provider });
      setRows(r.candidates); setRejected(r.rejectedSummary); setTotal(r.total);
    } catch (e: any) { setErr(e?.message || "Discovery failed"); }
  };

  return (
    <div className={`${card} space-y-4 p-5`}>
      <div>
        <h2 className="font-semibold text-wangari-heading">Discover models</h2>
        <p className="mt-0.5 text-sm text-wangari-muted">
          Fetches the provider&apos;s live catalogue and filters out everything that cannot run a farm job — images, embeddings, speech, and models with too little context.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-wangari-text">Provider</span>
          <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button className={btnPrimary} onClick={discover} disabled={busy || rows !== null}>
          <Search className="h-4 w-4" /> {rows === null ? "Fetch catalogue" : "Fetched"}
        </button>
      </div>
      {err && <div className="rounded-lg bg-badge-red-bg px-3 py-2 text-sm text-badge-red-text">{err}</div>}
      {rows && (
        <>
          <div className="text-xs text-wangari-muted">
            {rows.length} usable of {total} listed.
            {rejected && Object.entries(rejected).map(([k, v]) => ` ${v} ${k.replace(/-/g, " ")}`).join(",")}.
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-wangari-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-wangari-cream text-xs uppercase tracking-wide text-wangari-subtle">
                <tr><th className="px-3 py-2">Model</th><th className="px-3 py-2">Context</th><th className="px-3 py-2">Why</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.model} className="border-t border-wangari-border">
                    <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
                    <td className="px-3 py-2 text-xs text-wangari-muted">{r.contextLength?.toLocaleString() ?? "?"}</td>
                    <td className="px-3 py-2 text-xs text-wangari-muted">{r.why}</td>
                    <td className="px-3 py-2 text-right">
                      <button className={btnGhost} onClick={() => onAdd({ provider, model: r.model, isFree: true, contextLength: r.contextLength })}>
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AddModelPanel({ providers, allowPaid, busy, onAdd, onDone }: {
  providers: AiData["providers"]; allowPaid: boolean; busy: boolean;
  onAdd: (m: any) => Promise<unknown>; onDone: () => void;
}) {
  const [provider, setProvider] = React.useState("unorouter");
  const [model, setModel] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [isFree, setIsFree] = React.useState(true);
  const [costIn, setCostIn] = React.useState("");
  const [costOut, setCostOut] = React.useState("");

  const submit = async () => {
    if (!model.trim()) return;
    await onAdd({
      provider, model: model.trim(), label: label.trim() || undefined,
      apiKey: apiKey.trim() || undefined, isFree,
      costInPerM: costIn === "" ? undefined : Number(costIn),
      costOutPerM: costOut === "" ? undefined : Number(costOut),
    });
    setModel(""); setLabel(""); setApiKey("");
  };

  return (
    <div className={`${card} space-y-4 p-5`}>
      <div>
        <h2 className="font-semibold text-wangari-heading">Add a model</h2>
        <p className="mt-0.5 text-sm text-wangari-muted">
          New models arrive switched off. Test it first, then activate it.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-wangari-text">Provider</span>
          <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-wangari-text">Model id</span>
          <input className={`${inputCls} font-mono`} value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen3-next-80b-a3b-instruct:free" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-wangari-text">Label (optional)</span>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fast backup" />
        </label>
        <label className="text-sm">
          <span className="mb-1 flex items-center gap-1 font-medium text-wangari-text"><KeyRound className="h-3.5 w-3.5" /> API key (optional)</span>
          <input className={inputCls} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Leave blank to use the server's key" autoComplete="off" />
          <span className="mt-1 block text-xs text-wangari-muted">Stored encrypted. Never shown again once saved.</span>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-wangari-text">Cost in / 1M tokens ($)</span>
          <input className={inputCls} type="number" step="0.01" min="0" value={costIn} onChange={(e) => setCostIn(e.target.value)} placeholder="0.00" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-wangari-text">Cost out / 1M tokens ($)</span>
          <input className={inputCls} type="number" step="0.01" min="0" value={costOut} onChange={(e) => setCostOut(e.target.value)} placeholder="0.00" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
        <span className="text-wangari-text">This model is free</span>
        {!allowPaid && <span className="text-xs text-wangari-muted">(paid models are disabled in settings)</span>}
      </label>
      <div className="flex gap-2">
        <button className={btnPrimary} onClick={submit} disabled={busy || !model.trim()}>
          <Plus className="h-4 w-4" /> {busy ? "Adding…" : "Add model"}
        </button>
        <button className={btnGhost} onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function ModelTable({ models, busy, onTest, onActivate, onDeactivate, onDelete }: {
  models: AiModelRow[];
  /** Shared with the panels above, so any in-flight action disables every row
   *  button rather than allowing a second activation to race the first. */
  busy: number | "settings" | "discover" | null;
  onTest: (m: AiModelRow) => Promise<unknown>;
  onActivate: (m: AiModelRow, role: "primary" | "fallback") => Promise<unknown>;
  onDeactivate: (m: AiModelRow) => Promise<unknown>;
  onDelete: (m: AiModelRow) => Promise<unknown>;
}) {
  if (!models.length) {
    return (
      <div className={`${card} p-8 text-center`}>
        <div className="font-semibold text-wangari-heading">No models registered yet</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-wangari-muted">
          Wangari is currently using the model configured on the server. Add a model here to manage it from the dashboard instead.
        </p>
      </div>
    );
  }

  const roleBadge = (role: string) =>
    role === "primary" ? "bg-wangari-green-700 text-white"
    : role === "fallback" ? "bg-wangari-green-100 text-wangari-green-800"
    : "bg-wangari-cream text-wangari-muted";

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-wangari-cream text-xs uppercase tracking-wide text-wangari-subtle">
            <tr>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Agent test</th>
              <th className="px-4 py-3">Speed</th>
              <th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const probe = PROBE_META[m.probeState] || PROBE_META.untested;
              const lat = latencyBand(m.lastLatencyMs);
              const activatable = canActivate(m);
              return (
                <tr key={m.id} className="border-t border-wangari-border align-top">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-semibold text-wangari-heading">{m.model}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-wangari-muted">
                      <span>{m.provider}</span>
                      {m.hasKey && <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> key set</span>}
                      {m.contextLength && <span>· {(m.contextLength / 1000).toFixed(0)}k ctx</span>}
                    </div>
                    {m.probeReason && m.probeState !== "passing" && (
                      <div className="mt-1 max-w-xs text-xs text-badge-red-text">{m.probeReason}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleBadge(m.role)}`}>{m.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${probe.cls}`}>
                      <probe.Icon className="h-3 w-3" /> {probe.label}
                    </span>
                    {m.probeMs != null && <div className="mt-1 text-xs text-wangari-muted">{(m.probeMs / 1000).toFixed(1)}s to probe</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className={`text-sm font-medium ${TONE_CLS[lat.tone]}`}>
                      {formatSeconds(m.lastLatencyMs)}
                    </div>
                    <div className="text-xs text-wangari-muted">{lat.label}</div>
                    {(m.successCount + m.failureCount) > 0 && (
                      <div className="mt-0.5 text-xs text-wangari-subtle">
                        {m.successCount} ok · {m.failureCount} failed
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-wangari-muted">
                    {m.isFree ? <span className="rounded-full bg-badge-green-bg px-2 py-0.5 text-badge-green-text">Free</span> : (
                      <span>{costLabel(m)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button className={btnGhost} disabled={busy === m.id} onClick={() => onTest(m)} title="Run the two-step agent test">
                        <Play className="h-3.5 w-3.5" /> Test
                      </button>
                      {!activatable && (
                        <button className={btnGhost} disabled title={activateBlockedReason(m)}>
                          Activate
                        </button>
                      )}
                      {activatable && m.role === "primary" && (
                        <span className="inline-flex items-center gap-1 px-2 text-xs text-wangari-muted">In use</span>
                      )}
                      {activatable && m.role !== "primary" && (
                        <>
                          <button className={btnGhost} disabled={busy === m.id} onClick={() => onActivate(m, "primary")}>
                            <Rocket className="h-3.5 w-3.5" /> Make primary
                          </button>
                          <button className={btnGhost} disabled={busy === m.id} onClick={() => onActivate(m, "fallback")}>
                            Make backup
                          </button>
                        </>
                      )}
                      {m.role !== "candidate" && m.role !== "primary" && (
                        <button className={btnGhost} disabled={busy === m.id} onClick={() => onDeactivate(m)}>Remove role</button>
                      )}
                      {canDelete(m) && (
                        <button className={btnDanger} disabled={busy === m.id} onClick={() => { if (window.confirm(`Delete ${m.model}?`)) onDelete(m); }} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
