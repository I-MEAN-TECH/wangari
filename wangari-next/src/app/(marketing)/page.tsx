"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bird,
  BarChart3,
  Package,
  Users,
  Smartphone,
  Sparkles,
  ArrowRight,
  Shield,
  TrendingUp,
  Heart,
  Leaf,
  Sun,
  CloudRain,
  Droplets,
  CheckCircle2,
  Star,
  Quote,
} from "lucide-react";
import { EarlyAccessPanel } from "@/components/landing/EarlyAccessPanel";
import { DemoVideoShowcase } from "@/components/landing/DemoVideoShowcase";
import { StatCards } from "@/components/landing/StatCards";
import { TextRoll } from "@/components/ui/text-roll";
import { WaveGridBackground } from "@/components/ui/wave-grid-background";

/* ── Animation Variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const fadeDown = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8 } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" as const } },
};
const slideInLeft = {
  hidden: { opacity: 0, x: -60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const slideInRight = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

/* ── Data ── */
const features = [
  { icon: Bird, title: "Livestock Management", desc: "Track all your farm animals from arrival to harvest. Monitor health, feeding, and production in real time.", href: "/features/flocks" },
  { icon: BarChart3, title: "Smart Analytics", desc: "See your costs, revenue, and margins at a glance. Know exactly which flock is most profitable.", href: "/features/analytics" },
  { icon: Package, title: "Inventory Control", desc: "Never run out of feed or medication. Get low-stock alerts and track every bag in and out.", href: "/features/inventory" },
  { icon: Users, title: "Team Management", desc: "Manage workers, attendance, and wages. Assign tasks and track who did what.", href: "/features/team" },
  { icon: Smartphone, title: "Works Without Bundles", desc: "Record sales and output with zero internet. Everything is saved on your phone and syncs automatically when you're back online.", href: "/register" },
  { icon: Sparkles, title: "AI Assistant", desc: "Coming soon — an assistant that answers from your own records, never generic advice.", href: "/features/ai" },
];

const steps = [
  { num: 1, title: "Create Account", desc: "Sign up in 30 seconds. No credit card needed.", icon: CheckCircle2 },
  { num: 2, title: "Add Your Flock", desc: "Enter breed, count, and start date.", icon: Bird },
  { num: 3, title: "Log Daily", desc: "Record eggs, feed, and health in 3 taps.", icon: ClipboardIcon },
  { num: 4, title: "See Insights", desc: "Watch your farm data come alive with charts.", icon: BarChart3 },
];

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 14h6" />
      <path d="M9 18h6" />
      <path d="M9 10h6" />
    </svg>
  );
}

const stats = [
  { value: "100%", label: "Offline Sync", icon: Users },
  { value: "< 3 Taps", label: "Daily Data Entry", icon: Bird },
  { value: "KES 1,500", label: "Starter Monthly", icon: TrendingUp },
  { value: "14 Days", label: "Free Trial", icon: Shield },
];

// A second, unused testimonials array used to sit here. It was dead code, and
// it credited "the WhatsApp bot" — which is not built; /whatsapp is still a
// Coming Soon page. Removed rather than left to rot next to real copy.

const benefits = [
  { icon: Leaf, title: "Eco-Friendly", desc: "Reduce waste with smart inventory tracking and data-driven decisions." },
  { icon: Sun, title: "Works Offline", desc: "Log data without internet. Syncs automatically when you're back online." },
  { icon: CloudRain, title: "Weather Aware", desc: "Get weather alerts and adjust feeding schedules automatically." },
  { icon: Droplets, title: "Water Tracking", desc: "Monitor water consumption across all flocks and detect leaks early." },
];

