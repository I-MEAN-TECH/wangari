"use client";

import * as React from "react";
import {
  TicketPercent, Plus, Power, X, Share2, Layers, Download, Check,
  Ticket as TicketIcon, Zap, Handshake, ReceiptText, Pencil, Trash2, Users,
} from "lucide-react";
import { adminApi } from "@/lib/admin-client";
import {
  PageHeader, Panel, TableShell, Th, Td, Field, inputClass, Loading, ErrorState, Flash,
  EmptyState, Modal, PrimaryButton, GhostButton, StatCard,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CARD_PANEL, CARD_ROW_SM, CARD_WELL_DASHED } from "@/components/ui/patterns";

interface Redemption {
  id: number;
  reference: string | null;
  discountKes: any;
  createdAt: string;
}

interface PlanOption {
  id: string;
  name: string;
}

interface PromoRow {
  id: string;
  code: string;
  type: string;
  discountType: string | null;
  value: number | null;
  freeMonths?: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  partnerName: string | null;
  planId?: string | null;
  plan?: { id: string; name: string } | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  redemptions: number;
  recentRedemptions: Redemption[];
  summary: {
    totalCodes: number;
    active: number;
    totalRedemptions: number;
    totalDiscountKes: number;
    partnerCodes: number;
  };
}

interface RedeemerRow {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  reference: string | null;
  discountKes: any;
  createdAt: string;
  subscription: { id: number; plan: string; planName: string; expiresAt: string } | null;
}

interface PromoListRes extends Array<PromoRow> {}

const EMPTY = { code: "", type: "discount", discountType: "percent", value: "", freeMonths: "", maxRedemptions: "", partnerName: "", expiresAt: "", planId: "" };

function promoState(p: PromoRow): "active" | "expired" | "disabled" {
  if (!p.active) return "disabled";
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) return "expired";
  return "active";
}

function isFreeType(t: string) {
  return t === "sponsorship" || t === "partnership";
}

