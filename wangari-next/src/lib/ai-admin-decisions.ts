/**
 * The rules the AI admin screen enforces, separated from the screen.
 *
 * These are pure on purpose. The page that uses them is a client component that
 * fetches in `useEffect`, which `renderToStaticMarkup` never runs — so a test
 * against the rendered page can only ever see its loading spinner, and a suite
 * written that way would quietly assert nothing.
 *
 * The rules themselves are the valuable part, and each one mirrors a guard the
 * SERVER also enforces. Duplication here is deliberate: the server is the
 * guarantee, and this is what stops an operator being offered a button that
 * would only come back as a 400.
 */

export type ProbeState = "untested" | "passing" | "failing" | "error";

export interface ModelRowLike {
  role: string;
  probeState: string;
  lastLatencyMs: number | null;
  isFree: boolean;
  costInPerM: number | null;
  costOutPerM: number | null;
}

/**
 * Can this model be made live?
 *
 * The gate is the whole point of the module: a model that cannot chain two tool
 * calls answers a chat perfectly and then leaves the screen quiet halfway
 * through recording a sale. That failure must never be discovered by a farmer
 * during a demo.
 */
export function canActivate(m: { probeState: string }): boolean {
  return m.probeState === "passing";
}

/** Why activation is unavailable — shown as a tooltip, so it must be a sentence. */
export function activateBlockedReason(m: { probeState: string }): string {
  if (canActivate(m)) return "";
  switch (m.probeState) {
    case "untested":
      return "This model must pass the agent test before it can be activated";
    case "error":
      return "The last test errored. Fix the key or provider, then test again";
    default:
      return "This model failed the agent test. See the reason below.";
  }
}

/**
 * Speed, as a band rather than a bare number.
 *
 * "41000ms" tells an operator nothing about whether to act. These bands come
 * from what a farmer experiences: under 3s feels instant, 10s needs a "still
 * working" message, past 30s the free tier's per-minute window is the more
 * likely story than a slow model.
 */
export function latencyBand(ms: number | null): { label: string; tone: "good" | "ok" | "slow" | "bad" | "unknown" } {
  if (ms == null) return { label: "no traffic yet", tone: "unknown" };
  if (ms < 3000) return { label: "fast", tone: "good" };
  if (ms < 10000) return { label: "acceptable", tone: "ok" };
  if (ms < 30000) return { label: "slow", tone: "slow" };
  return { label: "very slow", tone: "bad" };
}

/** Seconds, formatted for display. Null becomes an em dash rather than "0.0s". */
export function formatSeconds(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/** May this model be deleted? Never the live one — the farm must keep a model. */
export function canDelete(m: { role: string }): boolean {
  return m.role !== "primary";
}

/** Cost as the operator reads it: free, or priced per million tokens. */
export function costLabel(m: { isFree: boolean; costInPerM: number | null; costOutPerM: number | null }): string {
  if (m.isFree) return "Free";
  if (m.costInPerM == null) return "Paid";
  return `$${m.costInPerM}/$${m.costOutPerM ?? "?"} per 1M`;
}

/**
 * Does this config come from the registry or from .env?
 *
 * Worth showing: they behave differently when the database is unavailable, and
 * a super-admin needs to know which one they are relying on.
 */
export function sourceLabel(fromEnv: boolean): string {
  return fromEnv ? "from environment" : "from this registry";
}

/**
 * Validate the settings form before sending it.
 *
 * The server bounds these too. Validating here means the operator gets the
 * error next to the field instead of as a toast after a round trip, and it
 * keeps the two sets of limits from drifting apart silently.
 *
 * NaN is checked FIRST for every field, and separately from the range checks,
 * because `Number("")` is 0 — not NaN. An emptied number input therefore reads
 * as a legitimate "0", which for searchesPerTurn would silently switch research
 * off across the whole product. Callers pass the raw strings through
 * `parseSetting` below so an empty field is distinguishable from a typed zero.
 */
export function validateSettings(v: {
  searchesPerTurn: number;
  rateLimitWindowMs: number;
  maxSteps: number;
}): string | null {
  if (Number.isNaN(v.searchesPerTurn)) return "Enter a number for searches per turn";
  if (Number.isNaN(v.rateLimitWindowMs)) return "Enter a number for the rate-limit window";
  if (Number.isNaN(v.maxSteps)) return "Enter a number for max agent steps";

  if (v.searchesPerTurn < 0 || v.searchesPerTurn > 10) {
    return "Searches per turn must be between 0 and 10";
  }
  if (v.rateLimitWindowMs < 1000 || v.rateLimitWindowMs > 300_000) {
    return "Rate-limit window must be between 1,000 and 300,000 ms";
  }
  if (v.maxSteps < 1 || v.maxSteps > 20) {
    return "Max agent steps must be between 1 and 20";
  }
  return null;
}

/**
 * Parse one setting field.
 *
 * Returns NaN for an empty or blank string so the validator can tell "the
 * operator cleared this field" apart from "the operator typed 0". `Number("")`
 * cannot: both are 0.
 */
export function parseSetting(raw: string): number {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return Number.NaN;
  return Number(trimmed);
}
