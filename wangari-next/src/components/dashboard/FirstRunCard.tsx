"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Milk, Wheat, Package, ArrowRight, CheckCircle2, Hand } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { showFirstRunCard } from "@/lib/first-run";

/**
 * FirstRunCard — the farmer's first screen, and the reason they come back.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The production audit (2 Oct 2026) found 8 farms, 7 distinct production days
 * total, and 5 farms that had recorded nothing at all. Sign-up was NOT the
 * problem — 9 people got past it. What they met instead was three English
 * chores ("add your animals", "record output", "record money") followed by a
 * dashboard of zeros and empty ratios. Nothing on that screen paid the farmer
 * anything, so nothing was worth doing twice.
 *
 * So the first thing a new farmer sees is the MONEY MOMENT, and they choose
 * which one is theirs:
 *   Milk icon, "I sell milk or eggs" → the delivery log (already built)
 *   Wheat icon, "I grow crops"       → today's harvest / output
 *
 * Both end in a number the same evening. That number is the first reward, and
 * the reward is the whole point: the habit forms because it pays, not because
 * we asked nicely.
 *
 * ── Design rules ───────────────────────────────────────────────────────────
 *  - TWO giant targets, not a form. The farmer picks a picture, not a path.
 *  - Words before numbers. (Copy is English today; Swahili returns via the
 *    i18n layer, so these strings move rather than get rewritten twice.)
 *  - This card RETIRES the moment the farmer records anything (the parent gates
 *    it on `firstRecordAt`), so it never nags a farmer who is already doing the
 *    useful thing. The old banner used totalFlocks for that check, which meant
 *    a dairy farmer logging milk nightly saw "Start here" forever.
 */

interface FirstRunCardProps {
  /** Has the farmer recorded anything yet? Null while loading. */
  firstRecordAt: string | null | undefined;
  /** Set false when the farm has hit the plan gate. */
  locked?: boolean;
}

const CHOICES = [
  {
    id: "livestock",
    icon: Milk,
    title: "I sell milk or eggs",
    subtitle: "Milk, eggs or meat",
    href: "/deliveries",
    cta: "Record a sale",
  },
  {
    id: "crops",
    icon: Wheat,
    title: "I grow crops",
    subtitle: "Maize, vegetables, fruit",
    href: "/crops",
    cta: "Record a harvest",
  },
] as const;

export function FirstRunCard({ firstRecordAt, locked }: FirstRunCardProps) {
  // The gating rule lives in lib/first-run.ts so it is pinned by tests rather
  // than re-implemented here. Note `loading` is not passed by the caller yet:
  // the dashboard passes `undefined` while loading, which the rule treats as
  // "do not show" — so the card never flashes at a long-standing farmer.
  if (!showFirstRunCard({ firstRecordAt })) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="mb-1 flex items-center gap-2 text-wangari-green-800">
            <Hand className="h-4 w-4" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-widest">
              Start here
            </span>
          </div>

          <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-wangari-heading">
            Show me what you sold today
          </h1>
          <p className="mt-2 max-w-md text-pretty text-wangari-muted">
            Pick the one that is you. You will see the money straight away.
          </p>

          {/* Two choices, at house card sizing. Each is a real link styled like the
              cards elsewhere in the app — an earlier version made these 168px
              tiles with a filled pill inside, which read as a separate app. */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {CHOICES.map((c) => {
              const Icon = c.icon;
              return (
                <Link
                  key={c.id}
                  href={locked ? "/subscription" : c.href}
                  className={cn(
                    "group flex flex-col gap-3 rounded-2xl border bg-wangari-card p-6",
                    "transition-all duration-200",
                    locked
                      ? "border-wangari-border opacity-60"
                      : "border-wangari-border hover:-translate-y-0.5 hover:border-wangari-green-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.99]"
                  )}
                >
                  <Icon className="h-6 w-6 text-wangari-green-700" aria-hidden />
                  <span className="text-base font-semibold text-wangari-heading">
                    {c.title}
                  </span>
                  <span className="-mt-2 text-sm text-wangari-muted">
                    {c.subtitle}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-wangari-green-800">
                    {c.cta}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </Link>
              );
            })}
          </div>

          {/* The promise, stated plainly — and honestly. */}
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-wangari-border bg-wangari-cream p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-wangari-green-700" aria-hidden />
            <p className="text-xs leading-relaxed text-wangari-muted">
              You will see what you earned and what is still owed to you. That
              is your statement — show it to your buyer whenever you need to.
            </p>
          </div>

          <p className="mt-3 text-center text-xs text-wangari-subtle">
            <Package className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            You do not have to type anything right now.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default FirstRunCard;
