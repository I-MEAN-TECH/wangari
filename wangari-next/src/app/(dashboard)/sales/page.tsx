"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { DollarSign, CheckCircle, Clock, Plus, X, Trash2, Search, Users, TrendingUp, AlertCircle, Printer } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { INVOICE_TEMPLATES, generateReceiptHtml, resolveReceiptTemplate, getDefaultFarmProfile, type FarmProfile } from "@/components/invoices/InvoiceTemplates";
import { salesSeries as COLORS } from "@/lib/chart-series";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

export default function SalesPage() {
  const [sales, setSales] = React.useState<any[]>([]);
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [showPayModal, setShowPayModal] = React.useState<number | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "paid" | "pending">("all");
  const { showToast, ToastComponent } = useToast();
  const [form, setForm] = React.useState({
    buyerCategory: "walk_in",
    customerId: "",
    otherDescription: "",
    totalAmount: "",
    productType: "general",
  });

  const [farmProfile, setFarmProfile] = React.useState<FarmProfile>(getDefaultFarmProfile());
  const [invoiceTemplate, setInvoiceTemplate] = React.useState("professional");
  const [receiptTemplate, setReceiptTemplate] = React.useState("same");

  const load = () => {
    Promise.all([api.get("/api/sales"), api.get("/api/customers"), api.get("/api/settings")])
      .then(([s, c, settingsData]) => {
        setSales(Array.isArray(s) ? s : []); setCustomers(Array.isArray(c) ? c : []);
        const st = (settingsData as any).settings || {};
        setInvoiceTemplate(st.farm_invoice_template || "professional");
        setReceiptTemplate(st.farm_receipt_template || "same");
        setFarmProfile({
          businessName: st.farm_business_name || "",
          logoUrl: st.farm_logo_url || "",
          phone: st.farm_phone || "",
          email: st.farm_email || "",
          address: st.farm_address || "",
          tinNumber: st.farm_tin_number || "",
          slogan: st.farm_slogan || "",
          bankName: st.farm_bank_name || "",
          bankAccount: st.farm_bank_account || "",
          bankBranch: st.farm_bank_branch || "",
          invoiceNotes: st.farm_invoice_notes || "",
          invoiceTerms: st.farm_invoice_terms || "",
          accentColor: st.farm_invoice_accent_color || "",
          layout: (() => { try { return st.farm_doc_layout ? JSON.parse(st.farm_doc_layout) : {}; } catch { return {}; } })(),
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    const buyerNotes =
      form.buyerCategory === "other"
        ? form.otherDescription || "Other Buyer"
        : form.buyerCategory === "wholesale"
        ? "Wholesale Buyer"
        : form.buyerCategory === "trader"
        ? "Local Trader / Broker"
        : form.buyerCategory === "neighbor"
        ? "Neighbor / Visitor"
        : form.buyerCategory === "walk_in"
        ? "Walk-in Customer"
        : "";

    await api.post("/api/sales", {
      customerId: form.buyerCategory === "customer" && form.customerId ? Number(form.customerId) : null,
      totalAmount: Number(form.totalAmount),
      amountPaid: Number(form.totalAmount),
      paymentStatus: "paid",
      items: [
        {
          name: form.productType,
          quantity: 1,
          price: Number(form.totalAmount),
          buyerCategory: form.buyerCategory,
          buyerNotes,
        },
      ],
    });
    setForm({ buyerCategory: "walk_in", customerId: "", otherDescription: "", totalAmount: "", productType: "general" });
    setShowForm(false);
    showToast("Sale recorded!");
    load();
  };

  const handlePartialPay = async (saleId: number) => {
    if (!payAmount) return;
    await api.patch(`/api/sales/${saleId}`, { amountPaid: Number(payAmount) });
    setShowPayModal(null);
    setPayAmount("");
    showToast("Payment recorded!");
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this sale?")) return;
    await api.delete("/api/sales/" + id);
    load();
  };

  const getBuyerLabel = (s: any) => {
    if (s.customer?.name) return s.customer.name;
    const items = Array.isArray(s.items) ? s.items : [];
    const firstItem = items[0];
    if (firstItem?.buyerNotes) return firstItem.buyerNotes;
    if (firstItem?.buyerCategory === "wholesale") return "Wholesale Buyer";
    if (firstItem?.buyerCategory === "trader") return "Local Trader / Broker";
    if (firstItem?.buyerCategory === "neighbor") return "Neighbor / Visitor";
    return "Walk-in Customer";
  };

  const totalRevenue = sales.reduce((s, sale) => s + Number(sale.totalAmount), 0);
  const totalPaid = sales.reduce((s, sale) => s + Number(sale.amountPaid), 0);
  const pending = totalRevenue - totalPaid;

  const handlePrintReceipt = (sale: any) => {
    const effective = resolveReceiptTemplate(receiptTemplate, invoiceTemplate);
    const html = generateReceiptHtml(sale, effective, farmProfile, `RCP-${String(sale.id).padStart(5, "0")}`);
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 300);
    }
  };

  const filtered = sales.filter(s => {
    if (filter === "paid" && s.paymentStatus !== "paid") return false;
    if (filter === "pending" && s.paymentStatus === "paid") return false;
    if (search) {
      const q = search.toLowerCase();
      const buyerLabel = getBuyerLabel(s).toLowerCase();
      return buyerLabel.includes(q);
    }
    return true;
  });

  // Product type breakdown
  const typeMap: Record<string, number> = {};
  sales.forEach(s => {
    const items = Array.isArray(s.items) ? s.items : [];
    items.forEach((item: any) => {
      const name = item.name || "Other";
      typeMap[name] = (typeMap[name] || 0) + Number(item.price || 0);
    });
  });
  const typeData = Object.entries(typeMap).map(([name, value]) => ({ name, value })).filter(v => v.value > 0);

  // Customer balances (who owes)
  const customerDebt = customers
    .map((c: any) => {
      const owed = sales
        .filter((s: any) => s.customerId === c.id && s.paymentStatus !== "paid")
        .reduce((sum: number, s: any) => sum + (Number(s.totalAmount) - Number(s.amountPaid)), 0);
      return { ...c, owed };
    })
    .filter((c: any) => c.owed > 0)
    .sort((a: any, b: any) => b.owed - a.owed);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Sales" description="Track product sales and payments"
          action={<Button onClick={() => setShowForm(!showForm)} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer"><Plus className="h-4 w-4 mr-2" />Record Sale</Button>} />
      </motion.div>

      {/* Form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <Card className="border border-wangari-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-wangari-heading">Record Sale</h3>
                <button onClick={() => setShowForm(false)} className="text-wangari-subtle hover:text-wangari-muted cursor-pointer"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-wangari-muted">What did you sell?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ v: "eggs", l: "Eggs" }, { v: "milk", l: "Milk" }, { v: "meat", l: "Meat" }, { v: "crops", l: "Crops" }, { v: "livestock", l: "Livestock" }, { v: "general", l: "Other" }].map(item => (
                    <button key={item.v} onClick={() => setForm({ ...form, productType: item.v })}
                      className={`py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${form.productType === item.v ? "bg-wangari-green-800 text-white shadow-md" : "bg-wangari-sunken text-wangari-muted hover:bg-tone-neutral-border"}`}>{item.l}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1 mt-4">
                <Label className="text-xs font-semibold text-wangari-muted">Amount (KES)</Label>
                <Input type="number" placeholder="0" value={form.totalAmount} onChange={e => setForm({ ...form, totalAmount: e.target.value })} className="h-12 rounded-xl text-lg font-bold text-center" />
              </div>
              
              {/* Buyer selection */}
              <div className="space-y-2 mt-4">
                <Label className="text-xs font-semibold text-wangari-muted">Buyer Category / Type</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { v: "walk_in", l: "Walk-in Customer" },
                    { v: "wholesale", l: "Wholesale Off-taker" },
                    { v: "trader", l: "Market Trader / Broker" },
                    { v: "neighbor", l: "Neighbor / Visitor" },
                    { v: "customer", l: "Saved Customer" },
                    { v: "other", l: "Other (Specify)" },
                  ].map(b => (
                    <button
                      key={b.v}
                      type="button"
                      onClick={() => setForm({ ...form, buyerCategory: b.v })}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border min-h-[44px] ${
                        form.buyerCategory === b.v
                          ? "bg-wangari-green-800 text-white border-wangari-green-800 shadow-sm"
                          : "bg-tone-neutral-bg text-wangari-muted border-wangari-border hover:bg-wangari-sunken"
                      }`}
                    >
                      {b.l}
                    </button>
                  ))}
                </div>

                {form.buyerCategory === "customer" && (
                  <div className="mt-2">
                    <Label className="text-xs text-wangari-muted">Select Customer</Label>
                    <select
                      value={form.customerId}
                      onChange={e => setForm({ ...form, customerId: e.target.value })}
                      className="w-full h-11 rounded-xl border border-wangari-border px-3 text-sm font-semibold bg-white mt-1"
                    >
                      <option value="">Choose registered customer...</option>
                      {customers.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}

                {form.buyerCategory === "other" && (
                  <div className="mt-2 space-y-1">
                    <Label className="text-xs text-wangari-muted">Describe Buyer / Buyer Name</Label>
                    <Input
                      type="text"
                      placeholder="e.g. Mama Mboga Jane, St. Jude School, County Hotel..."
                      value={form.otherDescription}
                      onChange={e => setForm({ ...form, otherDescription: e.target.value })}
                      className="h-11 rounded-xl font-medium"
                    />
                  </div>
                )}
              </div>

              <Button onClick={handleSubmit} disabled={!form.totalAmount} className="w-full mt-5 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer disabled:opacity-50 h-12 text-base font-bold">Save Sale</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* KPIs */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { title: "Total Revenue", value: `KES ${totalRevenue.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-wangari-green-800" },
          { title: "Paid", value: `KES ${totalPaid.toLocaleString()}`, icon: <CheckCircle className="h-5 w-5" />, color: "bg-wangari-green-500" },
          { title: "Pending", value: `KES ${pending.toLocaleString()}`, icon: <Clock className="h-5 w-5" />, color: "bg-wangari-amber-500" },
          { title: "Customers Owing", value: customerDebt.length.toString(), icon: <Users className="h-5 w-5" />, color: "bg-wangari-red-500" },
        ].map(kpi => (
          <motion.div key={kpi.title} variants={fadeUp}>
            <Card className="border border-wangari-border">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mb-2">{kpi.icon}</div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-wangari-muted">{kpi.title}</p>
                <p className="text-xl font-extrabold text-wangari-heading">{kpi.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts + Customer Balances row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Product breakdown */}
        {typeData.length > 0 && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Card className="border border-wangari-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-wangari-green-800" />
                  <p className="text-xs font-bold text-wangari-heading">Sales by Product</p>
                </div>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="45%" height={140}>
                    <PieChart>
                      <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={25} outerRadius={50} strokeWidth={2} stroke="#fff">
                        {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => `KES ${Number(v).toLocaleString()}`} contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1">
                    {typeData.sort((a, b) => b.value - a.value).map((e, i) => (
                      <div key={e.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-[10px] text-wangari-muted capitalize flex-1">{e.name}</span>
                        <span className="text-[10px] font-bold text-wangari-heading">KES {e.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Customer balances */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <Card className="border border-wangari-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-wangari-amber-500" />
                <p className="text-xs font-bold text-wangari-heading">Outstanding Balances</p>
              </div>
              {customerDebt.length === 0 ? (
                <p className="text-xs text-wangari-subtle py-4 text-center">No outstanding balances</p>
              ) : (
                <div className="space-y-2">
                  {customerDebt.slice(0, 5).map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between rounded-xl bg-tone-warn-bg border border-wangari-amber-100 px-3 py-2.5">
                      <div>
                        <p className="text-xs font-bold text-wangari-heading">{c.name}</p>
                        {c.phone && <p className="text-[10px] text-wangari-subtle">{c.phone}</p>}
                      </div>
                      <p className="text-sm font-extrabold text-wangari-amber-600">KES {c.owed.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "paid", "pending"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize ${filter === f ? "bg-wangari-green-800 text-white" : "bg-wangari-sunken text-wangari-muted hover:bg-tone-neutral-border"}`}>{f}</button>
        ))}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle" />
          <input placeholder="Search buyer..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-10 rounded-xl border border-wangari-border pl-9 pr-3 text-sm" />
        </div>
      </div>

      {/* Sale cards */}
      {filtered.length === 0 ? <EmptyState title="No sales" description="Record your first sale." /> : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-2">
          {filtered.slice(0, 30).map((s, i) => {
            const items = Array.isArray(s.items) ? s.items : [];
            const productNames = items.map((it: any) => it.name).join(", ") || "General";
            const balance = Number(s.totalAmount) - Number(s.amountPaid);
            return (
              <motion.div key={s.id} variants={fadeUp}>
                <Card className="border border-wangari-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={s.paymentStatus === "paid" ? "bg-wangari-green-50 text-wangari-green-800 border-wangari-green-200" : "bg-tone-warn-bg text-tone-warn-text border-tone-warn-border"}>{s.paymentStatus}</Badge>
                          <span className="text-[10px] text-wangari-subtle">{new Date(s.saleDate).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-wangari-muted">{productNames}</p>
                        <p className="text-[10px] font-medium text-wangari-muted mt-0.5">{getBuyerLabel(s)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-wangari-heading">KES {Number(s.totalAmount).toLocaleString()}</p>
                        {balance > 0 && <p className="text-[10px] text-wangari-amber-600 font-bold">KES {balance.toLocaleString()} owing</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {balance > 0 && (
                        <button onClick={() => { setShowPayModal(s.id); setPayAmount(String(balance)); }}
                          className="flex-1 py-2 rounded-xl bg-tone-warn-bg text-tone-warn-text text-xs font-bold border border-tone-warn-border hover:bg-wangari-amber-100 cursor-pointer">Record Payment</button>
                      )}
                      <button onClick={() => handlePrintReceipt(s)} title={`Print receipt (${INVOICE_TEMPLATES.find(t => t.id === (receiptTemplate === "same" ? invoiceTemplate : receiptTemplate))?.name || "Professional"})`}
                        className="py-2 px-3 rounded-xl bg-wangari-sunken text-wangari-muted text-xs font-bold hover:bg-tone-neutral-border cursor-pointer"><Printer className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(s.id)} className="py-2 px-3 rounded-xl bg-tone-bad-bg text-wangari-red-500 text-xs font-bold border border-tone-bad-border hover:bg-badge-red-bg cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Pay modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Card className="w-80 border border-wangari-border">
              <CardContent className="p-6 space-y-4">
                <h3 className="text-sm font-bold text-wangari-heading">Record Payment</h3>
                <Input type="number" placeholder="Amount" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="h-12 rounded-xl text-lg font-bold text-center" />
                <div className="flex gap-2">
                  <Button onClick={() => setShowPayModal(null)} variant="outline" className="flex-1 cursor-pointer">Cancel</Button>
                  <Button onClick={() => handlePartialPay(showPayModal)} className="flex-1 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">Save</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {ToastComponent}
    </div>
  );
}
