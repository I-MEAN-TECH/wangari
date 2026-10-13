"use client";

import * as React from "react";
import { Leaf, Shield, Sparkles } from "lucide-react";

import { ArrowFillButton } from "@/components/clone/ArrowFillButton";
import { CtaBand } from "@/components/clone/CtaBand";
import { FaqAccordion } from "@/components/clone/FaqAccordion";
import { PageHero } from "@/components/clone/PageHero";
import { VerifiedCheckIcon } from "@/components/clone/icons";
import { isLoggedIn } from "@/lib/auth-client";
import { useSiteContent } from "@/lib/site-content";

/**
 * Pricing — 3 tiers: Core (free), Starter (KES 950/mo or KES 2,400/season),
 * Growth (KES 2,900/mo or KES 7,500/season).
 */

interface PlanContent {
  name: string;
  paystackKey: string | null;
  price: number;
  annualPrice: number | null;
  seasonalPrice: number | null;
  period: string;
  description: string;
  icon: "leaf" | "shield" | "sparkles";
  popular: boolean;
  features: string[];
  cta: string;
  ctaHref: string;
}
interface PricingContent {
  heroKicker: string;
  heroTitle: string;
  heroSubtitle: string;
  annualBadge: string;
  plans: PlanContent[];
  faqs: { q: string; a: string }[];
}

const FALLBACK: PricingContent = {
  heroKicker: "Fair, Transparent Pricing",
  heroTitle: "Stop losing money to feed waste and co-op errors.",
  heroSubtitle:
    "Track every litre, egg, and bag on your phone. Wangari catches payment shortfalls and feed run-outs before they eat your profit. Start free for 14 days — no card required.",
  annualBadge: "Save 33% · 4 Months Free",
  plans: [
    {
      name: "Core",
      paystackKey: null,
      price: 0,
      annualPrice: null,
      seasonalPrice: null,
      period: "forever free",
      description: "Start keeping records today — no card, no commitment, no expiry.",
      icon: "leaf",
      popular: false,
      features: [
        "1 flock + 1 plot",
        "Daily diary & ledger",
        "Delivery logging",
        "WhatsApp quick input",
        "Basic offline store",
      ],
      cta: "Start free — no card",
      ctaHref: "/register",
    },
    {
      name: "Starter",
      paystackKey: "starter_monthly",
      price: 950,
      annualPrice: 7600,
      seasonalPrice: 2400,
      period: "/month",
      description: "Mixed farming setup — all livestock & crop types up to 500 birds or 5 cows.",
      icon: "shield",
      popular: false,
      features: [
        "Mixed farming (all livestock & crops)",
        "Up to 500 birds or 5 cattle",
        "Feed stockout alerts",
        "Delivery payout clock",
        "Basic break-even badge",
        "M-Pesa Till / Paybill",
        "WhatsApp bot for quick daily logs",
        "Daily profit summary & mobile access",
      ],
      cta: "Start 14-day free trial",
      ctaHref: "/register",
    },
    {
      name: "Growth",
      paystackKey: "growth_monthly",
      price: 2900,
      annualPrice: 23200,
      seasonalPrice: 7500,
      period: "/month",
      description: "For serious commercial farms wanting full profit visibility and automation.",
      icon: "sparkles",
      popular: true,
      features: [
        "Unlimited livestock & crop acreage",
        "Full Action Engine AI",
        "Co-op Statement audit PDF",
        "Multi-worker logins & task tracking",
        "Loan deduction audits",
        "Advanced reports + Excel/PDF export",
        "Vaccination & low-stock reminders",
        "WhatsApp bot for data entry",
      ],
      cta: "Start 14-day free trial",
      ctaHref: "/register",
    },
  ],
  faqs: [
    {
      q: "Is there a free plan?",
      a: "Yes — Wangari Core is free forever. You get 1 flock + 1 plot, a daily diary, delivery logging, and WhatsApp input. No card, no expiry.",
    },
    {
      q: "Is there a free trial on paid plans?",
      a: "Yes — every paid plan starts with a 14-day free trial with all features unlocked. No credit card required. Cancel anytime.",
    },
    {
      q: "What happens if I don't subscribe after 14 days?",
      a: "Your account gracefully downgrades to Wangari Core (free). Your records, finances, and inventory remain open forever in read-only mode so you never lose your history.",
    },
    {
      q: "What payment methods do you accept?",
      a: "We accept M-Pesa, Visa, Mastercard, and bank transfers through Paystack.",
    },
    {
      q: "Do you offer seasonal passes?",
      a: "Yes. We offer 90-day passes timed to harvest seasons — KES 2,400 for Starter, KES 7,500 for Growth. One M-Pesa payment, no recurring commitments.",
    },
    {
      q: "How much does it cost per day?",
      a: "Starter is about KES 30/day — less than the price of a single egg. Growth is KES 95/day and recovers its cost the first time it catches a co-op deduction error.",
    },
  ],
};

const PLAN_ICONS = { leaf: Leaf, shield: Shield, sparkles: Sparkles } as const;

