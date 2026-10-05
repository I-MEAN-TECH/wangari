/**
 * Guided intake — "add a flock" is a form, not a sentence.
 *
 * ── what was wrong ──────────────────────────────────────
 * Ask Wangari to add livestock and she called `create_flock` with a name, a
 * breed and a number. The farmer got ONE record out of the ~28 columns the
 * livestock screen actually holds: no purpose, no pen, no supplier, no cost,
 * no feed plan, no vet, no target, no insurance. Nothing was asked for, so
 * nothing could be filled in, and the blank columns stayed blank for the life
 * of the flock. The farmer never learns they had a say in it.
 *
 * ── why the model does not just ask questions ───────────
 * It is tempting to let the model run the interview: "What is the flock
 * called?" "How many?" "What breed?" in its own words. Measured against this
 * product's constraints that is the wrong shape for two reasons.
 *
 * ONE: the free tier allows one request a MINUTE, account-wide (see
 * lib/agentic-probe.ts). A 12-question interview is 12 minutes of waiting, and
 * a farmer on a phone in Kiambu will not sit through it. So the questions are
 * DATA here, not model output: the server knows all of them, and asking costs
 * the farmer zero requests.
 *
 * TWO: the questions must be the ones the livestock screen asks. They already
 * exist, in components/flocks/EditFlockForm.tsx, grouped into the sections a
 * farmer has seen before. Re-deriving them in a prompt would produce a second,
 * drifting set — and the day they differ, the AI has told a farmer something
 * the app does not actually store.
 *
 * So this module is the single source of truth: it describes the sections, it
 * validates what comes back, and it says which fields are still missing. It is
 * pure — no database, no fetch — so all of it is unit-testable, which is the
 * only reason the rules below can be trusted.
 */

export type IntakeEntity = "flock";

export interface IntakeOption {
  value: string;
  label: string;
}

export type IntakeFieldType = "text" | "textarea" | "number" | "money" | "select" | "date";

export interface IntakeField {
  /** The Flock column this fills. One name, used for storage and for the form. */
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: readonly IntakeOption[];
  placeholder?: string;
  /** Shown under the input. Say why it is being asked, not what it is. */
  hint?: string;
  /** Whole animals and whole shillings only — no 12.5 birds, no 0.3 deaths. */
  integer?: boolean;
  min?: number;
}

export interface IntakeSection {
  id: string;
  title: string;
  /** One line on what this group of questions is for. */
  blurb?: string;
  fields: IntakeField[];
}

interface IntakeSource {
  entity: IntakeEntity;
  title: string;
  intro: string;
  sections: IntakeSection[];
  /**
   * Words the MODEL uses for these fields, mapped onto ours.
   *
   * The model reads "add 200 Sasso layers called Sasso Kenya, 500 bob each"
   * and has to hand those facts over in our names. Getting this wrong is not
   * a crash, it is worse: the farmer's own words are silently dropped and the
   * form opens blank on a detail they had already typed. So the aliases exist,
   * and every one of them is a word a farmer actually says.
   */
  aliases: Record<string, string>;
}

/**
 * The eleven species the product knows, with the ids Prisma stores.
 *
 * Same ids as SPECIES_CATEGORY in lib/flock-create.ts and the templates in the
 * web app's lib/species-templates.ts. A flock whose species is not in this list
 * still saves — the field is free text underneath — but the category cannot be
 * derived, so it falls back to "livestock".
 */
const SPECIES: readonly IntakeOption[] = [
  { value: "layers", label: "Layers (eggs)" },
  { value: "broilers", label: "Broilers (meat)" },
  { value: "kienyeji", label: "Kienyeji (indigenous chicken)" },
  { value: "cattle_dairy", label: "Dairy cattle" },
  { value: "cattle_beef", label: "Beef cattle" },
  { value: "goats", label: "Goats" },
  { value: "sheep", label: "Sheep" },
  { value: "pigs", label: "Pigs" },
  { value: "rabbits", label: "Rabbits" },
  { value: "fish", label: "Fish (aquaculture)" },
  { value: "bees", label: "Bees (apiculture)" },
];

