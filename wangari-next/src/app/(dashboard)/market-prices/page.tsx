"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, Scale, Plus, Info } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

/**
 * Market price board (gap-analysis row 14, GAP 6).
 *
 * Farmers sell below the going rate because nobody told them the going rate.
 * The checker below takes a price the farmer was offered and tells them, in
 * money, what the difference is worth on the load they are actually selling.
 *
 * Deliberately region-scoped and dated. A national average would tell a Nakuru
 * farmer that a good price is one they can never get, which is worse than no
 * benchmark: it teaches them to ignore the number.
 */

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const COMMODITIES = [
  { id: "milk", label: "Milk", unit: "litre" },
  { id: "eggs", label: "Eggs", unit: "tray" },
  { id: "beef", label: "Beef", unit: "kg" },
  { id: "goat", label: "Goat", unit: "head" },
  { id: "sheep", label: "Sheep", unit: "head" },
  { id: "chicken", label: "Chicken", unit: "head" },
  { id: "coffee", label: "Coffee", unit: "kg" },
  { id: "tea", label: "Tea", unit: "kg" },
  { id: "avocado", label: "Avocado", unit: "kg" },
  { id: "macadamia", label: "Macadamia", unit: "kg" },
  { id: "maize", label: "Maize", unit: "bag" },
  { id: "potatoes", label: "Potatoes", unit: "kg" },
  { id: "onions", label: "Onions", unit: "kg" },
  { id: "tomatoes", label: "Tomatoes", unit: "kg" },
];

export default function MarketPricesPage() {
  const [board, setBoard] = React.useState<any>(null);
  const [mine, setMine] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [commodity, setCommodity] = React.useState("milk");
  const [price, setPrice] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [result, setResult] = React.useState<any>(null);
  const [checking, setChecking] = React.useState(false);

  const [addPrice, setAddPrice] = React.useState("");
  const { showToast, ToastComponent } = useToast();

  const load = React.useCallback(() => {
    Promise.all([api.get("/api/market-prices/board"), api.get("/api/market-prices/mine")])
      .then(([b, m]) => {
        setBoard(b);
        setMine(Array.isArray(m) ? m : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const unit = COMMODITIES.find((c) => c.id === commodity)?.unit ?? "unit";

  // Live check as the farmer types the price. Debounced because this is a
  // round trip per keystroke otherwise, and on a weak connection that is the
  // difference between usable and not.
  React.useEffect(() => {
    if (!price || Number(price) <= 0) {
      setResult(null);
      return;
    }
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await api.post("/api/market-prices/compare", {
          commodity,
          price: Number(price),
          quantity: quantity === "" ? undefined : Number(quantity),
          unit,
        });
        setResult(res);
      } catch {
        setResult(null);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [price, quantity, commodity, unit]);

  const recordPrice = async () => {
    try {
      await api.post("/api/market-prices", { commodity, price: Number(addPrice), unit });
      showToast("Recorded. Thanks — it helps everyone in your area.", "success");
      setAddPrice("");
      load();
    } catch (err: any) {
      showToast(err?.message ?? "Could not save", "error");
    }
  };

  // Group by commodity for the board, taking the newest price in each region.
  const byCommodity = React.useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of board?.prices ?? []) {
      if (!map.has(p.commodity)) map.set(p.commodity, []);
      map.get(p.commodity)!.push(p);
    }
    return map;
  }, [board]);

  return (
    <div className="space-y-6">
      {ToastComponent}
      <PageHeader
        title="Market prices"
        description={`Check a price against what your area is paying${
          board?.county ? ` (${board.county})` : ""
        }.`}
      />

      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Am I being paid enough?
            </CardTitle>
            <CardDescription>Type the price you were offered. We will tell you what it is worth.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="commodity">What are you selling</Label>
                <select
                  id="commodity"
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm text-wangari-heading focus-visible:outline-none focus-visible:border-wangari-green-500"
                >
                  {COMMODITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} (per {c.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price offered (KES)</Label>
                <Input
                  id="price"
                  type="number"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 55"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qty">How much (optional)</Label>
                <Input
                  id="qty"
                  type="number"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 400"
                />
              </div>
            </div>

            {checking && <p className="text-sm text-wangari-muted">Checking the going rate...</p>}

            {result && result.verdict !== "unknown" && (
              <div
                className={`rounded-xl p-4 ${
                  result.verdict === "below"
                    ? "bg-badge-orange-bg/50 border border-badge-orange-text/30"
                    : result.verdict === "above"
                      ? "bg-wangari-green-50 border border-wangari-green-200"
                      : "border border-wangari-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  {result.verdict === "below" ? (
                    <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-badge-orange-text" />
                  ) : result.verdict === "above" ? (
                    <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-wangari-green-800" />
                  ) : (
                    <Scale className="mt-0.5 h-5 w-5 shrink-0 text-wangari-muted" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-wangari-heading">{result.message}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-wangari-muted">
                      <Badge variant={result.stale ? "warning" : "outline"}>{result.ageLabel}</Badge>
                      {result.source && <span>{result.source}</span>}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {result?.verdict === "unknown" && (
              <p className="flex items-start gap-2 text-sm text-wangari-muted">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                {result.message}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle>What you were offered</CardTitle>
          <CardDescription>
            Add the price a buyer offered you. Farmers in your area see it, and it makes the checker better for
            everyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              type="number"
              inputMode="decimal"
              value={addPrice}
              onChange={(e) => setAddPrice(e.target.value)}
              placeholder={`Price for ${COMMODITIES.find((c) => c.id === commodity)?.label.toLowerCase()}, KES per ${unit}`}
              className="max-w-xs"
            />
            <Button onClick={recordPrice} disabled={!addPrice || Number(addPrice) <= 0}>
              <Plus className="h-4 w-4" />
              Record it
            </Button>
          </div>

          {mine.length > 0 && (
            <div className="space-y-1">
              {mine.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-wangari-green-50/60 px-3 py-2 text-sm">
                  <span className="text-wangari-heading">
                    {p.commodity} — KES {Number(p.priceKes).toLocaleString("en-KE")} per {p.unit}
                  </span>
                  <span className="text-xs text-wangari-muted">
                    {new Date(p.effectiveDate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-wangari-border/40" />
      ) : byCommodity.size > 0 ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-wangari-heading">Going rates</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...byCommodity.entries()].map(([commodityName, prices]) => {
              const newest = prices[0];
              return (
                <Card key={commodityName}>
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">
                      {commodityName}
                    </p>
                    <p className="mt-1 text-xl font-bold text-wangari-heading">
                      KES {Number(newest.priceKes).toLocaleString("en-")}
                      <span className="ml-1 text-sm font-normal text-wangari-muted">per {newest.unit}</span>
                    </p>
                    <p className="mt-1 text-xs text-wangari-muted">
                      {newest.region ?? "National"} ·{" "}
                      {new Date(newest.effectiveDate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}