export default function AdminPromosPage() {
  const [rows, setRows] = React.useState<PromoRow[] | null>(null);
  const [plans, setPlans] = React.useState<PlanOption[]>([]);
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");
  const [form, setForm] = React.useState({ ...EMPTY });
  const [busy, setBusy] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [detail, setDetail] = React.useState<PromoRow | null>(null);

  const load = React.useCallback(() => {
    adminApi.get<PromoListRes>("/promos").then((r) => setRows(r)).catch((e) => setError(e.message));
  }, []);
  React.useEffect(load, [load]);

  React.useEffect(() => {
    adminApi.get<any[]>("/plans").then((ps) => setPlans(ps.map((p) => ({ id: p.id, name: p.name })))).catch(() => {});
  }, []);

  const planName = (id?: string | null) => plans.find((p) => p.id === id)?.name || null;
  const summary = rows?.[0]?.summary ?? null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adminApi.post("/promos", {
        code: form.code,
        type: form.type,
        discountType: form.discountType,
        value: isFreeType(form.type) ? 0 : Number(form.value),
        freeMonths: isFreeType(form.type) ? Number(form.freeMonths) : null,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        partnerName: form.partnerName || null,
        expiresAt: form.expiresAt || null,
        planId: form.planId || null,
      });
      setForm({ ...EMPTY });
      setShowCreate(false);
      setFlash("Promo code created — it's live at checkout immediately.");
      setTimeout(() => setFlash(""), 4000);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: PromoRow) {
    try {
      await adminApi.patch(`/promos/${p.id}`, { active: !p.active });
      setDetail(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  // ── Edit existing promo (no delete/recreate needed) ──
  const [edit, setEdit] = React.useState<PromoRow | null>(null);
  const [editForm, setEditForm] = React.useState({ ...EMPTY });
  const [editBusy, setEditBusy] = React.useState(false);

  function openEdit(p: PromoRow) {
    setEdit(p);
    setEditForm({
      code: p.code,
      type: p.type,
      discountType: p.discountType || "percent",
      value: p.value != null ? String(p.value) : "",
      freeMonths: p.freeMonths != null ? String(p.freeMonths) : "",
      maxRedemptions: p.maxRedemptions != null ? String(p.maxRedemptions) : "",
      partnerName: p.partnerName || "",
      expiresAt: p.expiresAt ? p.expiresAt.slice(0, 10) : "",
      planId: p.planId || "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setEditBusy(true);
    setError("");
    try {
      await adminApi.patch(`/promos/${edit.id}`, {
        code: editForm.code,
        type: editForm.type,
        discountType: isFreeType(editForm.type) ? null : editForm.discountType,
        value: isFreeType(editForm.type) ? null : Number(editForm.value),
        freeMonths: isFreeType(editForm.type) ? Number(editForm.freeMonths) : null,
        maxRedemptions: editForm.maxRedemptions ? Number(editForm.maxRedemptions) : null,
        partnerName: editForm.partnerName || null,
        expiresAt: editForm.expiresAt || null,
        planId: editForm.planId || null,
      });
      setEdit(null);
      setFlash("Promo code updated.");
      setTimeout(() => setFlash(""), 4000);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEditBusy(false);
    }
  }

  // ── Redeemers manager ──
  const [redeemers, setRedeemers] = React.useState<RedeemerRow[] | null>(null);
  const [redeemersFor, setRedeemersFor] = React.useState<PromoRow | null>(null);
  const [redeemersBusy, setRedeemersBusy] = React.useState(false);

  async function openRedeemers(p: PromoRow) {
    setRedeemersFor(p);
    setRedeemers(null);
    try {
      setRedeemers(await adminApi.get<RedeemerRow[]>(`/promos/${p.id}/redemptions`));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function revokeRedemption(r: RedeemerRow) {
    if (!redeemersFor) return;
    if (!window.confirm(`Remove ${r.userEmail || `user #${r.userId}`} from ${redeemersFor.code}?${r.subscription ? "\\n\\nTheir sponsored subscription will be cancelled." : ""}`)) return;
    setRedeemersBusy(true);
    try {
      await adminApi.delete(`/promos/${redeemersFor.id}/redemptions/${r.id}`);
      setFlash("Redemption removed.");
      setTimeout(() => setFlash(""), 4000);
      await openRedeemers(redeemersFor);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRedeemersBusy(false);
    }
  }

  // ── WhatsApp share message ──
  const [sharedCode, setSharedCode] = React.useState<string | null>(null);
  function shareMessage(p: PromoRow): string {
    const isFree = isFreeType(p.type);
    const benefit = isFree
      ? `🎁 ${p.freeMonths || "?"} months of Wangari — completely FREE`
      : p.discountType === "percent" ? `🎁 ${p.value}% off your subscription` : `🎁 KES ${p.value?.toLocaleString()} off your subscription`;
    const planLine = p.planId
      ? `\\nValid on the *${planName(p.planId) || p.plan?.name || p.planId}* plan only.`
      : "";
    return [
      `🌿 *Wangari Farm OS* — ${benefit}`,
      p.partnerName ? `Powered by ${p.partnerName}` : "",
      "",
      `Your code: *${p.code}*`,
      isFree
        ? `How to use: open ${"https://wangari.imeantech.com/subscription"} → enter the code → tap *Redeem*. Free access starts instantly — no payment needed.`
        : `How to use: open ${"https://wangari.imeantech.com/subscription"} → pick a plan → enter the code at checkout.`,
      planLine,
      "",
      "Track animals, crops, sales & workers — even offline. 🐔🌾",
    ].filter(Boolean).join("\\n");
  }
  async function copyShare(p: PromoRow) {
    try {
      await navigator.clipboard.writeText(shareMessage(p));
      setSharedCode(p.id);
      setTimeout(() => setSharedCode(null), 2500);
    } catch {}
  }
  function openWhatsApp(p: PromoRow) {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage(p))}`, "_blank");
  }

  // ── Batch generation ──
  const [showBatch, setShowBatch] = React.useState(false);
  const [batchForm, setBatchForm] = React.useState({ prefix: "WANGARI", count: "50", type: "sponsorship", freeMonths: "12", discountType: "percent", value: "", partnerName: "", expiresAt: "", planId: "" });
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchCodes, setBatchCodes] = React.useState<string[] | null>(null);
  const [batchError, setBatchError] = React.useState("");

  async function generateBatch() {
    setBatchBusy(true);
    setBatchError("");
    try {
      const isFree = isFreeType(batchForm.type);
      const res = await adminApi.post<{ ok: boolean; created: string[] }>("/promos/batch", {
        prefix: batchForm.prefix,
        count: Number(batchForm.count),
        type: batchForm.type,
        ...(isFree ? { freeMonths: Number(batchForm.freeMonths) } : { discountType: batchForm.discountType, value: Number(batchForm.value) }),
        partnerName: batchForm.partnerName || null,
        expiresAt: batchForm.expiresAt || null,
        planId: batchForm.planId || null,
      });
      setBatchCodes(res.created);
      load();
    } catch (e: any) {
      setBatchError(e.message);
    } finally {
      setBatchBusy(false);
    }
  }

  function exportCsv() {
    if (!batchCodes) return;
    const isFree = isFreeType(batchForm.type);
    const rows = [
      "code,type,benefit,partner,plan,expires",
      ...batchCodes.map((c) =>
        [c, batchForm.type, isFree ? `${batchForm.freeMonths} months free` : `${batchForm.discountType === "percent" ? batchForm.value + "%" : "KES " + batchForm.value} off`, batchForm.partnerName, batchForm.planId ? planName(batchForm.planId) || batchForm.planId : "any", batchForm.expiresAt || "never"]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\\n");
    const url = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `wangari-codes-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<TicketPercent className="h-5 w-5" />}
        title="Promo & Partnership Codes"
        description="Codes are redeemed at checkout — the payment webhook records attribution and discount."
        actions={
          <div className="flex gap-2">
            <GhostButton onClick={() => { setBatchCodes(null); setShowBatch(true); }}>
              <Layers className="h-4 w-4" /> Batch generate
            </GhostButton>
            <PrimaryButton onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New code
            </PrimaryButton>
          </div>
        }
      />

      {flash && <Flash message={flash} />}
      {error && <ErrorState message={error} />}

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Total codes" value={summary.totalCodes} icon={<TicketIcon className="h-5 w-5" />} accent="green" />
          <StatCard label="Active now" value={summary.active} icon={<Zap className="h-5 w-5" />} accent="blue" hint="usable at checkout" />
          <StatCard label="Total redemptions" value={summary.totalRedemptions} icon={<ReceiptText className="h-5 w-5" />} accent="violet" />
          <StatCard label="Discount given" value={`KES ${summary.totalDiscountKes.toLocaleString()}`} icon={<TicketPercent className="h-5 w-5" />} accent="amber" hint="across all codes" />
          <StatCard label="Partner codes" value={summary.partnerCodes} icon={<Handshake className="h-5 w-5" />} accent="slate" />
        </div>
      )}

      <Panel bodyClassName="p-0">
        {!rows ? (
          <Loading label="Loading codes…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No promo codes yet" hint="Create the first one with the New code button." icon={<TicketPercent className="h-5 w-5" />} />
        ) : (
          <TableShell minWidth={880}>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Plan</Th>
                <Th>Redeemed</Th>
                <Th>Partner</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const state = promoState(p);
                return (
                  <tr
                    key={p.id}
                    onClick={() => setDetail(p)}
                    className="cursor-pointer transition-colors hover:bg-wangari-green-50/40"
                  >
                    <Td>
                      <code className="rounded bg-wangari-green-50 px-2 py-0.5 font-mono text-xs font-bold text-wangari-green-800">{p.code}</code>
                      <div className="mt-0.5 text-[11px] capitalize text-wangari-subtle">{p.type}</div>
                    </Td>
                    <Td className="text-wangari-text">
                      {isFreeType(p.type)
                        ? `${p.freeMonths || "?"} mo free`
                        : p.discountType === "percent" ? `${p.value}%` : `KES ${p.value?.toLocaleString()}`}
                    </Td>
                    <Td className="text-wangari-text">
                      {p.planId ? (
                        <Badge variant="info">{planName(p.planId) || p.plan?.name || p.planId}</Badge>
                      ) : (
                        <span className="text-wangari-muted">any</span>
                      )}
                    </Td>
                    <Td className="text-wangari-text">
                      <span className="font-medium text-wangari-heading">{p.timesRedeemed}</span>
                      {p.maxRedemptions ? <span className="text-wangari-muted"> / {p.maxRedemptions}</span> : ""}
                    </Td>
                    <Td className="text-wangari-muted">{p.partnerName || "—"}</Td>
                    <Td className="whitespace-nowrap text-xs text-wangari-muted">
                      {p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "never"}
                    </Td>
                    <Td>
                      {state === "active" ? (
                        <Badge variant="success">active</Badge>
                      ) : state === "expired" ? (
                        <Badge variant="warning">expired</Badge>
                      ) : (
                        <Badge variant="outline">disabled</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <GhostButton
                          onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          className="h-7 px-2 text-xs"
                        >
                          <Pencil className="h-3 w-3" />
                        </GhostButton>
                        <GhostButton
                          onClick={(e) => { e.stopPropagation(); openRedeemers(p); }}
                          className="h-7 px-2 text-xs"
                        >
                          <Users className="h-3 w-3" />
                        </GhostButton>
                        <GhostButton
                          onClick={(e) => { e.stopPropagation(); toggle(p); }}
                          className="h-7 px-2 text-xs"
                        >
                          <Power className="h-3 w-3" /> {p.active ? "Disable" : "Enable"}
                        </GhostButton>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>

      {/* Create modal */}
      <Modal title="Create promo code" onClose={() => setShowCreate(false)} open={showCreate} width="max-w-lg">
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" hint="Uppercase, unique">
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="LAUNCH25" className={inputClass} />
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                <option value="discount">Discount</option>
                <option value="partnership">Partnership (free months)</option>
                <option value="sponsorship">Sponsorship (free months)</option>
                <option value="credit">Credit</option>
              </select>
            </Field>
            {isFreeType(form.type) ? (
              <Field label="Free months" hint="Granted on redemption, no payment needed">
                <input required type="number" min="1" max="36" value={form.freeMonths} onChange={(e) => setForm({ ...form, freeMonths: e.target.value })} placeholder="12" className={inputClass} />
              </Field>
            ) : (
              <>
                <Field label="Discount type">
                  <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })} className={inputClass}>
                    <option value="percent">% off</option>
                    <option value="fixed">KES off</option>
                  </select>
                </Field>
                <Field label="Value" hint={form.discountType === "percent" ? "1-100" : "KES amount"}>
                  <input required type="number" min="1" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="25" className={inputClass} />
                </Field>
              </>
            )}
            <Field label="Max uses" hint="Empty = unlimited">
              <input type="number" min="1" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Expires" hint="Empty = never">
              <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Plan" hint="Empty = usable on any plan">
              <select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} className={inputClass}>
                <option value="">Any plan</option>
                {plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label={form.type === "sponsorship" ? "Sponsor name" : "Partner name"} hint="Optional — shown to the farmer when they redeem">
            <input value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} className={inputClass} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => setShowCreate(false)}>Cancel</GhostButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create code"}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal title={`Edit ${edit?.code || ""}`} onClose={() => setEdit(null)} open={!!edit} width="max-w-lg">
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" hint="Uppercase, unique">
              <input required value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })} className={inputClass} />
            </Field>
            <Field label="Type">
              <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} className={inputClass}>
                <option value="discount">Discount</option>
                <option value="partnership">Partnership (free months)</option>
                <option value="sponsorship">Sponsorship (free months)</option>
                <option value="credit">Credit</option>
              </select>
            </Field>
            {isFreeType(editForm.type) ? (
              <Field label="Free months" hint="Granted on redemption">
                <input required type="number" min="1" max="36" value={editForm.freeMonths} onChange={(e) => setEditForm({ ...editForm, freeMonths: e.target.value })} className={inputClass} />
              </Field>
            ) : (
              <>
                <Field label="Discount type">
                  <select value={editForm.discountType} onChange={(e) => setEditForm({ ...editForm, discountType: e.target.value })} className={inputClass}>
                    <option value="percent">% off</option>
                    <option value="fixed">KES off</option>
                  </select>
                </Field>
                <Field label="Value" hint={editForm.discountType === "percent" ? "1-100" : "KES amount"}>
                  <input required type="number" min="1" value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} className={inputClass} />
                </Field>
              </>
            )}
            <Field label="Max uses" hint="Empty = unlimited">
              <input type="number" min="1" value={editForm.maxRedemptions} onChange={(e) => setEditForm({ ...editForm, maxRedemptions: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Expires" hint="Empty = never">
              <input type="date" value={editForm.expiresAt} onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Plan" hint="Empty = usable on any plan">
              <select value={editForm.planId} onChange={(e) => setEditForm({ ...editForm, planId: e.target.value })} className={inputClass}>
                <option value="">Any plan</option>
                {plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label={editForm.type === "sponsorship" ? "Sponsor name" : "Partner name"} hint="Optional">
            <input value={editForm.partnerName} onChange={(e) => setEditForm({ ...editForm, partnerName: e.target.value })} className={inputClass} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => setEdit(null)}>Cancel</GhostButton>
            <PrimaryButton type="submit" disabled={editBusy}>
              {editBusy ? "Saving…" : "Save changes"}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Redeemers modal */}
      <Modal title={`Redeemers — ${redeemersFor?.code || ""}`} onClose={() => setRedeemersFor(null)} open={!!redeemersFor} width="max-w-xl">
        {!redeemers ? (
          <Loading label="Loading redeemers…" />
        ) : redeemers.length === 0 ? (
          <EmptyState title="No one has used this code yet" hint="Redemptions appear here as farmers redeem it." icon={<Users className="h-5 w-5" />} />
        ) : (
          <div className="space-y-2">
            {redeemers.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-wangari-border px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-wangari-heading">{r.userName || "Unknown farmer"}</div>
                  <div className="truncate text-xs text-wangari-muted">{r.userEmail || `user #${r.userId}`}</div>
                  <div className="mt-0.5 text-[11px] text-wangari-subtle">
                    {new Date(r.createdAt).toLocaleString()}
                    {r.subscription ? ` · ${r.subscription.planName || r.subscription.plan} until ${new Date(r.subscription.expiresAt).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <GhostButton
                  onClick={() => revokeRedemption(r)}
                  disabled={redeemersBusy}
                  className="h-8 shrink-0 px-2 text-xs text-wangari-red-600 hover:bg-tone-bad-bg"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </GhostButton>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-wangari-subtle">
              Removing a redeemer frees up a use of the code. If the code granted sponsored time, that subscription is cancelled too — payment-based discounts are never touched.
            </p>
          </div>
        )}
      </Modal>

      {/* Batch generation modal */}
      <Modal title="Batch generate codes" onClose={() => setShowBatch(false)} open={showBatch} width="max-w-lg">
        {batchCodes ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-wangari-green-50 px-4 py-3 text-sm font-semibold text-wangari-green-800">
              ✓ {batchCodes.length} unique codes created — each is single-use.
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-wangari-border bg-wangari-cream/40 p-3">
              <div className="grid grid-cols-1 gap-1 font-mono text-xs text-wangari-heading">
                {batchCodes.map((c) => <div key={c}>{c}</div>)}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <GhostButton onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</GhostButton>
              <PrimaryButton onClick={() => { setBatchCodes(null); setShowBatch(false); }}>Done</PrimaryButton>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); generateBatch(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code prefix" hint="e.g. NAKURU, MT-KENYA">
                <input value={batchForm.prefix} onChange={(e) => setBatchForm({ ...batchForm, prefix: e.target.value.toUpperCase() })} placeholder="WANGARI" className={inputClass} />
              </Field>
              <Field label="How many" hint="1–500">
                <input required type="number" min="1" max="500" value={batchForm.count} onChange={(e) => setBatchForm({ ...batchForm, count: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Type">
                <select value={batchForm.type} onChange={(e) => setBatchForm({ ...batchForm, type: e.target.value })} className={inputClass}>
                  <option value="sponsorship">Sponsorship (free months)</option>
                  <option value="partnership">Partnership (free months)</option>
                  <option value="discount">Discount</option>
                </select>
              </Field>
              {isFreeType(batchForm.type) ? (
                <Field label="Free months" hint="1–36">
                  <input required type="number" min="1" max="36" value={batchForm.freeMonths} onChange={(e) => setBatchForm({ ...batchForm, freeMonths: e.target.value })} className={inputClass} />
                </Field>
              ) : (
                <>
                  <Field label="Discount type">
                    <select value={batchForm.discountType} onChange={(e) => setBatchForm({ ...batchForm, discountType: e.target.value })} className={inputClass}>
                      <option value="percent">% off</option>
                      <option value="fixed">KES off</option>
                    </select>
                  </Field>
                  <Field label="Value">
                    <input required type="number" min="1" value={batchForm.value} onChange={(e) => setBatchForm({ ...batchForm, value: e.target.value })} className={inputClass} />
                  </Field>
                </>
              )}
              <Field label="Expires" hint="Empty = never">
                <input type="date" value={batchForm.expiresAt} onChange={(e) => setBatchForm({ ...batchForm, expiresAt: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Plan" hint="Empty = any plan">
                <select value={batchForm.planId} onChange={(e) => setBatchForm({ ...batchForm, planId: e.target.value })} className={inputClass}>
                  <option value="">Any plan</option>
                  {plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label={batchForm.type === "sponsorship" ? "Sponsor name" : "Partner name"} hint="Optional — appears in the WhatsApp message">
              <input value={batchForm.partnerName} onChange={(e) => setBatchForm({ ...batchForm, partnerName: e.target.value })} className={inputClass} />
            </Field>
            {batchError && <div className="rounded-lg bg-tone-bad-bg px-3 py-2 text-xs text-badge-red-text">{batchError}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <GhostButton onClick={() => setShowBatch(false)}>Cancel</GhostButton>
              <PrimaryButton type="submit" disabled={batchBusy}>
                {batchBusy ? "Generating…" : `Generate ${batchForm.count || ""} codes`}
              </PrimaryButton>
            </div>
          </form>
        )}
      </Modal>

      {/* Code detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDetail(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-wangari-border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <code className="rounded bg-wangari-green-50 px-3 py-1 font-mono text-lg font-bold text-wangari-green-800">{detail.code}</code>
                  <div className="mt-1.5 flex gap-1.5">
                    <Badge variant="info">{detail.type}</Badge>
                    {promoState(detail) === "active" ? <Badge variant="success">active</Badge> : promoState(detail) === "expired" ? <Badge variant="warning">expired</Badge> : <Badge variant="outline">disabled</Badge>}
                    {detail.planId && <Badge variant="info">{planName(detail.planId) || detail.plan?.name || detail.planId}</Badge>}
                  </div>
                </div>
                <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Discount</div>
                  <div className="mt-1 text-xl font-bold text-wangari-heading">
                    {isFreeType(detail.type)
                      ? `${detail.freeMonths || "?"} mo free`
                      : detail.discountType === "percent" ? `${detail.value}%` : `KES ${detail.value?.toLocaleString()}`}
                  </div>
                </div>
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Redeemed</div>
                  <div className="mt-1 text-xl font-bold text-wangari-heading">
                    {detail.timesRedeemed}{detail.maxRedemptions ? <span className="text-sm text-wangari-muted"> / {detail.maxRedemptions}</span> : ""}
                  </div>
                </div>
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Plan</div>
                  <div className="mt-1 font-medium text-wangari-heading">{detail.planId ? planName(detail.planId) || detail.plan?.name || detail.planId : "Any plan"}</div>
                </div>
                <div className={CARD_PANEL}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Expires</div>
                  <div className="mt-1 font-medium text-wangari-heading">
                    {detail.expiresAt ? new Date(detail.expiresAt).toLocaleDateString() : "Never"}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-wangari-subtle">
                  <span className="flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5" /> Recent redemptions</span>
                  <button onClick={() => openRedeemers(detail)} className="text-wangari-green-700 hover:underline">Manage all</button>
                </div>
                {detail.recentRedemptions.length === 0 ? (
                  <div className={CARD_WELL_DASHED}>
                    Not redeemed yet — redemptions appear here as customers use it at checkout.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {detail.recentRedemptions.map((r) => (
                      <div key={r.id} className={CARD_ROW_SM}>
                        <div>
                          <div className="font-mono text-xs text-wangari-heading">{r.reference || "no reference"}</div>
                          <div className="text-[11px] text-wangari-subtle">{new Date(r.createdAt).toLocaleString()}</div>
                        </div>
                        <span className="font-semibold text-wangari-green-700">−KES {Number(r.discountKes).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Share message preview */}
              <div className="rounded-2xl border border-wangari-border bg-wangari-cream/40 p-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-wangari-subtle">
                  <Share2 className="h-3.5 w-3.5" /> WhatsApp message
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-wangari-text">{shareMessage(detail)}</pre>
                <div className="mt-3 flex gap-2">
                  <PrimaryButton onClick={() => openWhatsApp(detail)} className="h-8 px-3 text-xs">
                    <Share2 className="h-3.5 w-3.5" /> Open WhatsApp
                  </PrimaryButton>
                  <GhostButton onClick={() => copyShare(detail)} className="h-8 px-3 text-xs">
                    {sharedCode === detail.id ? <><Check className="h-3.5 w-3.5" /> Copied!</> : "Copy message"}
                  </GhostButton>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-wangari-border pt-4">
                <PrimaryButton onClick={() => openEdit(detail)}>
                  <Pencil className="h-4 w-4" /> Edit code
                </PrimaryButton>
                <PrimaryButton onClick={() => openRedeemers(detail)}>
                  <Users className="h-4 w-4" /> Redeemers
                </PrimaryButton>
                <GhostButton onClick={() => toggle(detail)}>
                  <Power className="h-4 w-4" /> {detail.active ? "Disable" : "Enable"}
                </GhostButton>
                <GhostButton onClick={() => setDetail(null)}>Close</GhostButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