const FLOCK: IntakeSource = {
  entity: "flock",
  title: "Add your livestock",
  intro:
    "I need a few details before I save this. I have already filled in what you " +
    "told me — check it, fill the gaps, and leave anything you do not know yet.",
  sections: [
    {
      id: "basic",
      title: "Basic Info",
      blurb: "Who these animals are and what the group is for.",
      fields: [
        {
          key: "name",
          label: "Flock Name",
          type: "text",
          required: true,
          placeholder: "e.g. Sasso Kenya",
          hint: "The name you call this group.",
        },
        {
          key: "initialCount",
          label: "How many animals",
          type: "number",
          required: true,
          integer: true,
          min: 1,
          placeholder: "e.g. 200",
        },
        {
          key: "type",
          label: "Species",
          type: "select",
          options: SPECIES,
          hint: "Decides how the app works out feed, space and vaccines.",
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "sold", label: "Sold" },
            { value: "deceased", label: "Deceased" },
          ],
        },
        { key: "breed", label: "Breed", type: "text", placeholder: "e.g. Sasso, Kienyeji, Friesian" },
        {
          key: "mortality",
          label: "Deaths (Mortality)",
          type: "number",
          integer: true,
          min: 0,
          placeholder: "0",
          hint: "Deaths since you got them.",
        },
        {
          key: "purpose",
          label: "Purpose",
          type: "select",
          options: [
            { value: "production", label: "Production" },
            { value: "breeding", label: "Breeding" },
            { value: "dual_purpose", label: "Dual Purpose" },
          ],
        },
        {
          key: "gender",
          label: "Gender",
          type: "select",
          options: [
            { value: "female", label: "All Female" },
            { value: "male", label: "All Male" },
            { value: "mixed", label: "Mixed" },
          ],
        },
        {
          key: "genderRatio",
          label: "Male : Female ratio",
          type: "text",
          placeholder: "e.g. 1:9",
        },
        {
          key: "hatchDate",
          label: "Date you got them",
          type: "date",
          hint: "Used to work out the age and the vaccination dates.",
        },
      ],
    },
    {
      id: "location",
      title: "Location & Housing",
      blurb: "Where they are kept.",
      fields: [
        {
          key: "location",
          label: "Location / Pen",
          type: "text",
          placeholder: "e.g. Pen A, Barn 2",
        },
      ],
    },
    {
      id: "supply",
      title: "Source & Cost",
      blurb: "Where they came from and what they cost. This is what the profit page compares against.",
      fields: [
        { key: "source", label: "Source / Supplier", type: "text", placeholder: "e.g. Mamboeo market" },
        {
          key: "supplierContact",
          label: "Supplier Phone",
          type: "text",
          placeholder: "07…",
        },
        {
          key: "costPerAnimal",
          label: "Cost per Animal (KES)",
          type: "money",
          min: 0,
          placeholder: "e.g. 500",
          hint: "One animal, not the whole group. The total is worked out for you.",
        },
        {
          key: "targetMarket",
          label: "Target Market",
          type: "text",
          placeholder: "e.g. Nairobi, local market",
        },
      ],
    },
    {
      id: "feed",
      title: "Feed Plan",
      blurb: "Feed is 60–70% of a poultry farm's costs, so it is worth recording.",
      fields: [
        {
          key: "feedType",
          label: "Feed Type",
          type: "text",
          placeholder: "e.g. layers mash, hay",
        },
        { key: "feedSupplier", label: "Feed Supplier", type: "text", placeholder: "e.g. Unga Farm Care" },
        {
          key: "feedCostPerMonth",
          label: "Feed Cost/Month (KES)",
          type: "money",
          min: 0,
          placeholder: "e.g. 24000",
        },
      ],
    },
    {
      id: "vet",
      title: "Veterinarian & Health",
      blurb: "Who to call when something is wrong.",
      fields: [
        { key: "vetName", label: "Veterinarian", type: "text", placeholder: "Name" },
        { key: "vetPhone", label: "Vet Phone", type: "text", placeholder: "07…" },
        {
          key: "healthOnArrival",
          label: "Health on Arrival",
          type: "text",
          placeholder: "e.g. all healthy, vaccinated against Newcastle",
        },
      ],
    },
    {
      id: "target",
      title: "Production Target",
      blurb: "What this group is expected to produce. Blank is fine — do not guess a number for me.",
      fields: [
        {
          key: "expectedYield",
          label: "Expected Yield",
          type: "text",
          placeholder: "e.g. 250 eggs/bird/year",
        },
        { key: "expectedWeight", label: "Expected Weight", type: "text", placeholder: "e.g. 1.8 kg at 8 weeks" },
        {
          key: "expectedRevenue",
          label: "Expected Revenue (KES)",
          type: "money",
          min: 0,
          placeholder: "e.g. 600000",
        },
      ],
    },
    {
      id: "insurance",
      title: "Insurance & Notes",
      fields: [
        {
          key: "insurancePolicy",
          label: "Insurance Policy",
          type: "text",
          placeholder: "e.g. Kenya National Insurance, policy NHIF-2231",
        },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Anything else worth remembering." },
      ],
    },
    {
      id: "tags",
      title: "ANITRAC Tags",
      blurb: "First and last tag number for the whole group. Leave empty if they are not tagged.",
      fields: [
        { key: "tagFrom", label: "First tag number", type: "text", placeholder: "e.g. 1410001" },
        { key: "tagTo", label: "Last tag number", type: "text", placeholder: "e.g. 1410200" },
      ],
    },
  ],
  aliases: {
    count: "initialCount",
    number: "initialCount",
    quantity: "initialCount",
    head: "initialCount",
    flockName: "name",
    groupName: "name",
    deaths: "mortality",
    mortalityCount: "mortality",
    species: "type",
    pen: "location",
    house: "location",
    barn: "location",
    supplier: "source",
    supplierName: "source",
    phone: "supplierContact",
    supplierPhone: "supplierContact",
    cost: "costPerAnimal",
    pricePerAnimal: "costPerAnimal",
    market: "targetMarket",
    feed: "feedType",
    feedCost: "feedCostPerMonth",
    vet: "vetName",
    veterinarian: "vetName",
    vetPhoneNumber: "vetPhone",
    arrivedOn: "hatchDate",
    dateAcquired: "hatchDate",
    healthStatus: "healthOnArrival",
    insurance: "insurancePolicy",
    yield: "expectedYield",
    revenue: "expectedRevenue",
    weight: "expectedWeight",
    note: "notes",
    firstTag: "tagFrom",
    lastTag: "tagTo",
  },
};

