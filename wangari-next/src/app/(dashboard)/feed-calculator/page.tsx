"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Calculator, Wheat, AlertTriangle, TrendingUp, Beef, Leaf, Plus, Trash2, X, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api-client";

import { speciesFor } from "@/lib/species-resolve";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

interface FeedItem {
  id: string;
  name: string;
  pricePerBag: number;
  kgPerBag: number;
  numberOfBags: number;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function FeedCalculatorPage() {
  const [flocks, setFlocks] = React.useState<any[]>([]);
  const [selectedFlock, setSelectedFlock] = React.useState("");
  const [headCount, setHeadCount] = React.useState("");
  const [days, setDays] = React.useState("30");
  const [purchased, setPurchased] = React.useState(false);

  // Feed items — fully farmer-controlled
  const [feedItems, setFeedItems] = React.useState<FeedItem[]>([
    { id: generateId(), name: "", pricePerBag: 0, kgPerBag: 50, numberOfBags: 1 },
  ]);

  React.useEffect(() => { api.get("/api/flocks").then(d => setFlocks(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  const flock = flocks.find((f: any) => f.id === Number(selectedFlock));

  // Auto-fill head count when flock selected
  React.useEffect(() => {
    if (flock && !headCount) setHeadCount(String(flock.currentCount));
  }, [flock]);

  const count = Number(headCount) || 0;
  const numDays = Number(days) || 1;

  // Calculations per feed item
  const itemResults = feedItems.map(item => {
    const totalKg = item.kgPerBag * item.numberOfBags;
    const dailyKgPerHead = count > 0 ? totalKg / count / numDays : 0;
    const totalCost = item.pricePerBag * item.numberOfBags;
    const costPerHead = count > 0 ? totalCost / count : 0;
    return { ...item, totalKg, dailyKgPerHead, totalCost, costPerHead };
  });

  const grandTotalCost = itemResults.reduce((s, r) => s + r.totalCost, 0);
  const grandTotalKg = itemResults.reduce((s, r) => s + r.totalKg, 0);
  const grandCostPerHead = count > 0 ? grandTotalCost / count : 0;

  const addFeedItem = () => {
    setFeedItems(prev => [...prev, { id: generateId(), name: "", pricePerBag: 0, kgPerBag: 50, numberOfBags: 1 }]);
  };

  const removeFeedItem = (id: string) => {
    if (feedItems.length <= 1) return;
    setFeedItems(prev => prev.filter(f => f.id !== id));
  };

  const updateFeedItem = (id: string, field: keyof FeedItem, value: string | number) => {
    setFeedItems(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const handlePurchase = async () => {
    try {
      const description = feedItems
        .filter(f => f.name && f.numberOfBags > 0)
        .map(f => `${f.name} (${f.numberOfBags} bags)`)
        .join(", ");
      await api.post("/api/transactions", {
        type: "expense",
        category: "animal_feed",
        description: description || "Feed purchase",
        amount: grandTotalCost,
        paymentMethod: "cash",
        date: new Date().toISOString(),
      });
      setPurchased(true);
      setTimeout(() => setPurchased(false), 3000);
    } catch (err) {
      console.error("Purchase failed:", err);
    }
  };

  const flockSpecies = flock ? speciesFor(flock) : null;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Feed & Input Calculator" description="Calculate feed costs — fully customizable" />
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input section */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-4">
          {/* Flock selector */}
          <Card className="border border-[#E5E7EB]">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-bold text-gray-900">Select your group</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <select value={selectedFlock} onChange={e => { setSelectedFlock(e.target.value); setHeadCount(""); }}
                className="w-full h-12 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534]">
                <option value="">Choose a group...</option>
                {flocks.map(f => <option key={f.id} value={f.id}>{f.name} — {f.currentCount} head ({speciesFor(f)?.name || f.type})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-500">Head count</Label>
                  <Input type="number" value={headCount} onChange={e => setHeadCount(e.target.value)} placeholder="e.g. 500" className="h-11 rounded-xl text-lg font-bold" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-500">Number of days</Label>
                  <Input type="number" value={days} onChange={e => setDays(e.target.value)} className="h-11 rounded-xl text-lg font-bold" />
                </div>
              </div>
              {flockSpecies && (
                <div className="rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] p-2.5 text-[10px] text-[#64748B]">
                  {flockSpecies.name} — {flockSpecies.feedPerDay} • Water: {flockSpecies.waterPerDay}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feed items — fully editable */}
          <Card className="border border-[#E5E7EB]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-gray-900">Feed items</CardTitle>
                <button onClick={addFeedItem} className="flex items-center gap-1 text-[11px] font-bold text-[#166534] hover:underline cursor-pointer">
                  <Plus className="h-3.5 w-3.5" />Add item
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {feedItems.map((item, idx) => (
                <div key={item.id} className="p-3 rounded-xl border border-gray-200 bg-gray-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Item {idx + 1}</p>
                    {feedItems.length > 1 && (
                      <button onClick={() => removeFeedItem(item.id)} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-500">Feed / input name *</Label>
                    <Input placeholder="e.g. Layer Mash, NPK 17:17:17, Dairy Meal..." value={item.name} onChange={e => updateFeedItem(item.id, "name", e.target.value)} className="h-10 rounded-xl" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs font-semibold text-gray-500">💰 Price/bag (KES) *</Label>
                      <Input type="number" placeholder="0" value={item.pricePerBag || ""} onChange={e => updateFeedItem(item.id, "pricePerBag", Number(e.target.value))} className="h-10 rounded-xl text-sm font-bold" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-gray-500">⚖️ Kg per bag</Label>
                      <Input type="number" placeholder="50" value={item.kgPerBag || ""} onChange={e => updateFeedItem(item.id, "kgPerBag", Number(e.target.value))} className="h-10 rounded-xl text-sm font-bold" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-gray-500">📦 Number of bags</Label>
                      <Input type="number" placeholder="1" value={item.numberOfBags || ""} onChange={e => updateFeedItem(item.id, "numberOfBags", Number(e.target.value))} className="h-10 rounded-xl text-sm font-bold" />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Results section */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-4">
          <Card className="border border-[#E5E7EB]">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-bold text-gray-900">Results</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Per-item breakdown */}
              {itemResults.filter(r => r.name).map(r => (
                <div key={r.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                  <p className="text-xs font-bold text-gray-900 mb-2">{r.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white p-2 text-center border border-gray-100">
                      <Wheat className="h-4 w-4 text-[#166534] mx-auto mb-0.5" />
                      <p className="text-[9px] text-gray-400 uppercase">Total kg</p>
                      <p className="text-sm font-bold">{r.totalKg.toLocaleString()} kg</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 text-center border border-gray-100">
                      <Calculator className="h-4 w-4 text-[#166534] mx-auto mb-0.5" />
                      <p className="text-[9px] text-gray-400 uppercase">Bags × Price</p>
                      <p className="text-sm font-bold">{r.numberOfBags} × KES {r.pricePerBag.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-gray-400">Cost:</span>
                    <span className="font-bold text-gray-900">KES {r.totalCost.toLocaleString()}</span>
                  </div>
                </div>
              ))}

              {/* Grand totals */}
              {grandTotalCost > 0 && (
                <div className="rounded-xl bg-[#166534] text-white p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Total feed needed</span>
                    <span className="font-bold">{grandTotalKg.toLocaleString()} kg</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Total bags</span>
                    <span className="font-bold">{itemResults.reduce((s, r) => s + r.numberOfBags, 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-white/20 pt-2">
                    <span className="text-white/70">Total cost</span>
                    <span className="text-xl font-extrabold">KES {grandTotalCost.toLocaleString()}</span>
                  </div>
                  {count > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Cost per head ({numDays} days)</span>
                      <span className="font-bold">KES {grandCostPerHead.toFixed(0)}</span>
                    </div>
                  )}
                  {count > 0 && numDays > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Cost per head/day</span>
                      <span className="font-bold">KES {(grandCostPerHead / numDays).toFixed(0)}</span>
                    </div>
                  )}
                </div>
              )}

              {grandTotalCost === 0 && (
                <div className="text-center py-8">
                  <Calculator className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Add feed items and prices to see calculations</p>
                </div>
              )}

              {/* Purchase button */}
              {grandTotalCost > 0 && (
                <button onClick={handlePurchase} disabled={purchased}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${purchased ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-white text-[#166534] border-2 border-[#166534] hover:bg-[#F0FDF4]"}`}>
                  {purchased ? "✅ Added to Finances!" : <><ShoppingCart className="h-4 w-4 inline mr-2" />Record Purchase — KES {grandTotalCost.toLocaleString()}</>}
                </button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
