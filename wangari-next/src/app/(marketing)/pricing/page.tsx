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
  heroKicker: "Pricing",
  heroTitle: "Start free. Upgrade when you see results.",
  heroSubtitle:
    "Choose the plan that fits your farm. Every plan includes mobile access and daily profit reports. Start with a 14-day free trial — no credit card required.",
  annualBadge: "Save 17%",
  plans: [
    {
      name: "Starter",
      paystackKey: "starter_monthly",
      price: 1500,
      annualPrice: 12000,
      period: "/month",
      description: "Perfect for small farms just getting started with digital records.",
      icon: "zap",
      popular: false,
      features: [
        "1 hub of your choice",
        "Inventory tracking (always included)",
        "WhatsApp bot for data entry",
        "Daily profit summary",
        "Basic reports",
        "Mobile access",
      ],
      cta: "Subscribe Now",
      ctaHref: "/register",
    },
    {
      name: "Growth",
      paystackKey: "growth_monthly",
      price: 4500,
      annualPrice: 36000,
      period: "/month",
      description: "For serious farmers who want real profit visibility across their operation.",
      icon: "shield",
      popular: true,
      features: [
        "3 hubs of your choice",
        "Inventory tracking (always included)",
        "AI assistant (ask questions in plain language)",
        "Advanced reports + PDF export",
        "Vaccination & low-stock reminders",
        "Daily profit reports",
        "WhatsApp bot for data entry",
      ],
      cta: "Subscribe Now",
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
        "All 6 hubs unlocked",
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
    { q: "Is there a free trial?", a: "Yes — every plan starts with a 14-day free trial. All features included. No credit card required. Cancel anytime." },
    { q: "Can I switch plans later?", a: "Absolutely. Upgrade or downgrade anytime. Your data is always preserved." },
    { q: "What payment methods do you accept?", a: "We accept M-Pesa, Visa, Mastercard, and bank transfers through Paystack." },
    { q: "What happens to my data if I cancel?", a: "We never delete your data. If you cancel, you get read-only access. Come back anytime and your data is there." },
  ],
};

const PLAN_ICONS = { zap: Zap, shield: Shield, sparkles: Sparkles } as const;

/** Three promises that hold on every plan, so the grid of cards has a footer. */
const INCLUDED = [
  { value: "14 days", copy: "free on every plan, no card needed" },
  { value: "0 bundles", copy: "records save on the phone and sync later" },
  { value: "Cancel anytime", copy: "your data stays yours, read-only after" },
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
            Start free.
            <br />
            Upgrade when you see <span className="serif-word">results.</span>
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
            const monthlyPrice = annual ? Math.round(plan.price * 0.83) : plan.price;
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
                      : loggedIn
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
