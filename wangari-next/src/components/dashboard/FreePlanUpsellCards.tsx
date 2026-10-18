"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bird,
  Leaf,
  HeartPulse,
  Package,
  TrendingUp,
  Lock,
  Sparkles,
  ArrowRight,
  Baby,
} from "lucide-react";
import { cn } from "@/lib/utils";

const UPSELL_FEATURES = [
  {
    id: "livestock",
    icon: Bird,
    color: "from-amber-50 to-orange-50",
    border: "border-amber-200",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    badge: "Starter Plan",
    badgeColor: "bg-amber-100 text-amber-800",
    title: "Manage Your Cows & Chickens",
    story:
      "Mama Samia's cow was pregnant — but she didn't know because she had forgotten the day the cow was inseminated. Now she uses Wangari and gets alerts before the calf arrives.",
    cta: "Track My Animals",
  },
  {
    id: "health",
    icon: HeartPulse,
    color: "from-rose-50 to-pink-50",
    border: "border-rose-200",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-700",
    badge: "Starter Plan",
    badgeColor: "bg-rose-100 text-rose-800",
    title: "Animal Health & Vaccination Alerts",
    story:
      "Mwangi lost 3 chickens to Newcastle disease. A 24-hour vaccination reminder would have saved them. Wangari sends the alert automatically.",
    cta: "Get Health Alerts",
  },
  {
    id: "repro",
    icon: Baby,
    color: "from-violet-50 to-purple-50",
    border: "border-violet-200",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-700",
    badge: "Growth Plan",
    badgeColor: "bg-violet-100 text-violet-800",
    title: "Pregnancy & Birth Tracking",
    story:
      "Aisha tracks all 12 of her cows' breeding dates. She gets a 7-day birth alert so she prepares the shed, feeds the cow extra, and is ready when the calf arrives.",
    cta: "Track Pregnancies",
  },
  {
    id: "crops",
    icon: Leaf,
    color: "from-green-50 to-emerald-50",
    border: "border-green-200",
    iconBg: "bg-green-100",
    iconColor: "text-green-700",
    badge: "Starter Plan",
    badgeColor: "bg-green-100 text-green-800",
    title: "Crop & Plot Management",
    story:
      "Peter knows exactly when to spray his maize. Wangari shows the crop stage, rainfall data, and alerts him when pests are likely based on his farm location.",
    cta: "Manage My Crops",
  },
  {
    id: "inventory",
    icon: Package,
    color: "from-blue-50 to-sky-50",
    border: "border-blue-200",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
    badge: "Starter Plan",
    badgeColor: "bg-blue-100 text-blue-800",
    title: "Feed & Stock Inventory",
    story:
      "Grace never runs out of chicken feed anymore. Wangari warns her 5 days before stock runs out so she can order in time — saving emergency trips to town.",
    cta: "Track My Inventory",
  },
  {
    id: "analytics",
    icon: TrendingUp,
    color: "from-teal-50 to-cyan-50",
    border: "border-teal-200",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-700",
    badge: "Growth Plan",
    badgeColor: "bg-teal-100 text-teal-800",
    title: "Profit & Cost Analytics",
    story:
      "David discovered his feed cost was higher than his egg income. Wangari's cost-per-egg analysis showed him exactly where his money was going, and he switched feeds.",
    cta: "See My Profits",
  },
] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

export function FreePlanUpsellCards() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-sm font-bold text-wangari-text">Unlock More for Your Farm</h2>
          <p className="text-xs text-wangari-muted mt-0.5">
            Used by thousands of Kenyan farmers — tap to learn more
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-wangari-green-50 px-2.5 py-1 text-xs font-bold text-wangari-green-700">
          <Sparkles className="h-3 w-3" />
          Upgrade
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {UPSELL_FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div key={f.id} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
              <Link
                href="/subscription"
                className={cn(
                  "group flex flex-col h-full rounded-2xl border bg-gradient-to-br p-5 gap-3",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] active:scale-[0.99]",
                  f.color, f.border
                )}
              >
                <div className="flex items-start justify-between">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0", f.iconBg)}>
                    <Icon className={cn("h-5 w-5", f.iconColor)} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", f.badgeColor)}>
                      {f.badge}
                    </span>
                    <Lock className="h-3.5 w-3.5 text-wangari-muted/60" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-wangari-heading leading-snug">{f.title}</p>
                  <p className="mt-2 text-xs leading-relaxed text-wangari-muted line-clamp-3">{f.story}</p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-wangari-green-700 group-hover:gap-2 transition-all">
                  {f.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <Link href="/subscription">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-wangari-green-800 to-wangari-green-900 p-5 cursor-pointer hover:from-wangari-green-900 transition-all group mt-2"
        >
          <div>
            <p className="text-sm font-bold text-white">Start with Starter Plan — from KES 499/month</p>
            <p className="text-xs text-wangari-green-200 mt-0.5">Animals · Crops · Inventory · Health Alerts · No setup fee</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Sparkles className="h-4 w-4 text-wangari-green-300" />
            <span className="text-sm font-extrabold text-white flex items-center gap-1">
              Upgrade <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </motion.div>
      </Link>
    </div>
  );
}
