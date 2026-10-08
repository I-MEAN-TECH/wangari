import type { Metadata } from "next";
import { ArrowFillButton } from "@/components/clone/ArrowFillButton";
import { ProgramCard } from "@/components/clone/ProgramCard";

/**
 * Index for the feature pages.
 *
 * The nav links here, and before this page existed that link 404'd — the
 * feature routes are all nested (`/features/flocks`, `/features/analytics`, …)
 * with nothing at the parent path. Built from the same ported classes as the
 * rest of the public site so it sits inside the cloned shell without any
 * one-off styling.
 */

export const metadata: Metadata = {
  title: "Features",
  description:
    "Everything Wangari does for a Kenyan farm: record keeping, costs and sales, feed and stock, team and workers, livestock, and the AI assistant.",
};

const FEATURES = [
  {
    n: "01",
    tone: "lavender",
    eyebrow: "RECORD KEEPING",
    title: "Log a day in 3 taps.",
    body: "Eggs, milk, feed, drugs, sales. Type it once on your phone and it's saved — even with no bundles.",
    href: "/features/production",
    label: "See record keeping",
  },
  {
    n: "02",
    tone: "yellow",
    eyebrow: "COSTS & SALES",
    title: "Know what you actually earn.",
    body: "Every shilling in and out, per flock and per plot. Stop guessing your profit at the end of the month.",
    href: "/features/analytics",
    label: "See costs & sales",
  },
  {
    n: "03",
    tone: "sage",
    eyebrow: "FEED & STOCK",
    title: "Never run out mid-cycle.",
    body: "Track every bag of feed and every dose of vaccine. Get warned before you run low, not after.",
    href: "/features/inventory",
    label: "See inventory",
  },
  {
    n: "04",
    tone: "peach",
    eyebrow: "LIVESTOCK & FLOCKS",
    title: "Every animal accounted for.",
    body: "Keep a record per flock, herd or pond — arrivals, losses, production and health — and compare them.",
    href: "/features/flocks",
    label: "See livestock",
  },
  {
    n: "05",
    tone: "lavender",
    eyebrow: "TEAM & WORKERS",
    title: "Everyone on the same page.",
    body: "Add workers, assign tasks, track attendance and wages — so the records match what happened on the ground.",
    href: "/features/team",
    label: "See team & workers",
  },
  {
    n: "06",
    tone: "yellow",
    eyebrow: "AI ASSISTANT",
    title: "Answers from your own records.",
    body: "Ask what a flock is costing you and get the number from your books — never generic advice.",
    href: "/features/ai",
    label: "See the assistant",
  },
] as const;

export default function FeaturesPage() {
  return (
    <>
      <section className="offerings section" style={{ paddingTop: 40 }}>
        <div className="section-heading">
          <div>
            <div className="eyebrow">WHAT YOU CAN DO</div>
            <h2>
              Everything your farm
              <br />
              needs, in <span className="serif-word">one place.</span>
            </h2>
          </div>
          <p>
            Pick the records that matter to you today.
            <br className="desktop-break" />
            Add the rest when you&apos;re ready — nothing
            <br className="desktop-break" />
            here needs a bundle of data.
          </p>
        </div>

        <div className="program-grid">
          {FEATURES.map((f, i) => (
            <ProgramCard
              key={f.n}
              index={i}
              tone={f.tone}
              eyebrow={f.eyebrow}
              title={f.title}
              body={f.body}
              label={f.label}
              href={f.href}
            />
          ))}
        </div>
      </section>

      <section className="social-proof section" style={{ paddingTop: 20 }}>
        <div className="eyebrow">READY WHEN YOU ARE</div>
        <h2>
          Start with one record.
          <br />
          <span className="serif-word">Add the rest later.</span>
        </h2>
        <p className="stories-intro">
          Fourteen days free, no card, and no data bundles required.
        </p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
          <ArrowFillButton href="/register" className="button primary">
            Start free — 14 days
          </ArrowFillButton>
        </div>
      </section>
    </>
  );
}
