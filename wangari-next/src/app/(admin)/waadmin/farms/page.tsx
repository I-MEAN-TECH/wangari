"use client";

import * as React from "react";
import {
  Building2, Search, ChevronLeft, ChevronRight, CalendarPlus, X,
  Wheat, Users as UsersIcon, Ticket as TicketIcon, ReceiptText, MapPin, ShieldCheck,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import {
  PageHeader, Panel, TableShell, Th, Td, Toolbar, SearchInput, FilterPill, Loading, ErrorState,
  Flash, EmptyState, Modal, Field, inputClass, PrimaryButton, GhostButton, StatCard,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CARD_PANEL, CARD_PANEL_P4, CARD_ROW_SM, CARD_WELL_DASHED } from "@/components/ui/patterns";

interface FarmRow {
  id: number;
  name: string;
  code: string | null;
  location: string | null;
  county: string | null;
  owner: { id: number; name: string; email: string } | null;
  workers: number;
  flocks: number;
  plan: { name: string; status: string; expiresAt: string } | null;
  createdAt: string;
}

interface FarmSummary {
  total: number;
  active: number;
  expiring: number;
  trial: number;
}

interface FarmDetail {
  farm: { id: number; name: string; code: string | null; location: string | null; county: string | null; createdAt: string };
  owner: { id: number; name: string; email: string; phone: string | null; createdAt: string; emailVerified: string | null };
  workers: number;
  flocks: number;
  workerList: { id: number; name: string; role: string; status: string; createdAt: string }[];
  flockList: { id: number; name: string; species: string; birdCount: number; status: string }[];
  subscriptions: { id: number; planName: string; amount: any; status: string; reference: string | null; startsAt: string; expiresAt: string }[];
  tickets: { id: number; subject: string; status: string; createdAt: string }[];
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expiring", label: "Expiring ≤7d" },
  { key: "trial", label: "Trial / none" },
];

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default function AdminFarmsPage() {
  const [rows, setRows] = React.useState<FarmRow[] | null>(null);
  const [summary, setSummary] = React.useState<FarmSummary | null>(null);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");
  const [extending, setExtending] = React.useState<FarmRow | null>(null);
  const [days, setDays] = React.useState("30");
  const [busy, setBusy] = React.useState(false);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<FarmDetail | null>(null);
  const pageSize = 20;

  const load = React.useCallback(async () => {
    try {
      const res = await adminApi.get<{ rows: FarmRow[]; total: number; summary: FarmSummary }>(
        `/farms?q=${encodeURIComponent(q)}&page=${page}&status=${status}`
      );
      setRows(res.rows);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (e: any) {
      setError(e.message);
    }
  }, [q, page, status]);
  React.useEffect(() => { load(); }, [load]);

  const loadDetail = React.useCallback(async (id: number) => {
    setDetailId(id);
    setDetail(null);
    try {
      setDetail(await adminApi.get<FarmDetail>(`/farms/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  async function doExtend() {
    if (!extending) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.post(`/farms/${extending.id}/extend`, { days: Number(days) });
      setFlash(`"${extending.name}" subscription extended by ${days} days.`);
      setTimeout(() => setFlash(""), 4000);
      setExtending(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Farms"
        description="Every tenant farm — plan state, workforce, and one-click subscription actions. Click a row for the full picture."
      />

      {flash && <Flash message={flash} />}
      {error && <ErrorState message={error} />}

      {/* Summary stat cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total farms" value={summary.total} icon={<Building2 className="h-5 w-5" />} accent="green" />
          <StatCard label="Active plans" value={summary.active} icon={<ShieldCheck className="h-5 w-5" />} accent="blue" hint="paying, not expiring" />
          <StatCard label="Expiring ≤7 days" value={summary.expiring} icon={<CalendarPlus className="h-5 w-5" />} accent={summary.expiring > 0 ? "amber" : "slate"} hint="reach out before churn" />
          <StatCard label="Trial / no plan" value={summary.trial} icon={<Wheat className="h-5 w-5" />} accent={summary.trial > 0 ? "violet" : "slate"} hint="conversion candidates" />
        </div>
      )}

      <Panel bodyClassName="p-0">
        <div className="border-b border-wangari-border px-5 py-3">
          <Toolbar>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wangari-subtle" />
              <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, code, or owner email…" className="pl-8" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <FilterPill key={f.key} active={status === f.key} onClick={() => { setStatus(f.key); setPage(1); }}>
                  {f.label}
                </FilterPill>
              ))}
            </div>
            <span className="ml-auto text-xs text-wangari-muted">{total} farms</span>
          </Toolbar>
        </div>

        {!rows ? (
          <Loading label="Loading farms…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No farms match" hint="Try a different search or filter." icon={<Building2 className="h-5 w-5" />} />
        ) : (
          <TableShell minWidth={820}>
            <thead>
              <tr>
                <Th>Farm</Th>
                <Th>Owner</Th>
                <Th>Workforce</Th>
                <Th>Plan</Th>
                <Th>Joined</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const exp = f.plan ? daysLeft(f.plan.expiresAt) : null;
                return (
                  <tr
                    key={f.id}
                    onClick={() => loadDetail(f.id)}
                    className="cursor-pointer transition-colors hover:bg-wangari-green-50/40"
                  >
                    <Td>
                      <div className="font-medium text-wangari-heading">{f.name}</div>
                      <div className="text-xs text-wangari-subtle">
                        {f.code || "no code"}{f.county ? ` · ${f.county}` : ""}
                      </div>
                    </Td>
                    <Td>
                      <div className="text-wangari-text">{f.owner?.name || "—"}</div>
                      <div className="text-xs text-wangari-subtle">{f.owner?.email}</div>
                    </Td>
                    <Td>
                      <span className="text-wangari-text">{f.workers} workers</span>
                      <span className="text-wangari-subtle"> · {f.flocks} flocks</span>
                    </Td>
                    <Td>
                      {f.plan ? (
                        <div>
                          <Badge variant={exp !== null && exp <= 7 ? "warning" : "default"}>{f.plan.name}</Badge>
                          <div className="mt-1 text-[11px] text-wangari-subtle">{exp}d left</div>
                        </div>
                      ) : (
                        <Badge variant="outline">trial / none</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-wangari-muted">{new Date(f.createdAt).toLocaleDateString()}</Td>
                    <Td className="text-right">
                      <GhostButton
                        onClick={(e) => { e.stopPropagation(); setExtending(f); setDays("30"); }}
                        className="h-8 px-2.5 text-xs"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" /> Extend
                      </GhostButton>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-wangari-border px-5 py-3 text-sm text-wangari-muted">
            <span>Page {page} of {pages} · {total} farms</span>
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

      {/* Extend modal */}
      <Modal title={`Extend subscription — ${extending?.name ?? ""}`} onClose={() => setExtending(null)} open={!!extending}>
        {extending && (
          <div className="space-y-4">
            <Field label="Days to extend" hint="Extends from the current expiry date. Logged to the audit trail.">
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2">
              <GhostButton onClick={() => setExtending(null)}>Cancel</GhostButton>
              <PrimaryButton onClick={doExtend} disabled={busy || !(Number(days) > 0)}>
                {busy ? "Extending…" : "Extend subscription"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Farm detail drawer */}
      {detailId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDetailId(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l border-wangari-border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {!detail ? (
              <div className="flex h-32 items-center justify-center text-sm text-wangari-muted">
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-wangari-green-200 border-t-wangari-green-600" />
                Loading farm…
              </div>
            ) : (
              <div className="space-y-5 p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-700">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-wangari-heading">{detail.farm.name}</h2>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-wangari-subtle">
                        <span>{detail.farm.code || "no code"}</span>
                        {detail.farm.county && (
                          <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {detail.farm.county}</span>
                        )}
                        <span>joined {new Date(detail.farm.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setDetailId(null)} className="rounded-lg p-1 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Owner card */}
                <div className={CARD_PANEL_P4}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Owner</div>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-xs font-bold text-wangari-green-800">
                      {detail.owner.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-medium text-wangari-heading">
                        {detail.owner.name}
                        {detail.owner.emailVerified ? <Badge variant="success" className="!px-1.5 !py-0 !text-[10px]">verified</Badge> : <Badge variant="warning" className="!px-1.5 !py-0 !text-[10px]">unverified</Badge>}
                      </div>
                      <div className="truncate text-xs text-wangari-subtle">{detail.owner.email}{detail.owner.phone ? ` · ${detail.owner.phone}` : ""}</div>
                    </div>
                  </div>
                </div>

                {/* Counts */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={CARD_PANEL}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted"><UsersIcon className="h-3.5 w-3.5" /> Workers</div>
                    <div className="mt-1 text-2xl font-bold text-wangari-heading">{detail.workers}</div>
                  </div>
                  <div className={CARD_PANEL}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted"><Wheat className="h-3.5 w-3.5" /> Flocks</div>
                    <div className="mt-1 text-2xl font-bold text-wangari-heading">{detail.flocks}</div>
                  </div>
                </div>

                {/* Workers + flocks preview */}
                {detail.workerList.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">Recent workers</div>
                    <div className="space-y-1">
                      {detail.workerList.slice(0, 5).map((w) => (
                        <div key={w.id} className="flex items-center justify-between rounded-lg bg-wangari-cream/60 px-3 py-1.5 text-sm">
                          <span className="text-wangari-heading">{w.name}</span>
                          <span className="text-xs capitalize text-wangari-subtle">{w.role?.replace("_", " ") || "worker"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail.flockList.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">Flocks</div>
                    <div className="space-y-1">
                      {detail.flockList.slice(0, 5).map((fl) => (
                        <div key={fl.id} className="flex items-center justify-between rounded-lg bg-wangari-cream/60 px-3 py-1.5 text-sm">
                          <span className="text-wangari-heading">{fl.name}</span>
                          <span className="text-xs text-wangari-subtle">{fl.species} · {fl.birdCount ?? "?"} birds</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subscription history */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">
                    <ReceiptText className="h-3.5 w-3.5" /> Subscription history
                  </div>
                  {detail.subscriptions.length === 0 ? (
                    <div className={CARD_WELL_DASHED}>Never subscribed</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detail.subscriptions.map((s) => (
                        <div key={s.id} className={CARD_ROW_SM}>
                          <div>
                            <span className="font-medium text-wangari-heading">{s.planName}</span>
                            <div className="text-[11px] text-wangari-subtle">
                              {new Date(s.startsAt).toLocaleDateString()} → {new Date(s.expiresAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-wangari-heading">KES {Number(s.amount).toLocaleString()}</div>
                            <Badge variant={s.status === "active" ? "success" : "outline"} className="!px-1.5 !py-0 !text-[10px]">{s.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tickets */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">
                    <TicketIcon className="h-3.5 w-3.5" /> Recent tickets
                  </div>
                  {detail.tickets.length === 0 ? (
                    <div className="text-xs text-wangari-subtle">No tickets from this owner.</div>
                  ) : (
                    <div className="space-y-1">
                      {detail.tickets.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg bg-wangari-cream/60 px-3 py-1.5 text-sm">
                          <span className="truncate text-wangari-heading">{t.subject}</span>
                          <Badge variant={t.status === "solved" ? "success" : t.status === "closed" ? "outline" : "warning"} className="!px-1.5 !py-0 !text-[10px]">{t.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 border-t border-wangari-border pt-4">
                  <PrimaryButton
                    onClick={() => {
                      const row = rows?.find((r) => r.id === detail.farm.id);
                      if (row) { setDetailId(null); setExtending(row); setDays("30"); }
                    }}
                  >
                    <CalendarPlus className="h-4 w-4" /> Extend subscription
                  </PrimaryButton>
                  <GhostButton onClick={() => setDetailId(null)}>Close</GhostButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
