"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { EyeTracker } from "./eye-tracker";

/**
 * Wangari's avatar.
 *
 * Visual language follows the `bs-grokbot-avatar` skill's **Original**
 * mode: one continuous solid-colour body, exactly two solid
 * contrasting capsule eyes, no mouth, no nose, no outline, no shading.
 * The shape is a softened squircle (atlas cell A3) because it reads as a
 * character at small sizes and still holds two readable eyes at 48px.
 *
 * The skill's reference PNGs could not be used: it generates static
 * images via an image-generation tool, and a still PNG cannot blink,
 * think, or speak. So the character is drawn live in SVG instead, which
 * is what makes the behaviour below possible at all.
 *
 * ── the states do the work ───────────────────────────────
 * The farmer's main problem with an AI panel is not that it looks
 * static — it is that they cannot tell whether it is thinking, working,
 * or stuck. Every state therefore differs in MOTION, not just colour:
 *
 *   idle       slow breathing, eyes drift, occasional blink
 *   listening  leans toward the farmer, quick attentive blinks
 *   typing     (the farmer is typing) eyes rest low and patient
 *   reasoning  eyes drift up and away, slower — the classic "thinking"
 *   working    a small focused bob, eyes narrow to the task
 *   speaking   mouthless by design, so the BODY carries the voice
 *   error      a short shake, then still
 *
 * Speaking deserves a note: the style forbids a mouth, so there is
 * nothing to animate with speech. Instead the whole body pulses on the
 * audio envelope and the eyes lift — a squash on the silhouette rather
 * than a lip sync, which keeps the flat-design rule intact.
 */

export type AvatarState =
  | "idle"
  | "listening"
  | "typing"
  | "reasoning"
  | "working"
  | "speaking"
  | "error";

/**
 * What each state does to the body, the eyes and the gaze.
 * `gaze` is in fractions of the radius: -1 hard left/up, 1 hard right/down.
 */
const STATES: Record<
  AvatarState,
  {
    /** CSS animation name applied to the silhouette. */
    motion: string;
    /** Eye tracking strength; 0 hands the face entirely to `gaze`. */
    follow: number;
    /** Spring looseness — higher settles more slowly. */
    bounce: number;
    gaze?: { x: number; y: number };
    /** Blink cadence in ms; smaller blinks more often. */
    blink: number;
    /** Eye scale multiplier, so a thinking face can narrow slightly. */
    eyeScale: number;
  }
> = {
  idle: { motion: "wangari-breathe", follow: 45, bounce: 25, blink: 3400, eyeScale: 1 },
  listening: { motion: "wangari-lean", follow: 95, bounce: 45, blink: 1900, eyeScale: 1.08 },
  typing: { motion: "wangari-breathe", follow: 35, bounce: 20, gaze: { x: 0, y: 0.34 }, blink: 2800, eyeScale: 1 },
  reasoning: {
    motion: "wangari-recede",
    follow: 25,
    bounce: 15,
    // Up and away: the universally legible "I am working this out".
    gaze: { x: -0.3, y: -0.42 },
    blink: 5200,
    eyeScale: 0.92,
  },
  working: { motion: "wangari-work", follow: 70, bounce: 40, gaze: { x: 0.22, y: 0.18 }, blink: 1500, eyeScale: 0.95 },
  speaking: { motion: "wangari-speak", follow: 80, bounce: 50, gaze: { x: 0, y: -0.08 }, blink: 2400, eyeScale: 1.05 },
  error: { motion: "wangari-shake", follow: 30, bounce: 10, blink: 900, eyeScale: 1 },
};

/**
 * Compose the state's gaze with a runtime one.
 *
 * The horizontal axis is taken from whichever is stronger, so a caret
 * tracking left/right is never fought by a state that only wants to look
 * down (typing) — but a state's deliberate sideways look (working) still
 * wins when the caret has nothing to say. The vertical axis is simply
 * added, since both sources mean "how far from centre" rather than a
 * competing direction.
 *
 * Clamped to the same +/-0.85 the eye itself allows, so an extreme caret
 * cannot push the eyes past the rim.
 */
export function mergeGaze(
  base?: { x: number; y: number },
  live?: { x: number; y: number },
): { x: number; y: number } | undefined {
  if (!base && !live) return undefined;
  if (!live) return base;
  if (!base) return live;
  const clamp = (v: number) => Math.max(-0.85, Math.min(0.85, v));
  return {
    x: clamp(Math.abs(live.x) >= Math.abs(base.x) ? live.x : base.x),
    y: clamp(base.y + live.y),
  };
}

