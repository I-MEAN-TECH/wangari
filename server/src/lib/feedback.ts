/**
 * The feedback instrument — the questions, and what we do with the answers.
 *
 * ## Why this module exists at all
 *
 * Until now Wangari had **no way to ask a farmer anything**. A codebase search
 * for `feedback|rating|nps|satisfaction` returned zero matches, and the only
 * user-voice mechanism was a `Ticket` model shaped like customer support
 * (which had 0 rows). So every roadmap decision was being made from usage
 * counts alone — how many rows, how many days — and usage counts cannot say
 * *why*.
 *
 * ## The three rules this encodes
 *
 * 1. **Tap only.** module-plan.md §0.1 R1: "No typing. Ever. Not as the
 *    primary path." There is no required free-text field here, and the
 *    optional `comment` is never necessary for a submission to count. A form
 *    that only works if a farmer types collects nothing from the farmer we are
 *    actually trying to hear from.
 *
 * 2. **Swahili first.** R5. The labels are the farmer's language; the keys are
 *    English because they are what lands in the database.
 *
 * 3. **Invented answers are dropped, never counted.** The public link is
 *    unauthenticated. If arbitrary strings counted, `"everything"` would top
 *    the chart on day one and the report would be worse than no report,
 *    because it would look like evidence.
 *
 * ## What it deliberately does NOT do
 *
 * It does not score, rank, or grade the product. It counts what people chose.
 * The interpretation is a human's job, and the raw counts travel with the
 * averages so the interpretation can be argued with.
 */

