"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  ChevronRight,
  X,
  Zap,
  TrendingUp,
  ShieldCheck,
  Layers,
  Clock,
  Info,
} from "lucide-react";

import { ArrowFillButton } from "@/components/clone/ArrowFillButton";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const CARD_TONES = [
  { bg: "bg-white", border: "border-[#E9D5FF]", text: "text-[#6B21A8]", iconBg: "bg-[#F3E8FF]", tag: "lavender" },
  { bg: "bg-white", border: "border-[#FDE047]/60", text: "text-[#854D0E]", iconBg: "bg-[#FEF9C3]", tag: "yellow" },
  { bg: "bg-white", border: "border-wangari-border", text: "text-[#166534]", iconBg: "bg-wangari-cream", tag: "cream" },
  { bg: "bg-white", border: "border-[#FED7AA]/70", text: "text-[#9A3412]", iconBg: "bg-[#FFEDD5]", tag: "peach" },
];

export interface CapabilityItem {
  title: string;
  desc: string;
  details?: string[];
  impact?: string;
}

export interface FeaturePageProps {
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  capabilities: CapabilityItem[];
  stats?: { value: string; label: string }[];
  testimonial?: { name: string; role: string; text: string };
  farmerExperience?: { heading: string; steps: { title: string; desc: string }[] };
}

