/**
 * Picking a free model without picking a broken one.
 *
 * ── what this corrects ───────────────────────────────────
 * This file was deleted once, and the reason it was deleted was wrong.
 *
 * The first version filtered the roster on `pricing.prompt === 0`, which is
 * the shape OpenRouter returns. UnoRouter does NOT publish per-model pricing:
 * a live call returned 264 models and ZERO pricing fields. So the filter
 * found nothing and concluded "discovery cannot run here".
 *
 * What it actually concluded was "my filter does not apply here". On this
 * endpoint the price is in the ID: 113 of the 264 models end in `:free`,
 * and every other id is billable. The roster was always there.
 *
 * ── why a roster needs filtering before it needs ranking ─
 * All 113 "free" models are not chat models. Measured on the live roster:
 *
 *   - 22 are owned by `ai horde` and every single one is an IMAGE model
 *     (absolutereality, dreamshaper, juggernaut-xl, nova-anime-xl,
 *     wai-cute-pony...). These top public leaderboards, because leaderboards
 *     score images on aesthetics. Pointing a farm assistant at one of them
 *     is the worst possible automatic choice.
 *   - 10 are embedding models (jina-*, gemini-embedding-*, sea-lion-*).
 *   - 4 are Whisper, which transcribes audio and cannot be asked a question.
 *
 * That leaves roughly 77 chat models. The filter is the whole value of this
 * file; the ranking is a preference, and the probe is what makes it a fact.
 *
 * ── the rule this module must never break ───────────────
 * Nothing here decides the model at request time. This produces an ORDERED
 * SHORTLIST that an operator probes once and pins. A model that passes the
 * probe today can be gone tomorrow, but a model chosen afresh per farmer per
 * question can be gone mid-conversation, which is how an assistant dies in
 * front of a customer.
 */

/** One row of a provider's roster, as far as we care about it. */
export interface RosterModel {
  id: string;
  owned_by?: string;
  supported_endpoint_types?: string[];
  context_length?: number;
  max_output_tokens?: number;
}

/** Why a candidate was rejected. Surfaced so the filter is auditable. */
export type RejectionReason =
  | "not-free"
  | "not-chat-transport"
  | "embedding-model"
  | "image-model"
  | "speech-model"
  | "context-too-small";

export interface Candidate {
  model: RosterModel;
  /** Lower is better. */
  rank: number;
  /** Human-readable grounds, for the operator reading the output. */
  why: string;
}

/** Thrown away or kept, with the reason kept too. */
export interface Judged {
  candidate?: Candidate;
  rejected?: RosterModel;
  reason?: RejectionReason;
}

/**
 * The suffix that means "this one costs nothing" on a roster with no pricing.
 *
 * Not a guess: 113 of 264 live ids end in it, and they are exactly the
 * zero-cost tier. An id WITHOUT the suffix is billable, which is the single
 * most important thing this module decides — a farm SaaS must not discover
 * itself into a paid model by accident.
 */
export const FREE_SUFFIX = ":free";

/**
 * Minimum context, in tokens.
 *
 * Wangari ships a ~2,000-word system prompt plus 30 tool schemas. That is
 * already 6-8k tokens of prompt before the farmer's question. A 4k model
 * cannot hold its own instructions, so it fails in a way that looks like
 * disobedience rather than truncation.
 */
export const MIN_CONTEXT = 16_000;

/**
 * Ids that are diffusion models despite an `openai` endpoint type.
 *
 * `owned_by === "ai horde"` already catches every current one, so this list
 * is defence for the day a second provider starts listing images there. It
 * is deliberately conservative: a false positive costs one good model, a
 * false negative costs a farm assistant pointed at a picture generator.
 */
const IMAGE_HINTS = [
  "sdxl", "pony", "anime", "xl-31", "-xl", "diffusion", "realistic",
  "animerge", "illustrious", "furry", "swamp", "checkpoints",
];

/** Speech-to-text. Whisper is on an openai endpoint and cannot be chatted with. */
const SPEECH_HINTS = ["whisper", "tts", "speech", "voice", "transcribe"];

/**
 * Judge one roster row.
 *
 * Pure on purpose. The interesting decisions here are all "is this actually
 * a chat model", and they must be testable without a network or a provider
 * key — the alternative is a filter that is only ever exercised in
 * production, against a farmer.
 */
