/**
 * Which models are actually working, right now.
 *
 * ── the problem this exists to solve ────────────────────────────────────────
 * One pinned model id is a single point of failure on a free tier. UnoRouter
 * caps its upstream channels without warning, and when every channel behind
 * `space-bunny-alpha:free` is saturated at once the farmer gets
 * "UnoRouter: 503" and no answer — while a probe-verified backup sits unused in
 * the environment, because the old code only switched models on a 404, treating
 * a busy upstream as a blip worth waiting out. On a free tier it is not a blip;
 * it lasts minutes.
 *
 * So the assistant keeps a live picture instead of a single assumption, and
 * picks from what is working. It also writes down WHY it moved, because "the AI
 * is down" is unactionable and the operator needs to see which model failed, on
 * what status, for how many users.
 *
 * ── what this deliberately does NOT do ──────────────────────────────────────
 * It does not discover models at request time. `lib/free-model-roster.ts`
 * produces a shortlist and a human pins the winner; this only orders and
 * remembers the models that were already chosen. Picking a brand-new model
 * mid-conversation, without the two-step agentic probe, would leave the panel
 * dead halfway through recording a sale — a model that cannot chain two tool
 * calls is worse than a slow one.
 *
 * In memory and per process. A cluster of two workers keeps two views, which is
 * fine: each is learning the same thing from the same upstream within a
 * request or two, and a shared store would cost a database round trip on the
 * hot path to save a cooldown calculation.
 */

/** What we believe about a model right now. */
export type ModelState =
  /** It answered. */
  | "healthy"
  /** We have never called it, or have not called it since a reset. */
  | "unknown"
  /** The account's per-minute cap. Comes back on its own. */
  | "rate_limited"
  /** Every upstream channel behind the model is capped. Comes back eventually. */
  | "exhausted"
  /** The id does not exist. Will not come back without an operator. */
  | "gone"
  /** Our fault, or theirs, but not evidence about the model. */
  | "neutral";

export interface FailureVerdict {
  state: ModelState;
  /** Short, human-readable, safe to show an operator. Never the raw body. */
  reason: string | null;
}

export interface ModelHealth {
  model: string;
  state: ModelState;
  lastStatus: number | null;
  lastReason: string | null;
  lastFailureAt: number | null;
  lastHealthyAt: number | null;
  consecutiveFailures: number;
  calls: number;
  failures: number;
  /** Share of calls that succeeded, 0..1. */
  uptime: number;
}

/**
 * How long a model is sidelined for each failure.
 *
 * Five minutes for an exhausted channel, which is how long saturated free
 * channels take to come back. `rate_limited` is here for DISPLAY only — it is
 * the provider's own one-minute window, and it is what the panel counts down
 * for an operator. It deliberately does not move selection (see `usable`).
 * `gone` is not listed because it never expires: an operator has to clear it,
 * and a retirement that quietly un-retires itself is a trap.
 */
const COOLDOWN_MS: Partial<Record<ModelState, number>> = {
  rate_limited: 45_000,
  exhausted: 300_000,
  neutral: 0,
};

/** Cap the in-memory usage log. Forensics, not an audit log. */
const MAX_USES = 500;

export interface UseRecord {
  model: string;
  userId: number | null;
  ip: string | null;
  at: number;
  /** Populated when this call was not the first choice. */
  fellBackFrom?: string | null;
  reason?: string | null;
}

/**
 * What a response tells us about the model, as opposed to about us.
 *
 * The `neutral` case is the one that matters: a 400 for a malformed tool schema
 * says nothing about whether the model works, and counting it against the model
 * would rotate us off a healthy one after a single bad prompt.
 */
export function classifyFailure(status: number, body: string): FailureVerdict {
  const b = String(body ?? "").toLowerCase();

  if (status >= 200 && status < 300) return { state: "healthy", reason: null };

  if (status === 404 || status === 410) {
    return { state: "gone", reason: `model id returned ${status} — retired` };
  }

  if (status === 429) {
    return { state: "rate_limited", reason: "account rate limit (429) — pausing" };
  }

  if (status === 400 && (b.includes("model_not_found") || b.includes("does not exist"))) {
    return { state: "gone", reason: "model_not_found (400) — retired" };
  }

  // The body is the only thing distinguishing "this model is out of channels"
  // from "the upstream had a moment". Status alone cannot.
  if (
    status === 503 &&
    (b.includes("get_channel_failed") ||
      b.includes("all_providers_busy") ||
      (b.includes("all providers") && b.includes("busy")) ||
      b.includes("no available channel") ||
      b.includes("no channels available"))
  ) {
    return {
      state: "exhausted",
      reason: "every upstream channel is rate-limited (503) — pausing",
    };
  }

  return {
    state: "neutral",
    reason: `status ${status} — not evidence about the model`,
  };
}

/** The model to use, and the reason, for the operator to read afterwards. */
export interface Selection {
  model: string | null;
  reason: string;
  /** Set when we are not using the first choice, for the admin panel. */
  fellBackFrom?: string | null;
}

export class ModelHealthStore {
  private health = new Map<string, ModelHealth>();
  private uses: UseRecord[] = [];

