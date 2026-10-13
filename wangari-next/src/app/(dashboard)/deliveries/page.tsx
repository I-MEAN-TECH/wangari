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

// Standard estimated cost per production unit in Kenya for break-even feedback (C6)
const DEFAULT_BREAK_EVEN: Record<string, number> = {
  milk: 40,        // KES 40 / litre
  eggs: 320,       // KES 320 / tray (~KES 10.7 / egg)
  maize: 35,       // KES 35 / kg
  beef: 380,       // KES 380 / kg
  goat_meat: 450,  // KES 450 / kg
  pork: 320,       // KES 320 / kg
  fish: 350,       // KES 350 / kg
  honey: 600,      // KES 600 / kg
  beans: 80,       // KES 80 / kg
  tomatoes: 50,    // KES 50 / kg
  kale: 25,        // KES 25 / kg
  onions: 60,      // KES 60 / kg
  potatoes: 40,    // KES 40 / kg
};

function computeExpectedPayDate(terms: string, baseDateStr: string): string {
  const base = new Date(baseDateStr || Date.now());
  if (isNaN(base.getTime())) return "";
  if (terms === "immediate") return base.toISOString().slice(0, 10);
  if (terms === "net_7") return new Date(base.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  if (terms === "net_15") return new Date(base.getTime() + 15 * 86400000).toISOString().slice(0, 10);
  if (terms === "net_30") return new Date(base.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  if (terms === "monthly") {
    const endOfMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return endOfMonth.toISOString().slice(0, 10);
  }
  return "";
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting payment", cls: "bg-tone-warn-bg text-tone-warn-text border-tone-warn-border" },
  paid: { label: "Paid", cls: "bg-tone-good-bg text-tone-good-text border-tone-good-border" },
  disputed: { label: "Disputed", cls: "bg-tone-bad-bg text-tone-bad-text border-tone-bad-border" },
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
  /** Deliveries that slipped past the date the buyer gave. */
  arrears?: { total: number; count: number; oldestDays: number | null };
  /** Deductions grouped by who they were for — co-op vs agrovet vs the farmer's own loan. */
  deductionsByCreditor?: Record<string, number>;
  farm?: { name: string; county: string | null; code: string | null; owner: { name: string } } | null;
}

/**
 * Milk-quality fields shown only where they can exist. QBMP band pricing is a
 * DAIRY term, so asking a maize farmer for butterfat would be noise — the
 * block appears when the farmer picked milk (or is selling by the litre).
 */
const isMilkDelivery = (commodity: string) => commodity === "milk";

/** Milk and eggs are the two products a withdrawal window actually protects. */
const isMilkOrEggs = (commodity: string) => commodity === "milk" || commodity === "eggs";

/** Whether a promised payment date has passed — the arrears clock, on screen. */
const isOverdue = (payBy: string | Date) => new Date(payBy).getTime() < Date.now();

/** One-line summary of what the slip said, or null when nothing was tested. */
function qualitySummary(d: any): string | null {
  if (d.commodity === "eggs") {
    const parts: string[] = [];
    if (d.gradedCount != null) parts.push(`Grade A: ${d.gradedCount}`);
    if (d.crackedCount != null) parts.push(`Cracked: ${d.crackedCount}`);
    if (d.dirtyCount != null) parts.push(`Dirty: ${d.dirtyCount}`);
    return parts.length ? parts.join(" · ") : null;
  }
  const bits: string[] = [];
  if (d.fatPct != null) bits.push(`Fat ${Number(d.fatPct)}%`);
  if (d.snfPct != null) bits.push(`SNF ${Number(d.snfPct)}%`);
  if (d.density != null) bits.push(`Density ${Number(d.density)}`);
  if (d.addedWaterPct != null && Number(d.addedWaterPct) > 0) bits.push(`Added water ${Number(d.addedWaterPct)}%`);
  if (d.tpc != null) bits.push(`TPC ${Number(d.tpc).toLocaleString()}`);
  return bits.length ? bits.join(" · ") : null;
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = React.useState<any[]>([]);
  const [statement, setStatement] = React.useState<Statement | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [customers, setCustomers] = React.useState<any[]>([]);
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    date: new Date().toISOString().slice(0, 10),
    commodity: "milk",
    quantity: "",
    buyer: "",
    customerId: "",
    receiptRef: "",
    unitPrice: "",
    paymentTerms: "monthly",
    payBy: computeExpectedPayDate("monthly", new Date().toISOString().slice(0, 10)),
    fatPct: "",
    snfPct: "",
    density: "",
    addedWaterPct: "",
    tpc: "",
    gradedBy: "",
    crackedCount: "",
    dirtyCount: "",
    gradedCount: "",
    deductionLabel: "",
    deductionAmount: "",
    deductionCreditor: "",
    deductionFarmLoanId: "",
  });

  const [loans, setLoans] = React.useState<any[]>([]);
  const [withdrawal, setWithdrawal] = React.useState<any>(null);

  const month = new Date().toISOString().slice(0, 7);

  const load = () => {
    Promise.all([
      api.get("/api/deliveries"),
      api.get(`/api/deliveries/statement?month=${month}`),
      api.get("/api/deliveries/suggestions").catch(() => ({ suggestions: [] })),
      api.get("/api/farm-loans").catch(() => []),
      api.get("/api/customers").catch(() => []),
    ])
      .then(([d, s, sug, ln, cust]: any) => {
        const list = Array.isArray(d) ? d : [];
        setDeliveries(list);
        setStatement(s);
        setSuggestions(sug?.suggestions ?? []);
        setLoans(Array.isArray(ln) ? ln.filter((l: any) => l.status !== "repaid") : []);
        setCustomers(Array.isArray(cust) ? cust : []);
        if (openDeliveryFormByDefault(list.length)) setShowForm(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  React.useEffect(load, []);

  // A6: the question that has to be answered before milk from a treated cow can
  // be delivered. Asked when the commodity changes, because the answer can
  // change between opening the form and saving it.
  React.useEffect(() => {
    if (!isMilkOrEggs(form.commodity)) {
      setWithdrawal(null);
      return;
    }
    let alive = true;
    api
      .get(`/api/deliveries/withdrawal-check?commodity=${form.commodity === "eggs" ? "eggs" : "milk"}`)
      .then((d: any) => { if (alive) setWithdrawal(d?.advice ?? null); })
      .catch(() => { if (alive) setWithdrawal(null); });
    return () => { alive = false; };
  }, [form.commodity]);

  const submit = async () => {
    if (!form.quantity || !form.buyer) { showToast("Enter the quantity and buyer", "error"); return; }
    const deductions = form.deductionAmount && Number(form.deductionAmount) > 0
      ? [{
          label: form.deductionLabel || "Deduction",
          amount: Number(form.deductionAmount),
          // Who the money went to. "The co-op kept it" and "it repaid my SACCO
          // loan" are the two things a farmer gets confused about, so the
          // creditor travels with the deduction into the statement.
          creditor: form.deductionCreditor || undefined,
          // Tags the deduction to the loan it repays, so the loan shows what was
          // collected at source instead of only what the farmer paid by hand.
          farmLoanId: form.deductionFarmLoanId ? Number(form.deductionFarmLoanId) : undefined,
        }] : [];
    // Quality is stored exactly as the slip shows it. Empty stays empty — a
    // "not tested" field must not be sent as 0, which would read as real data.
    const num = (v: string) => (v.trim() !== "" ? Number(v) : undefined);
    const quality = isMilkDelivery(form.commodity)
      ? {
          fatPct: num(form.fatPct),
          snfPct: num(form.snfPct),
          density: num(form.density),
          addedWaterPct: num(form.addedWaterPct),
          tpc: num(form.tpc),
          gradedBy: form.gradedBy || undefined,
        }
      : {};
    const eggQuality = form.commodity === "eggs"
      ? {
          crackedCount: num(form.crackedCount),
          dirtyCount: num(form.dirtyCount),
          gradedCount: num(form.gradedCount),
        }
      : {};
    try {
      await api.post("/api/deliveries", {
        date: form.date, commodity: form.commodity, quantity: Number(form.quantity),
        buyer: form.buyer,
        customerId: form.customerId ? Number(form.customerId) : undefined,
        receiptRef: form.receiptRef || undefined,
        unitPrice: form.unitPrice ? Number(form.unitPrice) : undefined,
        paymentTerms: form.paymentTerms,
        expectedPaymentDate: form.payBy || undefined,
        payBy: form.payBy || undefined,
        ...quality,
        ...eggQuality,
        deductions,
      });
      showToast("Delivery recorded — your money trail is building", "success");
      setShowForm(false);
      setForm({
        ...form, quantity: "", buyer: "", customerId: "", receiptRef: "", unitPrice: "",
        paymentTerms: "monthly", payBy: computeExpectedPayDate("monthly", new Date().toISOString().slice(0, 10)),
        fatPct: "", snfPct: "", density: "", addedWaterPct: "", tpc: "", gradedBy: "",
        crackedCount: "", dirtyCount: "", gradedCount: "",
        deductionLabel: "", deductionAmount: "", deductionCreditor: "", deductionFarmLoanId: "",
      });
      load();
    } catch { showToast("Failed to record delivery", "error"); }
  };

  const markPaid = async (id: number) => {
    const d = deliveries.find((x) => x.id === id);
    const gross = d?.expectedPay ?? 0;
    const ded = (d?.deductions ?? []).reduce((s: number, x: any) => s + Number(x.amount), 0);
    try {
      await api.patch(`/api/deliveries/${id}`, { status: "paid", paidAmount: gross - ded });
      showToast("Marked as paid — added to income ledger", "success");
      load();
    } catch { showToast("Failed to update delivery", "error"); }
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
        title="What you sold"
        description="Every litre, kilo and tray you delivered — and what you are still owed"
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 mr-2" />Close</> : <><Plus className="h-4 w-4 mr-2" />Record delivery</>}</Button>}
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
                <Label className="mb-2 block">What are you delivering?</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  {suggestions.some(s => s.source)
                    ? "Based on the animals and crops on your farm"
                    : "Add flocks or crops and they'll be suggested here"}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {suggestions.map((c) => {
                    const Icon = ICONS[c.icon] ?? Truck;
                    const active = form.commodity === c.commodity;
                    return (
                      <button key={c.commodity} type="button" onClick={() => setForm({ ...form, commodity: c.commodity })}
                        title={c.source ? `From your ${c.source}` : undefined}
                        className={`rounded-xl border p-3 text-left transition ${active ? "border-wangari-green-600 bg-tone-good-bg" : "border-border hover:border-tone-good-border"}`}>
                        <Icon className={`h-5 w-5 mb-1 ${active ? "text-tone-good-text" : "text-muted-foreground"}`} />
                        <span className="block text-sm font-medium leading-tight">{c.label}</span>
                        <span className="block text-[10px] text-muted-foreground">per {c.unit}</span>
                        {c.source && <span className="mt-0.5 block text-[9px] text-tone-good-text truncate">↳ {c.source}</span>}
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
                    className={`rounded-xl border border-dashed p-3 text-left transition ${form.commodity.startsWith("custom_") ? "border-wangari-green-600 bg-tone-good-bg" : "border-border hover:border-tone-good-border"}`}>
                    <HelpCircle className={`h-5 w-5 mb-1 ${form.commodity.startsWith("custom_") ? "text-tone-good-text" : "text-muted-foreground"}`} />
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
                    <p className="mt-1 text-[11px] text-tone-good-text">≈ {eggTrayHint} tray{Number(eggTrayHint) === 1 ? "" : "s"} ({EGGS_PER_TRAY} eggs per tray)</p>
                  )}
                </div>
                <div>
                  <Label>Delivered to (buyer)</Label>
                  {customers.length > 0 ? (
                    <div className="space-y-1.5">
                      <select
                        className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                        value={form.customerId}
                        onChange={(e) => {
                          const val = e.target.value;
                          const found = customers.find((c) => String(c.id) === val);
                          setForm({ ...form, customerId: val, buyer: found ? found.name : "" });
                        }}
                      >
                        <option value="">-- Select registered buyer or type name --</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>
                        ))}
                      </select>
                      {!form.customerId && (
                        <Input placeholder="Or type new buyer name (e.g. Brookside)" value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} />
                      )}
                    </div>
                  ) : (
                    <Input placeholder="e.g. Brookside, factory name, broker" value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} />
                  )}
                </div>
                <div><Label>Receipt / slip no. (optional)</Label><Input placeholder="from the delivery book" value={form.receiptRef} onChange={(e) => setForm({ ...form, receiptRef: e.target.value })} /></div>
                <div>
                  <Label>Price per {current.unit} (optional)</Label>
                  <Input type="number" step="0.5" placeholder="KES" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
                  {/* C6 break-even feedback badge */}
                  {form.unitPrice && Number(form.unitPrice) > 0 && DEFAULT_BREAK_EVEN[form.commodity] != null && (() => {
                    const price = Number(form.unitPrice);
                    const cost = DEFAULT_BREAK_EVEN[form.commodity];
                    const diff = price - cost;
                    const isProfitable = diff >= 0;
                    return (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${isProfitable ? "bg-tone-good-bg text-tone-good-text border border-tone-good-border" : "bg-tone-warn-bg text-tone-warn-text border border-tone-warn-border"}`}>
                          {isProfitable ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {isProfitable ? `Profitable (+KES ${diff.toFixed(1)}/${current.unit})` : `Below estimated cost (~KES ${cost}/${current.unit})`}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <Label>Payment terms</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={form.paymentTerms}
                    onChange={(e) => {
                      const terms = e.target.value;
                      const nextPayBy = terms === "custom" ? form.payBy : computeExpectedPayDate(terms, form.date);
                      setForm({ ...form, paymentTerms: terms, payBy: nextPayBy });
                    }}
                  >
                    <option value="immediate">Immediate / Spot cash (today)</option>
                    <option value="net_7">Net 7 (in 7 days)</option>
                    <option value="net_15">Net 15 (in 15 days)</option>
                    <option value="net_30">Net 30 (in 30 days)</option>
                    <option value="monthly">Monthly payout (end of month)</option>
                    <option value="custom">Custom date</option>
                  </select>
                </div>
                <div>
                  <Label>Payment expected by</Label>
                  <Input
                    type="date"
                    value={form.payBy}
                    onChange={(e) => setForm({ ...form, payBy: e.target.value, paymentTerms: "custom" })}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Starts the arrears clock when payout date passes</p>
                </div>
              </div>

              {/* Milk test results: the QBMP parameters as the co-op slip shows
                  them. We never grade — band pricing is the co-op's term — we
                  just keep the farmer's copy of the measurement, because a
                  deduction is the thing they end up arguing about. */}
              {isMilkDelivery(form.commodity) && (
                <div className="rounded-xl border border-dashed p-3 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Milk test results (optional)</p>
                    <p className="text-[11px] text-muted-foreground">
                      Copy them off the co-op slip. Leave blank if they did not test — blank stays blank, it never becomes zero.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div><Label>Butterfat %</Label><Input type="number" step="0.01" placeholder="e.g. 3.8" value={form.fatPct} onChange={(e) => setForm({ ...form, fatPct: e.target.value })} /></div>
                    <div><Label>SNF %</Label><Input type="number" step="0.01" placeholder="e.g. 8.5" value={form.snfPct} onChange={(e) => setForm({ ...form, snfPct: e.target.value })} /></div>
                    <div><Label>Density</Label><Input type="number" step="0.001" placeholder="e.g. 1.03" value={form.density} onChange={(e) => setForm({ ...form, density: e.target.value })} /></div>
                    <div><Label>Added water %</Label><Input type="number" step="0.01" placeholder="e.g. 0" value={form.addedWaterPct} onChange={(e) => setForm({ ...form, addedWaterPct: e.target.value })} /></div>
                    <div><Label>TPC (cfu/ml)</Label><Input type="number" placeholder="e.g. 200000" value={form.tpc} onChange={(e) => setForm({ ...form, tpc: e.target.value })} /></div>
                    <div><Label>Tested by (optional)</Label><Input placeholder="e.g. co-op lab" value={form.gradedBy} onChange={(e) => setForm({ ...form, gradedBy: e.target.value })} /></div>
                  </div>
                </div>
              )}

              {/* Egg quality & grading (ERPNext quality inspection pattern) */}
              {form.commodity === "eggs" && (
                <div className="rounded-xl border border-dashed p-3 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Egg quality & grading (optional)</p>
                    <p className="text-[11px] text-muted-foreground">
                      Record Grade A, cracked and dirty eggs to maintain quality grading records.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Grade A (Good eggs)</Label><Input type="number" placeholder="e.g. 58" value={form.gradedCount} onChange={(e) => setForm({ ...form, gradedCount: e.target.value })} /></div>
                    <div><Label>Cracked / Broken</Label><Input type="number" placeholder="e.g. 2" value={form.crackedCount} onChange={(e) => setForm({ ...form, crackedCount: e.target.value })} /></div>
                    <div><Label>Dirty / Stained</Label><Input type="number" placeholder="e.g. 0" value={form.dirtyCount} onChange={(e) => setForm({ ...form, dirtyCount: e.target.value })} /></div>
                  </div>
                </div>
              )}

              {/* A6: what the withdrawal window says about THIS delivery. Only
                  rendered when the answer is worth reading — a warning about a
                  rule that does not apply trains the farmer to ignore the one
                  that does. */}
              {isMilkOrEggs(form.commodity) && withdrawal?.message && (
                <div className={`rounded-xl border px-4 py-3 ${withdrawal.blocked ? "border-tone-bad-border bg-tone-bad-bg" : "border-tone-warn-border bg-tone-warn-bg"}`}>
                  <p className={`flex items-start gap-2 text-sm font-semibold ${withdrawal.blocked ? "text-tone-bad-text" : "text-tone-warn-text"}`}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {withdrawal.message}
                  </p>
                  {withdrawal.blocked && (
                    <ul className="mt-1.5 space-y-0.5">
                      {withdrawal.animals.map((a: any) => (
                        <li key={`${a.animalId}-${a.condition}`} className="text-[11px] text-muted-foreground">
                          {a.label ?? `Animal #${a.animalId ?? "—"}`} · {a.condition} · clears {new Date(a.until).toLocaleDateString("en-KE")}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    You can still record this delivery — the record is yours, and a rejection letter needs it.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:col-span-2">
                <div><Label>Deduction label (optional)</Label><Input placeholder="e.g. AI service, agrovet" value={form.deductionLabel} onChange={(e) => setForm({ ...form, deductionLabel: e.target.value })} /></div>
                <div><Label>Deduction amount (optional)</Label><Input type="number" placeholder="KES" value={form.deductionAmount} onChange={(e) => setForm({ ...form, deductionAmount: e.target.value })} /></div>
                <div>
                  <Label>Deduction is for (optional)</Label>
                  <Input placeholder="e.g. the co-op, agrovet, SACCO loan" value={form.deductionCreditor} onChange={(e) => setForm({ ...form, deductionCreditor: e.target.value })} />
                  {/* "What the co-op kept" and "what repaid my loan" are the
                      same number on the slip and two different arguments. */}
                  <p className="mt-1 text-[11px] text-muted-foreground">Who took it — the statement groups deductions by this</p>
                </div>
                {/* Only offered when the farmer has a loan on file, because a
                    picker over an empty list is a dropdown that teaches nothing. */}
                {loans.length > 0 && (
                  <div className="md:col-span-3">
                    <Label>Was this a loan repayment? (optional)</Label>
                    <select
                      value={form.deductionFarmLoanId}
                      onChange={(e) => setForm({ ...form, deductionFarmLoanId: e.target.value })}
                      className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option value="">No — this was not repaying a loan</option>
                      {loans.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.lender}{l.balance != null ? ` — KES ${Number(l.balance).toLocaleString()} left` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Tagging it means the loan shows what the co-op collected at source, not just what you paid by hand
                    </p>
                  </div>
                )}
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
                    <div className="h-9 w-9 rounded-full bg-tone-good-bg flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-tone-good-text" /></div>
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
                      {/* The test result the farmer will be arguing about, shown
                          on the row itself so they never have to open the slip. */}
                      {qualitySummary(d) && (
                        <p className="text-xs text-tone-good-text">{qualitySummary(d)}</p>
                      )}
                      {/* Late only against a date the buyer actually gave. */}
                      {d.payBy && d.status !== "paid" && (
                        <p className={`text-xs ${isOverdue(d.payBy) ? "font-medium text-tone-warn-text" : "text-muted-foreground"}`}>
                          {isOverdue(d.payBy)
                            ? `Expected by ${new Date(d.payBy).toLocaleDateString()} — still not paid`
                            : `Expected by ${new Date(d.payBy).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{d.expectedPay != null ? money(net) : "—"}</p>
                      <span className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border ${sb.cls}`}>{sb.label}</span>
                    </div>
                    {d.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => markPaid(d.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Paid</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-3.5 w-3.5 text-tone-bad-text" /></Button>
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
