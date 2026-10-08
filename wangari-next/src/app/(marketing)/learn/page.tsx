import type { Metadata } from "next";

import { ArrowFillButton } from "@/components/clone/ArrowFillButton";
import { CtaBand } from "@/components/clone/CtaBand";
import { LearnShelf } from "@/components/clone/LearnShelf";
import { PageHero } from "@/components/clone/PageHero";

/**
 * Public /learn — the free library.
 *
 * Visitors browse and read real documents on our own screens, and member-only
 * documents show as teasers; the full library unlocks inside the dashboard.
 * That contrast is the subscription pitch, so the lock has to be visible
 * rather than hidden.
 *
 * Same data as the dashboard library, drawn in the public site's design
 * system.
 */

export const metadata: Metadata = {
  title: "Learn Center — Free Farming Knowledge | Wangari Farm OS",
  description:
    "A free digital library for Kenyan farmers: growing guides, farming-type handbooks and farmer-rights documents — readable right here, no account needed.",
};

const MEMBER_PANELS = [
  { value: "Live rain outlook", copy: "woven into every growing guide, from your own location" },
  { value: "Reminders", copy: "vaccination and calving dates generated from your records" },
  { value: "Weekly advisory", copy: "farm news with risk alerts, in your inbox" },
  { value: "The full farm OS", copy: "sales, inventory, invoices, workers and AI insights" },
];

export default function PublicLearnPage() {
  return (
    <>
      <PageHero
        eyebrow="WANGARI LEARN CENTER"
        title={
          <>
            The farming library
            <br />
            Kenya&apos;s farmers <span className="serif-word">actually read.</span>
          </>
        }
        lead="Growing guides, farming-type handbooks and your rights as a farmer — written for Kenya, readable right here. No account needed to start."
      >
        <ArrowFillButton href="/register" className="button primary">
          Unlock the full library — free
        </ArrowFillButton>
        <a className="site-sign-in" href="/pricing">
          See plans
        </a>
      </PageHero>

      <section className="section stack-section">
        <LearnShelf />
      </section>

      <section className="section stack-section">
        <div className="panel panel-deep cta-band">
          <div className="eyebrow">INSIDE THE DASHBOARD</div>
          <h2>
            This page is the free version.
            <br />
            <span className="serif-word">Members get the whole library.</span>
          </h2>
          <p>
            The guides stay free forever. What members add is the live layer on top of them — the
            part that uses your own numbers.
          </p>
          <div className="page-actions">
            <ArrowFillButton href="/register" className="button primary">
              Create your free account
            </ArrowFillButton>
            <a className="site-sign-in" href="/login">
              Sign in
            </a>
          </div>
        </div>
      </section>

      <section className="section stack-section">
        <div className="grid-4">
          {MEMBER_PANELS.map((p) => (
            <div className="stat" key={p.value}>
              <strong>{p.value}</strong>
              <span>{p.copy}</span>
            </div>
          ))}
        </div>
      </section>

      <CtaBand
        eyebrow="FREE FOREVER"
        title={
          <>
            Read the guides now.
            <br />
            <span className="serif-word">Add your farm</span> when you&apos;re ready.
          </>
        }
        copy="Fourteen days free, no card, and nothing to install from a store."
        ctaLabel="Start free — 14 days"
        ctaHref="/register"
        secondaryLabel="See pricing"
        secondaryHref="/pricing"
      />
    </>
  );
}
