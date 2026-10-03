import { describe, it, expect } from "vitest";
import {
  makeJoinCode,
  makeInviteCode,
  normaliseJoinCode,
  normaliseInviteCode,
  CODE_ALPHABET,
  AMBIGUOUS,
  INVITE_CODE_LENGTH,
  codeEntropy,
} from "./coop-code.js";

/** Deterministic pseudo-random so failures reproduce. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("makeJoinCode", () => {
  it("produces the four-letter four-digit shape", () => {
    expect(makeJoinCode()).toMatch(/^[A-Z]{4}-\d{4}$/);
  });

  it("never uses a letter a chair could mishear", () => {
    // I, L and O read aloud are the classic failures. A chair saying "KI-UMBO"
    // and typing "KLUMBO" must land on the same code.
    for (let i = 0; i < 500; i++) {
      expect(makeJoinCode()).not.toMatch(/[ILO]/);
    }
  });

  it("does not vary the letters within a single call", () => {
    // Seeded generator makes this reproducible rather than flaky.
    const a = makeJoinCode(seeded(7));
    const b = makeJoinCode(seeded(7));
    expect(a).toBe(b);
  });

  it("spreads across many distinct codes", () => {
    const seen = new Set(Array.from({ length: 400 }, () => makeJoinCode()));
    expect(seen.size).toBeGreaterThan(390);
  });

  it("always keeps four digits even when the number starts at zero", () => {
    // "KIUMBO-0042", not "KIUMBO-42": a variable width is one more way for two
    // codes to look identical.
    for (let i = 0; i < 300; i++) {
      expect(makeJoinCode().split("-")[1]).toHaveLength(4);
    }
  });
});

describe("makeInviteCode", () => {
  it("produces the documented length", () => {
    expect(makeInviteCode()).toHaveLength(INVITE_CODE_LENGTH);
  });

  it("uses only unambiguous characters", () => {
    for (let i = 0; i < 500; i++) {
      const code = makeInviteCode();
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
      for (const bad of AMBIGUOUS) expect(code).not.toContain(bad);
    }
  });

  it("spreads widely enough not to be guessable", () => {
    const seen = new Set(Array.from({ length: 800 }, () => makeInviteCode()));
    expect(seen.size).toBeGreaterThan(780);
  });

  it("offers at least 100 million possibilities", () => {
    // A 6-character code a farmer can be asked to type must not be enumerable
    // in a meaningful number of attempts.
    expect(codeEntropy(INVITE_CODE_LENGTH)).toBeGreaterThan(26);
  });
});

describe("normaliseJoinCode", () => {
  it("accepts the code however it was typed", () => {
    // NOTE the fixtures use only letters the generator can actually produce.
    // An earlier version of this test used "KIUMBO", which contains I — a code
    // we would never have issued, so the test was asserting the wrong thing.
    for (const typed of ["NKUR-1234", "nkur-1234", "NKUR 1234", " nkur1234 ", "N-K-U-R-1234"]) {
      expect(normaliseJoinCode(typed), typed).toBe("NKUR-1234");
    }
  });

  it("round-trips a generated code", () => {
    const code = makeJoinCode();
    expect(normaliseJoinCode(code)).toBe(code);
    expect(normaliseJoinCode(code.toLowerCase())).toBe(code);
  });

  it("rejects anything that is not the right shape", () => {
    expect(normaliseJoinCode("ABC-1234")).toBeNull(); // too short
    expect(normaliseJoinCode("ABCDE-1234")).toBeNull(); // too long
    expect(normaliseJoinCode("KIUMBO-12345")).toBeNull();
    expect(normaliseJoinCode("1234-1234")).toBeNull();
    expect(normaliseJoinCode("")).toBeNull();
    expect(normaliseJoinCode(null)).toBeNull();
    expect(normaliseJoinCode(1234)).toBeNull();
  });

  it("rejects I and L in the letter block, which the generator cannot produce", () => {
    // If someone submits "NKIL-1234" it is a typo or a guess, not a code we
    // ever issued, and silently normalising it would look like a match.
    expect(normaliseJoinCode("NKIL-1234")).toBeNull();
    expect(normaliseJoinCode("NKOU-1234")).toBeNull();
  });
});

describe("normaliseInviteCode", () => {
  it("accepts a generated code in any case or spacing", () => {
    const code = makeInviteCode();
    expect(normaliseInviteCode(code.toLowerCase())).toBe(code);
    expect(normaliseInviteCode(` ${code} `)).toBe(code);
  });

  it("rejects a code of the wrong length", () => {
    expect(normaliseInviteCode("ABC")).toBeNull();
    expect(normaliseInviteCode("ABCDEFGH")).toBeNull();
  });

  it("rejects an ambiguous character the generator never emits", () => {
    expect(normaliseInviteCode("ABCD0F")).toBeNull(); // 0
    expect(normaliseInviteCode("ABODEF")).toBeNull(); // contains O
    expect(normaliseInviteCode("AB1DEF")).toBeNull(); // contains 1
    expect(normaliseInviteCode("ABIDEF")).toBeNull(); // contains I
    expect(normaliseInviteCode("ABLDEF")).toBeNull(); // contains L
  });

  it("rejects non-strings and blanks", () => {
    expect(normaliseInviteCode("")).toBeNull();
    expect(normaliseInviteCode("      ")).toBeNull();
    expect(normaliseInviteCode(undefined)).toBeNull();
  });
});