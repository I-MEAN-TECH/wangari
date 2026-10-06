"use client";

import * as React from "react";
import {
  CreditCard, Search, ChevronLeft, ChevronRight, Ban, X,
  Wallet, CalendarDays, TrendingUp, AlarmClock, Gift, ReceiptText,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import {
  PageHeader, Panel, TableShell, Th, Td, Toolbar, SearchInput, FilterPill, Loading, ErrorState,
  Flash, EmptyState, GhostButton, StatCard, PrimaryButton,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CARD_PANEL, CARD_PANEL_P4 } from "@/components/ui/patterns";

interface SubRow {
  id: number;
  userId: number;
  plan: string;
  planName: string;
  amount: string;
  status: string;
  reference: string | null;
  startsAt: string;
  expiresAt: string;
  user: { id: number; name: string; email: string; role: string } | null;
}

interface BillingSummary {
  mrr: number;
  activeCount: number;
  collected30d: number;
  collectedMtd: number;
  lifetimeRevenue: number;
  expiringSoon: number;
  comps: number;
  aru: number;
}

const STATUSES = ["all", "active", "cancelled", "expired"];

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default function AdminBillingPage() {
  const [rows, setRows] = React.useState<SubRow[] | null>(null);
  const [summary, setSummary] = React.useState<BillingSummary | null>(null);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const pageSize = 20;

  const detail = rows?.find((r) => r.id === detailId) || null;

  const load = React.useCallback(async () => {
    try {
      const res = await adminApi.get<{ rows: SubRow[]; total: number; summary: BillingSummary }>(
        `/billing?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}&page=${page}`
      );
      setRows(res.rows);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (e: any) {
      setError(e.message);
    }
  }, [status, q, page]);
  React.useEffect(() => { load(); }, [load]);

  async function cancel(id: number) {
    if (!confirm("Cancel this subscription? The farm loses paid access immediately.")) return;
    try {
      await adminApi.post(`/billing/${id}/cancel`);
      setFlash(`Subscription #${id} cancelled.`);
      setTimeout(() => setFlash(""), 4000);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<CreditCard className="h-5 w-5" />}
        title="Billing & Payments"
        description="Every subscription on the platform — money collected, what's active, and what's about to churn."
      />

      {flash && <Flash message={flash} />}
      {error && <ErrorState message={error} />}

      {/* Money summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="MRR (active)" value={`KES ${summary.mrr.toLocaleString()}`} icon={<Wallet className="h-5 w-5" />} accent="green" hint={`${summary.activeCount} active subs`} />
          <StatCard label="Collected MTD" value={`KES ${summary.collectedMtd.toLocaleString()}`} icon={<CalendarDays className="h-5 w-5" />} accent="blue" hint="this month" />
          <StatCard label="Collected 30d" value={`KES ${summary.collected30d.toLocaleString()}`} icon={<TrendingUp className="h-5 w-5" />} accent="violet" />
          <StatCard label="Lifetime revenue" value={`KES ${summary.lifetimeRevenue.toLocaleString()}`} icon={<ReceiptText className="h-5 w-5" />} accent="slate" />
          <StatCard label="Avg revenue / sub" value={`KES ${summary.aru.toLocaleString()}`} icon={<ReceiptText className="h-5 w-5" />} accent="slate" hint="active subs" />
          <StatCard
            label="Expiring ≤7d"
            value={summary.expiringSoon}
            icon={<AlarmClock className="h-5 w-5" />}
            accent={summary.expiringSoon > 0 ? "amber" : "slate"}
            hint={summary.comps > 0 ? `${summary.comps} goodwill comp${summary.comps > 1 ? "s" : ""} active` : undefined}
          />
        </div>
      )}

      <Panel bodyClassName="p-0">
        <div className="border-b border-wangari-border px-5 py-3">
          <Toolbar>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wangari-subtle" />
              <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search owner name or email…" className="pl-8" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <FilterPill key={s} active={status === s} onClick={() => { setStatus(s); setPage(1); }}>
                  {s}
                </FilterPill>
              ))}
            </div>
            <span className="ml-auto text-xs text-wangari-muted">{total} subscriptions</span>
          </Toolbar>
        </div>

        {!rows ? (
          <Loading label="Loading subscriptions…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No subscriptions match" hint="Adjust the search or status filter." icon={<CreditCard className="h-5 w-5" />} />
        ) : (
          <TableShell minWidth={880}>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Plan</Th>
                <Th>Amount</Th>
                <Th>Reference</Th>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const exp = daysLeft(r.expiresAt);
                const isComp = Number(r.amount) === 0 && r.status === "active";
                return (
                  <tr
                    key={r.id}
                    onClick={() => setDetailId(r.id)}
                    className="cursor-pointer transition-colors hover:bg-wangari-green-50/40"
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-[11px] font-bold text-wangari-green-800">
                          {(r.user?.name || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-wangari-heading">{r.user?.name || `User #${r.userId}`}</div>
                          <div className="truncate text-xs text-wangari-subtle">{r.user?.email}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>{r.planName}{isComp && <Badge variant="outline" className="ml-1.5 !px-1.5 !py-0 !text-[10px]">comp</Badge>}</Td>
                    <Td className="font-semibold text-wangari-heading">
                      {Number(r.amount) > 0 ? `KES ${Number(r.amount).toLocaleString()}` : "—"}
                    </Td>
                    <Td className="font-mono text-xs text-wangari-subtle">
                      <div className="max-w-[160px] truncate" title={r.reference || undefined}>{r.reference || "—"}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-wangari-muted">
                      {new Date(r.startsAt).toLocaleDateString()} → {new Date(r.expiresAt).toLocaleDateString()}
                      {r.status === "active" && <span className="ml-1 text-wangari-subtle">({exp}d)</span>}
                    </Td>
                    <Td>
                      {r.status === "active" ? (
                        exp <= 7 ? <Badge variant="warning">expiring</Badge> : <Badge variant="success">active</Badge>
                      ) : r.status === "cancelled" ? (
                        <Badge variant="danger">cancelled</Badge>
                      ) : (
                        <Badge variant="outline">{r.status}</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      {r.status === "active" && (
                        <GhostButton
                          onClick={(e) => { e.stopPropagation(); cancel(r.id); }}
                          className="h-7 px-2 text-xs text-badge-red-text hover:bg-badge-red-bg hover:text-badge-red-text"
                        >
                          <Ban className="h-3 w-3" /> Cancel
                        </GhostButton>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-wangari-border px-5 py-3 text-sm text-wangari-muted">
            <span>Page {page} of {pages} · {total} total</span>
            <div className="flex gap-2">
              <GhostButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="h-8 px-2.5 text-xs">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </GhostButton>
              <GhostButton onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="h-8 px-2.5 text-xs">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </GhostButton>
            </div>
          </div>
        )}
      </Panel>

      {/* Subscription detail drawer (from loaded rows) */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDetailId(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-wangari-border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-700">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-wangari-heading">{detail.planName}</h2>
                    <div className="text-xs text-wangari-subtle">Subscription #{detail.id}</div>
                  </div>
                </div>
                <button onClick={() => setDetailId(null)} className="rounded-lg p-1 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className={CARD_PANEL_P4}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Customer</div>
                <div className="mt-1.5 font-medium text-wangari-heading">{detail.user?.name || `User #${detail.userId}`}</div>
                <div className="text-xs text-wangari-subtle">{detail.user?.email}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Amount</div>
                  <div className="mt-1 text-xl font-bold text-wangari-heading">
                    {Number(detail.amount) > 0 ? `KES ${Number(detail.amount).toLocaleString()}` : "Free comp"}
                  </div>
                </div>
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Status</div>
                  <div className="mt-1.5">
                    {detail.status === "active" ? <Badge variant="success">active</Badge> : <Badge variant="outline">{detail.status}</Badge>}
                  </div>
                </div>
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Starts</div>
                  <div className="mt-1 font-medium text-wangari-heading">{new Date(detail.startsAt).toLocaleDateString()}</div>
                </div>
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Expires</div>
                  <div className="mt-1 font-medium text-wangari-heading">
                    {new Date(detail.expiresAt).toLocaleDateString()}
                    {detail.status === "active" && <span className="ml-1 text-xs text-wangari-muted">({daysLeft(detail.expiresAt)}d)</span>}
                  </div>
                </div>
              </div>

              <div className={CARD_PANEL_P4}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Paystack reference</div>
                <code className="mt-1 block break-all font-mono text-xs text-wangari-text">{detail.reference || "no reference (admin action)"}</code>
              </div>

              <div className="flex gap-2 border-t border-wangari-border pt-4">
                {detail.status === "active" && (
                  <PrimaryButton onClick={() => { setDetailId(null); cancel(detail.id); }} className="bg-badge-red-text hover:bg-badge-red-text">
                    <Ban className="h-4 w-4" /> Cancel subscription
                  </PrimaryButton>
                )}
                <GhostButton onClick={() => setDetailId(null)}>Close</GhostButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
