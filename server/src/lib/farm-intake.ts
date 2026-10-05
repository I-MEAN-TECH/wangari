/**
 * The machinery behind every guided intake: cleaning answers, asking what is
 * still missing, and refusing what cannot be saved.
 *
 * ── what this is ─────────────────────────────────────────
 * Ask Wangari to add livestock and she used to call a tool with a name, a breed
 * and a number. The farmer got ONE record out of the twenty-eight columns the
 * livestock screen holds: no purpose, no pen, no supplier, no cost, no feed
 * plan, no vet, no target, no insurance. Nothing was asked for, so nothing could
 * be filled in, and the blank columns stayed blank for the life of the flock.
 * The same was true of every other record the assistant could write.
 *
 * So the questions are DATA, in intake-registry.ts, and this file is what reads
 * them. There is one list, and the card, the validation and the writers all get
 * their fields from it. A second copy would drift, and the day it did the
 * assistant would be asking about something the database cannot store.
 *
 * ── why the model does not just ask the questions ────────
 * It is tempting to let the model run the interview in its own words. Measured
 * against this product's constraints that is the wrong shape for two reasons.
 *
 * ONE: the free tier allows one request a MINUTE, account-wide (see
 * lib/agentic-probe.ts). A twelve-question interview is twelve minutes of
 * waiting, and a farmer on a phone in Kiambu will not sit through it. The
 * questions are therefore data here, not model output: the server knows all of
 * them, and asking costs the farmer zero requests.
 *
 * TWO: the questions must be the ones the screens already ask. They exist in
 * the flocks, crops, workers, customers, stock and money screens. Re-deriving
 * them in a prompt would produce a second, drifting set.
 *
 * Pure throughout — no database, no fetch — so all of it is unit-testable,
 * which is the only reason the rules below can be trusted.
 */import { intakeSource, isIntakeEntity } from "./intake-registry.js";
import type {
  IntakeCard,
  IntakeEntity,
  IntakeField,
  IntakeSource,
  IntakeValidation,
} from "./intake-types.js";
export type { IntakeEntity, IntakeCard, IntakeField, IntakeValidation } from "./intake-types.js";
export { intakeSource, intakeEntities, isIntakeEntity, intakeModule } from "./intake-registry.js";

/** Every field key in the entity, in the order the sections list them. */
export function intakeKeys(entity: IntakeEntity): string[] {
  return intakeSource(entity).sections.flatMap((s) => s.fields.map((f) => f.key));
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
 * Case and spacing are forgiven because the answer may have come from a farmer's
 * speech, but an unrecognised word is DROPPED rather than guessed at: inventing
 * a species would mis-file the whole group, and inventing an expense category
 * would put money on the wrong side of the profit page.
 */
function toOption(field: IntakeField, raw: unknown): string | null {
  const text = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  const options = field.options ?? [];
  const exact = options.find((o) => o.value.toLowerCase() === text);
  if (exact) return exact.value;
  const byLabel = options.find((o) => o.label.toLowerCase() === text);
  if (byLabel) return byLabel.value;
  // "eggs" for layers, "meat" for broilers, "income" for money in — the words
  // people actually use rather than the ones the database wants.
  const byWord = options.find(
    (o) => o.label.toLowerCase().includes(text) || text.includes(o.value.toLowerCase()),
  );
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
 * Coerce whatever the model handed over into a plain object.
 *
 * Nested objects are the natural shape for a tool call, but a model that sends
 * `values` as a JSON string is not rare, and dropping it would open an EMPTY
 * form on a farmer who had just said everything — the exact failure this whole
 * feature exists to prevent. So a string is parsed rather than ignored.
 */
export function asRecord(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

/**
 * Map whatever the model handed over onto our field names, cleaning as it goes.
 *
 * Unknown keys are dropped, aliases are followed, and a key that arrives with
 * both its own name and an alias is resolved once, in favour of the real name.
 */
export function prefillIntake(
  entity: IntakeEntity,
  raw: Record<string, unknown> | null | undefined | string,
): Record<string, string> {
  const out: Record<string, string> = {};
  const source = intakeSource(entity);
  for (const [key, value] of Object.entries(asRecord(raw))) {
    const mapped = source.aliases[key] ?? key;
    const field = fieldOf(entity, mapped);
    if (!field) continue;
    const cleaned = cleanField(field, value);
    if (cleaned !== null) out[mapped] = cleaned;
  }
  return out;
}

function fieldOf(entity: IntakeEntity, key: string): IntakeField | undefined {
  for (const section of intakeSource(entity).sections) {
    const hit = section.fields.find((f) => f.key === key);
    if (hit) return hit;
  }
  return undefined;
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
  prefill: Record<string, unknown> | null | undefined | string = {},
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
 * already known it says so, because that is the honest thing to say — the form
 * is there to be checked, not to be a wall.
 */
function askLine(
  source: IntakeSource,
  missingRequired: string[],
  missingOptional: string[],
  filled: number,
): string {
  const form = `${source.formNoun} form`;
  if (missingRequired.length) {
    const need = listOut(missingRequired.slice(0, 6));
    // "with what you told me" only when something WAS told. This sentence was
    // written once, for both cases, and on a bare "add a livestock" it claimed
    // the farmer had said things they had not — the first thing this sentence
    // does is establish trust, so it has to be true.
    return filled > 0
      ? `I need ${need} before I can save this. I have opened the ${form} with what you told me.`
      : `I need ${need} before I can save this. I have opened the ${form} so you can fill in the details.`;
  }
  if (!missingOptional.length) {
    return `I have everything I need, so I have opened the ${form} for you to check before I save it.`;
  }
  const some = listOut(missingOptional.slice(0, 4));
  return `I have the important details. The ${form} is open in case you want to add ${some} — you can leave those blank and save now.`;
}

function listOut(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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
 *    "twenty birds" out loud, and dropping it would save a record of nothing.
 */
export function validateIntake(
  entity: IntakeEntity,
  raw: Record<string, unknown> | null | undefined,
): IntakeValidation {
  const source = intakeSource(entity);
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  const missingRequired: string[] = [];
  const supplied = asRecord(raw);

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
 * A typed value for one field, or null when the farmer left it blank.
 *
 * Exported so the writers do not each re-invent "empty string is not a number".
 */
export function fieldNumber(values: Record<string, string>, key: string): number | null {
  const n = toNumber(values[key]);
  return n === null ? null : n;
}

/** A trimmed string, or null. Blank means "they did not say", not "". */
export function fieldText(values: Record<string, string>, key: string): string | null {
  const t = (values[key] ?? "").trim();
  return t === "" ? null : t;
}

/** A date string as a Date, or null. */
export function fieldDate(values: Record<string, string>, key: string): Date | null {
  const d = toDateOnly(values[key]);
  return d ? new Date(d) : null;
}