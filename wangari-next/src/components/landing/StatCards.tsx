"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Users, Bird, TrendingUp, Shield, type LucideIcon } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

type Stat = {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** tailwind gradient classes for the icon chip + glow */
  chip: string;
  glow: string;
  text: string;
  /** numeric target for count-up, when the value is numeric */
  countTo?: number;
  prefix?: string;
  suffix?: string;
};

const STATS: Stat[] = [
  {
    value: "100%",
    label: "Offline Sync",
    description: "Works with zero bundles — syncs when signal returns",
    icon: Users,
    chip: "from-wangari-green-600 to-wangari-green-700",
    glow: "group-hover:shadow-[0_8px_40px_-8px_rgba(5,150,105,0.45)]",
    text: "text-wangari-green-700",
    countTo: 100,
    suffix: "%",
  },
  {
    value: "< 3 Taps",
    label: "Daily Data Entry",
    description: "Log a sale, output or expense in seconds",
    icon: Bird,
    chip: "from-wangari-teal-500 to-wangari-green-600",
    glow: "group-hover:shadow-[0_8px_40px_-8px_rgba(20,184,166,0.45)]",
    text: "text-wangari-teal-600",
  },
  {
    value: "KES 1,500",
    label: "Starter Monthly",
    description: "Full farm OS for less than one crate of eggs",
    icon: TrendingUp,
    chip: "from-wangari-lime-500 to-wangari-green-600",
    glow: "group-hover:shadow-[0_8px_40px_-8px_rgba(132,204,22,0.45)]",
    text: "text-wangari-lime-600",
  },
  {
    value: "14 Days",
    label: "Free Trial",
    description: "Every feature unlocked — no card required",
    icon: Shield,
    chip: "from-wangari-green-600 to-wangari-green-800",
    glow: "group-hover:shadow-[0_8px_40px_-8px_rgba(5,150,105,0.45)]",
    text: "text-wangari-green-700",
    countTo: 14,
    suffix: " Days",
  },
];

function CountUpNumber({ stat }: { stat: Stat }) {
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (stat.countTo === undefined || !ref.current) return;
    const el = ref.current;
    const obj = { val: 0 };
    const tween = gsap.to(obj, {
      val: stat.countTo,
      duration: 1.6,
      ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
      onUpdate: () => {
        el.textContent = `${stat.prefix ?? ""}${Math.round(obj.val)}${stat.suffix ?? ""}`;
      },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [stat]);

  return (
    <span ref={ref}>
      {stat.prefix}
      {stat.countTo ?? stat.value}
      {stat.suffix}
    </span>
  );
}

export function StatCards() {
  const gridRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".stat-card",
        { y: 48, opacity: 0, scale: 0.96 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.12,
          scrollTrigger: { trigger: gridRef.current, start: "top 85%", once: true },
        }
      );
    }, gridRef);
    return () => ctx.revert();
  }, []);

  return (      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 gap-5 max-w-5xl mx-auto">
      {STATS.map((s) => (
        <div
          key={s.label}
          className={`stat-card group relative overflow-hidden rounded-2xl border border-wangari-border bg-white p-6 text-center transition-all duration-300 hover:-translate-y-1.5 hover:border-transparent ${s.glow}`}
        >
          {/* soft accent wash on hover */}
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${s.chip} opacity-0 transition-opacity duration-300 group-hover:opacity-[0.08]`}
          />
          {/* top accent hairline */}
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.chip} opacity-70`} />

          <div className="relative">
            <div
              className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${s.chip} text-white shadow-md`}
            >
              <s.icon className="h-5 w-5" />
            </div>
            <p className={`text-3xl md:text-[2.1rem] font-extrabold leading-none tracking-tight ${s.text}`}>
              <CountUpNumber stat={s} />
            </p>
            <p className="mt-2.5 text-sm font-semibold text-wangari-heading">{s.label}</p>
            <p className="mt-1.5 hidden md:block text-xs leading-relaxed text-wangari-subtle">{s.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
