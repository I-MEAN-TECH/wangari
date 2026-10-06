import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, GraduationCap, ArrowRight, Lock, Sparkles } from "lucide-react";
import { LibraryGrid } from "@/components/learn/LibraryGrid";

export const metadata: Metadata = {
  title: "Learn Center — Free Farming Knowledge | Wangari Farm OS",
  description:
    "A free digital library for Kenyan farmers: growing guides, farming-type handbooks and farmer-rights documents — readable right here, no account needed.",
};

/**
 * Public /learn — the free library. Visitors browse and read real documents
 * on OUR screens (no external redirects). Member-only documents show as
 * teasers; the full library unlocks inside the dashboard — that contrast is
 * the subscription pitch.
 */
export default function PublicLearnPage() {
  return (
    <main className="min-h-screen bg-wangari-paper">
      {/* Hero */}
      <section className="border-b border-stone-200 bg-gradient-to-b from-emerald-50/60 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-700">
            <BookOpen className="h-4 w-4" /> Wangari Learn Center
          </p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight text-stone-900 md:text-5xl">
            The farming library Kenya&apos;s
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent"> farmers actually read</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-stone-600">
            Growing guides, farming-type handbooks and your rights as a farmer —
            written for Kenya, readable right here on this page. No account
            needed to start. Members unlock the full library inside the app,
            with live weather and this week&apos;s farm news built into every guide.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-all hover:-translate-y-0.5 hover:bg-emerald-700"
            >
              <GraduationCap className="h-4 w-4" /> Unlock the full library — free
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition-all hover:ring-emerald-300"
            >
              See plans <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Library shelf */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <LibraryGrid isMember={false} />
      </section>

      {/* Member upsell */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-8 md:p-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-300">
              <Lock className="h-3.5 w-3.5" /> Inside the dashboard
            </p>
            <h2 className="mt-3 max-w-xl text-2xl font-black leading-tight text-white md:text-3xl">
              This page is the free version.
              <span className="text-emerald-300"> Members get the whole library.</span>
            </h2>
            <ul className="mt-6 grid gap-3 text-sm text-emerald-100/90 md:grid-cols-2">
              <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> Live rain outlooks woven into every growing guide</li>
              <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> Vaccination &amp; calving reminders generated from your own records</li>
              <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> Daily farm-news advisory with risk alerts in your inbox</li>
              <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> The full farm OS: sales, inventory, invoices, workers, AI insights</li>
            </ul>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold text-emerald-900 shadow-xl transition-all hover:-translate-y-0.5"
            >
              Create your free account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
