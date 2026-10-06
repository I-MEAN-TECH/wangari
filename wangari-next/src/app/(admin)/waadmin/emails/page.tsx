"use client";

import * as React from "react";
import {
  Mail, Send, RotateCcw, PenLine, X,
  MailCheck, MailWarning, TrendingUp, Activity,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import {
  PageHeader, Panel, TableShell, Th, Td, FilterPill, Field, inputClass, Loading, ErrorState,
  Flash, EmptyState, PrimaryButton, GhostButton, Modal, StatCard,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CARD_PANEL_P4 } from "@/components/ui/patterns";

interface EmailRow {
  id: number;
  to: string;
  subject: string;
  template: string | null;
  status: string;
  provider: string | null;
  providerId: string | null;
  error: string | null;
  userId: number | null;
  createdAt: string;
}

interface EmailSummary {
  total: number;
  sent24h: number;
  failed24h: number;
  sent7d: number;
  failed7d: number;
  successRatePct: number;
  byTemplate: Record<string, { sent: number; failed: number }>;
}

const STATUS_VARIANT: Record<string, "success" | "danger" | "warning"> = {
  sent: "success",
  failed: "danger",
  queued: "warning",
};

export default function AdminEmailsPage() {
  const [rows, setRows] = React.useState<EmailRow[] | null>(null);
  const [summary, setSummary] = React.useState<EmailSummary | null>(null);
  const [failed, setFailed] = React.useState(0);
  const [status, setStatus] = React.useState("all");
  const [template, setTemplate] = React.useState("all");
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");
  const [compose, setCompose] = React.useState(false);
  const [form, setForm] = React.useState({ to: "", subject: "", body: "" });
  const [detail, setDetail] = React.useState<EmailRow | null>(null);

  const load = React.useCallback(() => {
    adminApi.get<{ rows: EmailRow[]; failed: number; summary: EmailSummary }>(`/emails?status=${status}&template=${template}`)
      .then((d) => { setRows(d.rows); setFailed(d.failed); setSummary(d.summary); })
      .catch((e) => setError(e.message));
  }, [status, template]);
  React.useEffect(load, [load]);

  async function resend(id: number) {
    try {
      await adminApi.post(`/emails/${id}/resend`);
      setFlash("Re-sent — check the log for the new attempt.");
      setTimeout(() => setFlash(""), 3000);
      setDetail(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function sendOne(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminApi.post("/emails/send", form);
      setForm({ to: "", subject: "", body: "" });
      setCompose(false);
      setFlash("Email sent.");
      setTimeout(() => setFlash(""), 3000);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const templates = summary ? Object.keys(summary.byTemplate) : [];
  const allFailingNoKey = rows && rows.length > 0 && rows.every((r) => r.status === "failed") && rows.some((r) => r.error?.includes("not configured"));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Mail className="h-5 w-5" />}
        title="Email Ops"
        description="Every transactional send — receipts, ticket replies, one-offs — logged with provider response and errors."
        actions={
          <PrimaryButton onClick={() => setCompose(true)}>
            <PenLine className="h-4 w-4" /> Compose
          </PrimaryButton>
        }
      />

      {allFailingNoKey && (
        <div className="rounded-xl border border-tone-warn-border bg-badge-yellow-bg px-4 py-3 text-sm font-medium text-badge-yellow-text">
          Every send is failing with &quot;not configured&quot; — add <code className="rounded bg-black/10 px-1">SMTP_HOST / RESEND_API_KEY</code> to the server .env and restart the API. Nothing is lost: failed sends stay in this log and can be re-sent.
        </div>
      )}
      {flash && <Flash message={flash} />}
      {error && <ErrorState message={error} />}

      {/* Delivery health */}
      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Success rate" value={`${summary.successRatePct}%`} icon={<TrendingUp className="h-5 w-5" />} accent={summary.successRatePct >= 90 ? "green" : summary.successRatePct >= 70 ? "amber" : "red"} hint="all time" />
            <StatCard label="Delivered 24h" value={summary.sent24h} icon={<MailCheck className="h-5 w-5" />} accent="green" />
            <StatCard label="Failed 24h" value={summary.failed24h} icon={<MailWarning className="h-5 w-5" />} accent={summary.failed24h > 0 ? "red" : "slate"} />
            <StatCard label="Delivered 7d" value={summary.sent7d} icon={<MailCheck className="h-5 w-5" />} accent="blue" />
            <StatCard label="Failed 7d" value={summary.failed7d} icon={<MailWarning className="h-5 w-5" />} accent={summary.failed7d > 0 ? "amber" : "slate"} />
            <StatCard label="Total logged" value={summary.total} icon={<Activity className="h-5 w-5" />} accent="slate" />
          </div>

          {/* Per-template breakdown */}
          {templates.length > 0 && (
            <Panel title="By template" description="Which emails are going out and where failures cluster">
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => {
                  const v = summary.byTemplate[t];
                  return (
                    <div key={t} className="rounded-xl border border-wangari-border px-3 py-2 text-xs">
                      <code className="font-mono font-semibold text-wangari-heading">{t}</code>
                      <span className="ml-2 text-wangari-green-700">{v.sent} sent</span>
                      {v.failed > 0 && <span className="ml-1.5 text-badge-red-text">{v.failed} failed</span>}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </>
      )}

      <Panel bodyClassName="p-0">
        <div className="border-b border-wangari-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {["all", "sent", "failed"].map((s) => (
              <FilterPill key={s} active={status === s} onClick={() => setStatus(s)}>
                {s}{s === "failed" && failed > 0 ? ` (${failed})` : ""}
              </FilterPill>
            ))}
            <span className="mx-1 w-px self-stretch bg-wangari-border" />
            <FilterPill active={template === "all"} onClick={() => setTemplate("all")}>all templates</FilterPill>
            {templates.map((t) => (
              <FilterPill key={t} active={template === t} onClick={() => setTemplate(t)}>{t}</FilterPill>
            ))}
          </div>
        </div>

        {!rows ? (
          <Loading label="Loading email log…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No emails yet" hint="Receipts, ticket replies, and one-offs will appear here." icon={<Mail className="h-5 w-5" />} />
        ) : (
          <TableShell minWidth={780}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>To</Th>
                <Th>Subject</Th>
                <Th>Template</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setDetail(r)}
                  className="cursor-pointer transition-colors hover:bg-wangari-green-50/40"
                >
                  <Td className="whitespace-nowrap text-xs text-wangari-muted">{new Date(r.createdAt).toLocaleString()}</Td>
                  <Td className="font-medium text-wangari-heading">{r.to}</Td>
                  <Td className="max-w-[240px]"><div className="truncate" title={r.subject}>{r.subject}</div></Td>
                  <Td className="text-xs text-wangari-subtle">{r.template || "—"}</Td>
                  <Td>
                    <Badge variant={STATUS_VARIANT[r.status] || "outline"}>{r.status}</Badge>
                    {r.error && (
                      <div className="mt-1 max-w-[200px] truncate text-[10px] text-badge-red-text" title={r.error}>{r.error}</div>
                    )}
                  </Td>
                  <Td className="text-right">
                    {r.status === "failed" && (
                      <GhostButton onClick={(e) => { e.stopPropagation(); resend(r.id); }} className="h-7 px-2 text-xs">
                        <RotateCcw className="h-3 w-3" /> Resend
                      </GhostButton>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      {/* Email detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDetail(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-wangari-border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${detail.status === "sent" ? "bg-wangari-green-50 text-wangari-green-700" : "bg-badge-red-bg text-badge-red-text"}`}>
                    {detail.status === "sent" ? <MailCheck className="h-5 w-5" /> : <MailWarning className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-snug text-wangari-heading">{detail.subject}</h2>
                    <div className="mt-0.5 text-xs text-wangari-subtle">#{detail.id} · {new Date(detail.createdAt).toLocaleString()}</div>
                    <div className="mt-1.5">
                      <Badge variant={STATUS_VARIANT[detail.status] || "outline"}>{detail.status}</Badge>
                    </div>
                  </div>
                </div>
                <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className={CARD_PANEL_P4}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">To</div>
                <div className="mt-1 font-medium text-wangari-heading">{detail.to}</div>
                <div className="mt-0.5 text-xs text-wangari-subtle">
                  {detail.template || "one-off"}{detail.userId ? ` · user #${detail.userId}` : ""}
                </div>
              </div>

              <div className={CARD_PANEL_P4}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Provider</div>
                <div className="mt-1 text-sm font-medium capitalize text-wangari-heading">{detail.provider || "none"}</div>
                {detail.providerId && (
                  <code className="mt-1 block break-all font-mono text-[11px] text-wangari-muted">{detail.providerId}</code>
                )}
              </div>

              {detail.error && (
                <div className="rounded-2xl border border-tone-bad-border bg-badge-red-bg p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-badge-red-text">Error</div>
                  <div className="mt-1 text-sm text-badge-red-text">{detail.error}</div>
                </div>
              )}

              <div className="flex gap-2 border-t border-wangari-border pt-4">
                {detail.status === "failed" && (
                  <PrimaryButton onClick={() => resend(detail.id)}>
                    <RotateCcw className="h-4 w-4" /> Resend
                  </PrimaryButton>
                )}
                <GhostButton onClick={() => setDetail(null)}>Close</GhostButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compose modal */}
      <Modal title="Compose email" onClose={() => setCompose(false)} open={compose} width="max-w-lg">
        <form onSubmit={sendOne} className="space-y-3">
          <Field label="To">
            <input required type="email" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Subject">
            <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Message">
            <textarea
              required
              rows={5}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="w-full rounded-lg border border-wangari-border bg-white px-3 py-2 text-sm text-wangari-heading placeholder:text-wangari-subtle focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => setCompose(false)}>Cancel</GhostButton>
            <PrimaryButton type="submit">
              <Send className="h-3.5 w-3.5" /> Send
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
