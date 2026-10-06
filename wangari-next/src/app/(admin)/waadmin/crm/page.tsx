"use client";

import * as React from "react";
import {
  Handshake, Plus, StickyNote, Building2, X,
  Users, Trophy, UserX, Target, Clock,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import {
  PageHeader, Panel, Field, inputClass, Loading, ErrorState, Flash, EmptyState,
  PrimaryButton, GhostButton, StatCard, Modal,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CARD_PANEL, CARD_WELL_DASHED } from "@/components/ui/patterns";

interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  type: string;
  stage: string;
  source: string | null;
  noteCount: number;
  updatedAt: string;
  summary?: CrmSummary;
}

interface CrmSummary {
  total: number;
  openPipeline: number;
  won: number;
  lost: number;
  conversionPct: number;
  byStage: Record<string, number>;
}

const STAGES = [
  { key: "lead", label: "Leads", dot: "bg-wangari-subtle" },
  { key: "contacted", label: "Contacted", dot: "bg-badge-blue-text" },
  { key: "demo", label: "Demo", dot: "bg-wangari-purple-700" },
  { key: "trial", label: "Trial", dot: "bg-badge-yellow-text" },
  { key: "customer", label: "Customer", dot: "bg-wangari-green-600" },
  { key: "churned", label: "Churned", dot: "bg-badge-red-text" },
];

const TYPE_VARIANT: Record<string, "outline" | "info" | "success"> = {
  lead: "outline",
  partner: "info",
  customer: "success",
};

const SOURCE_LABEL: Record<string, string> = {
  contact_form: "Contact form",
  manual: "Manual entry",
  referral: "Referral",
};