/* ── Page Component ── */
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* ═══════ HERO ═══════ */}
      <section className="relative overflow-hidden text-white -mt-16 pt-16">
        <WaveGridBackground
          colorBase="#0B1220"
          colorHigh="#22C55E"
          gridSize={25}
          waveAmplitude={0.3}
          waveSpeed={5}
          className="absolute inset-0 h-full w-full"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-wangari-ink/80 via-wangari-ink/40 to-wangari-ink/90" />
        </WaveGridBackground>

        <div className="relative z-10 mx-auto max-w-7xl px-6 pt-28 pb-24 md:pt-32 md:pb-32 text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeDown} className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm font-medium mb-8">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-wangari-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-wangari-green-400" />
              </span>
              <span className="text-white/80">Works without bundles · Installs like an app</span>
            </motion.div>            <motion.h1 variants={fadeUp} className="max-w-4xl mx-auto px-4">
              <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
                <TextRoll center>Stop Guessing.</TextRoll>
              </div>
              <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight mt-2">
                <TextRoll center className="bg-gradient-to-r from-wangari-green-400 via-wangari-green-500 to-wangari-green-300 bg-clip-text text-transparent">Start Knowing.</TextRoll>
              </div>
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-8 text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
              Know your real farm profit every day. Track every egg, every bag of feed,
              every shilling — <span className="text-white font-semibold">even without bundles</span>.
              Works offline, installs like an app, syncs when you&apos;re back online.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="group inline-flex items-center gap-3 rounded-full bg-white text-wangari-green-800 px-8 py-4 text-base font-bold hover:bg-wangari-green-50 transition-all duration-300 shadow-2xl shadow-black/20 hover:shadow-3xl hover:-translate-y-1"
              >
                Start Free — 14 Days, No Card
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-8 py-4 text-base font-semibold text-white hover:bg-white/20 transition-all duration-300"
              >
                Sign In
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" className="w-full h-auto block">
            <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H0Z" fill="#FAFBFC" />
          </svg>
        </div>
      </section>

      {/* ═══════ DEMO VIDEO — scroll-to-reveal panel with annotation callouts ═══════ */}
      <DemoVideoShowcase />

      {/* ═══════ OFFLINE-FIRST — the differentiator for rural connectivity ═══════ */}
      <section className="py-24 px-6 bg-wangari-ink text-white relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-wangari-green-500/10 blur-[130px] pointer-events-none" />
        <div className="relative mx-auto max-w-6xl grid lg:grid-cols-2 gap-14 items-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={slideInLeft}>
            <p className="text-sm font-bold uppercase tracking-widest text-wangari-green-400 mb-3">Offline-first</p>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight">
              No bundles?
              <br />
              <span className="bg-gradient-to-r from-wangari-green-400 to-wangari-green-300 bg-clip-text text-transparent">No problem.</span>
            </h2>
            <p className="mt-5 text-lg text-white/60 leading-relaxed">
              The shamba has no signal — your records don&apos;t care. Wangari saves everything
              on your phone and syncs by itself the moment you&apos;re back online.
              No data lost. Ever.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Record sales, output & expenses with zero internet",
                "Saved on your device instantly — nothing is ever lost",
                "Auto-syncs when connectivity returns — no duplicates",
                "Installs like an app: no Play Store, no downloads eating your bundles",
              ].map((item) => (
                <motion.li key={item} variants={fadeUp} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-wangari-green-400 shrink-0 mt-0.5" />
                  <span className="text-sm md:text-base font-medium text-white/80">{item}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={slideInRight} className="relative">
            <div className="mx-auto max-w-sm rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-sm p-6 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">Wangari · Offline</span>
                <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> No connection
                </span>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                  <p className="text-sm font-semibold">Sale recorded — 5 trays KSh 1,750</p>
                  <p className="text-xs text-white/40 mt-0.5">Saved on device · waiting to sync</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                  <p className="text-sm font-semibold">Output — 142 eggs collected</p>
                  <p className="text-xs text-white/40 mt-0.5">Saved on device · waiting to sync</p>
                </div>
                <div className="rounded-xl bg-wangari-green-500/15 border border-wangari-green-500/30 px-4 py-3">
                  <p className="text-sm font-semibold text-wangari-green-300">Back online — 2 records synced ✓</p>
                  <p className="text-xs text-wangari-green-400/60 mt-0.5">Everything up to date</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats — premium cards with GSAP entrance + count-up, centered in the band */}
      <section className="py-24 px-6">
        <StatCards />
      </section>
      <section className="py-28 px-6">
        <div className="mx-auto max-w-7xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp} className="text-center mb-16">
            <p className="text-sm font-bold uppercase tracking-widest text-wangari-green-500 mb-3">Features</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-wangari-heading tracking-tight">
              Everything your farm needs
            </h2>
            <p className="mt-5 text-lg text-wangari-muted max-w-2xl mx-auto">
              From one-tap production logging to real profit in shillings — Wangari handles it all.
            </p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                whileHover={{ y: -8, scale: 1.02 }}
              >
                <Link href={f.href} className="group relative block rounded-2xl border border-wangari-border bg-white p-8 hover:shadow-2xl hover:shadow-wangari-green-800/5 transition-all duration-500 hover:-translate-y-2 hover:border-wangari-green-200 overflow-hidden h-full">
                  <div className="absolute inset-0 bg-gradient-to-br from-wangari-green-50/0 to-wangari-green-50/0 group-hover:from-wangari-green-50/50 group-hover:to-white/0 transition-all duration-500" />
                  <div className="relative">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-wangari-green-800 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <f.icon className="h-7 w-7" />
                    </div>
                    <h3 className="mt-5 text-xl font-bold text-wangari-heading">{f.title}</h3>
                    <p className="mt-3 text-sm text-wangari-muted leading-relaxed">{f.desc}</p>
                    <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-wangari-green-800 opacity-0 group-hover:opacity-100 transition-opacity">
                      Learn more <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section className="py-28 px-6 bg-gradient-to-b from-wangari-green-50 to-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-wangari-green-500/5 blur-[120px] pointer-events-none" />

        <div className="relative mx-auto max-w-5xl text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <p className="text-sm font-bold uppercase tracking-widest text-wangari-green-500 mb-3">How it works</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-wangari-heading tracking-tight">
              Up and running in 4 steps
            </h2>
            <p className="mt-5 text-lg text-wangari-muted">No training needed. No complex setup.</p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                variants={fadeUp}
                whileHover={{ y: -6 }}
                className="relative flex flex-col items-center text-center group"
              >
                {/* Connector line (except last) */}
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-wangari-green-800 to-wangari-green-500/30" />
                )}
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-wangari-green-800 to-wangari-green-700 text-white shadow-xl shadow-wangari-green-800/25 mb-5"
                >
                  <s.icon className="h-7 w-7" />
                </motion.div>
                <h3 className="text-lg font-bold text-wangari-heading">{s.title}</h3>
                <p className="mt-2 text-sm text-wangari-muted">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════ BENEFITS ═══════ */}
      <section className="py-28 px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={slideInLeft}>
              <p className="text-sm font-bold uppercase tracking-widest text-wangari-green-500 mb-3">Why Wangari</p>
              <h2 className="text-3xl md:text-5xl font-extrabold text-wangari-heading tracking-tight leading-tight">
                Built for African
                <br />
                <span className="text-wangari-green-800">farm conditions</span>
              </h2>
              <p className="mt-5 text-lg text-wangari-muted leading-relaxed">
                Unlike generic farm software, Wangari understands the unique challenges
                of farming in Africa — from intermittent connectivity to multi-currency support.
              </p>
              <div className="mt-8 space-y-4">
                {["KES currency built-in", "Works offline, syncs later", "Swahili & English", "WhatsApp integration"].map((item) => (
                  <motion.div key={item} variants={fadeUp} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-wangari-green-500 shrink-0" />
                    <span className="text-sm font-medium text-wangari-text">{item}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={slideInRight} className="grid grid-cols-2 gap-4">
              {benefits.map((b) => (
                <motion.div
                  key={b.title}
                  whileHover={{ y: -6, scale: 1.03 }}
                  className="rounded-2xl border border-wangari-border bg-white p-6 hover:shadow-xl hover:border-wangari-green-200 transition-all duration-300"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-800 mb-4">
                    <b.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-wangari-heading">{b.title}</h3>
                  <p className="mt-2 text-xs text-wangari-muted leading-relaxed">{b.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════ WHAT'S REAL ═══════ */}
      <section className="py-28 px-6 bg-gradient-to-b from-white to-wangari-green-50">
        <div className="mx-auto max-w-7xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-12">
            <p className="text-sm font-bold uppercase tracking-widest text-wangari-green-500 mb-3">Why this is different</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-wangari-heading tracking-tight">
              Built for farmers, not for a slide
            </h2>
            <p className="mt-4 text-base md:text-lg text-wangari-muted">
              What Wangari actually does today — no invented numbers, no invented customers.
            </p>
          </motion.div>

          <EarlyAccessPanel />
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className="py-28 px-6">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={scaleIn}
            className="relative rounded-3xl bg-gradient-to-br from-wangari-ink via-wangari-green-900 to-wangari-green-800 p-12 md:p-16 text-center text-white overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-20 -right-20 h-[300px] w-[300px] rounded-full bg-wangari-green-500/10 blur-[80px]" />
              <div className="absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full bg-wangari-green-400/10 blur-[80px]" />
            </div>
            <div className="relative">
              <motion.div variants={fadeUp}>
                <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">
                  Wangari technology by
                  <br />
                  <span className="bg-gradient-to-r from-wangari-green-400 via-wangari-green-500 to-wangari-green-300 bg-clip-text text-transparent">iMeanTech</span>
                </h2>
              </motion.div>
              <motion.p variants={fadeUp} className="mt-6 text-lg text-white/70 max-w-xl mx-auto">
                Visit iMeanTech to learn about the technology, services and support behind Wangari.
                Start for free — upgrade when you&apos;re ready.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="https://imeantech.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-3 rounded-full bg-white text-wangari-green-800 px-8 py-4 text-base font-bold hover:bg-wangari-green-50 transition-all duration-300 shadow-2xl hover:-translate-y-1"
                >
                  Visit iMeanTech.com
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1.5" />
                </a>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-white/25 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 transition-all duration-300"
                >
                  Get Started Free
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>


    </div>
  );
}
