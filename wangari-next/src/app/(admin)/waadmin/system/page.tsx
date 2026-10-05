"use client";

import * as React from "react";
import {
  Activity, Database, Timer, Cpu, Layers, RefreshCw, ShieldOff,
  MailCheck, MailWarning, ShieldCheck, CreditCard, MemoryStick, ScrollText,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import { PageHeader, Panel, StatCard, Loading, ErrorState, GhostButton } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { IpAccessPanel, type IpData } from "@/components/admin/ip-access-panel";
import { getAdminSession } from "@/lib/admin-client";
import type { PreviewResult } from "@/lib/ip-access-view";

interface SystemInfo {
  status: string;
  dbLatencyMs: number;
  counts: { farms: number; users: number; subs: number; workers: number; audit24h: number };
  email: { sent: number; failed: number };
  services: { database: string; smtp: string; paystack: string };
  memory: { heapUsedMb: number; heapTotalMb: number; rssMb: number };
  uptimeSec: number;
  nodeVersion: string;
  checkedAt: string;
}

type ServiceState = "ok" | "slow" | "down" | "configured" | "not_configured";

const SERVICE_META: Record<ServiceState, { label: string; variant: "success" | "warning" | "danger" | "outline" }> = {
  ok: { label: "Operational", variant: "success" },
  configured: { label: "Configured", variant: "success" },
  slow: { label: "Degraded", variant: "warning" },
  not_configured: { label: "Not configured", variant: "outline" },
  down: { label: "Down", variant: "danger" },
};

function ServiceCard({ icon, name, state, hint }: { icon: React.ReactNode; name: string; state: ServiceState; hint: string }) {
  const meta = SERVICE_META[state] || SERVICE_META.not_configured;
  return (
    <div className="flex items-center justify-between rounded-2xl border border-wangari-border p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wangari-cream text-wangari-muted">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-wangari-heading">{name}</div>
          <div className="truncate text-xs text-wangari-subtle">{hint}</div>
        </div>
      </div>
      <Badge variant={meta.variant}>{meta.label}</Badge>
    </div>
  );
}

export default function AdminSystemPage() {
  const [info, setInfo] = React.useState<SystemInfo | null>(null);
  const [error, setError] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);

  // IP rules are fetched on their own, and on no timer. The rest of this page is
  // infrastructure that changes on its own; who is knocking does not, and an
  // operator watching the hit counters rise does not need the page to fight
  // them for the connection.
  const [ipData, setIpData] = React.useState<IpData | null>(null);
  const [ipLoading, setIpLoading] = React.useState(true);
  const [ipError, setIpError] = React.useState<string | null>(null);
  const [ipBusy, setIpBusy] = React.useState<string | null>(null);
  const [ipFlash, setIpFlash] = React.useState<string | null>(null);

  /* This page is reachable by billing and support, but writing IP rules is not.
     Hiding the panel is not a security control — the server refuses a non
     super-admin on every route in routes/admin-ip.ts — it is here so support
     staff are not shown a form that could only ever come back as a 403.

     Resolved in an effect, not during render. `getAdminSession` reads
     localStorage, which does not exist on the server, so reading it while
     rendering gives false there and true in the browser — and React reports
     that as a hydration mismatch and throws the server's HTML away. Starting
     false and correcting after mount keeps the two renders identical. */
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  React.useEffect(() => { setIsSuperAdmin(getAdminSession()?.role === "super_admin"); }, []);

  const load = React.useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      setInfo(await adminApi.get<SystemInfo>("/system"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadIp = React.useCallback(async () => {
    try {
      setIpError(null);
      setIpData(await adminApi.get<IpData>("/ip"));
    } catch (e: any) {
      setIpError(e?.message || "Could not load IP rules");
    } finally {
      setIpLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  React.useEffect(() => { if (isSuperAdmin) loadIp(); }, [loadIp, isSuperAdmin]);

  const withIp = async (key: string, fn: () => Promise<void>) => {
    setIpBusy(key);
    setIpError(null);
    try {
      await fn();
      await loadIp();
    } catch (e: any) {
      // The server's own refusals are already written as sentences an operator
      // can act on — "that range includes your own address" — so they are shown
      // verbatim rather than replaced with something vaguer.
      setIpError(e?.message || "That did not work");
    } finally {
      setIpBusy(null);
    }
  };

  if (error && !info) return <ErrorState message={error} />;
  if (!info) return <Panel><Loading label="Checking system health…" /></Panel>;

  const uptimeDays = (info.uptimeSec / 86400).toFixed(1);
  const uptimeHours = Math.floor((info.uptimeSec % 86400) / 3600);
  const heapPct = Math.round((info.memory.heapUsedMb / info.memory.heapTotalMb) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Activity className="h-5 w-5" />}
        title="System Health"
        description={`Live infrastructure status · last checked ${new Date(info.checkedAt).toLocaleTimeString()} · auto-refreshes every 30s`}
        actions={
          <>
            {info.status === "ok" ? (
              <Badge variant="success"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-wangari-green-500" /> All systems operational</Badge>
            ) : (
              <Badge variant="danger"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" /> Degraded</Badge>
            )}
            <GhostButton onClick={() => load(true)} disabled={refreshing} className="h-8 px-2.5 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </GhostButton>
          </>
        }
      />

      {error && <ErrorState message={error} />}

      {/* Core stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="DB latency"
          value={`${info.dbLatencyMs} ms`}
          icon={<Database className="h-5 w-5" />}
          accent={info.dbLatencyMs < 100 ? "green" : info.dbLatencyMs < 500 ? "amber" : "red"}
          hint={info.dbLatencyMs < 100 ? "excellent" : info.dbLatencyMs < 500 ? "healthy" : "slow"}
        />
        <StatCard label="API uptime" value={`${uptimeDays}d ${uptimeHours}h`} icon={<Timer className="h-5 w-5" />} accent="blue" hint="since last restart" />
        <StatCard label="Heap usage" value={`${info.memory.heapUsedMb} MB`} icon={<MemoryStick className="h-5 w-5" />} accent={heapPct < 75 ? "slate" : "amber"} hint={`${heapPct}% of ${info.memory.heapTotalMb} MB heap`} />
        <StatCard label="Emails 24h" value={`${info.email.sent} / ${info.email.sent + info.email.failed}`} icon={<MailCheck className="h-5 w-5" />} accent={info.email.failed > info.email.sent ? "red" : "green"} hint={`${info.email.failed} failed`} />
        <StatCard label="Audit events 24h" value={info.counts.audit24h} icon={<ScrollText className="h-5 w-5" />} accent="violet" />
        <StatCard label="Runtime" value={info.nodeVersion} icon={<Cpu className="h-5 w-5" />} accent="slate" hint="Node.js" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Service status grid */}
        <Panel title="Services" description="External dependencies and integrations">
          <div className="space-y-3">
            <ServiceCard
              icon={<Database className="h-5 w-5" />}
              name="PostgreSQL Database"
              state={info.services.database as ServiceState}
              hint={`${info.dbLatencyMs}ms round-trip · query check`}
            />
            <ServiceCard
              icon={<MailCheck className="h-5 w-5" />}
              name="Email (SMTP / Mailbux)"
              state={info.services.smtp as ServiceState}
              hint={`${info.email.sent} delivered, ${info.email.failed} failed in 24h`}
            />
            <ServiceCard
              icon={<CreditCard className="h-5 w-5" />}
              name="Paystack Payments"
              state={info.services.paystack as ServiceState}
              hint="checkout + webhook secret key"
            />
          </div>
        </Panel>

        {/* Platform data */}
        <Panel title="Platform data" description="Live record counts across the system">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Farms", value: info.counts.farms, icon: <Layers className="h-4 w-4" /> },
              { label: "Users", value: info.counts.users, icon: <Layers className="h-4 w-4" /> },
              { label: "Subscriptions", value: info.counts.subs, icon: <Layers className="h-4 w-4" /> },
              { label: "Workers", value: info.counts.workers, icon: <Layers className="h-4 w-4" /> },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-wangari-border p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted">{c.icon} {c.label}</div>
                <div className="mt-1 text-2xl font-bold text-wangari-heading">{c.value.toLocaleString()}</div>
              </div>
            ))}
            <div className="col-span-2 rounded-2xl bg-wangari-cream px-3.5 py-3 text-xs text-wangari-muted">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-wangari-green-700" />
              Memory: {info.memory.rssMb} MB RSS · heap {info.memory.heapUsedMb}/{info.memory.heapTotalMb} MB · uptime {uptimeDays} days
            </div>
          </div>
        </Panel>
      </div>

      {/* ── IP access ───────────────────────────────────────────────
          Below the infrastructure panels rather than above them: this is the
          question you ask once something looks wrong, and the person asking it
          is already reading the panels above. */}
      {isSuperAdmin && (
      <IpAccessPanel
        data={ipData}
        loading={ipLoading}
        error={ipError}
        youAre={ipData?.youAre ?? null}
        busy={ipBusy}
        onReload={loadIp}
        onAdd={(input) =>
          withIp("add", async () => {
            await adminApi.post("/ip", input);
            setIpFlash(`Rule saved: ${input.pattern}`);
          })
        }
        onPreview={async (pattern, ip) =>
          adminApi.post<PreviewResult>("/ip/preview", { pattern, ip })
        }
        onToggle={(r) =>
          withIp(`toggle-${r.id}`, async () => {
            // Flipped server-side rather than with two buttons: there is one
            // concept here, and a toggle that can only ever mean "block" is
            // simpler to reason about than an action pair.
            await adminApi.patch(`/ip/${r.id}`, { action: r.action === "block" ? "allow" : "block" });
            setIpFlash(`${r.pattern} is now ${r.action === "block" ? "allowed" : "refused"}.`);
          })
        }
        onDelete={(r) =>
          withIp(`delete-${r.id}`, async () => {
            if (!window.confirm(`Delete the rule for ${r.pattern}? It caught ${r.hitCount} request(s).`)) return;
            await adminApi.delete(`/ip/${r.id}`);
            setIpFlash(`Rule deleted: ${r.pattern}`);
          })
        }
      />
      )}

      {isSuperAdmin && ipFlash && (
        <div className="rounded-xl border border-wangari-green-200 bg-wangari-green-50 px-4 py-3 text-sm font-medium text-wangari-green-800">
          {ipFlash}
        </div>
      )}

      {isSuperAdmin && (
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-wangari-subtle">
          <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A refused address is turned away before authentication, so it costs no password check and no
          database connection. This is the app&apos;s own gate — the VPS still has nginx and the operating
          system in front of it.
        </p>
      )}
    </div>
  );
}
