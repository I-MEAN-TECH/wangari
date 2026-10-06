"use client";

import * as React from "react";
import Link from "next/link";
import { GraduationCap, BookOpen, Sparkles, ArrowRight, Droplets, Bug, Sun } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { LibraryGrid } from "@/components/learn/LibraryGrid";
import { LEARN_DOCS } from "@/lib/learn-library";

/**
 * Learn (dashboard) — the FULL members-only library screen.
 *
 * Everything unlocked, with live weather + news woven into documents.
 * Same shelf component as the public page but isMember=true, so member-only
 * docs show their true content and the member badge reinforces the value.
 */
export default function LearnPage() {
  const minutes = LEARN_DOCS.reduce((s, d) => s + d.readMinutes, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Learn Center"
        description="The complete members library — growing guides, farming handbooks and your rights, with live weather and news built in"
      />

      {/* Member-value banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-wangari-green-200 bg-gradient-to-r from-wangari-green-50 to-wangari-teal-50 px-4 py-3">
        <GraduationCap className="h-5 w-5 shrink-0 text-wangari-green-700" />
        <p className="text-xs font-semibold text-wangari-green-800">
          <span className="font-extrabold">{LEARN_DOCS.length} documents · {minutes} minutes of reading.</span>{" "}
          Every guide includes this week&apos;s live rain outlook and the latest farm news —
          visitors on our public page only see a taste of this.
        </p>
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-wangari-green-800 px-2.5 py-1 text-[10px] font-bold text-white">
          <Sparkles className="h-3 w-3" /> Member
        </span>
      </div>

      {/* Library shelf — everything unlocked */}
      <LibraryGrid isMember={true} context="dashboard" />

      {/* Free tools cross-links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/weather" className="group rounded-2xl border border-wangari-border/70 bg-wangari-cream/40 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-3">
            <Droplets className="h-8 w-8 text-wangari-sky-600" />
            <div>
              <p className="flex items-center gap-1 text-sm font-extrabold text-wangari-heading">7-day rain outlook <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" /></p>
              <p className="text-xs text-wangari-muted">Your Weather tab has a per-location forecast — check before planting or spraying.</p>
            </div>
          </div>
        </Link>
        <Link href="/crops" className="group rounded-2xl border border-wangari-border/70 bg-wangari-cream/40 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-3">
            <Bug className="h-8 w-8 text-wangari-amber-600" />
            <div>
              <p className="flex items-center gap-1 text-sm font-extrabold text-wangari-heading">PHI safety <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" /></p>
              <p className="text-xs text-wangari-muted">Log every spray in your crop records — Wangari warns when produce is safe to harvest.</p>
            </div>
          </div>
        </Link>
        <div className="rounded-2xl border border-wangari-border/70 bg-wangari-cream/40 p-4">
          <div className="flex items-center gap-3">
            <Sun className="h-8 w-8 text-wangari-orange-500" />
            <div>
              <p className="text-sm font-extrabold text-wangari-heading">Daily advisory email</p>
              <p className="text-xs text-wangari-muted">Season tips, rain outlook and risk-flagged farm news arrive every morning — free with your account.</p>
            </div>
          </div>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-wangari-subtle">
        <BookOpen className="h-3 w-3" /> Reading something useful? Every document stays on Wangari — we never send you elsewhere.
      </p>
    </div>
  );
}
