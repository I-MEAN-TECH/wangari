"use client";

import * as React from "react";
import {
  ShieldCheck, ChevronLeft, ChevronRight, X,
  Activity, UserCheck, Wallet, Flame, History,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import {
  PageHeader, Panel, TableShell, Th, Td, FilterPill, SearchInput, Loading, ErrorState,
  EmptyState, GhostButton, StatCard,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CARD_PANEL } from "@/components/ui/patterns";

interface AuditRow {
  id: number;
  userId: number | null;
  farmId: number | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: any;
  createdAt: string;
  user: { name: string; email: string } | null;
}

interface AuditSummary {
  totalAllTime: number;
  last24h: number;
  admin24h: number;
  money24h: number;
  adminAll: number;
  moneyAll: number;
  topActors: { name: string; count: number }[];
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admin actions" },
  { key: "money", label: "Money path" },
];

/** Turn internal actor formats into readable names. */
function actorLabel(raw: string): string {
  const m = raw.match(/^admin:(\d+):(\w+)$/);
  if (m) {
    const role = m[2].replace(/_/g, " ");
    return role.charAt(0).toUpperCase() + role.slice(1);
  }
  return raw;
}

export default function AdminAuditPage() {
  const [rows, setRows] = React.useState<AuditRow[] | null>(null);
  const [summary, setSummary] = React.useState<AuditSummary | null>(null);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState("");
  const [detail, setDetail] = React.useState<AuditRow | null>(null);
  const pageSize = 30;

  React.useEffect(() => {
    adminApi.get<{ rows: AuditRow[]; total: number; summary: AuditSummary }>(
      `/audit?page=${page}&action=${filter}&q=${encodeURIComponent(q)}`
    )
      .then((r) => { setRows(r.rows); setTotal(r.total); setSummary(r.summary); })
      .catch((e) => setError(e.message));
  }, [page, filter, q]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Audit Log"
        description="Immutable trail of admin actions and money-path mutations. Append-only — nothing here can be edited or deleted."
      />

      {error && <ErrorState message={error} />}

      {/* Activity stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Entries all-time" value={summary.totalAllTime.toLocaleString()} icon={<History className="h-5 w-5" />} accent="slate" />
          <StatCard label="Last 24h" value={summary.last24h} icon={<Activity className="h-5 w-5" />} accent="green" />
          <StatCard label="Admin 24h" value={summary.admin24h} icon={<UserCheck className="h-5 w-5" />} accent="blue" />
          <StatCard label="Money 24h" value={summary.money24h} icon={<Wallet className="h-5 w-5" />} accent={summary.money24h > 0 ? "amber" : "slate"} />
          <StatCard label="Admin all-time" value={summary.adminAll} icon={<ShieldCheck className="h-5 w-5" />} accent="violet" />
          <StatCard
            label="Top actor"
            value={summary.topActors[0] ? actorLabel(summary.topActors[0].name) : "—"}
            icon={<Flame className="h-5 w-5" />}
            accent="amber"
            hint={summary.topActors[0] ? `${summary.topActors[0].count} actions` : undefined}
          />
        </div>
      )}

      <Panel bodyClassName="p-0">
        <div className="border-b border-wangari-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search action, entity, or actor…" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <FilterPill key={f.key} active={filter === f.key} onClick={() => { setFilter(f.key); setPage(1); }}>{f.label}</FilterPill>
              ))}
            </div>
            <span className="ml-auto text-xs text-wangari-muted">{total} entries</span>
          </div>
        </div>

        {!rows ? (
          <Loading label="Loading audit trail…" />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing here" hint="No entries match this filter or search." icon={<ShieldCheck className="h-5 w-5" />} />
        ) : (
          <TableShell minWidth={820}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isAdmin = r.action.startsWith("admin.");
                const isMoney = /transaction|payment|subscription|billing|extend|comp|promo/.test(r.action);
                return (
                  <tr
                    key={r.id}
                    onClick={() => setDetail(r)}
                    className="cursor-pointer transition-colors hover:bg-wangari-green-50/40"
                  >
                    <Td className="whitespace-nowrap text-xs text-wangari-muted">{new Date(r.createdAt).toLocaleString()}</Td>
                    <Td>
                      {r.details?._actor ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-wangari-green-100 text-[9px] font-bold text-wangari-green-800">
                            {actorLabel(String(r.details._actor)).slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-xs font-medium text-wangari-heading">{actorLabel(String(r.details._actor))}</span>
                        </span>
                      ) : r.user ? (
                        <span className="text-xs text-wangari-text">{r.user.name}</span>
                      ) : (
                        <span className="text-xs text-wangari-subtle">user #{r.userId ?? "?"}</span>
                      )}
                    </Td>
                    <Td>
                      <code className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${isAdmin ? "bg-wangari-green-50 text-wangari-green-800" : isMoney ? "bg-badge-yellow-bg text-badge-yellow-text" : "bg-wangari-cream text-wangari-heading"}`}>
                        {r.action}
                      </code>
                    </Td>
                    <Td className="text-xs text-wangari-muted">
                      {r.entityType
                        ? `${r.entityType}${r.details?._entityIdStr != null ? `#${r.details._entityIdStr}` : r.entityId != null ? `#${r.entityId}` : ""}`
                        : "—"}
                    </Td>
                    <Td className="max-w-[220px]">
                      <div className="truncate font-mono text-[11px] text-wangari-subtle">
                        {r.details ? JSON.stringify(r.details) : "—"}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-wangari-border px-5 py-3 text-sm text-wangari-muted">
            <span>Page {page} of {pages} · {total} entries</span>
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

      {/* Entry detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDetail(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-wangari-border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <code className="rounded bg-wangari-green-50 px-2 py-1 font-mono text-sm font-bold text-wangari-green-800">{detail.action}</code>
                  <div className="mt-1.5 text-xs text-wangari-subtle">Entry #{detail.id} · {new Date(detail.createdAt).toLocaleString()}</div>
                </div>
                <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Actor</div>
                  <div className="mt-1 text-sm font-medium text-wangari-heading">
                    {detail.details?._actor ? actorLabel(String(detail.details._actor)) : detail.user?.name || `user #${detail.userId ?? "?"}`}
                  </div>
                  {detail.user?.email && <div className="text-xs text-wangari-subtle">{detail.user.email}</div>}
                </div>
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Entity</div>
                  <div className="mt-1 text-sm font-medium text-wangari-heading">
                    {detail.entityType || "—"}
                    {detail.details?._entityIdStr != null ? `#${detail.details._entityIdStr}` : detail.entityId != null ? `#${detail.entityId}` : ""}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Full details (JSON)</div>
                <pre className="max-h-80 overflow-auto rounded-xl bg-wangari-cream p-3 font-mono text-[11px] leading-relaxed text-wangari-text">
                  {detail.details ? JSON.stringify(detail.details, null, 2) : "—"}
                </pre>
              </div>

              <div className="flex justify-end border-t border-wangari-border pt-4">
                <GhostButton onClick={() => setDetail(null)}>Close</GhostButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
