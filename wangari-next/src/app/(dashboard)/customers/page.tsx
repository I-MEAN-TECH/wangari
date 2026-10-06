"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Users, Plus, X, Phone, Mail, MapPin, Trash2, DollarSign, ShoppingCart, Search, ChevronRight, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/shared/toast";
import { EmptyState } from "@/components/shared/empty-state";
import api from "@/lib/api-client";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

export default function CustomersPage() {
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [sales, setSales] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [step, setStep] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [detailCustomer, setDetailCustomer] = React.useState<any>(null);
  const [showPayModal, setShowPayModal] = React.useState<number | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [form, setForm] = React.useState({ name: "", phone: "", email: "", address: "" });
  const { showToast, ToastComponent } = useToast();

  const load = () => {
    Promise.all([api.get("/api/customers"), api.get("/api/sales")])
      .then(([c, s]) => { setCustomers(Array.isArray(c) ? c : []); setSales(Array.isArray(s) ? s : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    await api.post("/api/customers", form);
    setForm({ name: "", phone: "", email: "", address: "" });
    setStep(1); setShowForm(false); showToast("Customer added!"); load();
  };

  const handleRecordPayment = async (customerId: number) => {
    if (!payAmount) return;
    const amount = Number(payAmount);
    // Distribute payment across unpaid sales (oldest first)
    const unpaidSales = sales
      .filter((s: any) => s.customerId === customerId && s.paymentStatus !== "paid")
      .sort((a: any, b: any) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());
    let remaining = amount;
    for (const sale of unpaidSales) {
      if (remaining <= 0) break;
      const owed = Number(sale.totalAmount) - Number(sale.amountPaid);
      const pay = Math.min(remaining, owed);
      await api.patch(`/api/sales/${sale.id}`, { amountPaid: pay });
      remaining -= pay;
    }
    // Update customer credit
    const cust = customerStats.find(c => c.id === customerId);
    if (cust) {
      const newCredit = Math.max(0, cust.totalOwed - amount);
      await api.patch(`/api/customers/${customerId}`, { totalCredit: newCredit });
    }
    setShowPayModal(null); setPayAmount("");
    showToast("Payment recorded!"); load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this customer?")) return;
    await api.delete("/api/customers/" + id); load();
  };

  const customerStats = customers.map(c => {
    const custSales = sales.filter(s => s.customerId === c.id);
    const totalSpent = custSales.reduce((s, sale) => s + Number(sale.totalAmount), 0);
    const totalOwed = custSales.reduce((s, sale) => s + (Number(sale.totalAmount) - Number(sale.amountPaid)), 0);
    return { ...c, totalSpent, totalOwed, salesCount: custSales.length, recentSales: custSales.slice(0, 5) };
  });

  const filtered = customerStats.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search));

  const totalRevenue = customerStats.reduce((s, c) => s + c.totalSpent, 0);
  const totalOwed = customerStats.reduce((s, c) => s + c.totalOwed, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  // Customer detail view
  if (detailCustomer) {
    const cust = customerStats.find(c => c.id === detailCustomer.id) || detailCustomer;
    return (
      <div className="space-y-6">
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <button onClick={() => setDetailCustomer(null)} className="text-xs font-bold text-wangari-green-800 mb-3 cursor-pointer">&larr; Back to customers</button>
          <div className="flex items-center gap-4">
            <Avatar name={cust.name} size="lg" />
            <div>
              <h1 className="text-xl font-extrabold text-wangari-heading">{cust.name}</h1>
              {cust.phone && <p className="text-sm text-wangari-muted flex items-center gap-1"><Phone className="h-3 w-3" />{cust.phone}</p>}
              {cust.email && <p className="text-sm text-wangari-muted flex items-center gap-1"><Mail className="h-3 w-3" />{cust.email}</p>}
              {cust.address && <p className="text-sm text-wangari-muted flex items-center gap-1"><MapPin className="h-3 w-3" />{cust.address}</p>}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="border border-wangari-border"><CardContent className="pt-4 pb-3 px-4"><p className="text-[10px] text-wangari-muted uppercase">Orders</p><p className="text-xl font-extrabold text-wangari-heading">{cust.salesCount}</p></CardContent></Card>
          <Card className="border border-wangari-border"><CardContent className="pt-4 pb-3 px-4"><p className="text-[10px] text-wangari-muted uppercase">Total spent</p><p className="text-xl font-extrabold text-wangari-green-800">KES {cust.totalSpent.toLocaleString()}</p></CardContent></Card>
          <Card className="border border-amber-200 bg-amber-50"><CardContent className="pt-4 pb-3 px-4"><p className="text-[10px] text-amber-600 uppercase">Owed</p><p className="text-xl font-extrabold text-amber-600">KES {cust.totalOwed.toLocaleString()}</p></CardContent></Card>
        </div>

        {cust.totalOwed > 0 && (
          <Button onClick={() => { setShowPayModal(cust.id); setPayAmount(String(cust.totalOwed)); }} className="w-full bg-amber-500 hover:bg-amber-600 text-white cursor-pointer">Record Payment</Button>
        )}

        <div>
          <p className="text-xs font-bold text-wangari-muted uppercase tracking-wider mb-3">Recent Sales</p>
          {cust.recentSales.length === 0 ? <p className="text-xs text-wangari-subtle text-center py-4">No sales yet</p> : (
            <div className="space-y-2">
              {cust.recentSales.map((s: any) => (
                <Card key={s.id} className="border border-wangari-border">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-wangari-heading">{new Date(s.saleDate).toLocaleDateString()}</p>
                      <p className="text-[10px] text-wangari-subtle">{Array.isArray(s.items) ? s.items.map((it: any) => it.name).join(", ") || "General" : "General"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-wangari-heading">KES {Number(s.totalAmount).toLocaleString()}</p>
                      <Badge className={s.paymentStatus === "paid" ? "bg-wangari-green-50 text-wangari-green-800 border-wangari-green-200 text-[9px]" : "bg-amber-50 text-amber-700 border-amber-200 text-[9px]"}>{s.paymentStatus}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

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
                    <Button onClick={() => handleRecordPayment(showPayModal)} className="flex-1 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">Save</Button>
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

  // List view
  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Customers" description="Manage customer profiles and purchase history"
          action={<Button onClick={() => { setShowForm(!showForm); setStep(1); }} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer"><Plus className="h-4 w-4 mr-2" />Add Customer</Button>} />
      </motion.div>

      {/* Form — step by step */}
      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <Card className="border border-wangari-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-wangari-heading">Add Customer</h3>
                  <div className="flex gap-1">{[1, 2].map(s => <div key={s} className={`h-1.5 w-8 rounded-full ${step >= s ? "bg-wangari-green-800" : "bg-gray-200"}`} />)}</div>
                </div>
                <button onClick={() => setShowForm(false)} className="text-wangari-subtle hover:text-wangari-muted cursor-pointer"><X className="h-4 w-4" /></button>
              </div>

              {step === 1 && (
                <div className="space-y-3">
                  <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-muted">Customer name</Label><Input placeholder="e.g. Grace Wanjiku" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-12 rounded-xl text-base" autoFocus /></div>
                  <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-muted">Phone number</Label><Input placeholder="+254 7XX XXX XXX" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-11 rounded-xl" /></div>
                  <Button onClick={() => form.name && setStep(2)} disabled={!form.name} className="w-full h-11 cursor-pointer">Next</Button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-muted">Email (optional)</Label><Input placeholder="customer@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl" /></div>
                  <div className="space-y-1"><Label className="text-xs font-semibold text-wangari-muted">Address (optional)</Label><Input placeholder="e.g. Nairobi, Kenya" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="h-11 rounded-xl" /></div>
                  <div className="rounded-xl bg-tone-neutral-bg border border-wangari-border p-3 space-y-1">
                    <p className="text-xs text-wangari-muted">Name: <span className="font-bold text-wangari-heading">{form.name}</span></p>
                    {form.phone && <p className="text-xs text-wangari-muted">Phone: <span className="font-bold text-wangari-heading">{form.phone}</span></p>}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setStep(1)} variant="outline" className="flex-1 cursor-pointer">Back</Button>
                    <Button onClick={handleSubmit} disabled={!form.name} className="flex-1 h-11 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">Save</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* KPIs */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-3 gap-3">
        {[
          { title: "Customers", value: String(customers.length), icon: <Users className="h-5 w-5" />, color: "bg-wangari-green-800" },
          { title: "Revenue", value: `KES ${totalRevenue.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-emerald-500" },
          { title: "Outstanding", value: `KES ${totalOwed.toLocaleString()}`, icon: <ShoppingCart className="h-5 w-5" />, color: totalOwed > 0 ? "bg-amber-500" : "bg-wangari-green-800" },
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle" />
        <input placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-10 rounded-xl border border-wangari-border pl-9 pr-3 text-sm" />
      </div>

      {/* Customer cards */}
      {filtered.length === 0 ? <EmptyState title="No customers" description="Add your first customer." /> : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-2">
          {filtered.map(c => (
            <motion.div key={c.id} variants={fadeUp}>
              <Card className="border border-wangari-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between" onClick={() => setDetailCustomer(c)} role="button">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size="md" />
                      <div>
                        <h3 className="text-sm font-bold text-wangari-heading">{c.name}</h3>
                        <p className="text-[10px] text-wangari-subtle">{c.salesCount} orders</p>
                        {c.phone && <p className="text-[10px] text-wangari-subtle">{c.phone}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-wangari-heading">KES {c.totalSpent.toLocaleString()}</p>
                        {c.totalOwed > 0 && <p className="text-[10px] font-bold text-amber-600">KES {c.totalOwed.toLocaleString()} owed</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-wangari-subtle" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
      {ToastComponent}
    </div>
  );
}