export function judgeModel(m: RosterModel): Judged {
  const id = String(m.id ?? "").toLowerCase();

  if (!id.endsWith(FREE_SUFFIX)) return { rejected: m, reason: "not-free" };

  /* Identity first, transport second - and the order is load-bearing.
     Every AI Horde entry is both an image model AND on a transport we cannot
     speak, so checking transport first reported "wrong transport" and buried
     the interesting fact. An operator reading "wrong transport" learns
     nothing; reading "this is a picture" tells them why a leaderboard ranked
     it first. Always report the most diagnostic reason. */
  const owned = String(m.owned_by ?? "").toLowerCase();
  if (owned === "ai horde" || IMAGE_HINTS.some((h) => id.includes(h))) {
    return { rejected: m, reason: "image-model" };
  }
  if (SPEECH_HINTS.some((h) => id.includes(h))) return { rejected: m, reason: "speech-model" };

  const endpoints = (m.supported_endpoint_types ?? []).map((e) => String(e).toLowerCase());
  if (endpoints.includes("embedding")) return { rejected: m, reason: "embedding-model" };
  // We call /chat/completions. An `aihorde` transport is a different wire
  // protocol we have no client for.
  if (endpoints.length && !endpoints.includes("openai")) {
    return { rejected: m, reason: "not-chat-transport" };
  }

  const ctx = Number(m.context_length ?? 0);
  if (!ctx || ctx < MIN_CONTEXT) return { rejected: m, reason: "context-too-small" };

  return {
    candidate: {
      model: m,
      rank: scoreRank(m),
      why: `${ctx.toLocaleString("en-KE")} ctx${m.max_output_tokens ? `, ${m.max_output_tokens.toLocaleString("en-KE")} out` : ""}, via ${owned || "unknown"}`,
    },
  };
}

/**
 * Families that have actually behaved on this farm job, best first.
 *
 * This is a preference, not a measurement — which is exactly why the probe
 * still gets the final word. Keeping the list short and honest is better
 * than a clever heuristic that quietly ranks by parameter count.
 */
const PREFERRED_FAMILIES = [
  "space-bunny-alpha", // the incumbent: already probe-verified here
  "qwen3-next",
  "qwen3.6-plus",
  "qwen3.8-flash-next",
  "deepseek-v4.1-flash",
  "deepseek-v4-flash",
  "glm-5.3-flash",
  "gemini-3.6-flash",
  "intern-s2",
  "nemotron-3-ultra",
  "mistral-large-3",
  "codestral",
  "gpt-oss",
];

/**
 * Lower rank is better: verified family first, then raw context window.
 *
 * Context is the tiebreak because a bigger window means the whole tool
 * catalogue plus a conversation fits without truncation — the failure we
 * cannot see, because the model simply stops calling tools halfway.
 */
function scoreRank(m: RosterModel): number {
  const id = String(m.id ?? "").toLowerCase();
  const tier = PREFERRED_FAMILIES.findIndex((f) => id.startsWith(f));
  if (tier >= 0) return tier;
  const ctx = Number(m.context_length ?? 0);
  return PREFERRED_FAMILIES.length + Math.max(0, 1_048_576 - ctx) / 1_048_576;
}

/**
 * Filter and rank a whole roster.
 *
 * Returns the shortlist AND the rejections, because the rejections are the
 * interesting part: "we looked at 113 free models and 36 of them were
 * pictures" is a sentence an operator needs before trusting the answer.
 */
export function rankCandidates(rows: RosterModel[]): {
  candidates: Candidate[];
  rejected: { model: RosterModel; reason: RejectionReason }[];
} {
  const candidates: Candidate[] = [];
  const rejected: { model: RosterModel; reason: RejectionReason }[] = [];
  for (const m of rows ?? []) {
    const j = judgeModel(m);
    if (j.candidate) candidates.push(j.candidate);
    if (j.rejected) rejected.push({ model: j.rejected, reason: j.reason! });
  }
  candidates.sort((a, b) => a.rank - b.rank || a.model.id.localeCompare(b.model.id));
  return { candidates, rejected };
}

/** How many candidates to probe. Each probe costs two provider requests. */
export const DEFAULT_PROBE_LIMIT = 5;

/** Fetch the roster. Not cached here; the caller decides the lifetime. */
export async function fetchRoster(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RosterModel[]> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`roster request failed: ${res.status}`);
  const json: any = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}