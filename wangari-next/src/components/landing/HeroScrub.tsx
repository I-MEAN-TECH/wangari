"use client";

// Scroll-scrub hero built from the 30 compressed Wangari frames.
//
// How it works — and why it's done this way
// ─────────────────────────────────────────
// The section is tall (SCRUB_VH viewport heights) and holds a `position: sticky`
// layer that is one viewport tall. The page scrolls NATIVELY (wheel, touch,
// keyboard, scrollbar drag, trackpad) and the sticky layer stays pinned while
// scroll progress through the tall section drives which frame is showing.
//
// The reference component we started from hijacked the wheel and locked the
// body with `position: fixed`. That works, but it fights browser scroll
// restoration, breaks keyboard/scrollbar scrolling, and needs a manual
// "release the lock" valve at the end. Driving native scroll instead is
// simpler, less to break, and feels the same to a farmer — scroll down and the
// farm moves, scroll back up and it rewinds, and past the last frame the page
// just carries on to the rest of the site.
//
// While scrolling, the sequence advances frame by frame and the headline splits
// into two lines: the first rises from the bottom-LEFT, the second from the
// bottom-RIGHT. The tagline and the calls to action settle in last.

import * as React from "react";

const FRAME_COUNT = 30;

/** Total scroll distance the scrub consumes, in viewport heights. */
const SCRUB_VH = 300;

const FRAME_PATHS: string[] = Array.from(
  { length: FRAME_COUNT },
  (_, i) => `/hero-frames/${String(i + 1).padStart(2, "0")}.webp`
);

const TITLE_LEFT = "Every egg.";
const TITLE_RIGHT = "Every shilling.";
const TAGLINE =
  "Wangari keeps the records — feed, output, expenses, sales — so you always know what your farm actually earns. Works with no bundles at all.";

const SANS = "var(--font-sans)";

const COL_BG = "#0a0f1c";
const COL_TEXT = "#f7f8fb";
const COL_MUTED = "#a8b3c4";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Normalised 0→1 ramp for a sub-range of the overall progress. */
function ramp(p: number, from: number, to: number) {
  return clamp((p - from) / (to - from), 0, 1);
}