const SOURCES: Record<IntakeEntity, IntakeSource> = { flock: FLOCK };

/** What the server sends the farmer's browser to draw the form. */
export interface IntakeCard {
  entity: IntakeEntity;
  title: string;
  intro: string;
  sections: IntakeSection[];
  /** Field key → what is already filled in, as strings. */
  values: Record<string, string>;
  /** Fields still needed before it can be saved. */
  missingRequired: string[];
  /** Fields that would be nice, in the farmer's language. */
  missingOptional: string[];
  /** Count of the fields already answered. */
  filled: number;
  /** Count of everything asked. */
  total: number;
  /**
   * One line the model reads out so the farmer knows what is being asked for,
   * in the same words as the form. Never a status code, never a count.
   */
  ask: string;
}

export function isIntakeEntity(value: unknown): value is IntakeEntity {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SOURCES, value);
}

export function intakeSource(entity: IntakeEntity): IntakeSource {
  return SOURCES[entity];
}

/** Every field key in the entity, in the order the sections list them. */
export function intakeKeys(entity: IntakeEntity): string[] {
  return SOURCES[entity].sections.flatMap((s) => s.fields.map((f) => f.key));
}

function fieldOf(entity: IntakeEntity, key: string): IntakeField | undefined {
  for (const section of SOURCES[entity].sections) {
    const hit = section.fields.find((f) => f.key === key);
    if (hit) return hit;
  }
  return undefined;
}

/** Strip thousands separators and stray currency marks a farmer may type. */
function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const text = String(raw).replace(/[,\s]/g, "").replace(/^kes/i, "");
  if (text === "" || text === "-") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** A real calendar date, or null. `new Date("2026-02-31")` does not check this. */
function toDateOnly(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw).trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * Reduce a free-text answer to one of the field's options, or nothing.
 *
 * Case and spacing are forgiven because the answer may have come from a
 * farmer's speech, but an unrecognised word is DROPPED rather than guessed at:
 * inventing a species would mis-file the whole group.
 */
