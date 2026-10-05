/**
 * The tap-to-answer question: what Wangari is allowed to ask, and what a tap
 * turns into.
 *
 * ── why a list of buttons ────────────────────────────────
 * "Which breed is it?" has four right answers, and typing produces "sasso
 * kenya", "Sasso", "saso" and "SASSO" for the same bird. Each of those then has
 * to be matched back to something the form accepts, and the farmer has to fix
 * it if the match fails. Tapping has neither problem: they choose one of the
 * options, it comes back exactly as written, and nothing has to be guessed.
 *
 * It is also simply faster on a phone with one hand in the sun, which is how
 * most of this app is used.
 *
 * ── why the rules are here and not in the component ──────
 * The decisions that can be got wrong — is this actually a choice, is an
 * option usable, what does a tap send — are pure functions, so they can be
 * tested without a DOM. The panel is a client component and this suite runs in
 * node, where useEffect does not run.
 */

/** One answer the farmer can tap. */
export interface ChoiceOption {
  value: string;
  label: string;
}

export interface FarmerChoice {
  id: string;
  question: string;
  options: ChoiceOption[];
  /** True when the farmer may answer with their own words instead. */
  allowCustom: boolean;
  /** The field this answer fills, when Wangari said so. */
  forField?: string;
}

/**
 * Is this actually a question the farmer can answer by tapping?
 *
 * One option is not a choice, and no options at all is just a slower way of
 * typing. Both would render as a card with nothing in it, which looks broken.
 */
export function isUsableChoice(choice: FarmerChoice | null | undefined): boolean {
  if (!choice) return false;
  if (!choice.question?.trim()) return false;
  const usable = usableOptions(choice.options);
  return usable.length >= 2;
}

/**
 * The options worth showing: real labels, no duplicates, in order.
 *
 * Duplicates are dropped because Wangari sometimes offers the same breed twice
 * with different capitalisation, and a list with "Sasso" twice reads as a
 * rendering bug rather than an invitation.
 */
export function usableOptions(options: ChoiceOption[] | null | undefined): ChoiceOption[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>();
  const out: ChoiceOption[] = [];
  for (const option of options) {
    const value = String(option?.value ?? "").trim();
    const label = String(option?.label ?? "").trim() || value;
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: value || label, label });
  }
  return out;
}

/**
 * What a tap sends as the farmer's next message.
 *
 * The label, and nothing else. It is the farmer's own word for the thing, it is
 * what the model needs to file the answer, and adding "you chose:" around it
 * only makes the conversation harder for the model to read. The question is
 * already in the history above it, because Wangari's turn ends with it.
 */
export function answerFromTap(label: string): string {
  return String(label ?? "").trim();
}

/**
 * The line above the buttons.
 *
 * Says who is asking and why the answer matters, because a card with no
 * context is one the farmer cannot answer without reading back through the
 * conversation.
 */
export function choicePrompt(choice: FarmerChoice): string {
  return choice.forField?.trim()
    ? `Choose one — this fills in ${choice.forField.trim()}`
    : "Tap one to answer";
}

/** A short line for a farmer who would rather type than tap. */
export function customAnswerHint(): string {
  return "None of these? Type your own answer instead.";
}