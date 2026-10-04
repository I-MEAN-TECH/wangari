import { Milk, Wheat } from "lucide-react";

/**
 * The two day-one choices — the farmer's first record, and the money moment.
 *
 * ── Why this is its own module ─────────────────────────────────────────────
 * The same pair of choices now appears in two places: the dashboard
 * FirstRunCard, and the final step of onboarding, so a farmer is offered the
 * same two doors no matter which screen they arrive on. When the pair was
 * defined inside FirstRunCard, the onboarding step would have had to either
 * import a dashboard component or copy the list — and the copy is exactly how
 * the two would silently drift apart, with one promising a screen that no
 * longer matches the other.
 *
 * So the options live here, and both callers render them. Adding a third door
 * (bees, fish, horticulture) is a one-line change in ONE place.
 *
 * ── The rule these encode ───────────────────────────────────────────────────
 * Phase 0 of the revised plan (docs/module-plan.md §8): a farmer who has just
 * claimed a farm should not meet a dashboard of zeros. His first screen after
 * signup should be a day-one job he can finish tonight — the milk, eggs or
 * harvest already in his hands — not a day-30 configuration chore.
 *
 * Both destinations end in a number the same evening. That number is the first
 * reward, and the reward is the whole point: the habit forms because it pays.
 */

export interface FirstRecordChoice {
  id: string;
  icon: typeof Milk;
  title: string;
  subtitle: string;
  href: string;
  cta: string;
}

export const FIRST_RECORD_CHOICES: readonly FirstRecordChoice[] = [
  {
    id: "livestock",
    icon: Milk,
    title: "I sell milk or eggs",
    subtitle: "Milk, eggs or meat",
    href: "/deliveries",
    cta: "Record a sale",
  },
  {
    id: "crops",
    icon: Wheat,
    title: "I grow crops",
    subtitle: "Maize, vegetables, fruit",
    href: "/crops",
    cta: "Record a harvest",
  },
] as const;
