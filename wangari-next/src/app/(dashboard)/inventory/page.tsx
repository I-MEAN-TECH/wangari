"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, AlertTriangle, TrendingUp, CircleDollarSign, Plus, X, Trash2, Wheat, Leaf, Pill, Wrench, Search, BarChart3, ArrowUp, ArrowDown, Edit3, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const COLORS = ["#166534", "#22C55E", "#86EFAC", "#94A3B8", "#CBD5E1", "#F59E0B", "#EF4444", "#3B82F6"];

// Suggested categories — but farmer can type ANYTHING
const SUGGESTED_CATEGORIES = [
  "Animal Feed", "Seeds", "Fertilizer", "Pesticide", "Herbicide",
  "Medication", "Equipment", "Fuel", "Packaging", "Other",
];

const SUGGESTED_UNITS = [
  "bags", "kg", "litres", "bottles", "pieces", "rolls", "sachets", "tonnes", "bundles", "cans",
];

export default function InventoryPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<any>(null);
  const [step, setStep] = React.useState(1);
  const [activeCategory, setActiveCategory] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [adjustItem, setAdjustItem] = React.useState<number | null>(null);
  const [adjustQty, setAdjustQty] = React.useState("");
  const [adjustReason, setAdjustReason] = React.useState("");
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    itemName: "", category: "", quantity: "", unit: "bags",
    unitCost: "", reorderLevel: "", supplier: "", expiryDate: "", notes: "",
  });

  const load = () => {
    api.get("/api/inventory").then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  // Discover categories from existing items + suggestions
  const allCategories = React.useMemo(() => {
    const fromItems = [...new Set(items.map(i => i.category).filter(Boolean))];
    const merged = [...new Set([...SUGGESTED_CATEGORIES, ...fromItems])];
    return merged;
  }, [items]);

  const resetForm = () => {
    setForm({ itemName: "", category: "", quantity: "", unit: "bags", unitCost: "", reorderLevel: "", supplier: "", expiryDate: "", notes: "" });
    setEditingItem(null);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      itemName: item.itemName || "",
      category: item.category || "",
      quantity: String(item.quantity || ""),
      unit: item.unit || "bags",
      unitCost: String(item.unitCost || ""),
      reorderLevel: String(item.reorderLevel || ""),
      supplier: item.supplier || "",
      expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split("T")[0] : "",
      notes: item.notes || "",
    });
    setShowForm(true);
    setStep(1);
  };

  const handleSubmit = async () => {
    const payload = {
      itemName: form.itemName,
      category: form.category || null,
      quantity: Number(form.quantity),
      unit: form.unit,
      unitCost: Number(form.unitCost),
      reorderLevel: Number(form.reorderLevel || 0),
      supplier: form.supplier || null,
      expiryDate: form.expiryDate || null,
      notes: form.notes || null,
    };

    if (editingItem) {
      await api.patch(`/api/inventory/${editingItem.id}`, payload);
      showToast("Item updated!");
    } else {
      await api.post("/api/inventory", payload);
      showToast("Item added!");
    }
    resetForm();
    setStep(1);
    setShowForm(false);
    load();
  };

  const handleAdjust = async (id: number, delta: number) => {
    if (!adjustQty) return;
    const qty = delta > 0 ? Math.abs(Number(adjustQty)) : -Math.abs(Number(adjustQty));
    await api.patch(`/api/inventory/${id}`, { quantity: qty });
    setAdjustItem(null); setAdjustQty(""); setAdjustReason("");
    showToast(delta > 0 ? "Stock added!" : "Stock used!");
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this item?")) return;
    await api.delete("/api/inventory/" + id); load();
  };

  const filtered = items.filter(i => {
    const matchCat = activeCategory === "all" || i.category === activeCategory;
    const matchSearch = !search || i.itemName.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const lowStock = items.filter(i => Number(i.quantity) <= i.reorderLevel);
  const totalValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0);

  // Check for expired items
  const now = new Date();
  const expiredItems = items.filter(i => i.expiryDate && new Date(i.expiryDate) < now);
  const expiringSoon = items.filter(i => {
    if (!i.expiryDate) return false;
    const exp = new Date(i.expiryDate);
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
    return daysLeft > 0 && daysLeft <= 30;
  });

  const valueByCategory: Record<string, number> = {};
  items.forEach(i => { const cat = i.category || "other"; valueByCategory[cat] = (valueByCategory[cat] || 0) + Number(i.quantity) * Number(i.unitCost); });
  const valuePie = Object.entries(valueByCategory).map(([name, value]) => ({ name: name.replace(/_/g, " "), value })).filter(v => v.value > 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Inventory" description="Track feed, seeds, fertilizer and farm supplies"
          action={<Button onClick={() => { resetForm(); setShowForm(!showForm); setStep(1); }} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer"><Plus className="h-4 w-4 mr-2" />Add Item</Button>} />
      </motion.div>

      {/* Add/Edit form — step by step */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border border-wangari-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-wangari-heading">{editingItem ? "Edit Item" : "Add Item"}</h3>
                    <div className="flex gap-1">{[1, 2, 3].map(s => <div key={s} className={`h-1.5 w-8 rounded-full ${step >= s ? "bg-wangari-green-800" : "bg-gray-200"}`} />)}</div>
                  </div>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="text-wangari-subtle hover:text-wangari-muted cursor-pointer"><X className="h-4 w-4" /></button>
                </div>

                {step === 1 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-wangari-muted">What is the item? *</Label>
                      <Input placeholder="e.g. Layer Mash, NPK 17:17:17, vaccines, diesel..." value={form.itemName} onChange={e => setForm({ ...form, itemName: e.target.value })} className="h-12 rounded-xl text-base" autoFocus />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-wangari-muted">Category</Label>
                      {/* Quick-pick suggestions */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {SUGGESTED_CATEGORIES.slice(0, 6).map(c => (
                          <button key={c} onClick={() => setForm({ ...form, category: c })}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${form.category === c ? "bg-wangari-green-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{c}</button>
                        ))}
                      </div>
                      {/* Or type custom */}
                      <Input placeholder="Type a custom category..." value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="h-10 rounded-xl text-sm" />
                    </div>
                    <Button onClick={() => form.itemName && setStep(2)} disabled={!form.itemName} className="w-full mt-2 h-11 cursor-pointer">Next</Button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-muted">Quantity *</Label>
                        <Input type="number" placeholder="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="h-12 rounded-xl text-lg font-bold text-center" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-muted">Unit</Label>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {SUGGESTED_UNITS.slice(0, 5).map(u => (
                            <button key={u} onClick={() => setForm({ ...form, unit: u })}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold cursor-pointer ${form.unit === u ? "bg-wangari-green-800 text-white" : "bg-gray-100 text-gray-500"}`}>{u}</button>
                          ))}
                        </div>
                        <Input placeholder="Or type custom unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="h-9 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-muted">Cost per unit (KES) *</Label>
                        <Input type="number" placeholder="0" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} className="h-12 rounded-xl text-lg font-bold text-center" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-muted">Alert when below</Label>
                        <Input type="number" placeholder="0" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} className="h-12 rounded-xl text-lg font-bold text-center" />
                      </div>
                    </div>
                    {form.quantity && form.unitCost && (
                      <div className="rounded-xl bg-wangari-green-50 border border-wangari-green-200 p-3 text-center">
                        <p className="text-xs text-wangari-muted">Total value</p>
                        <p className="text-xl font-extrabold text-wangari-green-800">KES {(Number(form.quantity) * Number(form.unitCost)).toLocaleString()}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={() => setStep(1)} variant="outline" className="flex-1 cursor-pointer">Back</Button>
                      <Button onClick={() => setStep(3)} disabled={!form.quantity} className="flex-1 h-11 cursor-pointer">Next</Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-muted">Supplier (optional)</Label>
                        <Input placeholder="e.g. Kenchic, Double F" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className="h-10 rounded-xl" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-wangari-muted"><Clock className="h-3 w-3 inline" />Expiry date (optional)</Label>
                        <Input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className="h-10 rounded-xl" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-wangari-muted">Notes (optional)</Label>
                      <Input placeholder="e.g. Store in cool dry place, batch #12345..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-10 rounded-xl" />
                    </div>
                    <div className="rounded-xl bg-tone-neutral-bg border border-wangari-border p-4 space-y-2">
                      <div className="flex justify-between text-xs"><span className="text-wangari-muted">Item</span><span className="font-bold text-wangari-heading">{form.itemName}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-wangari-muted">Category</span><span className="font-bold text-wangari-heading">{form.category || "—"}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-wangari-muted">Quantity</span><span className="font-bold text-wangari-heading">{form.quantity} {form.unit}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-wangari-muted">Unit cost</span><span className="font-bold text-wangari-heading">KES {Number(form.unitCost || 0).toLocaleString()}</span></div>
                      {form.expiryDate && <div className="flex justify-between text-xs"><span className="text-wangari-muted">Expires</span><span className="font-bold text-wangari-heading">{new Date(form.expiryDate).toLocaleDateString()}</span></div>}
                      <div className="flex justify-between text-xs border-t border-wangari-border pt-2"><span className="text-wangari-muted">Total value</span><span className="font-extrabold text-wangari-green-800">KES {(Number(form.quantity) * Number(form.unitCost)).toLocaleString()}</span></div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => setStep(2)} variant="outline" className="flex-1 cursor-pointer">Back</Button>
                      <Button onClick={handleSubmit} disabled={!form.itemName || !form.quantity} className="flex-1 h-11 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">{editingItem ? "Update Item" : "Save Item"}</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alerts */}
      {(lowStock.length > 0 || expiredItems.length > 0 || expiringSoon.length > 0) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          {expiredItems.length > 0 && (
            <Card className="border border-red-200 bg-red-50">
              <CardContent className="flex items-center gap-3 p-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-700">{expiredItems.length} item{expiredItems.length > 1 ? "s" : ""} expired!</p>
                  <p className="text-xs text-red-500">{expiredItems.map(i => i.itemName).join(", ")}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {expiringSoon.length > 0 && (
            <Card className="border border-amber-200 bg-amber-50">
              <CardContent className="flex items-center gap-3 p-3">
                <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-700">{expiringSoon.length} item{expiringSoon.length > 1 ? "s" : ""} expiring soon</p>
                  <p className="text-xs text-amber-600">{expiringSoon.map(i => `${i.itemName} (${new Date(i.expiryDate).toLocaleDateString()})`).join(", ")}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {lowStock.length > 0 && (
            <Card className="border border-amber-200 bg-amber-50">
              <CardContent className="flex items-center gap-3 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">{lowStock.length} item{lowStock.length > 1 ? "s" : ""} running low</p>
                  <p className="text-xs text-amber-600">{lowStock.map(i => i.itemName).join(", ")}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* KPIs */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { title: "Total Items", value: items.length.toString(), icon: <Package className="h-5 w-5" />, color: "bg-wangari-green-800" },
          { title: "Total Value", value: `KES ${totalValue.toLocaleString()}`, icon: <CircleDollarSign className="h-5 w-5" />, color: "bg-emerald-500" },
          { title: "Low Stock", value: lowStock.length.toString(), icon: <AlertTriangle className="h-5 w-5" />, color: lowStock.length > 0 ? "bg-amber-500" : "bg-wangari-green-800" },
          { title: "Expiring", value: String(expiredItems.length + expiringSoon.length), icon: <Clock className="h-5 w-5" />, color: (expiredItems.length + expiringSoon.length) > 0 ? "bg-red-500" : "bg-wangari-green-800" },
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

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setActiveCategory("all")}
          className={`px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${activeCategory === "all" ? "bg-wangari-green-800 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
          All ({items.length})
        </button>
        {allCategories.map(cat => {
          const count = items.filter(i => i.category === cat).length;
          if (count === 0) return null;
          return (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${activeCategory === cat ? "bg-wangari-green-800 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle" />
        <input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-10 rounded-xl border border-wangari-border pl-9 pr-3 text-sm" />
      </div>

      {/* Items */}
      {filtered.length === 0 ? <EmptyState title="No items" description="Add inventory items to track your stock." /> : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-2">
          {filtered.map(item => {
            const isLow = Number(item.quantity) <= item.reorderLevel;
            const isExpired = item.expiryDate && new Date(item.expiryDate) < now;
            const isExpiringSoon = item.expiryDate && !isExpired && Math.ceil((new Date(item.expiryDate).getTime() - now.getTime()) / 86400000) <= 30;
            return (
              <motion.div key={item.id} variants={fadeUp}>
                <Card className={`border ${isExpired ? "border-red-300 bg-red-50/30" : isLow ? "border-amber-300 bg-amber-50/30" : "border-wangari-border"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isLow ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                          <Package className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-wangari-heading">{item.itemName}</h3>
                          <p className="text-[10px] text-wangari-subtle">{item.category || "No category"}{item.supplier ? ` • ${item.supplier}` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isExpired && <Badge className="bg-red-100 text-red-700 text-[9px] border-red-200">Expired</Badge>}
                        {isExpiringSoon && !isExpired && <Badge className="bg-amber-100 text-amber-700 text-[9px] border-amber-200">Expiring</Badge>}
                        {isLow && !isExpired && <Badge className="bg-amber-100 text-amber-700 text-[9px] border-amber-200">Low</Badge>}
                        <p className="text-lg font-extrabold text-wangari-heading">{Number(item.quantity).toLocaleString()}<span className="text-xs font-normal text-wangari-subtle ml-1">{item.unit}</span></p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="rounded-lg bg-tone-neutral-bg p-2 text-center"><p className="text-[9px] text-wangari-subtle">Unit cost</p><p className="text-xs font-bold text-wangari-heading">KES {Number(item.unitCost).toLocaleString()}</p></div>
                      <div className="rounded-lg bg-tone-neutral-bg p-2 text-center"><p className="text-[9px] text-wangari-subtle">Value</p><p className="text-xs font-bold text-wangari-green-800">KES {(Number(item.quantity) * Number(item.unitCost)).toLocaleString()}</p></div>
                      <div className="rounded-lg bg-tone-neutral-bg p-2 text-center">
                        <p className="text-[9px] text-wangari-subtle">Reorder</p>
                        <p className="text-xs font-bold text-wangari-heading">{item.reorderLevel} {item.unit}</p>
                      </div>
                    </div>
                    {item.expiryDate && (
                      <div className="mt-2 text-[10px] text-wangari-subtle">
                        Expires: {new Date(item.expiryDate).toLocaleDateString()}
                        {isExpired && <span className="text-red-600 font-bold ml-1">(EXPIRED)</span>}
                        {isExpiringSoon && !isExpired && <span className="text-amber-600 font-bold ml-1">(expiring soon)</span>}
                      </div>
                    )}
                    {item.notes && <p className="mt-1 text-[10px] text-wangari-subtle italic">{item.notes}</p>}
                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { setAdjustItem(item.id); setAdjustQty(""); }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-wangari-green-50 text-wangari-green-800 text-xs font-bold border border-wangari-green-200 hover:bg-wangari-green-100 cursor-pointer">
                        <ArrowUp className="h-3.5 w-3.5" />Restock
                      </button>
                      <button onClick={() => { setAdjustItem(item.id); setAdjustQty(""); }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-bold border border-red-200 hover:bg-red-100 cursor-pointer">
                        <ArrowDown className="h-3.5 w-3.5" />Use Stock
                      </button>
                      <button onClick={() => openEdit(item)} className="py-2.5 px-3 rounded-xl bg-gray-50 text-wangari-subtle hover:text-wangari-muted border border-gray-200 cursor-pointer">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="py-2.5 px-3 rounded-xl bg-gray-50 text-wangari-subtle hover:text-red-500 border border-gray-200 cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Stock adjust modal */}
      {adjustItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Card className="w-80 border border-wangari-border">
              <CardContent className="p-6 space-y-4">
                <h3 className="text-sm font-bold text-wangari-heading">Adjust Stock</h3>
                <p className="text-xs text-wangari-muted">How many {items.find(i => i.id === adjustItem)?.unit || "units"}?</p>
                <Input type="number" placeholder="0" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} className="h-12 rounded-xl text-lg font-bold text-center" />
                <Input placeholder="Reason (optional)" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="h-10 rounded-xl text-sm" />
                <div className="flex gap-2">
                  <Button onClick={() => setAdjustItem(null)} variant="outline" className="flex-1 cursor-pointer">Cancel</Button>
                  <Button onClick={() => handleAdjust(adjustItem, 1)} disabled={!adjustQty} className="flex-1 bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">Add</Button>
                  <Button onClick={() => handleAdjust(adjustItem, -1)} disabled={!adjustQty} className="flex-1 bg-red-500 hover:bg-red-600 text-white cursor-pointer">Use</Button>
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
