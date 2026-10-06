"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Search, FileText, Truck, ShoppingCart, ReceiptText, ArrowRight, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import api from "@/lib/api-client";

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const KIND_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  invoice: { label: "Invoice", icon: <FileText className="h-4 w-4" />, color: "#166534", bg: "#F0FDF4" },
  receipt: { label: "Receipt", icon: <ReceiptText className="h-4 w-4" />, color: "#1E3A5F", bg: "#EFF6FF" },
  delivery: { label: "Delivery", icon: <Truck className="h-4 w-4" />, color: "#B45309", bg: "#FFF7ED" },
  purchase: { label: "Purchase", icon: <ShoppingCart className="h-4 w-4" />, color: "#7C2D12", bg: "#FEF2F2" },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "invoice", label: "Invoices" },
  { id: "receipt", label: "Receipts" },
  { id: "delivery", label: "Deliveries" },
  { id: "purchase", label: "Purchases" },
];

export default function DocumentsPage() {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("all");
  const [results, setResults] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const debounce = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = React.useCallback((query: string, t: string) => {
    setLoading(true);
    api
      .get(`/api/documents?q=${encodeURIComponent(query)}&type=${t}`)
      .then((d: any) => setResults(Array.isArray(d?.results) ? d.results : []))
      .catch(() => setResults([]))
      .finally(() => {
        setLoading(false);
        setSearched(true);
      });
  }, []);

  React.useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(q, type), q ? 300 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, type, runSearch]);

  const formatKES = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;
  const fmtDate = (d: any) => {
    const date = new Date(d);
    return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Documents" description="Every invoice, receipt, delivery and purchase — one search" />

      {/* Search box */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border border-wangari-border">
          <CardContent className="p-5">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by code (INV-202609-0001, DLV-…, PUR-…) or by name — customer, buyer, item…"
                className="h-12 pl-11 pr-10 rounded-xl text-base"
              />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-wangari-subtle hover:text-wangari-muted cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setType(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    type === f.id ? "bg-wangari-green-800 text-white border-wangari-green-800" : "bg-white text-wangari-muted border-wangari-border hover:border-wangari-green-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-wangari-green-800" />
        </div>
      ) : !searched && !q ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Find any document instantly"
          description="Type a document code like INV-202609-0001, or search by customer, buyer or item name. Invoices, receipts, deliveries and purchases are all in one place — nothing gets lost."
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No documents found"
          description={`Nothing matches "${q}". Try a shorter search or a different filter.`}
        />
      ) : (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-2">
          <p className="text-xs font-semibold text-wangari-subtle px-1">
            {results.length} document{results.length === 1 ? "" : "s"} found
          </p>
          {results.map((r) => {
            const meta = KIND_META[r.kind] || KIND_META.invoice;
            return (
              <a
                key={`${r.kind}-${r.id}`}
                href={r.link}
                className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-wangari-border hover:border-wangari-green-200 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0" style={{ background: meta.bg, color: meta.color }}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: meta.bg, color: meta.color }}>
                      {r.code}
                    </span>
                    <span className="text-sm font-bold text-wangari-heading truncate">{r.title}</span>
                    <span className="text-xs text-wangari-subtle capitalize">{meta.label}</span>
                  </div>
                  <p className="text-xs text-wangari-muted mt-1 truncate">
                    {r.party} · {fmtDate(r.date)} · <span className="capitalize">{String(r.status)}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-extrabold text-wangari-heading">{formatKES(r.amount)}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-wangari-rule shrink-0" />
              </a>
            );
          })}
        </motion.div>
      )}
      <div className="pb-4">
        <Button variant="outline" onClick={() => { setQ(""); setType("all"); }} className="cursor-pointer rounded-xl">
          Clear search
        </Button>
      </div>
    </div>
  );
}