/**
 * @param state          what Wangari is doing
 * @param audioLevel     0..1 speech envelope. Drives the speaking squash;
 *                       ignored in every other state.
 * @param gaze           runtime bias in fractions of the radius, -1..1.
 *                       Composed with (not replacing) the state's own gaze,
 *                       so while the farmer types she keeps reading low but
 *                       tracks the caret sideways. See `mergeGaze`.
 * @param pace           0..1 typing speed. Makes her livelier as the farmer
 *                       speeds up: a tighter spring, a quicker blink, and a
 *                       faster breath.
 * @param wordTick       bump this counter each time the farmer completes a
 *                       word; she gives a small acknowledging pulse. A
 *                       counter rather than a boolean so two words in
 *                       quick succession are two pulses, not one.
 * @param size           rendered px
 */
export function WangariAvatar({
  state = "idle",
  audioLevel = 0,
  gaze,
  pace = 0,
  wordTick = 0,
  size = 92,
  className = "",
}: {
  state?: AvatarState;
  audioLevel?: number;
  gaze?: { x: number; y: number };
  pace?: number;
  wordTick?: number;
  size?: number;
  className?: string;
}) {
  const base = STATES[state] ?? STATES.idle;
  const body = useRef<HTMLDivElement>(null);

  /* Typing pace feeds straight into her spring and blink. A racing farmer
     gets a face that keeps up; a deliberate one gets patience. Both are
     clamped because a caller could pass a value outside 0..1. */
  const p = Math.max(0, Math.min(1, pace));
  /* She is now the module's icon as well as the panel's character, and a nav
     item gives her 24px instead of 92. At that size the default eyes shrink
     to about 2px each and sit close enough to read as a single dark smear
     rather than a face, so small copies get proportionally bigger eyes —
     the same reason a favicon drops its detail. Sized off the rendered px,
     not a breakpoint, so any future placement gets the right answer. */
  const small = size < 48 ? 1.4 : size < 72 ? 1.15 : 1;
  const s = {
    ...base,
    // Faster typing tightens the spring, so her eyes keep up instead of
    // trailing a beat behind the caret.
    bounce: base.bounce * (1 - p * 0.5),
    // ...and blinks more often, which reads as alert rather than sleepy.
    blink: Math.round(base.blink / (1 + p * 0.7)),
    eyeScale: base.eyeScale * small,
  };
  const level = useRef(0);
  // The incoming envelope is held in a ref, NOT a dependency of the paint
  // loop. Depending on it tore the rAF loop down and rebuilt it on every
  // single audio frame, so the loop never got a chance to run and the
  // silhouette froze at its last written value.
  const target = useRef(audioLevel);
  target.current = audioLevel;

  /* The pace is written to the DOM as a custom property rather than used
     in JS, so CSS can shorten the breath with it. React state would
     re-render the tree on every keystroke. */
  React.useEffect(() => {
    const el = body.current;
    if (el) el.style.setProperty("--wangari-pace", Math.max(0, Math.min(1, pace)).toFixed(3));
  }, [pace]);

  /* A completed word gets a short pulse on the ROOT, not the body:
     the body already owns the state's motion and two `animation`
     shorthands on one element do not stack. The class is removed and
     re-added because React will not replay a CSS animation just
     because a dependency changed. */
  const [pulse, setPulse] = React.useState(false);
  const lastTick = useRef(wordTick);
  React.useEffect(() => {
    if (wordTick === lastTick.current) return;
    lastTick.current = wordTick;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 340);
    return () => window.clearTimeout(id);
  }, [wordTick]);

  // The speech envelope is written straight to the DOM per frame. Putting
  // it in React state would re-render the whole tree on every audio
  // frame, which is exactly the wrong thing to do at 60fps.
  useEffect(() => {
    if (state !== "speaking") {
      level.current = 0;
      body.current?.style.setProperty("--wangari-voice", "1.000");
      return;
    }
    let raf = 0;
    const paint = () => {
      const el = body.current;
      if (el) {
        // Ease toward the target so the silhouette never jitters on a
        // noisy envelope.
        level.current += (target.current - level.current) * 0.25;
        const k = 1 + Math.max(0, Math.min(1, level.current)) * 0.09;
        el.style.setProperty("--wangari-voice", k.toFixed(3));
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div
      className={`wangari-avatar ${className}${pulse ? " wangari-word-pulse" : ""}`}
      style={{ width: size, height: size }}
      data-state={state}
    >
      {/* The motion layer. transform-only so it composites on the GPU and
          never triggers layout on a farmer's cheap handset. */}
      <div ref={body} className={`wangari-avatar-body ${s.motion}`}>
        <EyeTracker
          size={size}
          follow={s.follow}
          bounce={s.bounce}
          eyeScale={s.eyeScale}
          idle={state === "idle"}
          blinkMs={s.blink}
          gaze={mergeGaze(s.gaze, gaze)}
          shape="Ball"
          eyes="Slant"
        />
      </div>
    </div>
  );
}

export default WangariAvatar;