export default function AdminCrmPage() {
  const [contacts, setContacts] = React.useState<Contact[] | null>(null);
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", company: "", type: "lead", stage: "lead" });
  const [selected, setSelected] = React.useState<Contact | null>(null);
  const [notes, setNotes] = React.useState<{ id: number; body: string; createdAt: string }[]>([]);
  const [noteBody, setNoteBody] = React.useState("");

  const load = React.useCallback(() => {
    adminApi.get<Contact[]>("/crm/contacts").then(setContacts).catch((e) => setError(e.message));
  }, []);
  React.useEffect(load, [load]);

  const summary = contacts?.[0]?.summary ?? null;

  async function moveStage(c: Contact, stage: string) {
    try {
      await adminApi.patch(`/crm/contacts/${c.id}`, { stage });
      if (selected?.id === c.id) setSelected({ ...c, stage });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminApi.post("/crm/contacts", { ...form, stage: undefined });
      setForm({ name: "", email: "", phone: "", company: "", type: "lead", stage: "lead" });
      setShowAdd(false);
      setFlash("Contact added to pipeline.");
      setTimeout(() => setFlash(""), 4000);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function openNotes(c: Contact) {
    setSelected(c);
    try {
      setNotes(await adminApi.get(`/crm/contacts/${c.id}/notes`));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function addNote() {
    if (!selected || !noteBody.trim()) return;
    try {
      await adminApi.post(`/crm/contacts/${selected.id}/notes`, { body: noteBody });
      setNoteBody("");
      setNotes(await adminApi.get(`/crm/contacts/${selected.id}/notes`));
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Handshake className="h-5 w-5" />}
        title="CRM Pipeline"
        description="Leads, partners, and customers. The marketing contact form feeds the Leads column automatically."
        actions={
          <PrimaryButton onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add contact
          </PrimaryButton>
        }
      />

      {flash && <Flash message={flash} />}
      {error && <ErrorState message={error} />}

      {/* Funnel stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Total contacts" value={summary.total} icon={<Users className="h-5 w-5" />} accent="green" />
          <StatCard label="Open pipeline" value={summary.openPipeline} icon={<Clock className="h-5 w-5" />} accent="blue" hint="lead → trial" />
          <StatCard label="Won" value={summary.won} icon={<Trophy className="h-5 w-5" />} accent="green" hint="became customers" />
          <StatCard label="Lost" value={summary.lost} icon={<UserX className="h-5 w-5" />} accent={summary.lost > 0 ? "red" : "slate"} hint="churned" />
          <StatCard label="Win rate" value={`${summary.conversionPct}%`} icon={<Target className="h-5 w-5" />} accent="violet" hint="won vs decided" />
        </div>
      )}

      {/* Stage board */}
      {!contacts ? (
        <Panel><Loading label="Loading pipeline…" /></Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {STAGES.map((col) => {
            const items = contacts.filter((c) => c.stage === col.key);
            const stageCount = summary?.byStage?.[col.key] ?? items.length;
            return (
              <div key={col.key} className="min-h-[220px] rounded-2xl border border-wangari-border bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-wangari-muted">
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                    {col.label}
                  </span>
                  <span className="rounded-full bg-wangari-cream px-1.5 text-[10px] font-semibold text-wangari-muted">{stageCount}</span>
                </div>
                <div className="space-y-2">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => openNotes(c)}
                      className="cursor-pointer rounded-xl border border-wangari-border bg-white p-2.5 transition-shadow hover:shadow-md"
                    >
                      <div className="text-xs font-semibold text-wangari-heading">{c.name}</div>
                      {c.company && (
                        <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-wangari-subtle">
                          <Building2 className="h-3 w-3 shrink-0" /> {c.company}
                        </div>
                      )}
                      {c.email && <div className="truncate text-[10px] text-wangari-subtle">{c.email}</div>}
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <Badge variant={TYPE_VARIANT[c.type] || "outline"} className="!px-1.5 !py-0 !text-[9px]">{c.type}</Badge>
                        <select
                          value={c.stage}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => moveStage(c, e.target.value)}
                          className="rounded-md bg-wangari-cream px-1 py-0.5 text-[10px] font-medium text-wangari-text focus:outline-none"
                        >
                          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openNotes(c); }}
                        className="mt-1.5 flex w-full items-center gap-1 text-left text-[10px] font-medium text-wangari-subtle hover:text-wangari-green-700"
                      >
                        <StickyNote className="h-3 w-3" />
                        {c.noteCount > 0 ? `${c.noteCount} note${c.noteCount > 1 ? "s" : ""}` : "Add note"}
                      </button>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-xl border border-dashed border-wangari-border px-2 py-4 text-center text-[10px] text-wangari-subtle">
                      empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add contact modal */}
      <Modal title="Add contact" onClose={() => setShowAdd(false)} open={showAdd}>
        <form onSubmit={addContact} className="space-y-3">
          <Field label="Name">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <Field label="Farm / company">
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                <option value="lead">Lead</option>
                <option value="partner">Partner</option>
                <option value="customer">Customer</option>
              </select>
            </Field>
            <Field label="Stage" hint="Optional for partners/customers — defaults to Lead">
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className={inputClass}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => setShowAdd(false)}>Cancel</GhostButton>
            <PrimaryButton type="submit">Add contact</PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Contact detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-wangari-border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-5 p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-sm font-bold text-wangari-green-800">
                    {selected.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-wangari-heading">{selected.name}</h2>
                    <div className="mt-0.5 text-xs text-wangari-subtle">
                      {selected.email || "no email"}{selected.phone ? ` · ${selected.phone}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant={TYPE_VARIANT[selected.type] || "outline"}>{selected.type}</Badge>
                      <Badge variant="outline">{SOURCE_LABEL[selected.source || ""] || selected.source || "unknown source"}</Badge>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Company + stage mover */}
              {selected.company && (
                <div className="flex items-center gap-2 rounded-2xl border border-wangari-border p-3.5 text-sm">
                  <Building2 className="h-4 w-4 shrink-0 text-wangari-muted" />
                  <span className="font-medium text-wangari-heading">{selected.company}</span>
                </div>
              )}
              <div className={CARD_PANEL}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Pipeline stage</div>
                <select
                  value={selected.stage}
                  onChange={(e) => moveStage(selected, e.target.value)}
                  className={`${inputClass} mt-1.5`}
                >
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <div className="mt-1.5 text-[11px] text-wangari-subtle">Last updated {new Date(selected.updatedAt).toLocaleString()}</div>
              </div>

              {/* Notes */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">
                  <StickyNote className="h-3.5 w-3.5" /> Notes & activity
                </div>
                <div className="mb-3 max-h-72 space-y-2 overflow-y-auto">
                  {notes.length === 0 && (
                    <div className={CARD_WELL_DASHED}>
                      No notes yet — log every call, meeting, and touchpoint.
                    </div>
                  )}
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-xl bg-wangari-cream px-3 py-2 text-xs text-wangari-text">
                      <div className="mb-0.5 text-[10px] text-wangari-subtle">{new Date(n.createdAt).toLocaleString()}</div>
                      {n.body}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addNote()}
                    placeholder="Add a note…"
                    className="h-10 flex-1 rounded-lg border border-wangari-border bg-white px-3 text-sm text-wangari-heading placeholder:text-wangari-subtle focus:border-wangari-green-500 focus:outline-none"
                  />
                  <PrimaryButton onClick={addNote} disabled={!noteBody.trim()}>Save</PrimaryButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
