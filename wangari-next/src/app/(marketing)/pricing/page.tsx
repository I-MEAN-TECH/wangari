"use client";

import * as React from "react";
import { Shield, Sparkles, Zap } from "lucide-react";

import { ArrowFillButton } from "@/components/clone/ArrowFillButton";
import { CtaBand } from "@/components/clone/CtaBand";
import { FaqAccordion } from "@/components/clone/FaqAccordion";
import { PageHero } from "@/components/clone/PageHero";
import { VerifiedCheckIcon } from "@/components/clone/icons";
import { isLoggedIn } from "@/lib/auth-client";
import { useSiteContent } from "@/lib/site-content";

/**
 * Pricing.
 *
 * Rebuilt on the cloned public-site design system — same headings, panels,
 * pill buttons and FAQ accordion as the home page — and every colour comes
 * from a token in styles/wc-theme.css, so nothing here needs touching when the
 * palette moves.
 *
 * The CMS contract is unchanged: the same `pricing` blob from
 * /waadmin/website drives this page, with the same fallback, so the page can
 * never render empty while the blob is loading or missing.
 */

interface PlanContent {
  name: string;
  paystackKey: string | null;
  price: number;
  annualPrice: number | null;
  period: string;
  description: string;
  icon: "zap" | "shield" | "sparkles";
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

// Fallbacks = today's content. Shown while loading or if the CMS blob is
// missing — the page can never render empty.
const FALLBACK: PricingContent = {
  heroKicker: "Fair, Transparent Pricing",
  heroTitle: "Stop losing money to feed waste and co-op errors.",
  heroSubtitle:
    "Track every litre, egg, and bag on your phone. Wangari catches payment shortfalls and feed run-outs before they eat your profit. Start free for 14 days — no card required.",
  annualBadge: "Save 33% · 4 Months Free",
  plans: [
    {
      name: "Starter",
      paystackKey: "starter_monthly",
      price: 950,
      annualPrice: 7600,
      period: "/month",
      description: "Mixed farming setup — all livestock & crop types up to 500 birds or 5 cows.",
      icon: "zap",
      popular: false,
      features: [
        "Mixed farming (all livestock & crops)",
        "Up to 500 birds or 5 cattle",
        "Feed stockout & expiry alerts",
        "Delivery payout clock & arrears tracker",
        "Break-even cost benchmark badge",
        "WhatsApp bot for quick daily logs",
        "Daily profit summary & mobile access",
        "M-Pesa payment friendly",
      ],
      cta: "Start 14-day free trial",
      ctaHref: "/register",
    },
    {
      name: "Growth",
      paystackKey: "growth_monthly",
      price: 2900,
      annualPrice: 23200,
      period: "/month",
      description: "For serious commercial farms wanting full profit visibility and automation.",
      icon: "shield",
      popular: true,
      features: [
        "Unlimited livestock head & crop acreage",
        "Full Action Engine alerts & forecasts",
        "Official Co-op statement audit PDF",
        "AI assistant agronomist",
        "Multi-worker logins & task tracking",
        "Advanced reports + Excel/PDF export",
        "Vaccination & low-stock reminders",
        "WhatsApp bot for data entry",
      ],
      cta: "Start 14-day free trial",
      ctaHref: "/register",
    },
    {
      name: "Enterprise",
      paystackKey: null,
      price: 12000,
      annualPrice: null,
      period: "/month",
      description: "Custom hosting, installation, and dedicated support for large operations.",
      icon: "sparkles",
      popular: false,
      features: [
        "All farm hubs unlocked",
        "Inventory tracking (always included)",
        "Individual hosting & installation",
        "Full AI + priority support",
        "Unlimited team members",
        "Advanced reports + PDF export",
        "Dedicated account manager",
        "Custom integrations",
      ],
      cta: "Contact Sales",
      ctaHref: "mailto:sales@imeantech.com",
    },
  ],
  faqs: [
    { q: "Is there a free trial?", a: "Yes — every plan starts with a 14-day free trial with all features unlocked. No credit card required. Cancel anytime." },
    { q: "What happens if I don't subscribe after 14 days?", a: "Your account gracefully downgrades to Wangari Free Core. Your records, finances, and inventory remain open forever for free in read-only mode so you never lose your history." },
    { q: "What payment methods do you accept?", a: "We accept M-Pesa, Visa, Mastercard, and bank transfers through Paystack." },
    { q: "Do you offer seasonal passes?", a: "Yes. We offer 90-day and 120-day passes timed to harvest seasons (KES 2,400 for Starter, KES 7,500 for Growth) — one M-Pesa payment, no recurring commitments." },
    { q: "How much does it cost per day?", a: "The Starter plan is about KES 30/day — less than the price of a single egg. Growth is KES 95/day and recovers its cost the first time it catches a co-op deduction error." },
  ],
};

const PLAN_ICONS = { zap: Zap, shield: Shield, sparkles: Sparkles } as const;

/** Three promises that hold on every plan, so the grid of cards has a footer. */
const INCLUDED = [
  { value: "14 days", copy: "free on every plan, no card needed" },
  { value: "0 bundles", copy: "records save on the phone and sync later" },
  { value: "Free Core", copy: "your data is never locked, read-only forever" },
];

export default function PricingPage() {
  const [annual, setAnnual] = React.useState(false);
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
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>
            Monthly
          </button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>
            Annual <span className="save">{content.annualBadge}</span>
          </button>
        </div>
      </PageHero>

      <section className="section stack-section">
        <div className="pricing-grid">
          {content.plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.icon] ?? Zap;
            const monthlyPrice = annual
              ? plan.annualPrice
                ? Math.round(plan.annualPrice / 12)
                : Math.round(plan.price * 0.67)
              : plan.price;
            const saving = plan.annualPrice ? plan.price * 12 - plan.annualPrice : 0;
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
                  <small>KES</small>
                  {monthlyPrice.toLocaleString()}
                  <small>{plan.period}</small>
                </div>

                {plan.paystackKey ? (
                  <p className="pricing-micro-anchor">
                    {plan.name.toLowerCase().includes("starter")
                      ? `≈ KES ${Math.round(monthlyPrice / 30).toLocaleString()}/day — less than 1 egg`
                      : `≈ KES ${Math.round(monthlyPrice / 30).toLocaleString()}/day — catches 1 co-op error`}
                  </p>
                ) : null}

                {annual && plan.annualPrice ? (
                  <p className="pricing-note">
                    KES {plan.annualPrice.toLocaleString()}/year — save KES {saving.toLocaleString()}
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
                    {plan.ctaHref.startsWith("mailto:")
                      ? plan.cta
                      : "Start 14-day free trial"}
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