function toOption(field: IntakeField, raw: unknown): string | null {
  const text = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  const options = field.options ?? [];
  const exact = options.find((o) => o.value.toLowerCase() === text);
  if (exact) return exact.value;
  const byLabel = options.find((o) => o.label.toLowerCase() === text);
  if (byLabel) return byLabel.value;
  // "eggs" for layers, "meat" for broilers — the words people actually use.
  const byWord = options.find((o) => o.label.toLowerCase().includes(text) || text.includes(o.value.toLowerCase()));
  if (byWord) return byWord.value;
  return null;
}

/**
 * Clean one answer for one field.
 *
 * Returns the string to store in the form, or null when the answer is absent
 * or unusable. Numbers come back as digits so "1,200" and "KES 1,200" are the
 * same value; everything else is trimmed.
 */
export function cleanField(field: IntakeField, raw: unknown): string | null {
  switch (field.type) {
    case "number":
    case "money": {
      const n = toNumber(raw);
      if (n === null) return null;
      if (field.integer && !Number.isInteger(n)) return null;
      if (field.min !== undefined && n < field.min) return null;
      return String(n);
    }
    case "date":
      return toDateOnly(raw);
    case "select":
      return toOption(field, raw);
    default: {
      const text = String(raw ?? "").trim();
      return text === "" ? null : text;
    }
  }
}

/**
 * Map whatever the model handed over onto our field names, cleaning as it goes.
 *
 * Unknown keys are dropped, aliases are followed, and a key that arrives with
 * both its own name and an alias is resolved once, in favour of the real name.
 */
export function prefillIntake(
  entity: IntakeEntity,
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  const source = intakeSource(entity);
  for (const [key, value] of Object.entries(raw)) {
    const mapped = source.aliases[key] ?? key;
    const field = fieldOf(entity, mapped);
    if (!field) continue;
    const cleaned = cleanField(field, value);
    if (cleaned !== null) out[mapped] = cleaned;
  }
  return out;
}

/**
 * Build the card the farmer fills in.
 *
 * `values` are the answers already known — from the conversation, or from an
 * earlier step of the same intake — so the form opens with the farmer's own
 * words in it rather than an empty grid they have to type from nothing.
 */
export function buildIntake(
  entity: IntakeEntity,
  values: Record<string, unknown> | null | undefined = {},
  prefill: Record<string, unknown> | null | undefined = {},
): IntakeCard {
  const source = intakeSource(entity);
  const merged = { ...prefillIntake(entity, prefill), ...prefillIntake(entity, values) };
  const clean: Record<string, string> = {};
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  let filled = 0;

  for (const section of source.sections) {
    for (const field of section.fields) {
      const value = cleanField(field, merged[field.key]);
      if (value === null) {
        (field.required ? missingRequired : missingOptional).push(field.label);
      } else {
        clean[field.key] = value;
        filled++;
      }
    }
  }

  const total = intakeKeys(entity).length;
  return {
    entity,
    title: source.title,
    intro: source.intro,
    sections: source.sections,
    values: clean,
    missingRequired,
    missingOptional,
    filled,
    total,
    ask: askLine(source, missingRequired, missingOptional, filled),
  };
}

/**
 * The sentence the model says while the form opens.
 *
 * Names the gaps rather than reading the form back, and short: it is one line
 * in a chat, not a summary of twenty-eight fields. When everything required is
 * already known it says so, because that is the honest thing to say — the
 * form is there to be checked, not to be a wall.
 */
function askLine(
  source: IntakeSource,
  missingRequired: string[],
  missingOptional: string[],
  filled: number,
): string {
  if (missingRequired.length) {
    const need = listOut(missingRequired.slice(0, 6));
    return `I need ${need} before I can save this. I have opened the ${source.title.toLowerCase()} form with what you told me.`;
  }
  if (!missingOptional.length) {
    return `I have everything I need, so I have opened the ${source.title.toLowerCase()} form for you to check before I save it.`;
  }
  const some = listOut(missingOptional.slice(0, 4));
  return `I have the important details. The form is open in case you want to add ${some} — you can leave those blank and save now.`;
}

