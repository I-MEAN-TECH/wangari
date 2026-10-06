"use client";

import * as React from "react";
import {
  Users, Search, ChevronLeft, ChevronRight, LogOut, MailCheck, X,
  UserRound, Ticket as TicketIcon, ReceiptText, Building2, ShieldCheck, History,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import {
  PageHeader, Panel, TableShell, Th, Td, Toolbar, SearchInput, FilterPill, Loading, ErrorState,
  Flash, EmptyState, GhostButton, StatCard, PrimaryButton,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CARD_PANEL, CARD_ROW_SM, CARD_WELL_DASHED } from "@/components/ui/patterns";

interface UserRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: string | null;
  createdAt: string;
  tokenVersion: number;
  googleId: string | null;
  ownedFarms: { id: number; name: string }[];
}

interface UserSummary {
  total: number;
  owners: number;
  verified: number;
  unverified: number;
  googleAccounts: number;
  newThisWeek: number;
}

interface UserDetail {
  user: Omit<UserRow, "ownedFarms"> & {
    avatar: string | null;
    trialStartsAt: string | null;
    trialEndsAt: string | null;
    ownedFarms: { id: number; name: string; code: string | null; _count: { workers: number; flocks: number } }[];
  };
  subscriptions: { id: number; planName: string; amount: any; status: string; reference: string | null; startsAt: string; expiresAt: string }[];
  tickets: { id: number; subject: string; status: string; createdAt: string }[];
  recentActions: { id: number; action: string; createdAt: string }[];
}

const ROLE_FILTERS = [
  { key: "all", label: "All roles" },
  { key: "farm_owner", label: "Farm owners" },
];

const VERIFIED_FILTERS = [
  { key: "all", label: "All" },
  { key: "yes", label: "Verified" },
  { key: "no", label: "Unverified" },
];

