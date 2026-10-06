"use client";

import * as React from "react";
import Link from "next/link";
import {
  Landmark, Building2, Users, Sprout, Wallet, TicketCheck, ArrowRight, UserPlus, ReceiptText,
  TrendingUp, TrendingDown, Minus, AlarmClock, ShieldCheck, MailWarning, MailCheck, History,
  TicketPercent, Gift,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import { PageHeader, Panel, StatCard, TableShell, Th, Td, Loading, ErrorState, EmptyState, GhostButton } from "@/components/admin/ui";
import { TrendAreaChart, DailyBarChart, DonutChart } from "@/components/admin/charts";
import { Badge } from "@/components/ui/badge";
import { CARD_PANEL_CREAM } from "@/components/ui/patterns";

interface Overview {
  totals: { farms: number; users: number; workers: number; activeSubscriptions: number; mrrKes: number; openTickets: number };
  promoStats?: { totalCodes: number; redemptionsThisMonth: number; sponsoredActive: number };
  byPlan: Record<string, { count: number; revenue: number }>;
  signups: { date: string; count: number }[];
  revenueTrend: { date: string; revenue: number }[];
  recentUsers: { id: number; name: string; email: string; createdAt: string }[];
  recentPayments: { id: number; planName: string; amount: string; startsAt: string; reference: string | null; user: { name: string; email: string } }[];
  deltas: { ownersThisWeek: number; ownersLastWeek: number; signupChangePct: number };
  expiringSubs: { id: number; planName: string; expiresAt: string; user: { name: string; email: string } | null }[];
  trialFarms: number;
  emailHealth: { sent: number; failed: number };
  recentAdminActions: { id: number; action: string; details: any; createdAt: string }[];
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function Delta({ pct }: { pct: number }) {
  if (pct > 0) return <span className="inline-flex items-center gap-1 rounded-full bg-wangari-green-50 px-2 py-0.5 text-[11px] font-bold text-wangari-green-700"><TrendingUp className="h-3 w-3" /> +{pct}%</span>;
  if (pct < 0) return <span className="inline-flex items-center gap-1 rounded-full bg-badge-red-bg px-2 py-0.5 text-[11px] font-bold text-badge-red-text"><TrendingDown className="h-3 w-3" /> {pct}%</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-wangari-sunken px-2 py-0.5 text-[11px] font-bold text-wangari-muted"><Minus className="h-3 w-3" /> 0%</span>;
}

function friendlyAction(action: string): string {
  const map: Record<string, string> = {
    "admin.login": "Signed in",
    "admin.plan.create": "Created plan",
    "admin.plan.update": "Updated plan",
    "admin.promo.create": "Created promo code",
    "admin.promo.update": "Updated promo code",
    "admin.announcement.create": "Published announcement",
    "admin.announcement.deactivate": "Took down announcement",
    "admin.user.force-logout": "Force-logged out a user",
    "admin.user.verify-email": "Verified a user email",
    "admin.farm.extend": "Extended a subscription",
    "admin.ticket.reply": "Replied to a ticket",
    "admin.crm.contact.create": "Added CRM contact",
    "admin.crm.stage.update": "Moved a CRM deal",
    "admin.email.send": "Sent an email",
  };
  return map[action] || action.replace("admin.", "").replace(/[.-]/g, " ");
}

export default function AdminOverviewPage() {
  const [data, setData] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    adminApi.get<Overview>("/overview").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading label="Loading overview…" />;

  const t = data.totals;
  const planRows = Object.entries(data.byPlan)
    .map(([name, v]) => ({ name, value: v.count, revenue: v.revenue }))
    .sort((a, b) => b.value - a.value);
  const needsAttention = data.expiringSubs.length > 0 || data.trialFarms > 0 || t.openTickets > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Landmark className="h-5 w-5" />}
        title="Overview"
        description="Platform-wide health at a glance — revenue, growth, and live operations."
      />

      {/* KPI row with week-over-week delta on signups */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="MRR (active)" value={`KES ${t.mrrKes.toLocaleString()}`} icon={<Wallet className="h-5 w-5" />} accent="green" hint="Active subscriptions" />
        <StatCard label="Active subs" value={t.activeSubscriptions} icon={<ReceiptText className="h-5 w-5" />} accent="blue" />
        <StatCard
          label="Farms"
          value={t.farms}
          icon={<Building2 className="h-5 w-5" />}
          accent="violet"
          hint={`${data.trialFarms} on free trial`}
        />
        <StatCard
          label="Farm owners"
          value={t.users}
          icon={<Users className="h-5 w-5" />}
          accent="slate"
          hint={<span className="inline-flex items-center gap-1.5">+{data.deltas.ownersThisWeek} this week <Delta pct={data.deltas.signupChangePct} /></span>}
        />
        <StatCard label="Workers" value={t.workers} icon={<Sprout className="h-5 w-5" />} accent="amber" />
        {data.promoStats && (
          <StatCard
            label="Promo codes"
            value={data.promoStats.totalCodes}
            icon={<TicketPercent className="h-5 w-5" />}
            accent="violet"
            hint={`${data.promoStats.redemptionsThisMonth} redeemed this month`}
          />
        )}
        {data.promoStats && (
          <StatCard
            label="Sponsored farms"
            value={data.promoStats.sponsoredActive}
            icon={<Gift className="h-5 w-5" />}
            accent="blue"
            hint="active via sponsor code"
          />
        )}
        <StatCard
          label="Open tickets"
          value={t.openTickets}
          icon={<TicketCheck className="h-5 w-5" />}
          accent={t.openTickets > 0 ? "red" : "slate"}
          hint={t.openTickets > 0 ? "needs attention" : "all clear"}
        />
      </div>

      {/* Action-required strip */}
      {needsAttention && (
        <Panel
          title="Needs attention"
          description="Subscriptions expiring soon, open tickets, and unconverted trials"
          className="border-amber-300 bg-tone-warn-bg/40"
        >
          <div className="space-y-2">
            {data.expiringSubs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <AlarmClock className="h-4 w-4 shrink-0 text-badge-yellow-text" />
                <span className="font-medium text-wangari-heading">
                  {data.expiringSubs.length} subscription{data.expiringSubs.length > 1 ? "s" : ""} expiring within 7 days
                </span>
                <span className="text-xs text-wangari-muted">
                  ({data.expiringSubs.slice(0, 3).map((s) => `${s.user?.name || s.user?.email || "user"} — ${daysLeft(s.expiresAt)}d left`).join(" · ")}
                  {data.expiringSubs.length > 3 ? " …" : ""})
                </span>
                <Link href="/waadmin/billing" className="ml-auto text-xs font-semibold text-wangari-green-700 hover:text-wangari-green-800">
                  Review billing
                </Link>
              </div>
            )}
            {t.openTickets > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <TicketCheck className="h-4 w-4 shrink-0 text-badge-yellow-text" />
                <span className="font-medium text-wangari-heading">{t.openTickets} open ticket{t.openTickets > 1 ? "s" : ""}</span>
                <Link href="/waadmin/tickets" className="ml-auto text-xs font-semibold text-wangari-green-700 hover:text-wangari-green-800">
                  Open tickets
                </Link>
              </div>
            )}
            {data.trialFarms > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Sprout className="h-4 w-4 shrink-0 text-badge-yellow-text" />
                <span className="font-medium text-wangari-heading">{data.trialFarms} farm{data.trialFarms > 1 ? "s" : ""} without an active subscription</span>
                <Link href="/waadmin/farms" className="ml-auto text-xs font-semibold text-wangari-green-700 hover:text-wangari-green-800">
                  View farms
                </Link>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendAreaChart
            title="Revenue — last 30 days"
            subtitle="New subscription payments per day (KES)"
            data={data.revenueTrend}
            dataKey="revenue"
          />
        </div>
        <DonutChart
          title="Active subs by plan"
          subtitle="Distribution across pricing tiers"
          data={planRows}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DailyBarChart
          title="Signups — last 7 days"
          subtitle="New farm-owner accounts per day"
          data={data.signups.map((s) => ({ date: s.date, count: s.count }))}
          dataKey="count"
        />

        {/* Ops health */}
        <Panel title="Operations health" description="Emails and system, last 24 hours">
          <div className="grid grid-cols-2 gap-3">
            <div className={CARD_PANEL_CREAM}>
              <div className="flex items-center gap-2 text-xs font-semibold text-wangari-muted">
                <MailCheck className="h-4 w-4 text-wangari-green-600" /> Emails delivered
              </div>
              <div className="mt-1.5 text-2xl font-bold text-wangari-heading">{data.emailHealth.sent}</div>
            </div>
            <div className={CARD_PANEL_CREAM}>
              <div className="flex items-center gap-2 text-xs font-semibold text-wangari-muted">
                <MailWarning className={`h-4 w-4 ${data.emailHealth.failed > 0 ? "text-badge-red-text" : "text-wangari-subtle"}`} /> Email failures
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className={`text-2xl font-bold ${data.emailHealth.failed > 0 ? "text-badge-red-text" : "text-wangari-heading"}`}>{data.emailHealth.failed}</div>
                {data.emailHealth.failed > 0 && (
                  <Link href="/waadmin/emails" className="text-xs font-semibold text-wangari-green-700 hover:text-wangari-green-800">
                    Review
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-wangari-border bg-wangari-cream/50 p-3.5">
            <div className="flex items-center gap-2 text-sm text-wangari-text">
              <ShieldCheck className="h-4 w-4 text-wangari-green-700" />
              <span className="font-medium text-wangari-heading">{data.recentAdminActions.length}</span> admin actions logged (latest below)
            </div>
            <Link href="/waadmin/audit" className="text-xs font-semibold text-wangari-green-700 hover:text-wangari-green-800">
              Full audit log
            </Link>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Admin activity feed */}
        <Panel
          title="Recent admin activity"
          description="Latest actions from the admin console"
          actions={
            <Link href="/waadmin/audit" className="flex items-center gap-1 text-xs font-semibold text-wangari-green-700 hover:text-wangari-green-800">
              Audit log <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {data.recentAdminActions.length === 0 ? (
            <EmptyState title="No admin actions yet" icon={<History className="h-5 w-5" />} />
          ) : (
            <div className="space-y-1">
              {data.recentAdminActions.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-wangari-green-50/50">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium capitalize text-wangari-heading">{friendlyAction(a.action)}</span>
                      {a.details?._actor && <span className="ml-1.5 text-xs text-wangari-subtle">— {String(a.details._actor)}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-wangari-subtle">{new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent payments"
          description="Latest activated subscriptions"
          actions={
            <Link href="/waadmin/billing" className="flex items-center gap-1 text-xs font-semibold text-wangari-green-700 hover:text-wangari-green-800">
              View billing <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {data.recentPayments.length === 0 ? (
            <EmptyState title="No payments yet" hint="Payments appear here as soon as subscriptions activate." />
          ) : (
            <div className="divide-y divide-wangari-border">
              {data.recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-700">
                      <ReceiptText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-wangari-heading">{p.user?.name || p.user?.email || `User #${p.id}`}</div>
                      <div className="truncate text-xs text-wangari-subtle">{p.planName} · {p.reference || "no reference"}</div>
                    </div>
                  </div>
                  <div className="shrink-0 font-semibold text-wangari-green-700">KES {Number(p.amount).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Recent signups"
        description="Newest farm-owner accounts"
        actions={
          <Link href="/waadmin/users" className="flex items-center gap-1 text-xs font-semibold text-wangari-green-700 hover:text-wangari-green-800">
            All users <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {data.recentUsers.length === 0 ? (
          <EmptyState title="No signups in the last 7 days" icon={<UserPlus className="h-5 w-5" />} />
        ) : (
          <TableShell minWidth={520}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th className="text-right">Joined</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentUsers.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-wangari-green-50/40">
                  <Td className="font-medium text-wangari-heading">{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td className="text-right text-wangari-muted">{new Date(u.createdAt).toLocaleDateString()}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
