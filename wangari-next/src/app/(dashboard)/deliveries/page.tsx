"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Milk, Wheat, Leaf, Truck, Plus, X, Trash2, ReceiptText, AlertTriangle, CheckCircle2, Egg, Drumstick, Bird, Droplets, Flower2, HelpCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatementCard } from "@/components/deliveries/StatementCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import { openDeliveryFormByDefault } from "@/lib/first-run";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  milk: Milk,
  egg: Egg,
  bird: Bird,
  beef: Drumstick,
  droplets: Droplets,
  flower: Flower2,
  wheat: Wheat,
  leaf: Leaf,
  truck: Truck,
};

interface Suggestion {
  commodity: string;
  label: string;
  unit: string;
  icon: string;
  source: string | null;
}

// Egg tray conversion (Kenya standard: 30 eggs per tray)
const EGGS_PER_TRAY = 30;

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting payment", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", cls: "bg-green-50 text-green-700 border-green-200" },
  disputed: { label: "Disputed", cls: "bg-red-50 text-red-700 border-red-200" },
};

// Mirrors the server response. `byBuyer`, `allTimeOutstanding` and
// `unpaidDeliveries` are the dispute-proof fields the StatementCard needs.
interface Statement {
  month: string; deliveries: number; gross: number; deductions: number;
  inputExpenses: number; net: number; paid: number; outstanding: number;
  byCommodity: Record<string, { quantity: number; gross: number; deliveries: number }>;
  byBuyer?: Record<string, {
    deliveries: number; quantity: number; gross: number;
    deductions: number; paid: number; outstanding: number;
  }>;
  allTimeOutstanding?: number;
  unpaidDeliveries?: number;
  farm?: { name: string; county: string | null; code: string | null; owner: { name: string } } | null;
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = React.useState<any[]>([]);
  const [statement, setStatement] = React.useState<Statement | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    date: new Date().toISOString().slice(0, 10),
    commodity: "milk",
    quantity: "",
    buyer: "",
    receiptRef: "",
    unitPrice: "",
    deductionLabel: "",
    deductionAmount: "",
  });

  const month = new Date().toISOString().slice(0, 7);

  const load = () => {
    Promise.all([
      api.get("/api/deliveries"),
      api.get(`/api/deliveries/statement?month=${month}`),
      api.get("/api/deliveries/suggestions").catch(() => ({ suggestions: [] })),
    ])
      .then(([d, s, sug]: any) => {
        const list = Array.isArray(d) ? d : [];
        setDeliveries(list);
        setStatement(s);
        setSuggestions(sug?.suggestions ?? []);
        // A farmer arriving from the first-run card has come here to log
        // something, not to browse a history they don't have yet. So open the
        // form ready for them — one tap instead of two, and no hunting for a
        // button on a page with nothing else on it.
        if (openDeliveryFormByDefault(list.length)) setShowForm(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  React.useEffect(load, []);

  const submit = async () => {
    if (!form.quantity || !form.buyer) { showToast("Andika kiasi na mnunuzi", "error"); return; }
    const deductions = form.deductionAmount && Number(form.deductionAmount) > 0
      ? [{ label: form.deductionLabel || "Deduction", amount: Number(form.deductionAmount) }] : [];
    try {
      await api.post("/api/deliveries", {
        date: form.date, commodity: form.commodity, quantity: Number(form.quantity),
        buyer: form.buyer, receiptRef: form.receiptRef || undefined,
        unitPrice: form.unitPrice ? Number(form.unitPrice) : undefined, deductions,
      });
      showToast("Delivery recorded — your money trail is building", "success");
      setShowForm(false);
      setForm({ ...form, quantity: "", buyer: "", receiptRef: "", unitPrice: "", deductionLabel: "", deductionAmount: "" });
      load();
    } catch { showToast("Failed to record delivery", "error"); }
  };

  const markPaid = async (id: number) => {
    const d = deliveries.find((x) => x.id === id);
    const gross = d?.expectedPay ?? 0;
    const ded = (d?.deductions ?? []).reduce((s: number, x: any) => s + Number(x.amount), 0);
    try {
      await api.patch(`/api/deliveries/${id}`, { status: "paid", paidAmount: gross - ded });
      showToast("Marked as paid", "success"); load();
    } catch { showToast("Failed", "error"); }
  };

  const remove = async (id: number) => {
    try { await api.delete(`/api/deliveries/${id}`); load(); } catch { showToast("Failed", "error"); }
  };

  const money = (n: number) => `KES ${Number(n).toLocaleString()}`;
  const current = suggestions.find((c) => c.commodity === form.commodity)
    ?? { commodity: form.commodity, label: form.commodity, unit: "kg", icon: "truck", source: null };
  const CurrentIcon = ICONS[current.icon] ?? Truck;

  // Egg helper text: show how many trays the entered egg count fills
  const eggTrayHint = current.commodity === "eggs" && form.quantity && Number(form.quantity) > 0
    ? (Number(form.quantity) / EGGS_PER_TRAY).toFixed(1)
    : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {ToastComponent}
      <PageHeader
        title="Umeuza nini"
        description="Kila litre, kilo na trei uliyouza — na bado inadaiwa kwako"
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 mr-2" />Funga</> : <><Plus className="h-4 w-4 mr-2" />Andika uuzaji</>}</Button>}
      />

      {/* The farmer's proof of what they are owed — per-buyer, all-time, and
          printable. Replaces the old summary block, which was English-only and
          gave a farmer nothing to hand to a co-op clerk. */}
      {statement && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <StatementCard
            statement={statement}
            monthLabel={new Date(statement.month + "-01").toLocaleString("en", {
              month: "long",
              year: "numeric",
            })}
          />
        </motion.div>
      )}

      {/* Record delivery form */}
      {showForm && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="mb-2 block">Unauza nini?</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  {suggestions.some(s => s.source)
                    ? "Kutoka kwa wanyama na bustani ulizoweka"
                    : "Ongeza wanyama au bustani na zitaonyeshwa hapa"}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {suggestions.map((c) => {
                    const Icon = ICONS[c.icon] ?? Truck;
                    const active = form.commodity === c.commodity;
                    return (
                      <button key={c.commodity} type="button" onClick={() => setForm({ ...form, commodity: c.commodity })}
                        title={c.source ? `From your ${c.source}` : undefined}
                        className={`rounded-xl border p-3 text-left transition ${active ? "border-green-500 bg-green-50" : "border-border hover:border-green-300"}`}>
                        <Icon className={`h-5 w-5 mb-1 ${active ? "text-green-600" : "text-muted-foreground"}`} />
                        <span className="block text-sm font-medium leading-tight">{c.label}</span>
                        <span className="block text-[10px] text-muted-foreground">per {c.unit}</span>
                        {c.source && <span className="mt-0.5 block text-[9px] text-green-700/70 truncate">↳ {c.source}</span>}
                      </button>
                    );
                  })}
                  {/* Custom entry */}
                  <button type="button"
                    onClick={() => {
                      const name = window.prompt("Name the produce you're delivering (e.g. Passion fruit):");
                      if (name && name.trim()) {
                        const value = "custom_" + name.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40);
                        setSuggestions([...suggestions, { commodity: value, label: name.trim(), unit: "kg", icon: "truck", source: null }]);
                        setForm({ ...form, commodity: value });
                      }
                    }}
                    className={`rounded-xl border border-dashed p-3 text-left transition ${form.commodity.startsWith("custom_") ? "border-green-500 bg-green-50" : "border-border hover:border-green-300"}`}>
                    <HelpCircle className={`h-5 w-5 mb-1 ${form.commodity.startsWith("custom_") ? "text-green-600" : "text-muted-foreground"}`} />
                    <span className="block text-sm font-medium leading-tight">Other…</span>
                    <span className="block text-[10px] text-muted-foreground">anything else</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div>
                  <Label>Quantity ({current.unit})</Label>
                  <Input type="number" step="0.5" placeholder={current.commodity === "eggs" ? `e.g. ${EGGS_PER_TRAY * 2} (= 2 trays)` : current.commodity === "milk" ? "e.g. 12" : "e.g. 50"} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  {eggTrayHint && (
                    <p className="mt-1 text-[11px] text-green-700">≈ {eggTrayHint} tray{Number(eggTrayHint) === 1 ? "" : "s"} ({EGGS_PER_TRAY} eggs per tray)</p>
                  )}
                </div>
                <div><Label>Delivered to (buyer)</Label><Input placeholder="e.g. Brookside, factory name, broker" value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} /></div>
                <div><Label>Receipt / slip no. (optional)</Label><Input placeholder="from the delivery book" value={form.receiptRef} onChange={(e) => setForm({ ...form, receiptRef: e.target.value })} /></div>
                <div><Label>Price per {current.unit} (optional)</Label><Input type="number" step="0.5" placeholder="KES" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:col-span-2">
                <div><Label>Deduction label (optional)</Label><Input placeholder="e.g. AI service, agrovet" value={form.deductionLabel} onChange={(e) => setForm({ ...form, deductionLabel: e.target.value })} /></div>
                <div><Label>Deduction amount (optional)</Label><Input type="number" placeholder="KES" value={form.deductionAmount} onChange={(e) => setForm({ ...form, deductionAmount: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={submit} disabled={!form.quantity || !form.buyer}>Save delivery</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Delivery list */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : deliveries.length === 0 ? (
            <EmptyState icon={<Truck className="h-8 w-8" />} title="No deliveries yet" description="Record your first delivery — even one line a day builds the record that wins disputes." />
          ) : (
            <div className="divide-y">
              {deliveries.map((d) => {
                const ded = (d.deductions ?? []).reduce((s: number, x: any) => s + Number(x.amount), 0);
                const net = (d.expectedPay ?? 0) - ded;
                const sug = suggestions.find((c) => c.commodity === d.commodity);
                const Icon = ICONS[sug?.icon ?? ""] ?? Truck;
                const sb = statusBadge[d.status] ?? statusBadge.pending;
                return (
                  <div key={d.id} className="flex items-center gap-3 py-3">
                    <div className="h-9 w-9 rounded-full bg-green-50 flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-green-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {sug?.label ?? d.commodity.replace(/_/g, " ")}: {Number(d.quantity).toLocaleString()} {d.unit} → {d.buyer}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(d.date).toLocaleDateString()}
                        {d.receiptRef ? ` · Slip #${d.receiptRef}` : ""}
                        {ded > 0 ? ` · −KES ${ded.toLocaleString()} deductions` : ""}
                        {d.status === "paid" && d.paidAmount ? ` · paid KES ${Number(d.paidAmount).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{d.expectedPay != null ? money(net) : "—"}</p>
                      <span className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border ${sb.cls}`}>{sb.label}</span>
                    </div>
                    {d.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => markPaid(d.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Paid</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
