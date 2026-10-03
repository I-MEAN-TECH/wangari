import { describe, it, expect } from "vitest";
import {
  normalisePhone,
  isValidPhone,
  formatPhoneForDisplay,
  maskPhone,
  phoneErrorMessage,
  KE_PREFIX,
} from "./phone.js";

describe("normalisePhone", () => {
  it("keeps a correct local number as-is", () => {
    expect(normalisePhone("0712345678")).toBe(`${KE_PREFIX}712345678`);
  });

  it("strips the trunk 0", () => {
    expect(normalisePhone("0712345678")).toBe(normalisePhone("712345678"));
  });

  it("accepts the +254 international form", () => {
    expect(normalisePhone("+254712345678")).toBe(`${KE_PREFIX}712345678`);
  });

  it("accepts a bare 254 form", () => {
    expect(normalisePhone("254712345678")).toBe(`${KE_PREFIX}712345678`);
  });

  it("treats every spacing a farmer might type as the same person", () => {
    const expected = `${KE_PREFIX}712345678`;
    for (const typed of [
      "0712 345 678",
      "0712-345-678",
      "0712.345.678",
      "  0712345678  ",
      "+254 712 345 678",
      "+254-712-345-678",
      "(0712) 345678",
    ]) {
      expect(normalisePhone(typed), typed).toBe(expected);
    }
  });

  // The whole reason this module exists: one farmer, one account. If any two of
  // these disagree, that farmer can sign up twice and lose their farm.
  it("collapses every known spelling of one number to a single identity", () => {
    const variants = ["0712345678", "+254712345678", "254 712 345 678", "0712345678 "];
    const unique = new Set(variants.map(normalisePhone));
    expect(unique.size).toBe(1);
  });

  it("accepts the newer 1-series mobile range", () => {
    expect(normalisePhone("0112345678")).toBe(`${KE_PREFIX}112345678`);
  });

  it("rejects an empty value", () => {
    expect(normalisePhone("")).toBe("empty");
    expect(normalisePhone("   ")).toBe("empty");
    expect(normalisePhone(undefined)).toBe("empty");
    expect(normalisePhone(null)).toBe("empty");
    expect(normalisePhone(712345678)).toBe("empty"); // a number, not a string
  });

  it("rejects a number that is too short", () => {
    expect(normalisePhone("071234")).toBe("too_short");
  });

  it("rejects a number that is too long", () => {
    expect(normalisePhone("07123456789")).toBe("too_long");
    expect(normalisePhone("+25471234567890")).toBe("too_long");
  });

  // A landline is 9 digits like a mobile, so a length-only check would let
  // Nairobi landlines through — and those cannot receive an OTP.
  it("rejects a landline-shaped number", () => {
    expect(normalisePhone("0201234567")).toBe("not_mobile"); // Nairobi landline
    expect(normalisePhone("0501234567")).toBe("not_mobile"); // Mombasa landline
  });

  it("rejects a number from another country rather than guessing", () => {
    expect(normalisePhone("+14155552671")).toBe("bad_start");
    expect(normalisePhone("+447700900123")).toBe("bad_start");
  });

  it("reads through the common +254-then-trunk-0 typo", () => {
    // A farmer copying their local number and adding 254 in front. It is
    // obviously the same number, so refusing it would only make a support call.
    expect(normalisePhone("+2540712345678")).toBe(`${KE_PREFIX}712345678`);
  });
});

describe("isValidPhone", () => {
  it("is true only for a normalisable number", () => {
    expect(isValidPhone("0712345678")).toBe(true);
    expect(isValidPhone("071234")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });

  it("never treats a rejection code as a valid number", () => {
    // The trap: every error code is a non-empty string, so a naive
    // `typeof result === "string"` would admit "too_short" into the database.
    for (const bad of ["071", "", "0201234567", "+14155552671"]) {
      expect(isValidPhone(bad), bad).toBe(false);
    }
  });
});

describe("formatPhoneForDisplay", () => {
  it("renders in the grouped local style a farmer recognises", () => {
    expect(formatPhoneForDisplay(`${KE_PREFIX}712345678`)).toBe("0712 345 678");
  });

  it("returns empty for anything that is not a stored Kenyan number", () => {
    expect(formatPhoneForDisplay(null)).toBe("");
    expect(formatPhoneForDisplay("")).toBe("");
    expect(formatPhoneForDisplay("nonsense")).toBe("");
  });
});

describe("maskPhone", () => {
  it("keeps the country code and the last three digits", () => {
    expect(maskPhone(`${KE_PREFIX}712345678`)).toBe(`${KE_PREFIX}•••••678`);
  });

  it("hides the digits a chair must not need", () => {
    const masked = maskPhone(`${KE_PREFIX}712345678`);
    expect(masked).not.toContain("1234");
  });

  it("returns empty for a missing number rather than a broken mask", () => {
    expect(maskPhone(null)).toBe("");
    expect(maskPhone("")).toBe("");
  });
});

describe("phoneErrorMessage", () => {
  it("gives a distinct, non-technical message for every rejection", () => {
    const errors = ["empty", "too_short", "too_long", "bad_start", "not_mobile"] as const;
    const messages = errors.map(phoneErrorMessage);
    expect(new Set(messages).size).toBe(errors.length);
    for (const m of messages) expect(m.length).toBeGreaterThan(10);
  });

  it("tells the farmer what a valid number looks like", () => {
    expect(phoneErrorMessage("bad_start")).toContain("0712");
  });
});