"use client";

import * as React from "react";
import Link from "next/link";
import { Lock, GraduationCap, Sparkles, ArrowRight } from "lucide-react";
import { DocReader } from "@/components/learn/DocReader";
import { isLoggedIn } from "@/lib/auth-client";
import type { LearnDoc } from "@/lib/learn-library";

/**
 * Public doc gate — the membership play.
 *
 * Visitors: see the first 2 chapters for free, then a locked member overlay
 * (with the live-data panels hidden entirely — that's the members-only magic).
 * Logged-in users: the full document, and links stay in the dashboard library.
 */
export function PublicDocGate({ doc }: { doc: LearnDoc }) {
  const [member, setMember] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setMember(isLoggedIn());
  }, []);

  if (member === null) {
    // avoid flash: render nothing meaningful while checking auth
    return <div className="min-h-[60vh]" />;
  }

  if (member) {
    // Full document — but keep navigation inside the dashboard library
    return <DocReader doc={doc} context="dashboard" />;
  }

  // ── Visitor teaser: first 2 sections + locked overlay ──
  const FREE_SECTIONS = 2;
  const headings = doc.sections.slice(0, FREE_SECTIONS);

  return (
    <div className="min-h-screen bg-wangari-paper">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 md:px-8">
        <header className="mb-8 border-b border-stone-200 pb-6">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-700">
            <GraduationCap className="h-4 w-4" /> Wangari Learn Center — free preview
          </p>
          <h1 className="text-3xl font-black leading-tight tracking-tight text-stone-900 md:text-4xl">
            {doc.emoji} {doc.title}
          </h1>
          <p className="mt-3 text-sm italic text-stone-500">{doc.summary}</p>
        </header>

        {headings.map((s, i) => (
          <section key={i} className="mb-8">
            <h2 className="mb-3 flex items-baseline gap-3 text-xl font-extrabold tracking-tight text-stone-900">
              <span className="text-sm font-black text-emerald-600/60">{String(i + 1).padStart(2, "0")}</span>
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
              <p className="text-[15px] leading-relaxed text-stone-700">{s.body}</p>
            )}
          </section>
        ))}

        {/* Locked member overlay */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-8 md:p-10">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Lock className="h-6 w-6 text-emerald-300" />
            </span>
            <h2 className="text-xl font-black text-white md:text-2xl">
              Read the rest — free with an account
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-emerald-100/80">
              You&apos;ve read the first {FREE_SECTIONS} chapters. Create a free
              account to unlock all {doc.sections.length} chapters of this guide,
              the complete library of {14}+ documents, and the live panels:
              this week&apos;s rain outlook built into every guide, live farm
              news with risk alerts, and reminders generated from your own
              records.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold text-emerald-900 shadow-xl transition-all hover:-translate-y-0.5"
              >
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-bold text-white ring-1 ring-white/25 transition-all hover:bg-white/15"
              >
                Already a member? Sign in
              </Link>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-emerald-300/70">
              <Sparkles className="h-3 w-3" /> Free forever — no card required
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