const INCLUDED = [
  { value: "14 days", copy: "free trial on every paid plan, no card needed" },
  { value: "0 bundles", copy: "records save on the phone and sync later" },
  { value: "Free Core", copy: "your data is never locked, read-only forever" },
];

export default function PricingPage() {
  const [billing, setBilling] = React.useState<"monthly" | "annual" | "seasonal">("monthly");
  const [loggedIn, setLoggedIn] = React.useState(false);
  const { data } = useSiteContent<PricingContent>("pricing");
  const content = data ?? FALLBACK;

  React.useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, []);

  return (
    <>
      <PageHero
        eyebrow={content.heroKicker}
        title={
          <>
            Stop losing money to
            <br />
            feed waste &amp; <span className="serif-word">co-op errors.</span>
          </>
        }
        lead={content.heroSubtitle}
      >
        <div className="toggle" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={billing === "monthly"} onClick={() => setBilling("monthly")}>
            Monthly
          </button>
          <button type="button" aria-pressed={billing === "annual"} onClick={() => setBilling("annual")}>
            Annual <span className="save">{content.annualBadge}</span>
          </button>
          <button type="button" aria-pressed={billing === "seasonal"} onClick={() => setBilling("seasonal")}>
            Season Pass
          </button>
        </div>
      </PageHero>

      <section className="section stack-section">
        <div className="pricing-grid">
          {content.plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.icon] ?? Leaf;

            let displayPrice = plan.price;
            let displayLabel = plan.period;

            if (plan.price > 0) {
              if (billing === "seasonal" && plan.seasonalPrice) {
                displayPrice = plan.seasonalPrice;
                displayLabel = "/ 90 days";
              } else if (billing === "annual") {
                displayPrice = plan.annualPrice
                  ? Math.round(plan.annualPrice / 12)
                  : Math.round(plan.price * 0.67);
              }
            }

            const annualSaving = plan.annualPrice ? plan.price * 12 - plan.annualPrice : 0;

            const href = plan.ctaHref.startsWith("mailto:")
              ? plan.ctaHref
              : loggedIn
                ? `/dashboard?subscribe=${plan.paystackKey}`
                : "/register";

            return (
              <article
                className={`panel pricing-card${plan.popular ? " is-popular" : ""}`}
                key={plan.name}
              >
                {plan.popular ? <span className="pricing-badge">Most popular</span> : null}

                <div className="plan-head">
                  <Icon width={20} height={20} aria-hidden="true" />
                  <h3>{plan.name}</h3>
                </div>

                <div className="pricing-price">
                  {plan.price === 0 ? (
                    <span style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Free</span>
                  ) : (
                    <>
                      <small>KES</small>
                      {displayPrice.toLocaleString()}
                      <small>{displayLabel}</small>
                    </>
                  )}
                </div>

                {plan.price === 0 ? (
                  <p className="pricing-micro-anchor">No card. No expiry. Always free.</p>
                ) : plan.paystackKey ? (
                  <p className="pricing-micro-anchor">
                    {plan.name.toLowerCase().includes("starter")
                      ? `\u2248 KES ${Math.round(plan.price / 30).toLocaleString()}/day \u2014 less than 1 egg`
                      : `\u2248 KES ${Math.round(plan.price / 30).toLocaleString()}/day \u2014 catches 1 co-op error`}
                  </p>
                ) : null}

                {billing === "annual" && plan.annualPrice ? (
                  <p className="pricing-note">
                    KES {plan.annualPrice.toLocaleString()}/year \u2014 save KES {annualSaving.toLocaleString()}
                  </p>
                ) : billing === "seasonal" && plan.seasonalPrice ? (
                  <p className="pricing-note">
                    KES {plan.seasonalPrice.toLocaleString()} for 90 days \u2014 one M-Pesa payment
                  </p>
                ) : null}

                <p className="pricing-desc">{plan.description}</p>

                <ul className="tick-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <VerifiedCheckIcon />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="pricing-cta">
                  <ArrowFillButton href={href} className="button primary">
                    {plan.price === 0 ? "Start free \u2014 no card" : "Start 14-day free trial"}
                  </ArrowFillButton>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section stack-section">
        <div className="grid-3">
          {INCLUDED.map((item) => (
            <div className="stat" key={item.value}>
              <strong>{item.value}</strong>
              <span>{item.copy}</span>
            </div>
          ))}
        </div>
      </section>

      <FaqAccordion
        eyebrow="BEFORE YOU CHOOSE"
        title={
          <>
            Good questions.
            <br />
            <span className="serif-word">Straight answers.</span>
          </>
        }
        items={content.faqs}
      />

      <CtaBand
        eyebrow="READY WHEN YOU ARE"
        title={
          <>
            One record today.
            <br />
            <span className="serif-word">A clearer farm</span> by next month.
          </>
        }
        copy="Fourteen days free, no card, and no data bundles required. If it doesn't earn its keep, walk away."
        ctaLabel="Start free — 14 days"
        ctaHref="/register"
        secondaryLabel="Talk to us"
        secondaryHref="/contact"
      />
    </>
  );
}