  /** Fold one response into what we believe about a model. */
  observe(model: string, status: number, body: string, now: number): void {
    const verdict = classifyFailure(status, body);
    const prev = this.health.get(model);
    const h: ModelHealth = prev ?? {
      model,
      state: "unknown",
      lastStatus: null,
      lastReason: null,
      lastFailureAt: null,
      lastHealthyAt: null,
      consecutiveFailures: 0,
      calls: 0,
      failures: 0,
      uptime: 1,
    };

    h.calls += 1;
    h.lastStatus = status;

    if (verdict.state === "healthy") {
      h.state = "healthy";
      h.lastHealthyAt = now;
      h.lastReason = null;
      h.consecutiveFailures = 0;
      h.uptime = (h.uptime * (h.calls - 1) + 1) / h.calls;
      this.health.set(model, h);
      return;
    }

    // Counted either way so the panel can show failures, but a neutral result
    // must not move the verdict — that failure was ours, not the model's.
    h.failures += 1;
    h.uptime = (h.uptime * (h.calls - 1)) / h.calls;
    h.lastReason = verdict.reason;

    if (verdict.state !== "neutral") {
      h.state = verdict.state;
      h.lastFailureAt = now;
      h.consecutiveFailures += 1;
    }

    this.health.set(model, h);
  }

  /** Record that a farmer's question was actually answered by this model. */
  recordUse(model: string, meta: { userId?: number | null; ip?: string | null }, now: number, extra?: { fellBackFrom?: string | null; reason?: string | null }): void {
    this.uses.push({
      model,
      userId: meta.userId ?? null,
      ip: meta.ip ?? null,
      at: now,
      fellBackFrom: extra?.fellBackFrom ?? null,
      reason: extra?.reason ?? null,
    });
    if (this.uses.length > MAX_USES) this.uses.splice(0, this.uses.length - MAX_USES);
  }

  snapshot(): Record<string, ModelHealth> {
    const out: Record<string, ModelHealth> = {};
    for (const [k, v] of this.health) out[k] = { ...v };
    return out;
  }

  recentUses(): UseRecord[] {
    return this.uses.slice(-MAX_USES);
  }

  /** An operator says this model is worth trying again. */
  clear(model: string): void {
    this.health.delete(model);
  }

  /** Forget everything. Used by tests and by an operator resetting the panel. */
  reset(): void {
    this.health.clear();
    this.uses = [];
  }
}

/**
 * Is this model worth calling right now?
 *
 * Two failures move us and one deliberately does not.
 *
 * A 429 does NOT move us. The free tier meters the KEY, account-wide — the
 * measurement behind that is in lib/rate-limit-window.ts, and it is why
 * `lastAcceptedCallAt` is module-level rather than per-request. Every model
 * behind one key is capped at the same instant, so a different id would be
 * refused identically; and the call site is already waiting out that window,
 * so switching would only throw away the model that was about to answer.
 *
 * An exhausted channel is the opposite: it is specific to one model's upstream
 * pool, it lasts minutes rather than seconds, and it is exactly what returned
 * "UnoRouter: 503" while a working backup sat idle. That one moves us.
 */
function usable(h: ModelHealth | undefined, now: number): boolean {
  if (!h) return true; // unknown — be optimistic, or a fresh deploy answers nobody
  if (h.state === "gone") return false;
  if (h.state === "exhausted") {
    return now >= (h.lastFailureAt ?? 0) + (COOLDOWN_MS.exhausted ?? 0);
  }
  return true;
}

/** How long until a model is worth trying again. Zero if it is usable now. */
export function sidelinedForMs(h: ModelHealth | undefined, now: number): number {
  if (usable(h, now)) return 0;
  if (!h || h.state === "gone") return -1; // -1 reads as "until an operator intervenes"
  return Math.max(0, (h.lastFailureAt ?? 0) + (COOLDOWN_MS[h.state] ?? 0) - now);
}

/**
 * Pick a model to use from the operator's ordered list.
 *
 * The order is the operator's preference, and it is respected unless the model
 * at the front is known not to be working. Always returns something when there
 * is something to return: a farmer is better served by a real upstream error
 * than by silence.
 */
export function healthyModel(
  candidates: string[],
  health: Record<string, ModelHealth>,
  now: number,
): Selection {
  /* De-duplicated, order preserved. The call site recurses with the remaining
     backups, so a list that named the primary as its own backup would spend a
     second request re-calling a model already known to be dead — on a free
     tier that is one of fifty a day, spent proving something we already knew.
     A Set keeps the operator's order, which is their stated preference. */
  const list = [...new Set(candidates.filter(Boolean))];
  if (!list.length) return { model: null, reason: "no models configured" };

  const preferred = list[0];

  for (let i = 0; i < list.length; i++) {
    const model = list[i];
    if (usable(health[model], now)) {
      if (i === 0) {
        return { model, reason: `preferred model, no known problem` };
      }
      const h = health[preferred];
      const why = h?.lastReason ?? h?.state ?? "not working";
      return {
        model,
        reason: `${preferred} unavailable (${why}) — used ${model} instead`,
        fellBackFrom: preferred,
      };
    }
  }

  // Everything is sidelined. Still call the preferred one: the cooldown may
  // have expired upstream without us hearing, and a real error beats silence.
  return {
    model: preferred,
    reason: `nothing healthy among ${list.length} models — trying ${preferred} anyway`,
    fellBackFrom: null,
  };
}

/** The process-wide store the routes share. */
export const modelHealth = new ModelHealthStore();

/**
 * "How many farmers are using Wangari AI right now", in numbers an operator can
 * act on.
 *
 * DISTINCT counts, not a total. During an incident the difference between
 * "480 requests" and "480 farmers" is the whole question: one is a busy farm,
 * the other is a script. The answer changes what gets done about it.
 *
 * Lives here rather than in the panel because it has to be computed over every
 * record the store holds, not over the sixty rows sent to the browser. A
 * version of this that ran client-side over the response would quietly
 * under-report the moment traffic exceeded the page size — reporting fewer
 * farmers exactly when the numbers are worth believing.
 */
export function summariseUsage(uses: UseRecord[]): {
  total: number;
  uniqueUsers: number;
  uniqueIps: number;
  /** Records with no user id. Counted, not dropped — it still happened. */
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