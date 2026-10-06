"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Clock, RefreshCw, Sparkles,
  BookOpen, Droplets, Newspaper, AlertTriangle, List,
} from "lucide-react";
import type { LearnDoc } from "@/lib/learn-library";

/**
 * DocReader — the book-like document viewer for the Learn library.
 *
 * Reads a LearnDoc and renders it as an in-app document screen: sticky
 * chapter navigation with SCROLL-SPY (the sidebar always highlights the
 * chapter you're currently reading), reading progress bar, and LIVE blocks
 * (7-day rain outlook, fresh farm news) auto-refreshed every 5 minutes.
 *
 * `context` controls navigation targets and link styling:
 *   - "dashboard" → inside the app chrome (sidebar/topbar)
 *   - "public"    → on the marketing site
 */

interface LiveWeather {
  days: { date: string; rainMm: number; tMax: number; tMin: number; humidity: number }[];
  totalRain: number;
  humidDays: number;
  summary: string;
  blightRisk: string | null;
}
interface LiveNewsItem { title: string; source: string; link: string; pubDate: string; alert: boolean }
interface LivePayload {
  weather?: LiveWeather | null;
  news?: LiveNewsItem[];
  season?: { name: string; advice: string };
  market?: { usdKes: number; asOf: string; daysToMonthEnd: number; note: string } | null;
  fetchedAt?: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LIVE_REFRESH_MS = 5 * 60 * 1000; // refresh live blocks every 5 minutes

export function DocReader({
  doc, nextDoc, prevDoc, context = "public",
}: {
  doc: LearnDoc;
  nextDoc?: LearnDoc;
  prevDoc?: LearnDoc;
  context?: "dashboard" | "public";
}) {
  const base = context === "dashboard" ? "/library" : "/learn";
  const [live, setLive] = React.useState<LivePayload | null>(null);
  const [liveLoading, setLiveLoading] = React.useState(doc.live?.length ? true : false);
  const [progress, setProgress] = React.useState(0);
  const [activeChapter, setActiveChapter] = React.useState(0);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // ── Live blocks: fetch on mount + auto-refresh every 5 min ──
  React.useEffect(() => {
    if (!doc.live?.length) return;
    let cancelled = false;

    const load = async () => {
      const params = new URLSearchParams({ slug: doc.slug });
      if (doc.live!.includes("weather")) params.set("weather", "1");
      if (doc.live!.includes("news")) params.set("news", "1");
      try {
        const res = await fetch(`/api/learn/live?${params}`);
        const data = await res.json();
        if (!cancelled) setLive(data);
      } catch {
        if (!cancelled) setLive(null);
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    };

    load();
    const timer = setInterval(load, LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [doc]);

  // ── Reading progress + scroll-spy active chapter ──
  React.useEffect(() => {
    const onScroll = () => {
      const el = contentRef.current;
      if (!el) return;
      const total = el.scrollHeight - window.innerHeight;
      setProgress(Math.min(100, Math.max(0, (window.scrollY / Math.max(total, 1)) * 100)));

      // which section heading is above the 30% viewport line?
      const sections = el.querySelectorAll("section[id^='sec-']");
      let current = 0;
      const line = window.innerHeight * 0.3;
      sections.forEach((s) => {
        if (s.getBoundingClientRect().top <= line) {
          current = parseInt(s.id.replace("sec-", ""), 10) || 0;
        }
      });
      setActiveChapter(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [doc.slug]);

  // ── Keyboard page flips ──
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && nextDoc) window.location.href = `${base}/${nextDoc.slug}`;
      if (e.key === "ArrowLeft" && prevDoc) window.location.href = `${base}/${prevDoc.slug}`;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextDoc, prevDoc, base]);

  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [doc.slug]);

  const headings = doc.sections.map((s, i) => ({ heading: s.heading, anchor: `sec-${i}` }));

  return (
    <div className="relative min-h-screen bg-wangari-paper">
      {/* Reading progress bar */}
      <div className="fixed inset-x-0 top-0 z-50 h-1 bg-transparent">
        <div className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-24 pt-8 md:px-8">
        {/* ── Chapter sidebar (desktop) — pinned while the document scrolls.
            sticky keeps it fixed in view; the internal max-height + overflow-y
            lets very long TOCs scroll within the rail instead of running off-screen. ── */}
        <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-56 shrink-0 flex-col overflow-y-auto lg:flex">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">
            <List className="h-3.5 w-3.5" /> In this document
          </p>
          <nav className="space-y-0.5 border-l border-stone-200">
            {headings.map((h, i) => {
              const active = i === activeChapter;
              return (
                <a
                  key={h.anchor}
                  href={`#${h.anchor}`}
                  className={`block border-l-2 py-1.5 pl-3 text-xs leading-snug transition-all ${
                    active
                      ? "-ml-[2px] border-emerald-600 bg-emerald-50/70 font-bold text-emerald-900"
                      : "border-transparent text-stone-500 hover:border-emerald-300 hover:text-stone-800"
                  }`}
                >
                  <span className={`mr-1.5 font-bold ${active ? "text-emerald-600" : "text-stone-300"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {h.heading}
                </a>
              );
            })}
          </nav>
          {/* Live reading position indicator */}
          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Now reading</p>
            <p className="mt-1 text-xs font-extrabold leading-snug text-emerald-900">
              Chapter {activeChapter + 1} of {headings.length}: {doc.sections[activeChapter]?.heading}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
                style={{ width: `${((activeChapter + 1) / headings.length) * 100}%` }}
              />
            </div>
          </div>
          <p className="mt-3 hidden text-[10px] text-stone-400 lg:block">← → keys flip to the next document</p>
        </aside>

        {/* ── Document body ── */}
        <article className="min-w-0 flex-1">
          {/* Header */}
          <header className="mb-8 border-b border-stone-200 pb-6">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-700">
              <BookOpen className="h-3.5 w-3.5" />
              {doc.category === "growing-guide" ? "Growing Guide" : doc.category === "farm-type" ? "Farming Type" : "Farmer Rights"}
              <span className="text-stone-300">·</span>
              <span className="flex items-center gap-1 font-medium normal-case tracking-normal text-stone-400">
                <Clock className="h-3 w-3" /> {doc.readMinutes} min read
              </span>
            </p>
            <h1 className="text-3xl font-black leading-tight tracking-tight text-stone-900 md:text-4xl">
              {doc.emoji} {doc.title}
            </h1>
            <p className="mt-3 text-sm italic text-stone-500">{doc.summary}</p>
            <p className="mt-3 text-[11px] text-stone-400">Source: {doc.source}</p>
          </header>

          {/* Live banner: season */}
          <AnimatePresence>
            {live?.season && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="mb-8 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3"
              >
                <Sparkles className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs font-extrabold text-emerald-900">This season: {live.season.name}</p>
                  <p className="text-xs text-emerald-700">{live.season.advice}</p>
                </div>
                {live.fetchedAt && (
                  <span className="ml-auto hidden shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-600 md:flex">
                    <RefreshCw className="h-3 w-3" /> live
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sections */}
          <div ref={contentRef} className="space-y-10">
            {doc.sections.map((s, i) => (
              <section key={i} id={`sec-${i}`} className="scroll-mt-24">
                <h2 className={`mb-3 flex items-baseline gap-3 text-xl font-extrabold tracking-tight transition-colors ${
                  i === activeChapter ? "text-emerald-900" : "text-stone-900"
                }`}>
                  <span className={`text-sm font-black ${i === activeChapter ? "text-emerald-600" : "text-emerald-600/60"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.heading}
                </h2>
                {s.body.startsWith("list:") ? (
                  <ul className="mt-2 space-y-2">
                    {s.body.slice(5).split("\n").filter(Boolean).map((li, j) => (
                      <li key={j} className="flex gap-2.5 leading-relaxed text-stone-700">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span className="text-[15px]">{li}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="max-w-2xl text-[15px] leading-relaxed text-stone-700">{s.body}</p>
                )}
              </section>
            ))}
          </div>

          {/* ── LIVE: 7-day outlook (auto-refreshes) ── */}
          {doc.live?.includes("weather") && (
            <div className="mt-12 rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-extrabold text-sky-900">
                <Droplets className="h-4 w-4 text-sky-600" /> This week&apos;s rain outlook
                <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-sky-500">
                  <RefreshCw className={`h-3 w-3 ${liveLoading ? "animate-spin" : ""}`} /> live — updates every 5 min
                </span>
              </h3>
              {liveLoading ? (
                <div className="mt-3 h-16 animate-pulse rounded-xl bg-sky-100" />
              ) : live?.weather ? (
                <>
                  <p className="text-xs leading-relaxed text-sky-800">{live.weather.summary}</p>
                  {live.weather.blightRisk && (
                    <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-100/80 px-3 py-2 text-xs font-semibold text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /> {live.weather.blightRisk}
                    </p>
                  )}
                  <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                    {live.weather.days.map((d) => (
                      <div key={d.date} className="min-w-[72px] rounded-xl bg-white px-2.5 py-2 text-center shadow-sm">
                        <p className="text-[10px] font-bold uppercase text-stone-400">{DAY_NAMES[new Date(d.date).getDay()]}</p>
                        <p className={`text-lg font-black ${d.rainMm >= 5 ? "text-sky-600" : d.rainMm > 0 ? "text-sky-400" : "text-stone-300"}`}>
                          {d.rainMm}
                        </p>
                        <p className="text-[9px] text-stone-400">mm · {d.tMax}°/{d.tMin}°</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-sky-600">Weather unavailable right now — it refreshes automatically.</p>
              )}
            </div>
          )}

          {/* ── LIVE: market context (auto-refreshes) ── */}
          {live?.market && (
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5">
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">USD / KES</p>
                <p className="text-2xl font-black text-emerald-700">{live.market.usdKes.toFixed(2)}</p>
                <p className="text-[9px] text-stone-400">as of {live.market.asOf}</p>
              </div>
              <div className="h-12 w-px bg-stone-200" />
              <div>
                <p className="text-xs font-bold text-stone-800">Export market context</p>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{live.market.note}</p>
              </div>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-semibold text-stone-400">
                <RefreshCw className="h-3 w-3" /> live
              </span>
            </div>
          )}

          {/* ── LIVE: farm news (auto-refreshes) ── */}
          {doc.live?.includes("news") && (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-stone-900">
                <Newspaper className="h-4 w-4 text-emerald-600" /> Latest farm news
                <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-stone-400">
                  <RefreshCw className={`h-3 w-3 ${liveLoading ? "animate-spin" : ""}`} /> live
                </span>
              </h3>
              {liveLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-4 animate-pulse rounded bg-stone-100" />)}</div>
              ) : live?.news?.length ? (
                <ul className="space-y-2.5">
                  {live.news.map((n) => (
                    <li key={n.link + n.title}>
                      <a href={n.link} target="_blank" rel="noreferrer" className="group flex items-start gap-2.5">
                        {n.alert ? (
                          <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded bg-badge-red-bg px-1.5 py-0.5 text-[9px] font-black uppercase text-badge-red-text">
                            <AlertTriangle className="h-2.5 w-2.5" /> Alert
                          </span>
                        ) : (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        )}
                        <span className="text-xs leading-snug text-stone-700 group-hover:underline">{n.title}</span>
                        <span className="ml-auto shrink-0 text-[10px] font-semibold text-stone-400">{n.source}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-500">News feed temporarily unavailable — it refreshes automatically.</p>
              )}
            </div>
          )}

          {/* ── Footer nav: prev / next like a book ── */}
          <nav className="mt-14 grid grid-cols-2 gap-3 border-t border-stone-200 pt-6">
            {prevDoc ? (
              <Link href={`${base}/${prevDoc.slug}`} className="group rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <ChevronLeft className="h-3 w-3" /> Previous
                </p>
                <p className="mt-1 text-sm font-bold text-stone-800 group-hover:text-emerald-700">{prevDoc.emoji} {prevDoc.title}</p>
              </Link>
            ) : <div />}
            {nextDoc && (
              <Link href={`${base}/${nextDoc.slug}`} className="group rounded-2xl border border-stone-200 bg-white p-4 text-right transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                <p className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  Next <ChevronRight className="h-3 w-3" />
                </p>
                <p className="mt-1 text-sm font-bold text-stone-800 group-hover:text-emerald-700">{nextDoc.emoji} {nextDoc.title}</p>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
