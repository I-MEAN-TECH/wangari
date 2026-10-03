/**
 * Which guidance a farm actually needs — resolved from what the farmer recorded.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * A farmer added a dairy herd and was told to feed "Starter Mash, 110-120g per
 * bird". The data was never wrong: `species-templates.ts` has correct feed,
 * vaccine and housing for eleven species. The lookup was.
 *
 * `page.tsx` did `speciesTemplates[flock.type] || speciesTemplates.layers`. That
 * `|| speciesTemplates.layers` is the bug: when the lookup missed for any reason
 * — and it missed constantly, most often because an offline write returns
 * `{ queued: true }` with no `type` at all — the farmer was shown poultry advice
 * for cattle. Silently, and with total confidence, because the fallback is a
 * valid looking template rather than an error.
 *
 * The rule this module enforces: **an unknown animal gets honesty, not poultry.**
 * A farmer who kept goats must never be told to feed mash, and if we genuinely
 * cannot tell what they keep, saying so is far better than inventing layers.
 */

import {
  speciesTemplates,
  type SpeciesTemplate,
  getAllSpecies,
} from "./species-templates";

/** What we know about the group, from whatever the farmer actually recorded. */
export interface SpeciesLookup {
  /** Flock.type / Crop.type — the canonical id, e.g. "cattle_dairy". */
  type?: string | null;
  /** Flock.category — "poultry" | "livestock" | "aquaculture" | "other". */
  category?: string | null;
  /** Flock.breed, e.g. "Ayrshire". Used to split dairy from beef cattle. */
  breed?: string | null;
}

/**
 * Words that mean "this is a dairy animal", matched against the breed name.
 *
 * Kept deliberately small and explicit rather than clever. The only genuinely
 * hard call in this file is dairy vs beef cattle, because both live under
 * `cattle_*` ids and a farmer may type "Ayrshire", "Friesian" or "Mixed
 * dairy". Listing the real breed names is clearer than a heuristic and cannot
 * guess wrong on a breed we have never heard of.
 */
const DAIRY_BREED_HINTS = [
  "ayrshire", "friesian", "holstein", "jersey", "guernsey", "brown swiss",
  "dairy", "milking", "karan Fries", "g Friesian",
];
const BEEF_BREED_HINTS = [
  "hereford", "angus", "shorthorn", "charolais", "limousin", "sahiwal",
  "boran", "zebu", "ganga", "beef",
];

/** Lowercase, strip anything that is not a letter or space. */
function normalise(text: string | null | undefined): string {
  return (text || "").toLowerCase().replace(/[^a-z ]/g, " ").trim();
}

/** Does the text contain any of these words? */
function mentions(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w.toLowerCase()));
}

/**
 * Turn a breed into a cattle direction. Unlisted breeds return null, which the
 * caller treats as "ask the farmer" rather than guessing.
 */
export function cattleDirection(
  breed: string | null | undefined
): "dairy" | "beef" | null {
  const b = normalise(breed);
  if (!b) return null;
  if (mentions(b, DAIRY_BREED_HINTS)) return "dairy";
  if (mentions(b, BEEF_BREED_HINTS)) return "beef";
  return null;
}

/**
 * How a species was identified. `exact` is a stored id we trust; the others
 * mean we worked it out, which the UI shows so a wrong guess is visible rather
 * than silent.
 */
export type SpeciesMatch = "exact" | "category" | "breed" | "none";

export interface ResolvedSpecies {
  template: SpeciesTemplate | null;
  match: SpeciesMatch;
  /** Plain English for when we could not identify it. */
  reason: string | null;
}

/**
 * Resolve what the farmer keeps. Never returns a template the farmer did not
 * imply — `template` is null when we genuinely do not know.
 */
export function resolveSpecies(lookup: SpeciesLookup): ResolvedSpecies {
  const type = (lookup.type || "").trim().toLowerCase();
  const breed = lookup.breed || null;
  const category = (lookup.category || "").trim().toLowerCase();

  // 1. The stored id. This is the common case and always right.
  const exact = speciesTemplates[type];
  if (exact) return { template: exact, match: "exact", reason: null };

  // 2. A flock whose type was lost but whose breed survived. This is the offline
  //    case: the write is queued, so the row has no type yet, but the farmer's
  //    chosen breed is still in the form they submitted.
  const dir = cattleDirection(breed);
  if (dir) {
    const t = speciesTemplates[dir === "dairy" ? "cattle_dairy" : "cattle_beef"];
    if (t) return { template: t, match: "breed", reason: null };
  }

  // 3. Last resort within a category: if they told us livestock but not which,
  //    and only one livestock template exists, that one is safe.
  const inCategory = getAllSpecies().filter((s) => s.category === category);
  if (inCategory.length === 1) {
    return { template: inCategory[0], match: "category", reason: null };
  }

  // 4. Nothing. Say so.
  return {
    template: null,
    match: "none",
    reason:
      category && category !== "other"
        ? `We do not know which ${category} this is yet. Choose the species to get the right feed, vaccine and treatment.`
        : "We do not know what kind of animal this is yet. Choose the species to get the right feed, vaccine and treatment.",
  };
}

/**
 * Convenience wrapper for templates that cannot render without a species.
 *
 * Deliberately returns `null` instead of a default. Every caller has to decide
 * what an empty state looks like, which is the point: a farmer must never be
 * shown a confident wrong answer.
 */
export function speciesFor(lookup: SpeciesLookup): SpeciesTemplate | null {
  return resolveSpecies(lookup).template;
}