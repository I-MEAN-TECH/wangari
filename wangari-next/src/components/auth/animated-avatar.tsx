"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, WifiOff, Sparkles } from "lucide-react";

export type AvatarState =
  | "idle"
  | "typing-name"
  | "typing-email"
  | "typing-farm"
  | "typing-password"
  | "show-password"
  | "loading"
  | "error"
  | "success";

interface AnimatedAvatarProps {
  state: AvatarState;
  className?: string;
}

export function AnimatedAvatar({ state, className }: AnimatedAvatarProps) {
  const avatarRef = React.useRef<HTMLDivElement>(null);
  const [mouseEye, setMouseEye] = React.useState({ x: 0, y: 0 });

  // Only track cursor on non-touch devices (no cursor on phones)
  React.useEffect(() => {
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchDevice) return; // No cursor on mobile — skip tracking

    const handleMouseMove = (e: MouseEvent) => {
      if (!avatarRef.current) return;
      const rect = avatarRef.current.getBoundingClientRect();
      const avatarCenterX = rect.left + rect.width / 2;
      const avatarCenterY = rect.top + rect.height / 2;

      const dx = e.clientX - avatarCenterX;
      const dy = e.clientY - avatarCenterY;
      const angle = Math.atan2(dy, dx);
      const dist = Math.min(Math.hypot(dx, dy) / 30, 6.5);

      setMouseEye({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Additional typing field offset override if focused
  const fieldEyeX = state === "typing-email" ? 3 : state === "typing-name" ? -3 : state === "typing-farm" ? 2 : 0;
  const fieldEyeY = state.startsWith("typing") ? 2 : 0;

  const pupilX = mouseEye.x + fieldEyeX;
  const pupilY = mouseEye.y + fieldEyeY;

  // Status message speech bubble
  const getSpeechBubbleText = () => {
    switch (state) {
      case "typing-name":
        return "Nice to meet you! 👋 What's your name?";
      case "typing-email":
        return "I'm watching! Make sure email is correct 📧";
      case "typing-farm":
        return "Ooh, tell me about your farm! 🌾";
      case "typing-password":
        return "Shh! I'm covering my eyes for privacy 🙈";
      case "show-password":
        return "I saw that! Keeping it safe 👁️✨";
      case "loading":
        return "Checking credentials... Hang tight! ⏳";
      case "error":
        return "Oops! Double check those details 😅";
      case "success":
        return "Karibu! Welcome to your farm portal 🎉";
      default:
        return "Jambo! Karibu Wangari Farm System! 🌾✨";
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center text-center space-y-6 ${className || ""}`}>
      {/* Cartoon Speech Bubble */}
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 6, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative bg-white text-[#0F172A] px-4 py-2.5 rounded-2xl shadow-lg border border-emerald-100 max-w-xs text-xs font-black tracking-wide"
      >
        <span>{getSpeechBubbleText()}</span>
        {/* Speech bubble tail */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white" />
      </motion.div>

      {/* SVG ANIMATED CARTOON EMOJI AVATAR */}
      <div ref={avatarRef} className="relative w-44 h-44 flex items-center justify-center">
        {/* Confetti / glow on success */}
        {state === "success" && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [1, 1.2, 1], opacity: 1 }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl"
          />
        )}

        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-2xl overflow-visible"
        >
          {/* Background aura circle */}
          <circle cx="100" cy="100" r="85" fill="#166534" opacity="0.15" />
          <circle cx="100" cy="100" r="75" fill="#22C55E" opacity="0.2" />

          {/* AVATAR BODY (Farmer Overalls) */}
          <path
            d="M 45 170 Q 100 135 155 170 L 165 200 L 35 200 Z"
            fill="#166534"
          />
          {/* Overall straps */}
          <path d="M 65 145 L 75 190" stroke="#14532D" strokeWidth="6" strokeLinecap="round" />
          <path d="M 135 145 L 125 190" stroke="#14532D" strokeWidth="6" strokeLinecap="round" />
          {/* Yellow Buttons */}
          <circle cx="75" cy="165" r="4" fill="#FACC15" />
          <circle cx="125" cy="165" r="4" fill="#FACC15" />

          {/* HEAD */}
          <motion.g
            animate={
              state === "error"
                ? { x: [-4, 4, -4, 4, 0], rotate: [-3, 3, -3, 3, 0] }
                : state === "loading"
                ? { y: [-2, 2, -2] }
                : state === "success"
                ? { y: [-6, 0, -6], scale: [1, 1.05, 1] }
                : { y: [0, -2, 0] }
            }
            transition={{ duration: state === "error" ? 0.4 : 2, repeat: Infinity }}
          >
            {/* Face base */}
            <circle cx="100" cy="95" r="50" fill="#FDE68A" />

            {/* Rosy cheeks */}
            <circle cx="68" cy="108" r="8" fill="#FCA5A5" opacity="0.6" />
            <circle cx="132" cy="108" r="8" fill="#FCA5A5" opacity="0.6" />

            {/* FARMER HAT */}
            <path
              d="M 40 80 Q 100 65 160 80 Q 165 62 100 40 Q 35 62 40 80 Z"
              fill="#D97706"
            />
            {/* Hat brim */}
            <path
              d="M 30 82 Q 100 70 170 82 Q 175 88 100 88 Q 25 88 30 82 Z"
              fill="#B45309"
            />
            {/* Green Sprout Badge on Hat */}
            <circle cx="100" cy="58" r="10" fill="#166534" />
            <path d="M 97 62 C 95 56 100 52 103 54 C 105 58 100 62 97 62 Z" fill="#4ADE80" />

            {/* EYES CONTAINER */}
            <g id="eyes">
              {state === "typing-password" ? (
                /* Hands covering eyes 🙈 */
                <g>
                  {/* Left Hand */}
                  <ellipse cx="75" cy="95" rx="16" ry="12" fill="#F59E0B" />
                  {/* Right Hand */}
                  <ellipse cx="125" cy="95" rx="16" ry="12" fill="#F59E0B" />
                </g>
              ) : state === "show-password" ? (
                /* Wide excited eyes 👁️👁️ */
                <g>
                  <circle cx="76" cy="94" r="12" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2" />
                  <circle cx="124" cy="94" r="12" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2" />
                  <circle cx="76" cy="94" r="6" fill="#166534" />
                  <circle cx="124" cy="94" r="6" fill="#166534" />
                  <circle cx="78" cy="92" r="2.5" fill="#FFFFFF" />
                  <circle cx="126" cy="92" r="2.5" fill="#FFFFFF" />
                </g>
              ) : state === "error" ? (
                /* Confused / Dizzy eyes X X */
                <g stroke="#991B1B" strokeWidth="3.5" strokeLinecap="round">
                  <line x1="68" y1="88" x2="80" y2="100" />
                  <line x1="80" y1="88" x2="68" y2="100" />
                  <line x1="116" y1="88" x2="128" y2="100" />
                  <line x1="128" y1="88" x2="116" y2="100" />
                </g>
              ) : (
                /* Dynamic Mouse Pointer Tracking Eyes 👀 */
                <g>
                  {/* Eyeballs */}
                  <circle cx="76" cy="95" r="11" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.5" />
                  <circle cx="124" cy="95" r="11" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.5" />
                  {/* Pupils with smooth mouse tracking */}
                  <motion.circle
                    cx={76 + pupilX}
                    cy={95 + pupilY}
                    r="5"
                    fill="#0F172A"
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  />
                  <motion.circle
                    cx={124 + pupilX}
                    cy={95 + pupilY}
                    r="5"
                    fill="#0F172A"
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  />
                  {/* Eye shine reflection */}
                  <circle cx={74 + pupilX} cy={93 + pupilY} r="1.8" fill="#FFFFFF" />
                  <circle cx={122 + pupilX} cy={93 + pupilY} r="1.8" fill="#FFFFFF" />
                </g>
              )}
            </g>

            {/* MOUTH */}
            <g id="mouth">
              {state === "success" ? (
                <path d="M 75 112 Q 100 135 125 112 Z" fill="#DC2626" stroke="#0F172A" strokeWidth="2" />
              ) : state === "error" ? (
                <path d="M 80 120 Q 100 110 120 120" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" fill="none" />
              ) : state === "typing-password" ? (
                <ellipse cx="100" cy="116" rx="6" ry="4" fill="#0F172A" />
              ) : (
                <path d="M 80 112 Q 100 126 120 112" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" fill="none" />
              )}
            </g>
          </motion.g>

          {/* CHEERING HANDS ON SUCCESS */}
          {state === "success" && (
            <g>
              <motion.path
                d="M 30 140 Q 20 110 35 100"
                stroke="#FDE68A"
                strokeWidth="10"
                strokeLinecap="round"
                animate={{ rotate: [-10, 10, -10] }}
                transition={{ repeat: Infinity, duration: 0.6 }}
              />
              <motion.path
                d="M 170 140 Q 180 110 165 100"
                stroke="#FDE68A"
                strokeWidth="10"
                strokeLinecap="round"
                animate={{ rotate: [10, -10, 10] }}
                transition={{ repeat: Infinity, duration: 0.6 }}
              />
            </g>
          )}
        </svg>
      </div>

      {/* HONEST MARKETING NOTE FOR WANGARI */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 text-white text-left space-y-3 max-w-md shadow-xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#4ADE80] shrink-0" />
          <h3 className="font-extrabold text-sm tracking-tight text-white">An Honest Note from Wangari</h3>
        </div>
        <p className="text-xs text-white/80 leading-relaxed">
          We built Wangari because farm record-keeping shouldn&apos;t require a university degree or an expensive consultant. Whether you keep 5 cows, 20 chickens, a fish pond or 10,000 birds, keeping daily track of milk, eggs, feed, vaccines, and money is the difference between profit and loss.
        </p>
        <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[11px] font-bold text-[#4ADE80]">
          <span className="flex items-center gap-1.5"><WifiOff className="h-3.5 w-3.5" /> 100% Works Offline</span>
          <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Built for Farmers</span>
        </div>
      </div>
    </div>
  );
}
