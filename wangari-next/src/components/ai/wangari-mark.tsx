"use client";

/**
 * Wangari as a module icon.
 *
 * The one rule here: this is the SAME animated character as the one in the
 * AI panel — the same states, the same breath, the same blink — rendered
 * small. That is the whole point. A farmer who learns her face on the Home
 * screen must meet that same face on the module they tap to reach her,
 * otherwise the app has two different assistants wearing one name.
 *
 * Which is also why it reads the shared presence store rather than accepting
 * a state as a prop. If the icon were given its own `state`, it would sit
 * at "idle" while the panel beside it was mid-task, and a farmer would
 * learn not to believe her face. She is either working or she is not,
 * everywhere at once.
 */

import * as React from "react";
import { WangariAvatar } from "./wangari-avatar";
import { useWangariPresence, PRESENCE_STATE, type Presence } from "@/lib/wangari-presence";
import { cn } from "@/lib/utils";

export function WangariMark({
  size = 24,
  className = "",
  /** Overrides the shared presence. For tests and stories only. */
  presence,
}: {
  size?: number;
  className?: string;
  presence?: Presence;
}) {
  const live = useWangariPresence();
  const state = presence ?? live;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      // The nav item already carries the name in text, so the mark itself is
      // decorative. Announcing it would make a screen reader say "Wangari"
      // twice per menu.
      aria-hidden="true"
    >
      <WangariAvatar state={PRESENCE_STATE[state] ?? "idle"} size={size} />
    </span>
  );
}

export default WangariMark;