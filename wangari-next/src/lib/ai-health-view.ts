/**
 * How the live AI health panel turns numbers into sentences.
 *
 * Same reasoning as ai-admin-decisions.ts, and the same reason: the panel is a
 * client component that fetches in `useEffect`, which `renderToStaticMarkup`
 * never runs. A test written against the rendered page would see a spinner and
 * assert nothing. The rules an operator actually reads belong here, where they
 * can be asserted.
 *
 * Every label below is written to be read by a human in a hurry. That is not a
 * cosmetic preference: the alternative failure this whole feature exists to
 * prevent is "the AI is not working", which tells nobody anything. "Every
 * upstream channel is rate-limited (503) — paused" tells them what to do.
 */

export type HealthState = "healthy" | "unknown" | "rate_limited" | "exhausted" | "gone" | "neutral";

export interface ModelHealthLike {
  model: string;
  state: HealthState;
  lastStatus: number | null;
  lastReason: string | null;
  lastFailureAt: number | null;
  lastHealthyAt: number | null;
  consecutiveFailures: number;
  calls: number;
  failures: number;
  uptime: number;
  sidelinedForMs?: number;
}

export interface UseRecordLike {
  model: string;
  userId: number | null;
  ip: string | null;
  at: string | number;
  fellBackFrom?: string | null;
  reason?: string | null;
}

export interface FallbackLike {
  at: string | number;
  from: string | null;
  to: string;
  reason: string | null;
  userId: number | null;
  ip: string | null;
}

export interface Tone {
  label: string;
  cls: string;
}

/**
 * What each state means for a farmer, in one word.
 *
 * "unknown" is deliberately NOT labelled "fine". It means nobody has called
 * this model yet, and saying "working" for it would be the optimistic lie that
 * put a dead model in front of a farmer in the first place.
 */
export function stateMeta(state: string): Tone {
  switch (state) {
    case "healthy":
      return { label: "Answering", cls: "bg-badge-green-bg text-badge-green-text" };
    case "unknown":
      return { label: "Not tried yet", cls: "bg-wangari-cream text-wangari-muted" };
    case "rate_limited":
      return { label: "Rate limited", cls: "bg-badge-yellow-bg text-tone-warn-text" };
    case "exhausted":
      return { label: "No capacity", cls: "bg-badge-yellow-bg text-tone-warn-text" };
    case "gone":
      return { label: "Retired", cls: "bg-badge-red-bg text-badge-red-text" };
    default:
      // An unrecognised state fails to "checking" rather than to "Answering".
      // A newer server must never make an old panel imply everything is fine.
      return { label: "Checking", cls: "bg-wangari-cream text-wangari-muted" };
  }
}

/** Is this model currently being skipped by the automatic selection? */
export function isSidelined(h: ModelHealthLike): boolean {
  return h.state === "gone" || (typeof h.sidelinedForMs === "number" && h.sidelinedForMs > 0);
}

/**
 * How long, in words. -1 means "until an operator intervenes", which is a
 * genuinely different thing from a number of seconds and must not be rendered
 * as one.
 */
export function sidelinedLabel(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 0) return "until you clear it";
  if (ms === 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `paused ${s}s`;
  const m = Math.round(s / 60);
  return `paused ${m}m`;
}

/** "0%" for a model that has never run, rather than a misleading "100%". */
export function uptimePct(h: Pick<ModelHealthLike, "uptime" | "calls">): string {
  if (!h.calls) return "—";
  return `${Math.round(h.uptime * 100)}%`;
}

/** Uptime as a number for sorting and thresholds. -1 means "no evidence". */
export function uptimeScore(h: Pick<ModelHealthLike, "uptime" | "calls">): number {
  return h.calls ? h.uptime : -1;
}

/** The number that decides whether the assistant is actually up right now. */
export function overallTone(models: ModelHealthLike[], candidates: string[]): Tone {
  const live = models.filter((m) => candidates.includes(m.model));
  if (!live.length) return { label: "No traffic yet", cls: "bg-wangari-cream text-wangari-muted" };
  const usable = live.filter((m) => !isSidelined(m));
  if (!usable.length) return { label: "Every model is paused", cls: "bg-badge-red-bg text-badge-red-text" };
  if (usable.some((m) => m.state === "healthy")) {
    return { label: "Wangari AI is answering", cls: "bg-badge-green-bg text-badge-green-text" };
  }
  return { label: "Recovering", cls: "bg-badge-yellow-bg text-tone-warn-text" };
}

/**
 * "how many users in uptime are using Wangari AI, with IP addresses".
 *
 * Distinct counts, not a total: a farmer asking four questions is one farmer.
 * An operator reading "480 requests" during an incident needs to know whether
 * that is 480 farmers or three, because the answer changes what they do next.
 */
export function summariseUsage(uses: UseRecordLike[]): {
  total: number;
  uniqueUsers: number;
  uniqueIps: number;
  anonymous: number;
} {
  const users = new Set<number>();
  const ips = new Set<string>();
  let anonymous = 0;
  for (const u of uses) {
    if (u.userId != null) users.add(u.userId);
    else anonymous++;
    if (u.ip) ips.add(u.ip);
  }
  return { total: uses.length, uniqueUsers: users.size, uniqueIps: ips.size, anonymous };
}

/**
 * One line naming the fallback, both models and the reason.
 *
 * The reason is the whole point. Before selection was automatic, "why is it
 * answering with that model" had no answer at all, and the only visible
 * symptom was farmers saying the assistant was broken.
 */
export function fallbackSentence(f: FallbackLike): string {
  const from = f.from || "the configured model";
  return `${f.to} took over from ${from}${f.reason ? ` — ${f.reason}` : ""}`;
}

/**
 * "4m ago". Never a bare timestamp: an operator looking at an incident needs
 * to know whether this is happening now or an hour ago.
 */
export function timeAgo(at: string | number, now: number): string {
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(t)) return "unknown";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Which model selection would pick right now.
 *
 * Mirrors the server's healthyModel so the panel can answer "what is live?"
 * without the operator having to infer it from a table. It is a mirror, not the
 * implementation — the server is the guarantee.
 */
export function wouldUseNow(models: ModelHealthLike[], candidates: string[]): string | null {
  for (const m of models) {
    if (candidates.includes(m.model) && !isSidelined(m)) return m.model;
  }
  return candidates[0] ?? null;
}

/** A short label for a user id, or a mark for traffic we could not attribute. */
export function whoLabel(userId: number | null): string {
  return userId == null ? "unattributed" : `user ${userId}`;
}