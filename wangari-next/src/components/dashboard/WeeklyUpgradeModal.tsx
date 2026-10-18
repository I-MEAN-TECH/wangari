"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, Sparkles, ArrowRight, Star, CheckCircle } from "lucide-react";

interface WeeklyStory {
  emoji: string;
  badge: string;
  headline: string;
  body: string;
  farmer: string;
  quote: string;
  cta: string;
}

const WEEKLY_STORIES: WeeklyStory[] = [
  {
    emoji: "🐄",
    badge: "Dairy Alert Success",
    headline: "Mama Samia's cow was pregnant but she did not know...",
    body: "She had completely forgotten the day the cow received the seed. The day she started using Wangari, it calculated the expected calving window. She got automated alert emails 10 days early. The healthy calf was delivered in a warm, prepared shed.",
    farmer: "Mama Samia, Nakuru",
    quote: "Wangari saved my calf when I had forgotten the date.",
    cta: "Unlock Cow & Breeding Alerts",
  },
  {
    emoji: "🐔",
    badge: "Poultry Health",
    headline: "Mwangi lost 12 chickens — then Wangari automated his vaccines.",
    body: "Newcastle disease wiped out a dozen birds in 2 months because manual calendars are easy to miss. Once he set his batch dates in Wangari, he got phone & email reminders for every dose. In 6 months: zero mortality.",
    farmer: "John Mwangi, Kiambu",
    quote: "Vaccination alerts saved my entire poultry business.",
    cta: "Manage Your Chickens & Flocks",
  },
  {
    emoji: "📊",
    badge: "Profit Tracking",
    headline: "Grace thought she was making money — until Wangari showed her feed cost.",
    body: "Her eggs sold at KES 15, but feed was costing KES 18 per egg. Wangari's Feed Score & cost analytics helped her fix her supplier and mix. She now takes home an extra KES 12,500 every single month.",
    farmer: "Grace Wanjiru, Eldoret",
    quote: "I stopped losing money every day thanks to the cost reports.",
    cta: "See Feed Score & Profit Reports",
  },
  {
    emoji: "🌽",
    badge: "Crop Advisory",
    headline: "Peter's neighbours lost their crop. Peter got Wangari's alert.",
    body: "Fall armyworm hit his sub-county. Peter received an early-stage advisory alert 3 days before the swarm appeared, sprayed on schedule, and had the only harvest that survived in his village.",
    farmer: "Peter Odhiambo, Kisumu",
    quote: "Timely alerts made all the difference between harvest and hunger.",
    cta: "Get Real-Time Crop & Weather Alerts",
  },
];

const WEEKLY_KEY = "wangari_weekly_modal_last_shown";

interface WeeklyUpgradeModalProps {
  isFreePlan?: boolean;
}

export function WeeklyUpgradeModal({ isFreePlan = true }: WeeklyUpgradeModalProps) {
  const [open, setOpen] = React.useState(false);
  const [story, setStory] = React.useState<WeeklyStory>(WEEKLY_STORIES[0]);

  React.useEffect(() => {
    // Only show to free plan users
    if (!isFreePlan) return;

    try {
      const last = localStorage.getItem(WEEKLY_KEY);
      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      // Pick a rotating story based on the week number
      const weekIndex = Math.floor(now / oneWeek) % WEEKLY_STORIES.length;
      setStory(WEEKLY_STORIES[weekIndex] || WEEKLY_STORIES[0]);

      if (!last || now - Number(last) > oneWeek) {
        // Show after 3 seconds of browsing
        const timer = setTimeout(() => {
          setOpen(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, [isFreePlan]);

  const dismiss = () => {
    try {
      localStorage.setItem(WEEKLY_KEY, String(Date.now()));
    } catch {}
    setOpen(false);
  };

  if (!isFreePlan) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-wangari-border bg-white shadow-2xl"
          >
            {/* Header with green gradient & badge */}
            <div className="bg-gradient-to-br from-wangari-green-800 via-wangari-green-900 to-slate-900 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-wangari-green-200 backdrop-blur-md">
                  <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
                  <span>Farmer Story of the Week</span>
                </div>
                <button
                  onClick={dismiss}
                  className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <span className="text-3xl" role="img" aria-label="story icon">
                  {story.emoji}
                </span>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-wangari-green-300">
                    {story.badge}
                  </span>
                  <h3 className="text-lg font-bold text-white leading-tight">
                    {story.headline}
                  </h3>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-4">
              <p className="text-sm leading-relaxed text-slate-700">
                {story.body}
              </p>

              {/* Quote box */}
              <div className="rounded-2xl bg-wangari-green-50 border border-wangari-green-200/60 p-4">
                <div className="flex gap-1 text-yellow-500 mb-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <p className="text-xs font-semibold italic text-wangari-green-900">
                  "{story.quote}"
                </p>
                <p className="mt-1 text-[11px] font-bold text-wangari-green-700">
                  — {story.farmer}
                </p>
              </div>

              {/* Feature check list */}
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-wangari-green-600 shrink-0" />
                  <span>Cow breeding & AI alerts</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-wangari-green-600 shrink-0" />
                  <span>Flock vaccine schedules</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-wangari-green-600 shrink-0" />
                  <span>Feed cost & score tracking</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-wangari-green-600 shrink-0" />
                  <span>M-Pesa payment records</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <Link
                  href="/subscription"
                  onClick={dismiss}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-wangari-green-700 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-wangari-green-700/25 hover:bg-wangari-green-800 transition-all active:scale-[0.98]"
                >
                  <span>{story.cta}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  onClick={dismiss}
                  className="rounded-2xl border border-slate-200 px-4 py-3.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Maybe Later
                </button>
              </div>

              <p className="text-center text-[11px] text-slate-400">
                Plans start at KES 499/mo. Cancel anytime.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
