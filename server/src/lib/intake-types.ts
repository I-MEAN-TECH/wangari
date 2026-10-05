/**
 * The types every guided intake shares.
 *
 * They live in their own file so the questions (intake-registry.ts) and the
 * machinery that reads them (farm-intake.ts) can both depend on them without
 * importing each other. An earlier version kept the types beside the engine
 * and had the definitions import them back — a cycle that works only because
 * TypeScript erases type-only imports, which is a trap for whoever edits it
 * next.
 */

export type IntakeEntity =
  | "flock"
  | "crop"
  | "worker"
  | "customer"
  | "inventory"
  | "transaction"
  | "sale"
  | "invoice"
  | "production"
  | "vaccination"
  | "attendance";

export interface IntakeOption {
  value: string;
  label: string;
}

export type IntakeFieldType = "text" | "textarea" | "number" | "money" | "select" | "date";

export interface IntakeField {
  /** The column this fills. One name, used for storage and for the form. */
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

export interface IntakeSource {
  entity: IntakeEntity;
  /** The card's heading, in the imperative: "Add your livestock". */
  title: string;
  /**
   * The bare noun, used in the sentence Wangari says: "the livestock form".
   *
   * Derived from `title` it reads "the add your livestock form", which is
   * grammatical and useless — caught by running the bare case live and reading
   * what she actually said.
   */
  formNoun: string;
  /** Which plan module gates this, so the AI and the screen obey one rule. */
  module: string;
  intro: string;
  sections: IntakeSection[];
  /**
   * Words the MODEL uses for these fields, mapped onto ours.
   *
   * The model reads "add 200 Sasso layers called Sasso Kenya, 500 bob each" and
   * has to hand those facts over in our names. Getting this wrong is not a
   * crash, it is worse: the farmer's own words are silently dropped and the form
   * opens blank on a detail they had already typed. So the aliases exist, and
   * every one of them is a word a farmer actually says.
   */
  aliases: Record<string, string>;
}

/** What the server sends the farmer's browser to draw the form. */
export interface IntakeCard {
  entity: IntakeEntity;
  title: string;
  intro: string;
  sections: IntakeSection[];
  /** Field key → what is already filled in, as strings. */
  values: Record<string, string>;
  /** Labels still needed before it can be saved. */
  missingRequired: string[];
  /** Labels that would be nice, in the farmer's language. */
  missingOptional: string[];
  filled: number;
  total: number;
  /**
   * One line the model reads out so the farmer knows what is being asked for,
   * in the same words as the form. Never a status code, never a count.
   */
  ask: string;
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
 * A question the farmer answers by TAPPING rather than typing.
 *
 * The reason this exists: "which breed is it?" has four right answers and a
 * farmer should not have to spell one of them on a phone with one hand in the
 * sun. Asking in words costs a request on the free tier and produces "Sasso
 * kenya layers" in whatever spelling the farmer chose, which then has to be
 * matched back to a breed. A list of options has neither problem.
 */
export interface IntakeChoiceOption {
  /** What the model gets, so it can use it as a value. */
  value: string;
  /** What the farmer reads and taps. */
  label: string;
}

export interface IntakeChoice {
  /** Correlates the card with the answer. Never trusted for anything. */
  id: string;
  question: string;
  options: IntakeChoiceOption[];
  /**
   * True when the farmer may answer with their own words instead. Set it when
   * the list is a guide, not the whole world — always saying "pick one of these"
   * about a breed that is not on the list produces a wrong record.
   */
  allowCustom: boolean;
  /** The form this answer feeds, so the client can say what happens next. */
  forEntity?: IntakeEntity;
  forField?: string;
}