function listOut(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface IntakeValidation {
  ok: boolean;
  /** Cleaned answers, safe to hand back to the form. */
  values: Record<string, string>;
  /** Field key → the sentence to show under that input. */
  errors: Record<string, string>;
  /** Required keys still empty. Drives "you cannot save yet". */
  missingRequired: string[];
}

/**
 * Validate a submitted form.
 *
 * Two rules, and both exist because of a way this has been got wrong:
 *
 * 1. A required field that is empty is an ERROR with a sentence, not a silent
 *    skip. A farmer who presses Save and watches nothing happen will press it
 *    again, harder.
 * 2. A required field that is FILLED WITH NONSENSE is also an error. "twenty"
 *    in a count field is the most likely thing a farmer types after saying
 *    "twenty birds" out loud, and dropping it would save a flock of nothing.
 */
export function validateIntake(
  entity: IntakeEntity,
  raw: Record<string, unknown> | null | undefined,
): IntakeValidation {
  const source = intakeSource(entity);
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  const missingRequired: string[] = [];
  const supplied = raw && typeof raw === "object" ? raw : {};

  for (const section of source.sections) {
    for (const field of section.fields) {
      const answer = cleanField(field, supplied[field.key]);
      if (answer !== null) {
        values[field.key] = answer;
        continue;
      }
      // Nothing usable came back. Distinguish "left empty" from "typed wrong".
      const typed = String(supplied[field.key] ?? "").trim();
      if (typed !== "") {
        errors[field.key] = badValueMessage(field, typed);
      } else if (field.required) {
        missingRequired.push(field.key);
        errors[field.key] = `${field.label} is needed before I can save this.`;
      }
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    values,
    errors,
    missingRequired,
  };
}

function badValueMessage(field: IntakeField, typed: string): string {
  if (field.type === "number" || field.type === "money") {
    return field.min !== undefined && field.min > 0
      ? `Use a number of ${field.min} or more, not "${typed}".`
      : `Use a number, not "${typed}".`;
  }
  if (field.type === "date") return "Use a date like 2026-10-12.";
  if (field.type === "select") return `Choose one of the options for ${field.label.toLowerCase()}.`;
  return `Check ${field.label.toLowerCase()}.`;
}

/**
 * The typed payload Prisma wants, or the reason it cannot be built.
 *
 * Numbers become numbers, blanks become null, and the two fields the database
 * insists on — a name and a count — are refused here rather than at the
 * database, where the error would be a Prisma message no farmer can read.
 */
export function toFlockCreateInput(
  values: Record<string, string>,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const name = (values.name ?? "").trim();
  if (!name) return { ok: false, error: "The flock needs a name before I can save it." };

  const count = Number(values.initialCount);
  if (!Number.isInteger(count) || count < 1) {
    return { ok: false, error: "I need to know how many animals are in this flock." };
  }

  const num = (key: string): number | null => {
    const n = toNumber(values[key]);
    return n === null ? null : n;
  };
  const text = (key: string): string | null => {
    const t = (values[key] ?? "").trim();
    return t === "" ? null : t;
  };

  const costPerAnimal = num("costPerAnimal");

  return {
    ok: true,
    data: {
      name,
      breed: text("breed"),
      type: text("type"),
      status: text("status") ?? "active",
      initialCount: count,
      // Mortality is subtracted rather than stored as a separate truth: the
      // screen shows "Deaths" beside "Current Count", and a group of 200 with
      // 3 deaths is 197 birds alive today.
      mortality: Math.max(0, Math.trunc(num("mortality") ?? 0)),
      purpose: text("purpose"),
      gender: text("gender"),
      genderRatio: text("genderRatio"),
      location: text("location"),
      hatchDate: text("hatchDate"),
      source: text("source"),
      supplierContact: text("supplierContact"),
      costPerAnimal,
      targetMarket: text("targetMarket"),
      feedType: text("feedType"),
      feedSupplier: text("feedSupplier"),
      feedCostPerMonth: num("feedCostPerMonth"),
      vetName: text("vetName"),
      vetPhone: text("vetPhone"),
      healthOnArrival: text("healthOnArrival"),
      insurancePolicy: text("insurancePolicy"),
      expectedYield: text("expectedYield"),
      expectedWeight: text("expectedWeight"),
      expectedRevenue: num("expectedRevenue"),
      notes: text("notes"),
      tagFrom: text("tagFrom"),
      tagTo: text("tagTo"),
      totalInvestment: costPerAnimal === null ? null : costPerAnimal * count,
    },
  };
}