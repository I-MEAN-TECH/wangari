"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatedAvatar, AvatarState } from "@/components/auth/animated-avatar";

interface AuthContextType {
  avatarState: AvatarState;
  setAvatarState: (state: AvatarState) => void;
}

export const AuthAvatarContext = React.createContext<AuthContextType>({
  avatarState: "idle",
  setAvatarState: () => {},
});

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [avatarState, setAvatarState] = React.useState<AvatarState>("idle");

  return (
    <AuthAvatarContext.Provider value={{ avatarState, setAvatarState }}>
      <div className="min-h-screen flex">
        {/* Left — Brand panel & Interactive Avatar */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-wangari-ink via-wangari-green-900 to-wangari-green-800 relative overflow-hidden flex-col justify-between p-10">
          {/* Decorative blobs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -left-20 h-[400px] w-[400px] rounded-full bg-wangari-green-500/15 blur-[120px]" />
            <div className="absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-wangari-green-400/10 blur-[140px]" />
          </div>

          {/* Logo */}
          <div className="relative z-10">
            <Link href="/" className="flex items-center gap-3 text-white">
              <img
                src="/images/wangari-real-logo.png"
                alt="Wangari"
                className="h-10 w-10 rounded-full object-cover"
              />
              <span className="text-xl font-extrabold tracking-tight">Wangari</span>
            </Link>
          </div>

          {/* Interactive Animated Cartoon Avatar & Honest Note */}
          <div className="relative z-10 my-auto py-6">
            <AnimatedAvatar state={avatarState} />
          </div>

          {/* Bottom stats — Honest & Transparent Highlights */}
          <div className="relative z-10 flex justify-between border-t border-white/10 pt-4">
            {[
              { value: "100%", label: "Offline Sync" },
              { value: "< 3 Taps", label: "Daily Output Log" },
              { value: "0 Fees", label: "Free 14-Day Trial" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-lg font-black text-wangari-green-400">{stat.value}</p>
                <p className="text-[11px] text-white/70 font-semibold">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Form panel */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white overflow-y-auto">
          {/* Mobile avatar header */}
          <div className="lg:hidden w-full max-w-md mb-6 flex flex-col items-center">
            <AnimatedAvatar state={avatarState} className="scale-90" />
          </div>
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </AuthAvatarContext.Provider>
  );
}
