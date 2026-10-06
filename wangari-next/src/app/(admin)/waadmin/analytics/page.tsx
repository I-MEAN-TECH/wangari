"use client";

import * as React from "react";
import {
  Eye, Users, MousePointerClick, Zap, TrendingUp, TrendingDown, Minus,
  Activity, BarChart3, RefreshCw, Radio, GitBranch, Bug, Wallet,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import { PageHeader, Panel, StatCard, Loading, ErrorState, EmptyState } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";

/**
 * PostHog Analytics — product overview for the super-admin dashboard.
 *
 * All PostHog data is fetched server-side via /api/admin/posthog (the
 * Personal API Key never reaches the browser). KPIs cover the last 7 days
 * with comparison to the previous 7.
 */

type QueryResult = { results: any[][]; columns?: string[] };

const EVENT_COLORS = ["#16A34A", "#0EA5E9", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316"];

// ── HogQL helpers ─────────────────────────────────────────

async function runQuery(query: object): Promise<QueryResult> {
  return adminApi.post("/posthog", { query });
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

function pct(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function DeltaPill({ value }: { value: number }) {
  if (value > 0) return <span className="inline-flex items-center gap-1 rounded-full bg-wangari-green-50 px-2 py-0.5 text-[11px] font-bold text-wangari-green-700"><TrendingUp className="h-3 w-3" />+{value}%</span>;
  if (value < 0) return <span className="inline-flex items-center gap-1 rounded-full bg-badge-red-bg px-2 py-0.5 text-[11px] font-bold text-badge-red-text"><TrendingDown className="h-3 w-3" />{value}%</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-wangari-sunken px-2 py-0.5 text-[11px] font-bold text-wangari-muted"><Minus className="h-3 w-3" />0%</span>;
}

// ── Queries ───────────────────────────────────────────────

const METRICS_HOGL = `
SELECT
  countIf(event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY) AS pageviews_7d,
  countIf(event = '$pageview' AND timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY) AS pageviews_prev,
  countIf(event = '$autocapture' AND timestamp >= now() - INTERVAL 7 DAY) AS interactions_7d,
  countIf(event = '$autocapture' AND timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY) AS interactions_prev,
  countIf(event = 'user_signed_up' AND timestamp >= now() - INTERVAL 7 DAY) AS signups_7d,
  countIf(event = 'user_signed_up' AND timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY) AS signups_prev,
  countIf(event = 'user_signed_up' AND timestamp >= now() - INTERVAL 30 DAY) AS signups_30d,
  countIf(event = 'checkout_started' AND timestamp >= now() - INTERVAL 30 DAY) AS checkouts_30d,
  countIf(event = 'subscription_completed' AND timestamp >= now() - INTERVAL 30 DAY) AS subs_30d,
  countIf(event = '$exception' AND timestamp >= now() - INTERVAL 7 DAY) AS errors_7d,
  countIf(event = 'user_logged_in' AND timestamp >= now() - INTERVAL 7 DAY) AS logins_7d,
  uniqExactIf(distinct_id, timestamp >= now() - INTERVAL 7 DAY) AS active_users_7d,
  uniqExactIf(distinct_id, timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY) AS active_users_prev,
  uniqExactIf(distinct_id, event = 'harvest_recorded' AND timestamp >= now() - INTERVAL 30 DAY) AS active_farmers_30d,
  countIf(event = 'locked_module_clicked' AND timestamp >= now() - INTERVAL 7 DAY) AS upgrade_intent_7d
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
`.trim();

const PAGEVIEWS_DAILY_HOGL = `
SELECT
  formatDateTime(timestamp, '%Y-%m-%d') AS date,
  countIf(event = '$pageview') AS pageviews,
  uniqExact(distinct_id) AS visitors
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
GROUP BY date
ORDER BY date
`.trim();

const TOP_EVENTS_HOGL = `
SELECT event, count() AS count
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event NOT IN ('$pageview', '$pageleave', '$autocapture', '$web_vitals', '$session_idle', '$pageview_masking_status')
GROUP BY event
ORDER BY count DESC
LIMIT 8
`.trim();

const TOP_PAGES_HOGL = `
SELECT
  coalesce(JSONExtractString(properties, '$current_url'), '$screen_name', 'unknown') AS page,
  count() AS views
FROM events
WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY page
ORDER BY views DESC
LIMIT 8
`.trim();

const LIVE_EVENTS_HOGL = `
SELECT
  event,
  formatDateTime(timestamp, '%H:%M:%S') AS time,
  coalesce(JSONExtractString(properties, '$current_url'), '') AS url,
  distinct_id
FROM events
WHERE timestamp >= now() - INTERVAL 1 HOUR
ORDER BY timestamp DESC
LIMIT 12
`.trim();

const FUNNEL_EVENTS = ["user_signed_up", "email_verified", "crop_registered", "harvest_recorded"];

function funnelQuery(): string {
  const steps = FUNNEL_EVENTS.map((e, i) =>
    `uniqExactIf(distinct_id, event = '${e}') AS step_${i}`
  ).join(",\n  ");
  return `SELECT\n  ${steps}\nFROM events\nWHERE timestamp >= now() - INTERVAL 30 DAY`.trim();
}

// ── Page ──────────────────────────────────────────────────

interface Metrics {
  pageviews_7d: string; pageviews_prev: string;
  interactions_7d: string; interactions_prev: string;
  signups_7d: string; signups_prev: string; signups_30d: string;
  checkouts_30d: string; subs_30d: string;
  errors_7d: string; logins_7d: string;
  active_users_7d: string; active_users_prev: string;
  active_farmers_30d: string; upgrade_intent_7d: string;
}

export default function PostHogAnalyticsPage() {
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  const [daily, setDaily] = React.useState<{ date: string; pageviews: number; visitors: number }[]>([]);
  const [topEvents, setTopEvents] = React.useState<{ name: string; count: number }[]>([]);
  const [topPages, setTopPages] = React.useState<{ page: string; views: number }[]>([]);
  const [live, setLive] = React.useState<{ event: string; time: string; url: string; distinct_id: string }[]>([]);
  const [funnel, setFunnel] = React.useState<{ name: string; count: number }[]>([]);
  const [qFunnel, setQFunnel] = React.useState<{
    windowDays: number; farms: number;
    steps: { stage: string; count: number; note: string }[];
    totals: { draft: number; sent: number; accepted: number; declined: number; converted: number; expired: number; acceptedValue: number; conversionRate: number; sendRate: number };
  } | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [mRes, dRes, eRes, pRes, lRes, fRes, qRes] = await Promise.allSettled([
        runQuery({ kind: "HogQLQuery", query: METRICS_HOGL }),
        runQuery({ kind: "HogQLQuery", query: PAGEVIEWS_DAILY_HOGL }),
        runQuery({ kind: "HogQLQuery", query: TOP_EVENTS_HOGL }),
        runQuery({ kind: "HogQLQuery", query: TOP_PAGES_HOGL }),
        runQuery({ kind: "HogQLQuery", query: LIVE_EVENTS_HOGL }),
        runQuery({ kind: "HogQLQuery", query: funnelQuery() }),
        adminApi.get("/quotes-funnel?days=30"),
      ]);

      if (mRes.status === "fulfilled" && mRes.value.results?.[0]) {
        const cols = ["pageviews_7d","pageviews_prev","interactions_7d","interactions_prev","signups_7d","signups_prev","signups_30d","checkouts_30d","subs_30d","errors_7d","logins_7d","active_users_7d","active_users_prev","active_farmers_30d","upgrade_intent_7d"];
        const row = mRes.value.results[0];
        setMetrics(Object.fromEntries(cols.map((c, i) => [c, row[i] ?? 0])) as Metrics);
      }
      if (dRes.status === "fulfilled") {
        setDaily((dRes.value.results || []).map((r: any[]) => ({ date: r[0], pageviews: Number(r[1]), visitors: Number(r[2]) })));
      }
      if (eRes.status === "fulfilled") {
        setTopEvents((eRes.value.results || []).map((r: any[]) => ({ name: r[0], count: Number(r[1]) })));
      }
      if (pRes.status === "fulfilled") {
        setTopPages((pRes.value.results || []).map((r: any[]) => ({ page: shortenUrl(r[0]), views: Number(r[1]) })));
      }
      if (lRes.status === "fulfilled") {
        setLive((lRes.value.results || []).map((r: any[]) => ({ event: r[0], time: r[1], url: shortenUrl(r[2]), distinct_id: String(r[3]).slice(0, 8) })));
      }
      if (fRes.status === "fulfilled" && fRes.value.results?.[0]) {
        const row = fRes.value.results[0];
        setFunnel(FUNNEL_EVENTS.map((name, i) => ({ name, count: Number(row[i] ?? 0) })));
      }
      if (qRes.status === "fulfilled" && qRes.value?.steps) {
        setQFunnel(qRes.value);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  // Auto-refresh live feed every 60s
  React.useEffect(() => {
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const pageviews = Number(metrics?.pageviews_7d ?? 0);
  const visitors = Number(metrics?.active_users_7d ?? 0);
  const signups = Number(metrics?.signups_7d ?? 0);
  const errors = Number(metrics?.errors_7d ?? 0);
  const checkoutConv = Number(metrics?.checkouts_30d ?? 0) > 0
    ? Math.round((Number(metrics?.subs_30d ?? 0) / Number(metrics?.checkouts_30d ?? 1)) * 100)
    : 0;

  if (loading) return <Loading label="Loading analytics…" />;
  if (error && !metrics) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="PostHog Analytics"
        description="Product usage, engagement & conversion — powered by PostHog (EU Cloud)"
        actions={
          <>
            <a href="https://eu.posthog.com" target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-wangari-border bg-white px-3.5 py-2 text-sm font-bold text-wangari-heading hover:bg-wangari-cream transition-colors cursor-pointer">
              Open PostHog <Zap className="h-3.5 w-3.5" />
            </a>
            <Button onClick={() => load(true)} disabled={refreshing} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-tone-warn-border bg-tone-warn-bg px-4 py-3 text-sm text-amber-800">⚠️ {error} — showing partial data.</div>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pageviews (7d)" value={fmt(pageviews)} icon={<Eye className="h-5 w-5" />}
          hint={<DeltaPill value={pct(pageviews, Number(metrics?.pageviews_prev ?? 0))} />} />
        <StatCard label="Active Users (7d)" value={fmt(visitors)} icon={<Users className="h-5 w-5" />} accent="blue"
          hint={<DeltaPill value={pct(visitors, Number(metrics?.active_users_prev ?? 0))} />} />
        <StatCard label="Signups (7d)" value={fmt(signups)} icon={<Users className="h-5 w-5" />} accent="violet"
          hint={<span className="text-[11px] text-wangari-subtle">{fmt(Number(metrics?.signups_30d ?? 0))} in 30d</span>} />
        <StatCard label="Errors (7d)" value={fmt(errors)} icon={<Bug className="h-5 w-5" />} accent="red"
          hint={<span className={errors > 20 ? "text-[11px] font-bold text-badge-red-text" : "text-[11px] text-wangari-subtle"}>{errors > 20 ? "needs attention" : "healthy"}</span>} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Interactions (7d)" value={fmt(Number(metrics?.interactions_7d ?? 0))} icon={<MousePointerClick className="h-5 w-5" />} accent="blue"
          hint={<DeltaPill value={pct(Number(metrics?.interactions_7d ?? 0), Number(metrics?.interactions_prev ?? 0))} />} />
        <StatCard label="Logins (7d)" value={fmt(Number(metrics?.logins_7d ?? 0))} icon={<Activity className="h-5 w-5" />}
          hint={<span className="text-[11px] text-wangari-subtle">{fmt(Number(metrics?.active_farmers_30d ?? 0))} farmers active 30d</span>} />
        <StatCard label="Checkout → Paid (30d)" value={`${checkoutConv}%`} icon={<Wallet className="h-5 w-5" />} accent="violet"
          hint={<span className="text-[11px] text-wangari-subtle">{fmt(Number(metrics?.subs_30d ?? 0))} of {fmt(Number(metrics?.checkouts_30d ?? 0))} checkouts</span>} />
        <StatCard label="Upgrade Intent (7d)" value={fmt(Number(metrics?.upgrade_intent_7d ?? 0))} icon={<Zap className="h-5 w-5" />} accent="amber"
          hint={<span className="text-[11px] text-wangari-subtle">locked module clicks</span>} />
      </div>

      {/* ── Trend chart ── */}
      <Panel title="Traffic — last 30 days" description="Daily pageviews & unique visitors">
        {daily.length === 0 ? (
          <EmptyState title="No traffic yet" hint="Events will appear here as farmers use the site." />
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16A34A" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#16A34A" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="uvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5F6E85" }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "#5F6E85" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 12 }} />
                <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="#16A34A" strokeWidth={2.5} fill="url(#pvFill)" />
                <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#0EA5E9" strokeWidth={2} fill="url(#uvFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {/* ── Two-column: top events + funnel ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top Custom Events (7d)" description="Product events — not autocapture noise">
          {topEvents.length === 0 ? (
            <EmptyState title="No custom events yet" hint="Signup, harvest and checkout events appear as farmers use the app." />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topEvents} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#5F6E85" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#334155" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 12 }} cursor={{ fill: "rgba(22,163,74,0.05)" }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                    {topEvents.map((_, i) => <Cell key={i} fill={EVENT_COLORS[i % EVENT_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Activation Funnel (30d)" description="Signup → verified → first crop → first harvest">
          {funnel.every(f => f.count === 0) ? (
            <EmptyState title="No funnel data yet" hint="The funnel fills as farmers register and record crops." />
          ) : (
            <div className="space-y-3 pt-1">
              {funnel.map((step, i) => {
                const max = Math.max(...funnel.map(f => f.count), 1);
                const wPct = (step.count / max) * 100;
                const drop = i > 0 && funnel[i - 1].count > 0
                  ? Math.round(((funnel[i - 1].count - step.count) / funnel[i - 1].count) * 100)
                  : 0;
                return (
                  <div key={step.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-wangari-heading">{step.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-bold text-wangari-heading">{fmt(step.count)}</span>
                        {i > 0 && drop > 0 && <span className="text-[10px] font-semibold text-badge-red-text">−{drop}%</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-3 overflow-hidden rounded-full bg-wangari-sunken">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(wPct, 2)}%`, background: EVENT_COLORS[i % EVENT_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-wangari-subtle">A farmer who records a harvest is your retained user — protect this funnel.</p>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Quotes funnel — real DB truth across all farms ── */}
      <Panel
        title={`Quotes Funnel (${qFunnel?.windowDays ?? 30}d)`}
        description={`Draft → sent → accepted → invoiced across all farms${qFunnel ? ` · ${qFunnel.farms} farm${qFunnel.farms === 1 ? "" : "s"} quoting` : " — straight from the database"}`}
      >
        {!qFunnel || qFunnel.totals.sent + qFunnel.totals.draft + qFunnel.totals.accepted + qFunnel.totals.declined + qFunnel.totals.converted + qFunnel.totals.expired === 0 ? (
          <EmptyState title="No quotes yet" hint="The funnel fills as farmers create and send quotes." />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {qFunnel.steps.map((s, i) => {
                const prev = i > 0 ? qFunnel.steps[i - 1].count : 0;
                const drop = i > 0 && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : 0;
                const max = Math.max(...qFunnel.steps.map(x => x.count), 1);
                return (
                  <div key={s.stage} className="rounded-xl border border-wangari-border/60 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-wangari-subtle">{s.stage}</p>
                    <p className="mt-1 text-2xl font-extrabold text-wangari-heading">{fmt(s.count)}</p>
                    <p className="text-[11px] text-wangari-subtle">{s.note}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-wangari-sunken">
                      <div className="h-full rounded-full" style={{ width: `${Math.max((s.count / max) * 100, 3)}%`, background: EVENT_COLORS[i % EVENT_COLORS.length] }} />
                    </div>
                    {i > 0 && drop > 0 && <p className="mt-1 text-[10px] font-semibold text-badge-red-text">−{drop}% from {qFunnel.steps[i - 1].stage.toLowerCase()}</p>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge className="bg-wangari-green-50 text-wangari-green-700 border-0">{qFunnel.totals.conversionRate}% quote → invoice (of decided)</Badge>
              <Badge className="bg-badge-red-bg text-badge-red-text border-0">{qFunnel.totals.declined} declined</Badge>
              <Badge className="bg-amber-100 text-amber-800 border-0">{qFunnel.totals.expired} expired</Badge>
              <Badge className="bg-wangari-sunken text-tone-neutral-text border-0">{qFunnel.totals.sent} awaiting response</Badge>
              <Badge className="bg-wangari-green-50 text-wangari-green-700 border-0">KES {qFunnel.totals.acceptedValue.toLocaleString()} accepted value</Badge>
              <Badge className="bg-wangari-sunken text-tone-neutral-text border-0">{qFunnel.totals.sendRate}% of drafts get sent</Badge>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Two-column: top pages + live feed ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top Pages (7d)" description="Where farmers spend their time">
          {topPages.length === 0 ? <EmptyState title="No pageviews yet" /> : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPages} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#5F6E85" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="page" width={140} tick={{ fontSize: 11, fill: "#334155" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 12 }} cursor={{ fill: "rgba(14,165,233,0.05)" }} />
                  <Bar dataKey="views" fill="#0EA5E9" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Live Events"
          description="Last hour — refreshes every 60s"
        >
          {live.length === 0 ? <EmptyState title="Quiet right now" hint="No events in the last hour." /> : (
            <div className="max-h-[300px] space-y-1.5 overflow-y-auto">
              {live.map((e, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg border border-wangari-border/60 px-3 py-2 text-xs">
                  <span className="font-mono text-[10px] text-wangari-subtle">{e.time}</span>
                  <Badge className={eventBadge(e.event)}>{shortEvent(e.event)}</Badge>
                  <span className="min-w-0 flex-1 truncate text-wangari-muted">{e.url || e.distinct_id}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <p className="pb-4 text-center text-[11px] text-wangari-subtle">
        Data from PostHog EU Cloud · project 276436 · KPIs compare last 7 days vs the previous 7
      </p>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────

function shortenUrl(url: string): string {
  if (!url) return "—";
  try {
    const u = new URL(url);
    return (u.pathname === "/" ? "Home" : u.pathname) || "/";
  } catch { return url.slice(0, 30); }
}

function shortEvent(e: string): string {
  return e.replace("$autocapture", "click").replace("$exception", "error").replace("$pageview", "view").replace("$", "");
}

function eventBadge(e: string): string {
  if (e.includes("exception")) return "bg-badge-red-bg text-badge-red-text border-0";
  if (e.includes("signup") || e.includes("subscription")) return "bg-wangari-green-50 text-wangari-green-700 border-0";
  if (e.includes("checkout")) return "bg-amber-100 text-amber-800 border-0";
  return "bg-wangari-sunken text-tone-neutral-text border-0";
}
