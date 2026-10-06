"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Bird, BarChart3, Package, MousePointerClick, Smartphone } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * DemoVideoShowcase — hero demo video with a plain GSAP slide-up on scroll.
 * No scale/rotate/parallax on the video itself: it simply slides up into view
 * as the user scrolls down. Annotation cards fade-slide in alongside.
 */

const callouts = [
  {
    icon: Bird,
    side: "left" as const,
    title: "Every animal, one view",
    desc: "Cattle, layers, coffee blocks — your whole farm on one screen.",
    /** Vertical position (% from panel top) the arrow points at */
    pointAt: "18%",
  },
  {
    icon: MousePointerClick,
    side: "right" as const,
    title: "Log a day in 3 taps",
    desc: "Milk, eggs, feed — recorded from the shed, even offline.",
    pointAt: "45%",
  },
  {
    icon: BarChart3,
    side: "left" as const,
    title: "Profit, not guesswork",
    desc: "Costs, revenue and margin update the moment you log.",
    pointAt: "72%",
  },
];

export function DemoVideoShowcase() {
  const sectionRef = React.useRef<HTMLElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const ctx = gsap.context(() => {
      // Single clean slide-up of the whole video panel on scroll.
      gsap.fromTo(
        panelRef.current,
        { y: 120, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 85%",
            end: "top 35%",
            scrub: 0.6,
          },
        }
      );

      // Annotation cards slide in as the panel arrives.
      gsap.utils.toArray<HTMLElement>(".demo-callout").forEach((el, i) => {
        gsap.fromTo(
          el,
          { opacity: 0, x: el.dataset.side === "left" ? -48 : 48 },
          {
            opacity: 1,
            x: 0,
            ease: "power2.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: `top ${60 - i * 10}%`,
              end: `top ${30 - i * 10}%`,
              scrub: 0.6,
            },
          }
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative -mt-6 sm:-mt-8 md:-mt-12 pb-8">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Annotation callouts (desktop) ── */}
        {callouts.map((c) => (
          <div
            key={c.title}
            data-side={c.side}
            className={`demo-callout absolute z-20 hidden lg:block ${
              c.side === "left"
                ? "left-[-30px] xl:left-[-60px]"
                : "right-[-30px] xl:right-[-60px]"
            }`}
            style={{ top: c.pointAt }}
          >
            <div className="relative">
              {/* Curved arrow pointing toward the video */}
              <svg
                viewBox="0 0 120 90"
                className={`absolute h-[90px] w-[120px] ${
                  c.side === "left" ? "-right-[100px]" : "-left-[100px] -scale-x-100"
                } top-1/2 -translate-y-1/2 text-wangari-green-500`}
                fill="none"
              >
                <path
                  d="M6 78 C 40 84, 84 64, 108 18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="6 7"
                />
                <path
                  d="M108 18 l-14 2 M108 18 l-3 13"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>

              <div className="w-64 rounded-2xl border border-wangari-border bg-white/95 p-5 shadow-xl shadow-wangari-ink/10 backdrop-blur">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wangari-green-800 text-white mb-3">
                  <c.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-wangari-heading">{c.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-wangari-muted">{c.desc}</p>
              </div>
            </div>
          </div>
        ))}

        {/* ── Video panel — stands alone, no mock-up chrome ── */}
        <div ref={panelRef} className="relative z-10">
          <div className="relative overflow-hidden rounded-2xl shadow-2xl shadow-wangari-ink/30 ring-1 ring-black/10">
            <video
              src="/demo.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="block w-full aspect-video object-cover"
            />
          </div>

          {/* Scroll cue shown while the panel is peeking */}
          <ScrollCue />
        </div>

        {/* ── Mobile/tablet fallback: callouts as a grid under the video ── */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3 lg:hidden">
          {callouts.map((c, i) => (
            <div
              key={c.title}
              className="rounded-2xl border border-wangari-border bg-white p-5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wangari-green-800 text-white mb-3">
                <c.icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-wangari-heading">{c.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-wangari-muted">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Scroll cue: hides once the user has scrolled past the peek ── */
function ScrollCue() {
  const [gone, setGone] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setGone(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 transition-opacity duration-500 ${
        gone ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-wangari-ink/80 px-4 py-2 backdrop-blur">
        <Package className="h-3.5 w-3.5 text-wangari-green-500" />
        <span className="text-xs font-medium text-white/70">Scroll to explore the demo</span>
        <span className="animate-bounce">
          <Smartphone className="h-3.5 w-3.5 text-white/50" />
        </span>
      </div>
    </div>
  );
}
