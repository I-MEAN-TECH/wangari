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

  // The Store is the single source of truth for feed and inputs. Before this,
  // the calculator kept its own private list, so the same bag had to be typed
  // twice — once on the Inventory page and once here — and the two could
  // disagree. Now the calculator reads the store and writes back to it.
  const [inventory, setInventory] = React.useState<any[]>([]);
  const [restock, setRestock] = React.useState(true);
  const [syncNote, setSyncNote] = React.useState("");

  const loadInventory = React.useCallback(() => {
    api.get("/api/inventory")
      .then((d: any) => {
        const list = Array.isArray(d) ? d : d?.items || [];
        setInventory(list);
      })
      .catch(() => setInventory([]));
  }, []);

  React.useEffect(() => { api.get("/api/flocks").then(d => setFlocks(Array.isArray(d) ? d : [])).catch(() => {}); }, []);
  React.useEffect(() => { loadInventory(); }, [loadInventory]);

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

  /**
   * Pull a store item into a calculator row. Prices are converted to a
   * per-bag basis because that is how feed is bought in Kenya: a store item
   * priced per kg has to be multiplied out to the bag, or the farmer sees a
   * number that looks nothing like the price on the sack.
   */
  const pickFromStore = (id: string, itemName: string) => {
    const item = inventory.find((i: any) => (i.itemName || i.name) === itemName);
    if (!item) return;
    const unit = String(item.unit || "bags").toLowerCase();
    const cost = Number(item.unitCost || 0);
    const perBag = unit.startsWith("kg") ? cost * 50 : cost;
    setFeedItems(prev => prev.map(f => f.id === id
      ? { ...f, name: itemName, pricePerBag: perBag, kgPerBag: f.kgPerBag || 50 }
      : f));
  };

  /**
   * Buy what the calculator worked out, into the place the farm actually keeps
   * it. Matched by name against the store: an existing item is topped up, a new
   * one is created — so a purchase never silently forks into a second row for a
   * feed the farm already stocks.
   */
  const restockInventory = async (bought: FeedItem[]) => {
    let toppedUp = 0;
    let created = 0;
    for (const item of bought) {
      const existing = inventory.find(
        (i: any) => String(i.itemName || i.name || "").toLowerCase() === item.name.toLowerCase()
      );
      if (existing) {
        // quantity alone = delta adjust (see PATCH /api/inventory/:id)
        await api.patch(`/api/inventory/${existing.id}`, { quantity: item.numberOfBags });
        toppedUp++;
      } else {
        await api.post("/api/inventory", {
          itemName: item.name,
          category: "feed",
          quantity: item.numberOfBags,
          unit: "bags",
          unitCost: item.pricePerBag,
          reorderLevel: 0,
        });
        created++;
      }
    }
    loadInventory();
    return { toppedUp, created };
  };

  const handlePurchase = async () => {
    try {
      const bought = feedItems.filter(f => f.name && f.numberOfBags > 0);
      const description = bought
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

      if (restock && bought.length > 0) {
        const { toppedUp, created } = await restockInventory(bought);
        setSyncNote(
          [toppedUp ? `${toppedUp} item${toppedUp === 1 ? "" : "s"} topped up` : "",
           created ? `${created} added` : ""].filter(Boolean).join(", ") + " in your Store"
        );
      } else {
        setSyncNote("");
      }

      setPurchased(true);
      setTimeout(() => { setPurchased(false); setSyncNote(""); }, 4000);
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
          <Card className="border border-wangari-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-bold text-wangari-gray-900">Select your group</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <select value={selectedFlock} onChange={e => { setSelectedFlock(e.target.value); setHeadCount(""); }}
                className="w-full h-12 rounded-xl border border-wangari-border px-3 text-sm font-medium focus:ring-2 focus:ring-wangari-green-800/20 focus:border-wangari-green-800">
                <option value="">Choose a group...</option>
                {flocks.map(f => <option key={f.id} value={f.id}>{f.name} — {f.currentCount} head ({speciesFor(f)?.name || f.type})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-wangari-gray-500">Head count</Label>
                  <Input type="number" value={headCount} onChange={e => setHeadCount(e.target.value)} placeholder="e.g. 500" className="h-11 rounded-xl text-lg font-bold" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-wangari-gray-500">Number of days</Label>
                  <Input type="number" value={days} onChange={e => setDays(e.target.value)} className="h-11 rounded-xl text-lg font-bold" />
                </div>
              </div>
              {flockSpecies && (
                <div className="rounded-lg bg-wangari-green-50 border border-wangari-green-200 p-2.5 text-[10px] text-wangari-muted">
                  {flockSpecies.name} — {flockSpecies.feedPerDay} • Water: {flockSpecies.waterPerDay}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feed items — fully editable */}
          <Card className="border border-wangari-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-wangari-gray-900">Feed items</CardTitle>
                <button onClick={addFeedItem} className="flex items-center gap-1 text-[11px] font-bold text-wangari-green-800 hover:underline cursor-pointer">
                  <Plus className="h-3.5 w-3.5" />Add item
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {feedItems.map((item, idx) => (
                <div key={item.id} className="p-3 rounded-xl border border-wangari-border bg-wangari-gray-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-wangari-gray-400 uppercase">Item {idx + 1}</p>
                    {feedItems.length > 1 && (
                      <button onClick={() => removeFeedItem(item.id)} className="text-wangari-gray-400 hover:text-wangari-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-wangari-gray-500">Feed / input name *</Label>
                    {inventory.length > 0 && (
                      <select
                        value={inventory.some((i: any) => (i.itemName || i.name) === item.name) ? item.name : ""}
                        onChange={e => { if (e.target.value) pickFromStore(item.id, e.target.value); }}
                        className="w-full h-10 rounded-xl border border-wangari-border px-3 text-sm font-medium"
                      >
                        <option value="">Pick from your Store…</option>
                        {inventory.map((i: any) => {
                          const nm = i.itemName || i.name;
                          return (
                            <option key={i.id} value={nm}>
                              {nm} — KES {Number(i.unitCost || 0).toLocaleString()} / {i.unit} ({Number(i.quantity || 0)} in stock)
                            </option>
                          );
                        })}
                      </select>
                    )}
                    <Input placeholder="or type a new item, e.g. Layer Mash" value={item.name} onChange={e => updateFeedItem(item.id, "name", e.target.value)} className="h-10 rounded-xl" />
                    {inventory.length === 0 && (
                      <a href="/inventory" className="block text-[11px] font-semibold text-wangari-green-800 hover:underline">
                        + Nothing in your Store yet — tap to add feed and inputs in Inventory
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs font-semibold text-wangari-gray-500">💰 Price/bag (KES) *</Label>
                      <Input type="number" placeholder="0" value={item.pricePerBag || ""} onChange={e => updateFeedItem(item.id, "pricePerBag", Number(e.target.value))} className="h-10 rounded-xl text-sm font-bold" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-wangari-gray-500">⚖️ Kg per bag</Label>
                      <Input type="number" placeholder="50" value={item.kgPerBag || ""} onChange={e => updateFeedItem(item.id, "kgPerBag", Number(e.target.value))} className="h-10 rounded-xl text-sm font-bold" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-wangari-gray-500">📦 Number of bags</Label>
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
          <Card className="border border-wangari-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-bold text-wangari-gray-900">Results</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Per-item breakdown */}
              {itemResults.filter(r => r.name).map(r => (
                <div key={r.id} className="p-3 rounded-xl border border-wangari-gray-100 bg-wangari-gray-50/50">
                  <p className="text-xs font-bold text-wangari-gray-900 mb-2">{r.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white p-2 text-center border border-wangari-gray-100">
                      <Wheat className="h-4 w-4 text-wangari-green-800 mx-auto mb-0.5" />
                      <p className="text-[9px] text-wangari-gray-400 uppercase">Total kg</p>
                      <p className="text-sm font-bold">{r.totalKg.toLocaleString()} kg</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 text-center border border-wangari-gray-100">
                      <Calculator className="h-4 w-4 text-wangari-green-800 mx-auto mb-0.5" />
                      <p className="text-[9px] text-wangari-gray-400 uppercase">Bags × Price</p>
                      <p className="text-sm font-bold">{r.numberOfBags} × KES {r.pricePerBag.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-wangari-gray-400">Cost:</span>
                    <span className="font-bold text-wangari-gray-900">KES {r.totalCost.toLocaleString()}</span>
                  </div>
                </div>
              ))}

              {/* Grand totals */}
              {grandTotalCost > 0 && (
                <div className="rounded-xl bg-wangari-green-800 text-white p-4 space-y-2">
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
                  <Calculator className="h-8 w-8 text-wangari-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-wangari-gray-400">Add feed items and prices to see calculations</p>
                </div>
              )}

              {/* Purchase button */}
              {grandTotalCost > 0 && (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 rounded-xl border border-wangari-border bg-wangari-gray-50/60 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restock}
                      onChange={e => setRestock(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-wangari-green-800"
                    />
                    <span className="text-xs text-wangari-muted">
                      Also add these bags to my <span className="font-bold text-wangari-heading">Store</span>, so
                      Inventory stays the one place feed is tracked.
                    </span>
                  </label>

                  <button onClick={handlePurchase} disabled={purchased}
                    className={`w-full py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${purchased ? "bg-wangari-green-100 text-wangari-green-700 border border-wangari-green-200" : "bg-white text-wangari-green-800 border-2 border-wangari-green-800 hover:bg-wangari-green-50"}`}>
                    {purchased
                      ? `✅ Recorded${syncNote ? ` — ${syncNote}` : " and added to Finances"}`
                      : <><ShoppingCart className="h-4 w-4 inline mr-2" />Record Purchase — KES {grandTotalCost.toLocaleString()}</>}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