/** Where a response came from. Determines how much weight it carries. */
export const FEEDBACK_SOURCES = ["in_app", "public_link", "booth"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export type RatingPoint = {
  value: 1 | 2 | 3 | 4 | 5;
  /** Shown large; the label is a second layer (R2 — icon before words). */
  icon: string;
  label: string;
  /** Colour carries the same meaning app-wide (R2). */
  tone: "red" | "amber" | "green";
};

/**
 * Five points, spanning sad to happy.
 *
 * Five rather than two because "did it help?" tells us nothing actionable, and
 * five rather than ten because a ten-point scale is a scale designed by someone
 * who has never watched a farmer answer a question on a phone in the sun.
 */
export const RATING_SCALE: readonly RatingPoint[] = [
  { value: 1, icon: "😞", label: "Not good at all", tone: "red" },
  { value: 2, icon: "🙁", label: "Needs improvement", tone: "red" },
  { value: 3, icon: "😐", label: "Helps a little", tone: "amber" },
  { value: 4, icon: "🙂", label: "It helps", tone: "green" },
  { value: 5, icon: "😄", label: "It helps a lot", tone: "green" },
];

export type TagDef = { label: string; icon: string };

/**
 * "What is the best thing about Wangari?" — single tap.
 *
 * The options are the things we *believe* we are good at, which is exactly why
 * the list has to be fixed: a free-text box would only ever collect the
 * opinions of people who write well.
 */
export const BEST_TAGS: Readonly<Record<string, TagDef>> = {
  inafanya_kazi_bila_internet: { label: "Works without internet", icon: "📴" },
  ni_rahisi: { label: "It is easy to use", icon: "👆" },
  naona_faida: { label: "I see my profit in KES", icon: "💰" },
  kumbukumbu: { label: "My records are in order", icon: "📒" },
  bei_na_soko: { label: "It helps me with market prices", icon: "🏷️" },
  mifugo_na_mazao_yote: { label: "It tracks all my livestock and crops", icon: "🌾" },
};

/**
 * "What should improve?" — multi tap.
 *
 * The split between product faults (`ugumu`, `kasi`, `usahihi`, `lugha`) and
 * non-product answers (`mafunzo`, `msaada`) is the point. If farmers mostly
 * pick `mafunzo`, the problem is not the software, and [gap-analysis.md]
 * already suspects exactly that.
 */
export const IMPROVE_TAGS: Readonly<Record<string, TagDef>> = {
  mafunzo: { label: "I need training", icon: "🎓" },
  ugumu: { label: "It is hard to use", icon: "😕" },
  usahihi: { label: "My numbers were not accurate", icon: "🔢" },
  kasi: { label: "It is slow", icon: "🐢" },
  lugha: { label: "The language is hard to follow", icon: "🗣️" },
  mtandao: { label: "Needs internet", icon: "📶" },
  kipengele_hakipo: { label: "A feature I need is missing", icon: "➕" },
  bei_ya_mkopo: { label: "The monthly price is high", icon: "💸" },
  msaada: { label: "Support is hard to reach", icon: "🆘" },
};

/** What they keep or grow — the segmentation question. */
export const SPECIES_OPTIONS = ["kuku", "mifugo", "mazao", "samaki", "nyuki"] as const;
export type SpeciesOption = (typeof SPECIES_OPTIONS)[number];

/**
 * Who is answering — and the one field the public link now *requires*.
 *
 * ## Why this exists
 *
 * The public link shipped on 6 October 2026 with no way to tell a farmer from
 * a passer-by. A MiroFish simulation then did exactly what a real investor
 * would do: opened the link, filled in the farmer form, rated it 1/5, and
 * ticked every species including the five he does not keep.
 *
 * That is not a hypothetical annoyance. The single number an investor takes
 * from an open link is *how many people answered*, and under this project's
 * first rule — never inflate — a respondent who was never a farmer is worse
 * than no response at all, because it inflates the one thing we refuse to
 * inflate.
 *
 * So the link asks one extra tap: which of these are you? It is the cheapest
 * possible gate (one question, three big buttons, no typing) and it converts
 * an unanswerable poll into a segmented one.
 *
 * `other` is a real option, not a dumping ground: a county officer or an
 * agrovet is a legitimate respondent, and forcing them into "farmer" would
 * make the farmer segment lie. What we remove is the *unclassified* case.
 */
export const FEEDBACK_AUDIENCES = ["farmer", "adviser", "other"] as const;
export type FeedbackAudience = (typeof FEEDBACK_AUDIENCES)[number];

export const AUDIENCE_TAGS: Readonly<Record<FeedbackAudience, TagDef>> = {
  farmer: { label: "Farmer", icon: "🌾" },
  adviser: { label: "Extension adviser", icon: "🎓" },
  other: { label: "Other", icon: "👥" },
};

export type FeedbackInput = {
  source?: FeedbackSource | string | null;
  rating?: unknown;
  best?: unknown;
  improve?: unknown;
  species?: unknown;
  comment?: unknown;
  phone?: unknown;
  audience?: unknown;
  utm?: unknown;
};

export type NormalisedFeedback = {
  source: FeedbackSource;
  rating: number | null;
  best: string[];
  improve: string[];
  species: string[];
  comment: string | null;
  phone: string | null;
  /** `null` when not required and not given (in_app / booth). */
  audience: FeedbackAudience | null;
  /** `null` when the link was opened without campaign parameters. */
  utm: string | null;
};

export type ValidationResult =
  | { ok: true; value: NormalisedFeedback }
  | { ok: false; error: string };

const MAX_COMMENT = 400;

/**
 * Keep only the values we recognise, in the order given, without duplicates.
 *
 * The whitelist is the whole defence of the public link. An unknown value is
 * not an error — it is discarded — because a farmer's phone or a stale cached
 * form should never produce a 400 they cannot read.
 */
function pickKnown(input: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    if (!allowed.includes(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/**
 * Validate and normalise a submission. **Never throws** — it returns a
 * discriminated result, because the caller is a public endpoint.
 */
export function validateFeedback(input: FeedbackInput): ValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "No submission received." };
  }

  const source = input.source;
  if (source !== "in_app" && source !== "public_link" && source !== "booth") {
    return { ok: false, error: "Unknown feedback source." };
  }

  // Rating: absent is allowed, present-and-wrong is not. A 9 is a broken
  // client or a script, not an opinion.
  let rating: number | null = null;
  const rawRating = input.rating;
  if (rawRating !== null && rawRating !== undefined) {
    if (
      typeof rawRating !== "number" ||
      !Number.isInteger(rawRating) ||
      rawRating < 1 ||
      rawRating > 5
    ) {
      return { ok: false, error: "Rating must be a whole number from 1 to 5." };
    }
    rating = rawRating;
  }

  const best = pickKnown(input.best, Object.keys(BEST_TAGS));
  const improve = pickKnown(input.improve, Object.keys(IMPROVE_TAGS));
  const species = pickKnown(input.species, SPECIES_OPTIONS);

  // Who is answering. Required on the open link, optional elsewhere — an
  // in-app submission comes from a signed-in farmer and a booth response is
  // recorded by our own staff, so neither can be a random passer-by.
  let audience: FeedbackAudience | null = null;
  const rawAudience = input.audience;
  const audienceIsKnown =
    typeof rawAudience === "string" &&
    (FEEDBACK_AUDIENCES as readonly string[]).includes(rawAudience);
  if (audienceIsKnown) audience = rawAudience as FeedbackAudience;

  if (source === "public_link" && audience === null) {
    return { ok: false, error: "Tell us who you are before answering." };
  }

  // Which link they came from. Always optional — normalising returns null
  // rather than failing, so a malformed campaign URL cannot block a farmer.
  const utm = normaliseUtm(input.utm);

  // Species alone is not an opinion — it only segments one. Requiring a real
  // answer keeps the public link from filling with segmentation-only rows.
  if (rating === null && best.length === 0 && improve.length === 0) {
    return { ok: false, error: "Choose at least one answer." };
  }

  // Optional, and never required. Capped so an abusive payload cannot store
  // megabytes; nothing here is rendered as HTML, so this is a size guard.
  const comment =
    typeof input.comment === "string" && input.comment.trim()
      ? input.comment.trim().slice(0, MAX_COMMENT)
      : null;

  // Optional. Digits only, and only a plausible Kenyan-length number.
  const phone =
    typeof input.phone === "string"
      ? (() => {
          const digits = input.phone.replace(/\D+/g, "");
          return digits.length >= 9 && digits.length <= 15 ? digits : null;
        })()
      : null;

  return {
    ok: true,
    value: { source, rating, best, improve, species, comment, phone, audience, utm },
  };
}

/** One stored response, as far as aggregation cares. */
export type FeedbackRow = {
  rating: number | null;
  best: string[];
  improve: string[];
  species: string[];
  audience?: string | null;
  utm?: string | null;
};

/**
 * Which campaign link brought this response.
 *
 * ## Why reach has to be measurable before it can be improved
 *
 * [gap-analysis.md](gap-analysis.md) ranks reach (GAP 1) above every feature:
 * 9 users, and nobody knows whether that is because the app is wrong or
 * because nobody was told. Those two problems have opposite fixes, and the
 * difference between them is a number we were not keeping.
 *
 * So the shareable link carries `?utm_source=…&utm_medium=…&utm_campaign=…`
 * and stores them joined. A booth QR, a WhatsApp message and the marketing
 * site then become three separate rows in the admin summary instead of one
 * anonymous number. This is the only honest way to learn that a booth day
 * produced 40 responses and a poster produced 40, or neither.
 *
 * Not required, because most farmers arrive by typing the link. Stored
 * strictly: this arrives from a public endpoint, so an unbounded string from
 * a URL is a card that can be stuffed with megabytes.
 */
const UTM_PART = /^[a-z0-9_-]{1,32}$/;
export const MAX_UTM_LENGTH = 96;

/**
 * Normalise a UTM string to something storable and groupable.
 *
 * Returns `null` — never an error — for anything unusable, because a farmer
 * who followed a slightly malformed link must still get to answer the form.
 */
export function normaliseUtm(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const parts = input
    .split("|")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
    .filter((p) => UTM_PART.test(p));
  if (parts.length === 0) return null;
  return parts.join("|").slice(0, MAX_UTM_LENGTH);
}

export type SegmentSummary = {
  responses: number;
  ratedCount: number;
  /** `null` when nobody in the segment rated — never NaN, never 0. */
  averageRating: number | null;
  bestCounts: Record<string, number>;
  improveCounts: Record<string, number>;
};

export type FeedbackSummary = SegmentSummary & {
  speciesCounts: Record<string, number>;
  bestRanked: { tag: string; count: number }[];
  improveRanked: { tag: string; count: number }[];
  bySpecies: Record<string, SegmentSummary>;
  audienceCounts: Record<string, number>;
  byAudience: Record<string, SegmentSummary>;
  channelCounts: Record<string, number>;
};

function countInto(target: Record<string, number>, values: readonly string[]) {
  for (const v of values) target[v] = (target[v] ?? 0) + 1;
}

function summariseRows(rows: readonly FeedbackRow[]): SegmentSummary {
  const bestCounts: Record<string, number> = {};
  const improveCounts: Record<string, number> = {};
  let ratingSum = 0;
  let ratedCount = 0;

  for (const row of rows) {
    countInto(bestCounts, row.best ?? []);
    countInto(improveCounts, row.improve ?? []);
    if (typeof row.rating === "number" && Number.isFinite(row.rating)) {
      ratingSum += row.rating;
      ratedCount++;
    }
  }

  return {
    responses: rows.length,
    ratedCount,
    // Guard the divide. A dashboard showing `NaN%` teaches the founder to
    // distrust every other number on the page, including the correct ones.
    averageRating: ratedCount > 0 ? Number((ratingSum / ratedCount).toFixed(2)) : null,
    bestCounts,
    improveCounts,
  };
}

const rank = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

/**
 * Aggregate responses for the admin view.
 *
 * `bySpecies` exists because a poultry answer and a dairy answer are different
 * answers, and averaging them together produces a number that describes
 * neither. Responses with no species are kept in an `unspecified` segment
 * rather than dropped — dropping them would quietly shrink the denominator.
 */
export function summariseFeedback(rows: readonly FeedbackRow[]): FeedbackSummary {
  const base = summariseRows(rows);

  const speciesCounts: Record<string, number> = {};
  const grouped: Record<string, FeedbackRow[]> = {};

  for (const row of rows) {
    const species = row.species && row.species.length > 0 ? row.species : ["unspecified"];
    for (const s of species) {
      speciesCounts[s] = (speciesCounts[s] ?? 0) + 1;
      (grouped[s] ??= []).push(row);
    }
  }

  const bySpecies: Record<string, SegmentSummary> = {};
  for (const [s, groupRows] of Object.entries(grouped)) {
    bySpecies[s] = summariseRows(groupRows);
  }

  // Audience is single-choice, so unlike species a row lands in exactly one
  // bucket and the counts sum to `responses`. Rows predating the gate have no
  // audience and go to `unspecified` rather than being dropped — dropping them
  // would quietly shrink the denominator the dashboard shows.
  const audienceCounts: Record<string, number> = {};
  const audienceGrouped: Record<string, FeedbackRow[]> = {};
  for (const row of rows) {
    const key =
      row.audience && (FEEDBACK_AUDIENCES as readonly string[]).includes(row.audience)
        ? row.audience
        : "unspecified";
    audienceCounts[key] = (audienceCounts[key] ?? 0) + 1;
    (audienceGrouped[key] ??= []).push(row);
  }

  const byAudience: Record<string, SegmentSummary> = {};
  for (const [key, groupRows] of Object.entries(audienceGrouped)) {
    byAudience[key] = summariseRows(groupRows);
  }

  // Which link brought them. Single-choice like audience, so the counts sum
  // to `responses`. `direct` is an honest label, not a bucket for junk: a
  // farmer who typed the URL by hand is the most valuable kind of respondent
  // and must not be filed as if something were wrong.
  const channelCounts: Record<string, number> = {};
  for (const row of rows) {
    const key = row.utm ? row.utm : "direct";
    channelCounts[key] = (channelCounts[key] ?? 0) + 1;
  }

  return {
    ...base,
    speciesCounts,
    bestRanked: rank(base.bestCounts),
    improveRanked: rank(base.improveCounts),
    bySpecies,
    audienceCounts,
    byAudience,
    channelCounts,
  };
}