export function FeaturePage({
  icon: Icon,
  badge,
  title,
  subtitle,
  description,
  highlights,
  capabilities,
  stats,
  testimonial,
  farmerExperience,
}: FeaturePageProps) {
  const [selectedCapability, setSelectedCapability] = React.useState<CapabilityItem | null>(null);

  return (
    <div className="wc font-sans">
      <div>
        {/* ── 1. HERO SECTION (Site Theme Gradient & Glow) ── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0a2318] via-[#0f3826] to-[#04120b] text-white pt-32 pb-24 px-6 md:pt-40 md:pb-32">
          {/* Subtle glowing ambient spheres */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-32 -right-32 h-[600px] w-[600px] rounded-full bg-wangari-green-500/15 blur-[140px]" />
            <div className="absolute -bottom-32 -left-32 h-[500px] w-[500px] rounded-full bg-wangari-green-400/10 blur-[120px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-[#185339]/20 blur-[100px]" />
          </div>

          <div className="relative mx-auto max-w-5xl text-center">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div
                variants={fadeUp}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md px-4 py-2 text-xs font-bold uppercase tracking-wider text-wangari-green-300 mb-8 shadow-lg"
              >
                <Icon className="h-4 w-4 text-wangari-green-400" />
                <span>{badge}</span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] text-white"
              >
                {title}
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="mt-6 text-base sm:text-lg md:text-xl text-white/75 max-w-2xl mx-auto leading-relaxed font-normal"
              >
                {subtitle}
              </motion.p>

              <motion.div
                variants={fadeUp}
                className="mt-10 flex flex-wrap items-center justify-center gap-4"
              >
                <ArrowFillButton href="/register" className="button primary" circle={36}>
                  Start free trial
                </ArrowFillButton>

                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 backdrop-blur-sm px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/15 transition-all duration-300 active:scale-98"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── 2. INTRO DESCRIPTION ── */}
        <section className="py-16 md:py-20 px-6 bg-wangari-cream border-b border-wangari-border/60">
          <div className="mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="p-10 md:p-14 rounded-3xl bg-white border border-wangari-border shadow-sm relative overflow-hidden text-center"
            >
              {/* Centered top accent bar */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 rounded-b-full bg-wangari-green-800" />
              <p className="text-base sm:text-lg md:text-2xl font-semibold text-wangari-heading leading-snug text-center mx-auto max-w-2xl">
                &ldquo;{description}&rdquo;
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── 3. METRICS / STATS CARDS ── */}
        {stats && stats.length > 0 && (
          <section className="py-16 px-6 bg-wangari-cream border-b border-wangari-border">
            <div className="mx-auto max-w-5xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {stats.map((s, idx) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    whileInView={{ opacity: 1, scale: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    className="p-6 rounded-2xl border border-wangari-border bg-white hover:border-wangari-green-300 hover:shadow-md transition-all duration-300 text-center"
                  >
                    <p className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-wangari-green-800 tracking-tight">
                      {s.value}
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-wangari-muted mt-2">
                      {s.label}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 4. CAPABILITIES (Interactive Card View) ── */}
        <section className="py-24 px-6 bg-wangari-cream">
          <div className="mx-auto max-w-6xl">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-xs font-extrabold uppercase tracking-widest text-wangari-green-800 bg-white border border-wangari-border px-3.5 py-1.5 rounded-full"
              >
                Core Capabilities
              </motion.span>
              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-3xl md:text-4xl font-extrabold text-wangari-heading tracking-tight leading-tight mt-6 mb-4"
              >
                Everything built for real farm conditions
              </motion.h2>
              <p className="text-sm md:text-base text-wangari-muted leading-relaxed">
                Tap any card to view detailed walkthrough &amp; impact.
              </p>
            </div>

            {/* CARD GRID VIEW */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {capabilities.map((cap, i) => {
                const tone = CARD_TONES[i % CARD_TONES.length];
                return (
                  <motion.div
                    key={cap.title}
                    variants={fadeUp}
                    whileHover={{ y: -6, transition: { duration: 0.25 } }}
                    onClick={() => setSelectedCapability(cap)}
                    className={`group cursor-pointer rounded-3xl border ${tone.border} ${tone.bg} p-7 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden`}
                  >
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 shadow-sm text-wangari-green-800">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>

                    <div>
                      <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${tone.iconBg} ${tone.text} mb-5 shadow-sm`}>
                        <CheckCircle2 className="h-6 w-6" />
                      </div>

                      <h3 className="text-xl font-bold text-wangari-heading tracking-tight group-hover:text-wangari-green-800 transition-colors">
                        {cap.title}
                      </h3>

                      <p className="mt-3 text-sm text-wangari-muted leading-relaxed line-clamp-3">
                        {cap.desc}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-black/5 flex items-center justify-between text-xs font-bold text-wangari-green-800">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        Interactive Feature
                      </span>
                      <span className="group-hover:translate-x-1 transition-transform flex items-center gap-0.5">
                        View details &rarr;
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ── 5. FARMER EXPERIENCE (Animated Scroll Timeline) ── */}
        {farmerExperience && (
          <section className="py-28 px-6 bg-gradient-to-b from-[#0a2318] to-[#04120b] text-white relative overflow-hidden">
            <div className="absolute top-0 right-1/3 w-[600px] h-[600px] rounded-full bg-wangari-green-500/10 blur-[150px] pointer-events-none" />
            <div className="relative mx-auto max-w-4xl">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={stagger}
                className="text-center mb-16"
              >
                <motion.span
                  variants={fadeUp}
                  className="inline-flex items-center gap-2 rounded-full border border-wangari-green-400/30 bg-wangari-green-500/15 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-wangari-green-300 mb-4"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Day-in-the-life walkthrough
                </motion.span>
                <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
                  {farmerExperience.heading}
                </motion.h2>
              </motion.div>

              <div className="relative">
                {/* Timeline spine */}
                <div className="absolute left-5 sm:left-[23px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-wangari-green-400 via-wangari-green-500/40 to-transparent" />

                <motion.div
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-50px" }}
                  variants={stagger}
                  className="space-y-8"
                >
                  {farmerExperience.steps.map((step, idx) => (
                    <motion.div key={step.title} variants={fadeUp} className="relative flex gap-5 sm:gap-8 items-start group">
                      <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-wangari-green-400 bg-[#0a2318] text-sm font-extrabold text-wangari-green-300 shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-transform group-hover:scale-110">
                        {idx + 1}
                      </div>

                      <div className="flex-1 rounded-3xl border border-white/12 bg-white/5 backdrop-blur-md p-6 sm:p-8 hover:border-wangari-green-400/40 hover:bg-white/10 transition-all duration-300 shadow-xl">
                        <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                          {step.title}
                        </h3>
                        <p className="mt-3 text-sm sm:text-base text-white/70 leading-relaxed">
                          {step.desc}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </div>
          </section>
        )}

        {/* ── 6. HIGHLIGHTS & BENEFIT CARDS ── */}
        <section className="py-24 px-6 bg-white">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <motion.span
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="text-xs font-extrabold uppercase tracking-widest text-wangari-green-800 bg-wangari-cream border border-wangari-border px-3.5 py-1.5 rounded-full"
              >
                Key Advantages
              </motion.span>
              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-3xl md:text-4xl font-extrabold text-wangari-heading tracking-tight leading-tight mt-6 mb-4"
              >
                Why farmers choose Wangari
              </motion.h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {highlights.map((h, idx) => (
                <motion.div
                  key={h}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                  className="flex items-center gap-4 rounded-2xl bg-white border border-wangari-border p-5 shadow-sm hover:border-wangari-green-300 hover:shadow-md transition-all"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-wangari-green-100 text-wangari-green-800">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-wangari-heading leading-snug">{h}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 7. TESTIMONIAL ── */}
        {testimonial && (
          <section className="py-20 px-6 bg-wangari-cream border-t border-wangari-border">
            <div className="mx-auto max-w-3xl">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="rounded-3xl border border-wangari-border bg-white p-8 sm:p-12 text-center relative overflow-hidden"
              >
                <div className="absolute top-4 right-6 text-6xl text-wangari-border font-serif leading-none select-none">
                  &ldquo;
                </div>
                <p className="text-base sm:text-lg md:text-xl font-medium text-wangari-heading leading-relaxed italic mb-6 relative z-10">
                  &ldquo;{testimonial.text}&rdquo;
                </p>
                <div className="relative z-10">
                  <p className="font-extrabold text-wangari-green-900 text-base">{testimonial.name}</p>
                  <p className="text-xs font-semibold text-wangari-muted mt-0.5">{testimonial.role}</p>
                </div>
              </motion.div>
            </div>
          </section>
        )}

        {/* ── 8. BOTTOM CTA SECTION ── */}
        <section className="py-24 px-6 bg-gradient-to-br from-[#0a2318] to-[#0f3826] text-white text-center relative overflow-hidden">
          <div className="relative mx-auto max-w-3xl">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            >
              Ready to simplify your {badge.toLowerCase()}?
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="mt-5 text-base sm:text-lg text-white/75 max-w-xl mx-auto"
            >
              Start logging today with 14 days free. Zero card required.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-8 flex justify-center"
            >
              <ArrowFillButton href="/register" className="button primary" circle={36}>
                Start 14-day free trial
              </ArrowFillButton>
            </motion.div>
          </div>
        </section>
      </div>

      {/* ── INTERACTIVE CAPABILITY MODAL DRAWER ── */}
      <AnimatePresence>
        {selectedCapability && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.25 }}
              className="relative w-full max-w-lg rounded-3xl bg-white border border-wangari-border p-8 shadow-2xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setSelectedCapability(null)}
                className="absolute top-5 right-5 h-9 w-9 rounded-full bg-wangari-cream flex items-center justify-center text-wangari-muted hover:text-wangari-heading transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-wangari-green-100 text-wangari-green-800 font-bold">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-wangari-green-800 bg-wangari-green-50 px-3 py-1 rounded-full">
                  Capability Detail
                </span>
              </div>

              <h3 className="text-2xl font-extrabold text-wangari-heading tracking-tight">
                {selectedCapability.title}
              </h3>

              <p className="mt-3 text-sm text-wangari-muted leading-relaxed">
                {selectedCapability.desc}
              </p>

              <div className="mt-6 pt-6 border-t border-wangari-border space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-wangari-heading">
                  <Zap className="h-4 w-4 text-wangari-green-800" />
                  Key Practical Impact
                </div>
                <p className="text-xs text-wangari-muted leading-relaxed bg-wangari-cream/60 p-3.5 rounded-xl border border-wangari-border">
                  {selectedCapability.impact ||
                    "Reduces administrative guesswork, guarantees real-time field data capture without internet, and saves hours of manual calculations."}
                </p>
              </div>

              <div className="mt-8 flex gap-3">
                <ArrowFillButton href="/register" className="button primary" circle={32}>
                  Try this feature free
                </ArrowFillButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

