/**
 * The guided intake on the client — types, the save, and the pure helpers the
 * card is built from.
 *
 * ── what this is ─────────────────────────────────────────
 * When the farmer says "add 200 Sasso layers called Sasso Kenya", Wangari used
 * to write a row with a name and a number and report it done. Now she opens a
 * form with every question the livestock screen holds, prefilled with whatever
 * she already heard, and saves nothing until the farmer confirms it.
 *
 * The questions are NOT generated here. They come down from the server
 * (lib/farm-intake.ts) inside the stream event, because there is one list of
 * them and a second copy on the client would be a second list to drift — the
 * day the two disagree, the form asks about something the app cannot store.
 *
 * ── what is pure, and why ─────────────────────────────────
 * The card's decisions — which section is next, whether the farmer may save
 * yet, how many answers are in — are functions with no React in them, so they
 * can be tested without a DOM. The panel's test environment has no DOM and
 * cannot run useEffect, which is exactly the constraint that made the admin
 * page untestable earlier; these rules are where the logic lives instead.
 */

/** Must match TOKEN_KEY in lib/ai-stream.ts, where the JWT is stored. */
const TOKEN_KEY = "wangari_token";

export interface IntakeOption {
  value: string;
  label: string;
}

export type IntakeFieldType = "text" | "textarea" | "number" | "money" | "select" | "date";

export interface IntakeField {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: IntakeOption[];
  placeholder?: string;
  hint?: string;
  integer?: boolean;
  min?: number;
}

export interface IntakeSection {
  id: string;
  title: string;
  blurb?: string;
  fields: IntakeField[];
}

export interface IntakeCard {
  entity: string;
  title: string;
  intro: string;
  sections: IntakeSection[];
  values: Record<string, string>;
  missingRequired: string[];
  missingOptional: string[];
  filled: number;
  total: number;
  ask: string;
  /** When set, the form is editing an existing record and saving uses PUT. */
  editing?: { entity: string; id: number };
}

export interface IntakeSaveResult {
  ok: true;
  entity: string;
  record: { id: number; [k: string]: unknown };
  summary: string;
  alsoCreated?: { vaccinations: number; expenseTransactionId: number | null; totalInvestment: number | null };
  warning?: string | null;
  values?: Record<string, string>;
  updated?: boolean;
  flock?: { id: number; name: string; currentCount?: number; breed?: string | null; [k: string]: unknown };
}

export interface IntakeSaveFailure {
  ok: false;
  error: string;
  /** Field key → the sentence to put under that input. */
  errors?: Record<string, string>;
  /** Required keys still empty, so the card can jump to them. */
  missingRequired?: string[];
}

export function isAnswered(field: IntakeField, value: string | undefined): boolean {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  return text !== "";
}

/**
 * May the farmer save yet?
 *
 * Only the REQUIRED fields decide. The optional ones are exactly the ones the
 * farmer may not know — a vet's name, an insurance policy — and demanding them
 * would mean the form can only be completed by someone who already had all the
 * answers, which is nobody.
 */
export function canSave(sections: IntakeSection[], values: Record<string, string>): boolean {
  return sections.every((s) =>
    s.fields.every((f) => !f.required || isAnswered(f, values[f.key])),
  );
}

/** The required fields still empty, by key. */
export function missingRequiredKeys(
  sections: IntakeSection[],
  values: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.required && !isAnswered(field, values[field.key])) out.push(field.key);
    }
  }
  return out;
}

/**
 * Where the card opens, so the farmer is never sent to a page they have already
 * answered.
 *
 * Two stages, and the order matters. First: the section holding a missing
 * REQUIRED answer, because nothing can be saved without it. Only when those
 * are all answered do we fall back to the first section with anything still
 * unanswered — the farmer's words already covered the essentials, so the useful
 * page to show is the TOP of what is left, not the bottom. When nothing at all
 * is left, the last section is the one holding Save.
 */
export function firstSectionNeedingAnswer(
  sections: IntakeSection[],
  values: Record<string, string>,
): number {
  const unanswered = (s: IntakeSection) => s.fields.some((f) => !isAnswered(f, values[f.key]));

  const required = sections.findIndex((s) =>
    s.fields.some((f) => f.required && !isAnswered(f, values[f.key])),
  );
  if (required >= 0) return required;

  const anyLeft = sections.findIndex(unanswered);
  if (anyLeft >= 0) return anyLeft;

  return Math.max(0, sections.length - 1);
}

