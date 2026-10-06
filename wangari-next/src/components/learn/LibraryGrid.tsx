"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, Clock, Lock, Search, Sparkles } from "lucide-react";
import { LEARN_DOCS, CATEGORIES, type LearnDoc } from "@/lib/learn-library";

/**
 * LibraryGrid — the shared "library shelf" screen.
 *
 * `context` controls where clicking a card goes:
 *   - "dashboard" → /library/[slug] (inside the app chrome, full docs)
 *   - "public"    → /learn/[slug] (free teaser + member upsell)
 */

function DocCard({ doc, index, isMember, context }: { doc: LearnDoc; index: number; isMember: boolean; context: "public" | "dashboard" }) {
  const locked = doc.memberOnly && !isMember;
  const href = context === "dashboard" ? `/library/${doc.slug}` : `/learn/${doc.slug}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
    >
      <Link
        href={href}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-wangari-stone-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-wangari-green-300 hover:shadow-[0_12px_40px_-12px_rgba(16,185,129,0.35)]"
      >
        {/* spine accent like a book */}
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-wangari-green-500 to-wangari-teal-500 opacity-60 transition-opacity group-hover:opacity-100" />

        <div className="flex items-start justify-between">
          <span className="text-3xl">{doc.emoji}</span>
          {locked ? (
            <span className="flex items-center gap-1 rounded-full bg-wangari-stone-100 px-2 py-1 text-[10px] font-bold text-wangari-stone-500">
              <Lock className="h-3 w-3" /> Members
            </span>
          ) : doc.memberOnly ? (
            <span className="flex items-center gap-1 rounded-full bg-wangari-green-100 px-2 py-1 text-[10px] font-bold text-wangari-green-700">
              <Sparkles className="h-3 w-3" /> Member
            </span>
          ) : (
            <span className="rounded-full bg-wangari-sky-50 px-2 py-1 text-[10px] font-bold text-wangari-sky-600">Free</span>
          )}
        </div>

        <h3 className="mt-3 text-sm font-extrabold leading-snug text-wangari-stone-900 group-hover:text-wangari-green-800">
          {doc.title}
        </h3>
        <p className="mt-1.5 flex-1 text-xs leading-relaxed text-wangari-stone-500">
          {locked ? "Full guide inside — varieties, programs and checklists for members. Free account unlocks everything." : doc.summary}
        </p>

        <div className="mt-4 flex items-center gap-3 border-t border-wangari-stone-100 pt-3 text-[10px] font-semibold text-wangari-stone-400">
          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {doc.category === "growing-guide" ? "Guide" : doc.category === "farm-type" ? "Farming" : "Rights"}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {doc.readMinutes} min</span>
          <span className="ml-auto text-wangari-green-600 opacity-0 transition-opacity group-hover:opacity-100">Read →</span>
        </div>
      </Link>
    </motion.div>
  );
}

export function LibraryGrid({ isMember = false, context = "public" }: { isMember?: boolean; context?: "public" | "dashboard" }) {
  const [cat, setCat] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");

  const filtered = LEARN_DOCS.filter((d) => {
    const matchCat = cat === "all" || d.category === cat;
    const q = query.trim().toLowerCase();
    const matchQuery = !q || d.title.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q);
    return matchCat && matchQuery;
  });

  return (
    <div>
      {/* Filter + search bar */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCat("all")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
              cat === "all" ? "bg-wangari-stone-900 text-white shadow-md" : "bg-white text-wangari-stone-600 ring-1 ring-wangari-stone-200 hover:ring-wangari-green-300"
            }`}
          >
            All documents
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                cat === c.id ? "bg-wangari-stone-900 text-white shadow-md" : "bg-white text-wangari-stone-600 ring-1 ring-wangari-stone-200 hover:ring-wangari-green-300"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wangari-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the library…"
            className="w-full rounded-full border border-wangari-stone-200 bg-white py-2 pl-9 pr-4 text-xs font-medium text-wangari-stone-700 outline-none transition-all placeholder:text-wangari-stone-400 focus:border-wangari-green-400 focus:ring-2 focus:ring-wangari-green-100"
          />
        </div>
      </div>

      {/* Shelf */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((doc, i) => (
          <DocCard key={doc.slug} doc={doc} index={i} isMember={isMember} context={context} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-wangari-stone-400">No documents match &ldquo;{query}&rdquo;.</p>
      )}
    </div>
  );
}