export default function AdminUsersPage() {
  const [rows, setRows] = React.useState<UserRow[] | null>(null);
  const [summary, setSummary] = React.useState<UserSummary | null>(null);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [role, setRole] = React.useState("all");
  const [verified, setVerified] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<UserDetail | null>(null);
  const pageSize = 20;

  const load = React.useCallback(async () => {
    try {
      const res = await adminApi.get<{ rows: UserRow[]; total: number; summary: UserSummary }>(
        `/users?q=${encodeURIComponent(q)}&page=${page}&role=${role}&verified=${verified}`
      );
      setRows(res.rows);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (e: any) {
      setError(e.message);
    }
  }, [q, page, role, verified]);
  React.useEffect(() => { load(); }, [load]);

  const loadDetail = React.useCallback(async (id: number) => {
    setDetailId(id);
    setDetail(null);
    try {
      setDetail(await adminApi.get<UserDetail>(`/users/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  async function act(id: number, action: "force-logout" | "verify-email", confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try {
      await adminApi.post(`/users/${id}/${action}`);
      setFlash(action === "force-logout" ? "User signed out of all devices." : "Email marked verified.");
      setTimeout(() => setFlash(""), 4000);
      load();
      if (detailId === id) loadDetail(id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="Users"
        description="Every account on the platform — verification state, plan, and support actions. Click a row for the full picture."
      />

      {flash && <Flash message={flash} />}
      {error && <ErrorState message={error} />}

      {/* Summary stat cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total users" value={summary.total} icon={<Users className="h-5 w-5" />} accent="green" />
          <StatCard label="Farm owners" value={summary.owners} icon={<UserRound className="h-5 w-5" />} accent="blue" />
          <StatCard label="Verified" value={summary.verified} icon={<ShieldCheck className="h-5 w-5" />} accent="green" />
          <StatCard label="Unverified" value={summary.unverified} icon={<MailCheck className="h-5 w-5" />} accent={summary.unverified > 0 ? "amber" : "slate"} hint="can verify manually" />
          <StatCard label="Google sign-in" value={summary.googleAccounts} icon={<UserRound className="h-5 w-5" />} accent="violet" />
          <StatCard label="New this week" value={summary.newThisWeek} icon={<History className="h-5 w-5" />} accent="slate" />
        </div>
      )}

      <Panel bodyClassName="p-0">
        <div className="border-b border-wangari-border px-5 py-3">
          <Toolbar>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wangari-subtle" />
              <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, email, or phone…" className="pl-8" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_FILTERS.map((f) => (
                <FilterPill key={f.key} active={role === f.key} onClick={() => { setRole(f.key); setPage(1); }}>{f.label}</FilterPill>
              ))}
              <span className="mx-1 w-px self-stretch bg-wangari-border" />
              {VERIFIED_FILTERS.map((f) => (
                <FilterPill key={f.key} active={verified === f.key} onClick={() => { setVerified(f.key); setPage(1); }}>{f.label}</FilterPill>
              ))}
            </div>
            <span className="ml-auto text-xs text-wangari-muted">{total} users</span>
          </Toolbar>
        </div>

        {!rows ? (
          <Loading label="Loading users…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No users match" hint="Try a different search or filter." icon={<Users className="h-5 w-5" />} />
        ) : (
          <TableShell minWidth={760}>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Farms</Th>
                <Th>Verified</Th>
                <Th>Joined</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => loadDetail(u.id)}
                  className="cursor-pointer transition-colors hover:bg-wangari-green-50/40"
                >
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-[11px] font-bold text-wangari-green-800">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-wangari-heading">{u.name}</span>
                          {u.role !== "farm_owner" && <Badge variant="info">{u.role.replace("_", " ")}</Badge>}
                          {u.googleId && <Badge variant="outline" className="!px-1.5 !py-0 !text-[10px]">Google</Badge>}
                        </div>
                        <div className="truncate text-xs text-wangari-subtle">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-xs text-wangari-muted">
                    {u.ownedFarms.length ? u.ownedFarms.map((f) => f.name).join(", ") : "—"}
                  </Td>
                  <Td>
                    {u.emailVerified ? (
                      <Badge variant="success">verified</Badge>
                    ) : (
                      <Badge variant="warning">unverified</Badge>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-wangari-muted">{new Date(u.createdAt).toLocaleDateString()}</Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-1.5">
                      <GhostButton
                        onClick={(e) => { e.stopPropagation(); act(u.id, "force-logout", `Force-logout ${u.email} from all devices?`); }}
                        className="h-7 px-2 text-xs text-badge-yellow-text hover:bg-badge-yellow-bg hover:text-badge-yellow-text"
                      >
                        <LogOut className="h-3 w-3" /> Force logout
                      </GhostButton>
                      {!u.emailVerified && (
                        <GhostButton onClick={(e) => { e.stopPropagation(); act(u.id, "verify-email"); }} className="h-7 px-2 text-xs">
                          <MailCheck className="h-3 w-3" /> Verify
                        </GhostButton>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-wangari-border px-5 py-3 text-sm text-wangari-muted">
            <span>Page {page} of {pages} · {total} users</span>
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

      {/* User detail drawer */}
      {detailId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDetailId(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l border-wangari-border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {!detail ? (
              <div className="flex h-32 items-center justify-center text-sm text-wangari-muted">
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-wangari-green-200 border-t-wangari-green-600" />
                Loading user…
              </div>
            ) : (
              <div className="space-y-5 p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-sm font-bold text-wangari-green-800">
                      {detail.user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-wangari-heading">{detail.user.name}</h2>
                      <div className="mt-0.5 text-xs text-wangari-subtle">
                        {detail.user.email}{detail.user.phone ? ` · ${detail.user.phone}` : ""}
                      </div>
                      <div className="mt-1 flex gap-1.5">
                        <Badge variant="info">{detail.user.role.replace("_", " ")}</Badge>
                        {detail.user.emailVerified ? <Badge variant="success">verified</Badge> : <Badge variant="warning">unverified</Badge>}
                        {detail.user.googleId && <Badge variant="outline">Google</Badge>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setDetailId(null)} className="rounded-lg p-1 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className={CARD_PANEL}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Joined</div>
                    <div className="mt-1 font-medium text-wangari-heading">{new Date(detail.user.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className={CARD_PANEL}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Trial</div>
                    <div className="mt-1 font-medium text-wangari-heading">
                      {detail.user.trialEndsAt
                        ? detail.user.trialEndsAt > new Date().toISOString()
                          ? `ends ${new Date(detail.user.trialEndsAt).toLocaleDateString()}`
                          : "ended"
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* Farms */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">
                    <Building2 className="h-3.5 w-3.5" /> Owned farms
                  </div>
                  {detail.user.ownedFarms.length === 0 ? (
                    <div className="text-xs text-wangari-subtle">No farms owned.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detail.user.ownedFarms.map((f) => (
                        <div key={f.id} className={CARD_ROW_SM}>
                          <div>
                            <span className="font-medium text-wangari-heading">{f.name}</span>
                            <div className="text-[11px] text-wangari-subtle">{f.code || "no code"}</div>
                          </div>
                          <span className="text-xs text-wangari-muted">{f._count.workers} workers · {f._count.flocks} flocks</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subscriptions */}
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
                {detail.tickets.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">
                      <TicketIcon className="h-3.5 w-3.5" /> Recent tickets
                    </div>
                    <div className="space-y-1">
                      {detail.tickets.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg bg-wangari-cream/60 px-3 py-1.5 text-sm">
                          <span className="truncate text-wangari-heading">{t.subject}</span>
                          <Badge variant={t.status === "solved" ? "success" : t.status === "closed" ? "outline" : "warning"} className="!px-1.5 !py-0 !text-[10px]">{t.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent activity */}
                {detail.recentActions.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">
                      <History className="h-3.5 w-3.5" /> Recent activity
                    </div>
                    <div className="space-y-1">
                      {detail.recentActions.map((a) => (
                        <div key={a.id} className="flex items-center justify-between rounded-lg bg-wangari-cream/60 px-3 py-1.5 text-xs">
                          <code className="font-mono text-wangari-heading">{a.action}</code>
                          <span className="text-wangari-subtle">{new Date(a.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 border-t border-wangari-border pt-4">
                  {!detail.user.emailVerified && (
                    <PrimaryButton onClick={() => act(detail.user.id, "verify-email")}>
                      <MailCheck className="h-4 w-4" /> Verify email
                    </PrimaryButton>
                  )}
                  <GhostButton
                    onClick={() => act(detail.user.id, "force-logout", `Force-logout ${detail.user.email} from all devices?`)}
                    className="text-badge-yellow-text hover:bg-badge-yellow-bg hover:text-badge-yellow-text"
                  >
                    <LogOut className="h-4 w-4" /> Force logout everywhere
                  </GhostButton>
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