/** How many of the questions have an answer, for the progress line. */
export function progressOf(sections: IntakeSection[], values: Record<string, string>) {
  const all = sections.flatMap((s) => s.fields);
  const answered = all.filter((f) => isAnswered(f, values[f.key])).length;
  return { answered, total: all.length };
}

/** The section titles, joined, for the "where am I" line. */
export function sectionLabel(sections: IntakeSection[], index: number): string {
  const section = sections[index];
  if (!section) return "";
  return `Section ${index + 1} of ${sections.length} — ${section.title}`;
}

/**
 * A one-line summary of what was saved, in the farmer's words.
 *
 * Shown after the save so the record is legible on the screen: "200 birds,
 * Sasso Kenya" tells them it worked, while a flock ID tells them nothing.
 */
export function savedSummary(flock: { name?: string; currentCount?: number; breed?: string | null }): string {
  const count = Number(flock.currentCount ?? 0);
  const animals = count === 1 ? "1 animal" : `${count} animals`;
  const breed = flock.breed ? `, ${flock.breed}` : "";
  return `${flock.name} — ${animals}${breed}`;
}

/**
 * Save the form.
 *
 * Every answer goes up, including the blanks, so the server decides what is
 * missing rather than the client. That is the difference between one place
 * knowing the rules and two disagreeing about them.
 */
export async function submitIntake(
  entity: string,
  values: Record<string, string>,
): Promise<IntakeSaveResult | IntakeSaveFailure> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  let res: Response;
  try {
    res = await fetch(`/api/ai/intake/${entity}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Sent explicitly: the JWT lives in localStorage, so the browser
        // attaches nothing on its own.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ values }),
    });
  } catch {
    return { ok: false, error: "No connection. Check your network and try again." };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* a non-JSON body still has a status to act on */
  }

  if (!res.ok) {
    return {
      ok: false,
      // The server's sentence first: it names the field, and this client has
      // nothing better to add.
      error: body?.error || "I could not save that just now. Please try again.",
      errors: body?.errors,
      missingRequired: body?.missingRequired,
    };
  }
  const result = body as IntakeSaveResult;
  // Back-compat: older server responses used `flock` for the flock entity.
  if (entity === "flock" && result.record && !result.flock) {
    result.flock = result.record as any;
  }
  return result;
}

/**
 * Update a record the farmer already saved.
 *
 * PUTs the same shape as submitIntake, but to /api/ai/intake/:entity/:id so
 * the server knows to update rather than create. Blank values keep their
 * existing value on the server.
 */
export async function updateIntake(
  entity: string,
  id: number,
  values: Record<string, string>,
): Promise<IntakeSaveResult | IntakeSaveFailure> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  let res: Response;
  try {
    res = await fetch(`/api/ai/intake/${entity}/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ values }),
    });
  } catch {
    return { ok: false, error: "No connection. Check your network and try again." };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* a non-JSON body still has a status to act on */
  }

  if (!res.ok) {
    return {
      ok: false,
      error: body?.error || "I could not update that just now. Please try again.",
      errors: body?.errors,
      missingRequired: body?.missingRequired,
    };
  }
  const result = body as IntakeSaveResult;
  if (entity === "flock" && result.record && !result.flock) {
    result.flock = result.record as any;
  }
  return result;
}

/**
 * Remove a flock saved from the chat. One tap, because undo must be cheap.
 *
 * `expenseTransactionId` is the purchase expense the SAVE created. Passing it
 * lets the backend remove that money row too — without it, undo leaves a cost
 * in the books for animals that no longer exist, which the first version of
 * this did. The backend still verifies it belongs to this flock before it
 * deletes anything, so a wrong or stale id costs nothing but a kept expense.
 */
export async function undoIntake(
  entity: string,
  id: number,
  expenseTransactionId?: number | null,
): Promise<{ ok: boolean; error?: string; expenseKeptReason?: string | null }> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  try {
    const res = await fetch(`/api/ai/intake/${entity}/${id}`, {
      method: "DELETE",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(expenseTransactionId ? { "Content-Type": "application/json" } : {}),
      },
      body: expenseTransactionId ? JSON.stringify({ expenseTransactionId }) : undefined,
    });
    const body = await res.json().catch(() => null);
    if (res.ok) return { ok: true, expenseKeptReason: body?.expenseKeptReason ?? null };
    return { ok: false, error: body?.error || "I could not remove that." };
  } catch {
    return { ok: false, error: "No connection. Try again in a moment." };
  }
}