/** Ease-out cubic — input feels responsive, arrival feels soft. */
function ease(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export default function HeroScrub() {
  const sectionRef = React.useRef<HTMLElement>(null);
  const zoomRef = React.useRef<HTMLDivElement>(null);
  const frameRefs = React.useRef<(HTMLImageElement | null)[]>([]);
  const titleLeftRef = React.useRef<HTMLDivElement>(null);
  const titleRightRef = React.useRef<HTMLDivElement>(null);
  const taglineRef = React.useRef<HTMLDivElement>(null);
  const hintRef = React.useRef<HTMLDivElement>(null);
  const progressRef = React.useRef<HTMLDivElement>(null);
  const ctaRef = React.useRef<HTMLDivElement>(null);

  const [reducedMotion, setReducedMotion] = React.useState(false);

  /* Respect the OS "reduce motion" setting — show a single still frame. */
  React.useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  /* Warm the browser cache for every frame once the hero mounts. */
  React.useEffect(() => {
    const images = FRAME_PATHS.map((src) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      return img;
    });
    return () => {
      images.length = 0;
    };
  }, []);

  React.useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const textRefs = {
      left: titleLeftRef.current,
      right: titleRightRef.current,
      tagline: taglineRef.current,
      hint: hintRef.current,
      progress: progressRef.current,
      cta: ctaRef.current,
      zoom: zoomRef.current,
    };

    const setFrameOpacity = (index: number, value: number) => {
      const el = frameRefs.current[index];
      if (el) el.style.opacity = String(value);
    };

    const paintFrames = (p: number) => {
      const f = p * (FRAME_COUNT - 1);
      const base = Math.floor(f);
      const frac = f - base;
      const ahead = Math.min(base + 1, FRAME_COUNT - 1);

      // Cross-fade between the frame we're on and the next one so the
      // sequence reads as motion rather than a slideshow.
      if (ahead === base) {
        setFrameOpacity(base, 1);
      } else {
        setFrameOpacity(base, 1 - frac);
        setFrameOpacity(ahead, frac);
      }
    };

    const paintText = (p: number) => {
      const tLeft = ease(ramp(p, 0.05, 0.3));
      if (textRefs.left) {
        textRefs.left.style.opacity = String(tLeft);
        textRefs.left.style.transform = `translate(${(1 - tLeft) * -60}px, ${(1 - tLeft) * 56}px)`;
      }

      const tRight = ease(ramp(p, 0.24, 0.49));
      if (textRefs.right) {
        textRefs.right.style.opacity = String(tRight);
        textRefs.right.style.transform = `translate(${(1 - tRight) * 60}px, ${(1 - tRight) * 56}px)`;
      }

      const tTag = ease(ramp(p, 0.48, 0.68));
      if (textRefs.tagline) {
        textRefs.tagline.style.opacity = String(tTag);
        textRefs.tagline.style.transform = `translateY(${(1 - tTag) * 28}px)`;
      }

      const tCta = ease(ramp(p, 0.68, 0.85));
      if (textRefs.cta) {
        textRefs.cta.style.opacity = String(tCta);
        textRefs.cta.style.transform = `translateY(${(1 - tCta) * 20}px)`;
        textRefs.cta.style.pointerEvents = tCta > 0.5 ? "auto" : "none";
      }

      if (textRefs.hint) {
        textRefs.hint.style.opacity = p > 0.02 ? "0" : "1";
      }

      if (textRefs.progress) {
        textRefs.progress.style.transform = `scaleX(${p})`;
      }

      // Slow push-in on the frames — the "you are moving" feeling.
      if (textRefs.zoom) {
        textRefs.zoom.style.transform = `scale(${1 + p * 0.09})`;
      }
    };

    if (reducedMotion) {
      paintFrames(0.62);
      paintText(1);
      if (textRefs.hint) textRefs.hint.style.opacity = "0";
      return;
    }

    const progressFor = () => {
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return 0;
      return clamp(-rect.top / total, 0, 1);
    };

    let current = progressFor();
    let target = current;
    let raf = 0;
    let running = false;

    paintFrames(current);
    paintText(current);

    const tick = () => {
      current += (target - current) * 0.16;
      const settled = Math.abs(target - current) < 0.0005;
      if (settled) current = target;

      paintFrames(current);
      paintText(current);

      if (settled) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      target = progressFor();
      kick();
    };

    const onResize = () => {
      target = progressFor();
      current = target;
      paintFrames(current);
      paintText(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  return (
    <section
      ref={sectionRef}
      aria-label="Wangari — every egg, every shilling"
      style={{
        position: "relative",
        height: `${SCRUB_VH}vh`,
        background: COL_BG,
      }}
    >
      <div
        className="sticky top-0 w-full overflow-hidden"
        style={{ height: "100dvh", touchAction: "pan-y" }}
      >
        {/* ── Frame sequence ── */}
        <div
          ref={zoomRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: "center center",
            willChange: "transform",
          }}
        >
          {FRAME_PATHS.map((src, i) => (
            <img
              key={src}
              ref={(el) => {
                frameRefs.current[i] = el;
              }}
              src={src}
              alt=""
              draggable={false}
              decoding="async"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0,
                userSelect: "none",
                transition: "opacity 120ms linear",
              }}
            />
          ))}
        </div>

        {/* ── Readability gradient ── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(10,15,28,0.55) 0%, rgba(10,15,28,0.15) 26%, rgba(10,15,28,0.2) 58%, rgba(10,15,28,0.72) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* ── Headline: line one from the bottom-left, line two from the bottom-right ── */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center pointer-events-none">
          <div
            ref={titleLeftRef}
            style={{
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: "clamp(40px, 8.5vw, 112px)",
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              color: COL_TEXT,
              textShadow: "0 6px 40px rgba(0,0,0,0.45)",
              willChange: "transform, opacity",
            }}
          >
            {TITLE_LEFT}
          </div>
          <div
            ref={titleRightRef}
            style={{
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: "clamp(40px, 8.5vw, 112px)",
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              color: COL_TEXT,
              textShadow: "0 6px 40px rgba(0,0,0,0.45)",
              willChange: "transform, opacity",
            }}
          >
            {TITLE_RIGHT}
          </div>

          <div
            ref={taglineRef}
            style={{
              fontFamily: SANS,
              fontWeight: 400,
              fontSize: "clamp(15px, 1.6vw, 21px)",
              lineHeight: 1.55,
              letterSpacing: "-0.01em",
              color: COL_MUTED,
              maxWidth: "620px",
              marginTop: "clamp(20px, 3.5vh, 40px)",
              willChange: "transform, opacity",
            }}
          >
            {TAGLINE}
          </div>
        </div>

        {/* ── Calls to action, revealed at the end of the sequence ── */}
        <div
          ref={ctaRef}
          className="absolute inset-x-0 bottom-[clamp(56px,10vh,96px)] flex flex-wrap items-center justify-center gap-3 px-6"
          style={{ opacity: 0, pointerEvents: "none", willChange: "transform, opacity" }}
        >
          <a
            href="/register"
            className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-[var(--ink)] transition hover:-translate-y-0.5 hover:bg-[var(--base)]"
          >
            Start free — 14 days
          </a>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 text-[15px] font-semibold text-[var(--base)] transition hover:-translate-y-0.5 hover:bg-white/10"
          >
            Sign in
          </a>
        </div>

        {/* ── Scroll hint ── */}
        <div
          ref={hintRef}
          className="absolute inset-x-0 bottom-[clamp(20px,4vh,34px)] flex flex-col items-center gap-2 pointer-events-none"
          style={{
            fontFamily: SANS,
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: COL_MUTED,
            transition: "opacity 400ms ease",
          }}
        >
          <span>Scroll to move</span>
          <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
            <style>{`@keyframes heroBounce { 0%,100% { transform: translateY(0); opacity: .45 } 50% { transform: translateY(5px); opacity: 1 } }`}</style>
            <path
              d="M7 1 L7 17 M2 12 L7 17 L12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: "heroBounce 1.6s ease-in-out infinite" }}
            />
          </svg>
        </div>

        {/* ── Progress line ── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 2,
            background: "rgba(255,255,255,0.12)",
          }}
        >
          <div
            ref={progressRef}
            style={{
              height: "100%",
              width: "100%",
              background: "linear-gradient(90deg, rgba(74,222,128,0.75), rgba(255,255,255,0.95))",
              transform: "scaleX(0)",
              transformOrigin: "left center",
            }}
          />
        </div>
      </div>
    </section>
  );
}
