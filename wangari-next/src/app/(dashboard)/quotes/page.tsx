"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { FileText, Plus, Send, CheckCircle2, XCircle, Printer, Trash2, ArrowRightCircle, Eye, X, MessageCircle, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import { generateQuoteHtml, getDefaultFarmProfile, type FarmProfile, type DocLayout } from "@/components/invoices/InvoiceTemplates";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-green-50 text-green-700 border-green-200",
  declined: "bg-red-50 text-red-600 border-red-200",
  converted: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-orange-50 text-orange-600 border-orange-200",
};

type Item = { description: string; qty: number; unitPrice: number };

export default function QuotesPage() {
  const [quotes, setQuotes] = React.useState<any[]>([]);
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [stats, setStats] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [viewQuote, setViewQuote] = React.useState<any>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [farmProfile, setFarmProfile] = React.useState<FarmProfile>(getDefaultFarmProfile());
  const [farmSettings, setFarmSettings] = React.useState<any>({});
  // create form
  const [customerId, setCustomerId] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([{ description: "", qty: 1, unitPrice: 0 }]);
  const [validUntil, setValidUntil] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const { showToast, ToastComponent } = useToast();

  const load = () => {
    Promise.all([api.get("/api/quotes"), api.get("/api/customers"), api.get("/api/quotes/stats"), api.get("/api/settings")])
      .then(([q, c, st, settingsData]) => {
        setQuotes(Array.isArray(q) ? q : []);
        setCustomers(Array.isArray(c) ? c : []);
        setStats(st);
        const s = (settingsData as any).settings || {};
        setFarmSettings(s);
        setFarmProfile({
          ...getDefaultFarmProfile(),
          businessName: s.farm_business_name || "",
          logoUrl: s.farm_logo_url || "",
          phone: s.farm_phone || "",
          email: s.farm_email || "",
          address: s.farm_address || "",
          tinNumber: s.farm_tin_number || "",
          slogan: s.farm_slogan || "",
          bankName: s.farm_bank_name || "",
          bankAccount: s.farm_bank_account || "",
          bankBranch: s.farm_bank_branch || "",
          invoiceNotes: s.farm_invoice_notes || "",
          invoiceTerms: s.farm_invoice_terms || "",
          accentColor: s.farm_invoice_accent_color || "",
          ctaText: s.farm_cta_text || "",
          signatureDataUrl: s.farm_signature_data_url || "",
          signatureName: s.farm_signature_name || "",
          layout: (() => { try { return s.farm_doc_layout ? JSON.parse(s.farm_doc_layout) : {}; } catch { return {}; } })() as DocLayout,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const total = items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);

  const resetForm = () => { setCustomerId(""); setItems([{ description: "", qty: 1, unitPrice: 0 }]); setValidUntil(""); setNotes(""); };

  const createQuote = async (sendNow: boolean) => {
    if (!items.some((it) => it.description.trim() && Number(it.qty) > 0)) {
      showToast("Add at least one line item with a description and quantity", "error");
      return;
    }
    setBusy(true);
    try {
      const cleanItems = items.filter((it) => it.description.trim()).map((it) => ({ description: it.description.trim(), qty: Number(it.qty) || 0, unitPrice: Number(it.unitPrice) || 0 }));
      const created = await api.post("/api/quotes", {
        customerId: customerId || null,
        items: cleanItems,
        totalAmount: total,
        status: sendNow ? "sent" : "draft",
        validUntil: validUntil || null,
        notes: notes || null,
      });
      if (sendNow) openWhatsApp(created);
      showToast(sendNow ? "Quote sent — WhatsApp share opened" : "Quote saved as draft", "success");
      setShowCreate(false);
      resetForm();
      load();
    } catch {
      showToast("Could not save the quote", "error");
    } finally {
      setBusy(false);
    }
  };

  const openWhatsApp = (q: any) => {
    const farmName = farmProfile.businessName || "Our farm";
    const lines = (q.items || []).map((it: any) => `• ${it.qty} × ${it.description} — KES ${(Number(it.qty) * Number(it.unitPrice)).toLocaleString()}`).join("\n");
    // Customer-facing link: they can accept/decline with one tap — no app, no login.
    const link = q.responseToken ? `\n\n✅ View & respond to this quote online:\n${window.location.origin}/q/${q.responseToken}` : "";
    const msg = `Hello ${q.customer?.name || ""},\n\n*QUOTE ${q.quoteNumber}* from ${farmName}\n\n${lines}\n\n*Total: KES ${Number(q.totalAmount).toLocaleString()}*${q.validUntil ? `\nValid until: ${new Date(q.validUntil).toLocaleDateString()}` : ""}\n\nReply YES to accept, or tap the link below to accept or decline:${link}\n\nThank you! 🌾`;
    const phone = (q.customer?.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "254");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const action = async (id: number, act: string, message?: string) => {
    setBusy(true);
    try {
      await api.patch(`/api/quotes/${id}`, { action: act });
      showToast(message || "Quote updated", "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Action failed", "error");
    } finally { setBusy(false); }
  };

  const convert = async (id: number) => {
    setBusy(true);
    try {
      const inv = await api.post(`/api/quotes/${id}/convert`, {});
      showToast(`Converted to invoice ${(inv as any).invoiceNumber}`, "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Conversion failed", "error");
    } finally { setBusy(false); }
  };

  const removeQuote = async (id: number) => {
    setBusy(true);
    try {
      await api.delete(`/api/quotes/${id}`);
      showToast("Draft deleted", "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Delete failed", "error");
    } finally { setBusy(false); }
  };

  const printQuote = (q: any) => {
    const quoteTemplateId = farmSettings.farm_quote_template && farmSettings.farm_quote_template !== "same" ? farmSettings.farm_quote_template : farmSettings.farm_invoice_template || "professional";
    const html = generateQuoteHtml(q, quoteTemplateId, farmProfile);
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) { showToast("Allow pop-ups to print quotes", "error"); return; }
    w.document.write(html);
    w.document.close();
  };

  const filtered = quotes.filter((q) => {
    if (filter !== "all" && q.status !== filter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return q.quoteNumber?.toLowerCase().includes(s) || q.customer?.name?.toLowerCase().includes(s) || String(q.totalAmount).includes(s);
  });

  const statCards = stats ? [
    { label: "Total quotes", value: stats.total, color: "text-slate-700" },
    { label: "Sent", value: stats.sent, color: "text-blue-600" },
    { label: "Accepted", value: stats.accepted + stats.converted, color: "text-green-600" },
    { label: "Declined", value: stats.declined, color: "text-red-500" },
    { label: "Accepted value", value: `KES ${Number(stats.acceptedValue || 0).toLocaleString()}`, color: "text-amber-600" },
    { label: "Conversion rate", value: `${stats.conversionRate}%`, color: "text-wangari-green-800" },
  ] : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Quotes"
        description="Send price quotes, track responses, and turn accepted quotes into invoices in one tap"
        action={
          <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl bg-wangari-green-800 hover:bg-wangari-green-900">
            <Plus className="h-4 w-4" /> New quote
          </Button>
        }
      />

      {stats && (
        <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }} className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((c) => (
            <motion.div key={c.label} variants={fadeUp}>
              <Card className="rounded-2xl border-[#E7EBD8]">
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-wangari-subtle">{c.label}</p>
                  <p className={`mt-1 text-xl font-bold ${c.color}`}>{c.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Card className="mb-5 rounded-2xl border-[#E7EBD8]">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Input placeholder="Search by quote number, customer or amount…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 flex-1 rounded-xl" />
          <div className="flex flex-wrap gap-2">
            {["all", "draft", "sent", "accepted", "declined", "expired", "converted"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${filter === f ? "bg-wangari-green-800 text-white border-wangari-green-800" : "bg-white text-wangari-muted border-wangari-border hover:border-wangari-green-200"}`}>{f}</button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((n) => <div key={n} className="h-20 animate-pulse rounded-2xl bg-[#F1F5E8]" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-[#E7EBD8]">
          <CardContent className="p-0">
            <EmptyState icon={<FileText className="h-8 w-8" />} title={search || filter !== "all" ? "No quotes match" : "No quotes yet"}
              description={search || filter !== "all" ? "Try a different search or filter." : "Create your first quote, send it over WhatsApp, and track whether the customer accepts — then convert it to an invoice in one tap."} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <motion.div key={q.id} initial="hidden" animate="visible" variants={fadeUp}>
              <Card className="rounded-2xl border-[#E7EBD8] transition hover:border-wangari-green-200">
                <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-wangari-green-800">{q.quoteNumber}</span>
                      <Badge variant="outline" className={`capitalize ${STATUS_STYLES[q.status] || ""}`}>{q.status}</Badge>
                      {q.convertedInvoiceId && <span className="text-[11px] text-wangari-subtle">→ invoice created</span>}
                    </div>
                    <p className="mt-1 truncate text-sm text-wangari-text">{q.customer?.name || "Walk-in customer"} · {new Date(q.createdAt).toLocaleDateString()} · {(q.items || []).length} item{(q.items || []).length === 1 ? "" : "s"}{q.validUntil ? ` · valid to ${new Date(q.validUntil).toLocaleDateString()}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-wangari-heading">KES {Number(q.totalAmount).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {q.status === "draft" && (
                      <>
                        <Button size="sm" disabled={busy} onClick={() => action(q.id, "mark-sent", "Marked as sent")} className="gap-1 rounded-lg bg-wangari-green-800 hover:bg-wangari-green-900"><Send className="h-3.5 w-3.5" /> Send</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => printQuote(q)} className="gap-1 rounded-lg"><Printer className="h-3.5 w-3.5" /> Print</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => removeQuote(q.id)} className="gap-1 rounded-lg text-red-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                    {q.status === "sent" && (
                      <>
                        <Button size="sm" disabled={busy} onClick={() => action(q.id, "accept", "Quote accepted 🎉")} className="gap-1 rounded-lg bg-wangari-green-800 hover:bg-wangari-green-900"><CheckCircle2 className="h-3.5 w-3.5" /> Accepted</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => action(q.id, "decline", "Quote marked declined")} className="gap-1 rounded-lg text-red-500 hover:text-red-600"><XCircle className="h-3.5 w-3.5" /> Declined</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => openWhatsApp(q)} className="gap-1 rounded-lg"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => printQuote(q)} className="gap-1 rounded-lg"><Printer className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                    {q.status === "accepted" && (
                      <Button size="sm" disabled={busy} onClick={() => convert(q.id)} className="gap-1 rounded-lg bg-amber-600 hover:bg-amber-700"><ArrowRightCircle className="h-3.5 w-3.5" /> Convert to invoice</Button>
                    )}
                    {(q.status === "converted" || q.status === "declined") && (
                      <Button size="sm" variant="outline" onClick={() => setViewQuote(q)} className="gap-1 rounded-lg"><Eye className="h-3.5 w-3.5" /> View</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create quote modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setShowCreate(false)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-wangari-heading">New quote</h3>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 hover:bg-slate-100"><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block text-sm">Customer</Label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-10 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm">
                  <option value="">Walk-in customer (no name)</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-sm">Line items</Label>
                  <button onClick={() => setItems([...items, { description: "", qty: 1, unitPrice: 0 }])} className="text-xs font-medium text-wangari-green-800 hover:underline">+ Add item</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="Description (e.g. 500 broiler chicks)" value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className="h-10 flex-1 rounded-xl" />
                      <Input type="number" min="0" placeholder="Qty" value={it.qty || ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} className="h-10 w-20 rounded-xl" />
                      <Input type="number" min="0" placeholder="Unit price" value={it.unitPrice || ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} className="h-10 w-28 rounded-xl" />
                      {items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="rounded-lg p-2 text-red-400 hover:bg-red-50"><X className="h-4 w-4" /></button>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5 block text-sm">Valid until (optional)</Label>
                  <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-10 rounded-xl" />
                </div>
                <div>
                  <Label className="mb-1.5 block text-sm">Notes (optional)</Label>
                  <Input placeholder="e.g. Includes free delivery within Nakuru" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 rounded-xl" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#F1F5E8] px-4 py-3">
                <span className="text-sm font-medium text-tone-neutral-text">Quote total</span>
                <span className="text-xl font-bold text-wangari-green-800">KES {total.toLocaleString()}</span>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" disabled={busy} onClick={() => createQuote(false)} className="h-11 flex-1 rounded-xl">Save as draft</Button>
                <Button disabled={busy} onClick={() => createQuote(true)} className="h-11 flex-1 rounded-xl gap-2 bg-wangari-green-800 hover:bg-wangari-green-900"><Send className="h-4 w-4" /> Save &amp; send</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View quote modal */}
      {viewQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setViewQuote(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-lg font-bold text-wangari-green-800">{viewQuote.quoteNumber}</h3>
                <Badge variant="outline" className={`mt-1 capitalize ${STATUS_STYLES[viewQuote.status] || ""}`}>{viewQuote.status}</Badge>
              </div>
              <button onClick={() => setViewQuote(null)} className="rounded-lg p-1.5 hover:bg-slate-100"><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <p><span className="text-wangari-subtle">Customer:</span> {viewQuote.customer?.name || "Walk-in customer"}</p>
              <div className="rounded-xl border border-[#E7EBD8]">
                {(viewQuote.items || []).map((it: any, i: number) => (
                  <div key={i} className="flex justify-between border-b border-[#E7EBD8] px-4 py-2 last:border-0">
                    <span>{it.qty} × {it.description}</span>
                    <span className="font-medium">KES {(Number(it.qty) * Number(it.unitPrice)).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <p className="text-right text-lg font-bold">Total: KES {Number(viewQuote.totalAmount).toLocaleString()}</p>
              {viewQuote.notes && <p className="text-wangari-muted">{viewQuote.notes}</p>}
              {viewQuote.sentAt && <p className="text-xs text-wangari-subtle">Sent {new Date(viewQuote.sentAt).toLocaleString()}{viewQuote.respondedAt ? ` · responded ${new Date(viewQuote.respondedAt).toLocaleString()}` : ""}</p>}
              {viewQuote.convertedInvoiceId && <p className="flex items-center gap-1.5 text-xs text-amber-600"><TrendingUp className="h-3.5 w-3.5" /> Converted to invoice #{viewQuote.convertedInvoiceId}</p>}
            </div>
          </div>
        </div>
      )}

      {ToastComponent}
    </div>
  );
}
