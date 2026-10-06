"use client";

import * as React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, ArrowRight, Zap, Shield, Sparkles } from "lucide-react";
import { isLoggedIn } from "@/lib/auth-client";
import { useSiteContent } from "@/lib/site-content";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

// Editable content shape (managed in /waadmin/website).
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

// Fallbacks = today's hardcoded content. Shown while loading or if the CMS
// blob is missing — the page can never render empty.
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
    { q: "Is there a free trial?", a: "Yes! Every plan starts with a 14-day free trial. All features included. No credit card required. Cancel anytime." },
    { q: "Can I switch plans later?", a: "Absolutely. Upgrade or downgrade anytime. Your data is always preserved." },
    { q: "What payment methods do you accept?", a: "We accept M-Pesa, Visa, Mastercard, and bank transfers through Paystack." },
    { q: "What happens to my data if I cancel?", a: "We never delete your data. If you cancel, you get read-only access. Come back anytime and your data is there." },
  ],
};

const ICONS = { zap: Zap, shield: Shield, sparkles: Sparkles } as const;

export default function PricingPage() {
  const [annual, setAnnual] = React.useState(false);
  const [loggedIn, setLoggedIn] = React.useState(false);
  const { data } = useSiteContent<PricingContent>("pricing");
  const content = data ?? FALLBACK;

  React.useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, []);

  return (
    <div className="min-h-screen bg-wangari-cream">
      {/* Hero */}
      <section className="pt-24 pb-16 px-6">
        <motion.div initial="hidden" animate="visible" variants={stagger} className="mx-auto max-w-4xl text-center">
          <motion.p variants={fadeUp} className="text-sm font-bold uppercase tracking-widest text-wangari-green-800 mb-3">{content.heroKicker}</motion.p>
          <motion.h1 variants={fadeUp} className="text-4xl md:text-5xl font-extrabold text-wangari-heading tracking-tight">
            {content.heroTitle}
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 text-lg text-wangari-muted max-w-2xl mx-auto">
            {content.heroSubtitle}
          </motion.p>

          {/* Toggle */}
          <motion.div variants={fadeUp} className="mt-8 inline-flex items-center gap-3 bg-white rounded-full p-1.5 border border-wangari-border">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${!annual ? "bg-wangari-green-800 text-white shadow-md" : "text-wangari-muted hover:text-wangari-heading"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${annual ? "bg-wangari-green-800 text-white shadow-md" : "text-wangari-muted hover:text-wangari-heading"}`}
            >
              Annual <span className="text-wangari-green-500 font-bold">{content.annualBadge}</span>
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* Plans */}
      <section className="pb-24 px-6">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto max-w-6xl grid md:grid-cols-3 gap-8">
          {content.plans.map((plan) => {
            const monthlyPrice = annual ? Math.round(plan.price * 0.83) : plan.price;
            const Icon = ICONS[plan.icon] ?? Zap;
            return (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                whileHover={{ y: -8 }}
                className={`relative rounded-2xl border-2 p-8 transition-all duration-300 ${
                  plan.popular
                    ? "border-wangari-green-800 bg-white shadow-2xl shadow-wangari-green-800/10"
                    : "border-wangari-border bg-white hover:border-wangari-green-200 hover:shadow-xl"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-wangari-green-800 text-white text-xs font-bold uppercase tracking-wider">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl mb-4 ${plan.popular ? "bg-wangari-green-800 text-white" : "bg-wangari-green-50 text-wangari-green-800"}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-wangari-heading">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-sm text-wangari-muted">KES</span>
                    <span className="text-4xl font-extrabold text-wangari-heading">{monthlyPrice.toLocaleString()}</span>
                    <span className="text-sm text-wangari-muted">{plan.period}</span>
                  </div>
                  {annual && plan.annualPrice && (
                    <p className="text-xs text-wangari-green-500 font-semibold mt-1">
                      KES {plan.annualPrice.toLocaleString()}/year — save KES {((plan.price * 12) - plan.annualPrice).toLocaleString()}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-wangari-muted leading-relaxed">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-wangari-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-wangari-text">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={
                    plan.ctaHref.startsWith("mailto:")
                      ? plan.ctaHref
                      : loggedIn
                        ? `/dashboard?subscribe=${plan.paystackKey}`
                        : "/register"
                  }
                  className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                    plan.popular
                      ? "bg-wangari-green-800 text-white hover:bg-wangari-green-900 hover:shadow-lg hover:shadow-wangari-green-800/25"
                      : "border-2 border-wangari-border text-wangari-heading hover:border-wangari-green-800 hover:text-wangari-green-800 hover:bg-wangari-green-50"
                  }`}
                >
                  {plan.ctaHref.startsWith("mailto:")
                    ? plan.cta
                    : loggedIn
                      ? plan.cta
                      : "Start 14-Day Free Trial"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {/* FAQ */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto max-w-3xl mt-16">
          <motion.h2 variants={fadeUp} className="text-2xl font-extrabold text-wangari-heading text-center mb-10">
            Frequently Asked Questions
          </motion.h2>
          <div className="space-y-6">
            {content.faqs.map((faq) => (
              <motion.div key={faq.q} variants={fadeUp} className="rounded-xl border border-wangari-border bg-white p-6">
                <h3 className="font-bold text-wangari-heading mb-2">{faq.q}</h3>
                <p className="text-sm text-wangari-muted leading-relaxed">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>
    </div>
  );
}
