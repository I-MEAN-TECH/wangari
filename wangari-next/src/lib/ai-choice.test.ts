import { describe, it, expect } from "vitest";
import {
  answerFromTap,
  choicePrompt,
  customAnswerHint,
  isUsableChoice,
  usableOptions,
  type FarmerChoice,
} from "./ai-choice";

/**
 * The rules behind the tap-to-answer card, without the card.
 *
 * The panel cannot be rendered here — it is a client component and this suite
 * runs in node, where useEffect does not run — so the decisions live in
 * ai-choice.ts as plain functions and these test them.
 */

const choice = (over: Partial<FarmerChoice> = {}): FarmerChoice => ({
  id: "q1",
  question: "Which breed are they?",
  options: [
    { value: "Sasso", label: "Sasso" },
    { value: "Kienyeji", label: "Kienyeji" },
    { value: "BRR", label: "Bomet Rhode Red" },
  ],
  allowCustom: true,
  ...over,
});

describe("isUsableChoice", () => {
  it("accepts a real question", () => {
    expect(isUsableChoice(choice())).toBe(true);
  });

  it("refuses one option, which is not a choice", () => {
    // Rendered as a card with a single button it reads as a broken form.
    expect(isUsableChoice(choice({ options: [{ value: "Sasso", label: "Sasso" }] }))).toBe(false);
  });

  it("refuses no options at all, which is just typing with extra steps", () => {
    expect(isUsableChoice(choice({ options: [] }))).toBe(false);
  });

  it("refuses a blank question, even with options", () => {
    expect(isUsableChoice(choice({ question: "   " }))).toBe(false);
  });

  it("refuses nothing at all, rather than throwing", () => {
    expect(isUsableChoice(null)).toBe(false);
    expect(isUsableChoice(undefined)).toBe(false);
  });
});

describe("usableOptions", () => {
  it("keeps order, which is the order Wangari meant", () => {
    expect(usableOptions(choice().options).map((o) => o.label)).toEqual([
      "Sasso",
      "Kienyeji",
      "Bomet Rhode Red",
    ]);
  });

  it("drops a duplicate that differs only in capitalisation", () => {
    // Two identical buttons read as a rendering bug, not an invitation.
    const out = usableOptions([
      { value: "sasso", label: "Sasso" },
      { value: "SASSO", label: "SASSO" },
      { value: "k", label: "Kienyeji" },
    ]);
    expect(out.map((o) => o.label)).toEqual(["Sasso", "Kienyeji"]);
  });

  it("drops blanks, so a stray empty button cannot be tapped", () => {
    const out = usableOptions([
      { value: "a", label: "Sasso" },
      { value: "", label: "   " },
    ]);
    expect(out).toHaveLength(1);
  });

  it("falls back to the value when the label is missing", () => {
    const out = usableOptions([{ value: "layers", label: "" }]);
    expect(out[0].label).toBe("layers");
  });

  it("survives nothing at all", () => {
    expect(usableOptions(null)).toEqual([]);
    expect(usableOptions(undefined)).toEqual([]);
  });
});

describe("answerFromTap", () => {
  it("sends the farmer's own word, unchanged", () => {
    // Anything wrapped around it ("you chose: Sasso") is noise the model has to
    // read past, and the label is already exactly what the form expects.
    expect(answerFromTap("Bomet Rhode Red")).toBe("Bomet Rhode Red");
  });

  it("trims the edges a tap cannot produce but a paste can", () => {
    expect(answerFromTap("  Sasso  ")).toBe("Sasso");
  });
});

describe("choicePrompt", () => {
  it("names the field it fills, when Wangari said which", () => {
    expect(choicePrompt(choice({ forField: "breed" }))).toMatch(/breed/);
  });

  it("stays plain when she did not", () => {
    expect(choicePrompt(choice())).toBe("Tap one to answer");
  });

  it("always offers a way out, because a list is a guide not a cage", () => {
    expect(customAnswerHint()).toMatch(/Type your own/i);
  });
});