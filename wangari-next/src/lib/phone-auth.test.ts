import { describe, it, expect } from "vitest";
import { formatPhoneInput, phoneDigitsOnly, sanitisePin } from "./phone-auth";

describe("formatPhoneInput", () => {
  it("groups the familiar local style as the farmer types", () => {
    expect(formatPhoneInput("0")).toBe("0");
    expect(formatPhoneInput("07")).toBe("07");
    expect(formatPhoneInput("0712")).toBe("0712");
    expect(formatPhoneInput("07123")).toBe("0712 3");
    expect(formatPhoneInput("071234")).toBe("0712 34");
    expect(formatPhoneInput("0712345")).toBe("0712 345");
    expect(formatPhoneInput("07123456")).toBe("0712 345 6");
    expect(formatPhoneInput("071234567")).toBe("0712 345 67");
    expect(formatPhoneInput("0712345678")).toBe("0712 345 678");
  });

  it("groups the international form", () => {
    expect(formatPhoneInput("+254712345678")).toBe("254 712 345 678");
  });

  it("strips formatting a farmer pasted in", () => {
    expect(formatPhoneInput("(0712) 345-678")).toBe("0712 345 678");
    expect(formatPhoneInput(" 0712 345 678 ")).toBe("0712 345 678");
  });

  it("returns empty for empty or non-numeric input", () => {
    expect(formatPhoneInput("")).toBe("");
    expect(formatPhoneInput("abc")).toBe("");
  });

  // Never longer than a Kenyan number: the server is the real gate, but a UI
  // that lets a farmer type 20 digits then rejects it is a bad experience.
  it("caps the length", () => {
    expect(formatPhoneInput("0712345678999").replace(/\D/g, "")).toHaveLength(10);
  });
});

describe("phoneDigitsOnly", () => {
  it("reduces any spelling to the digits the server expects", () => {
    expect(phoneDigitsOnly("0712 345 678")).toBe("0712345678");
    expect(phoneDigitsOnly("+254 712 345 678")).toBe("254712345678");
    expect(phoneDigitsOnly("(0712)345-678")).toBe("0712345678");
  });

  it("is empty for nothing", () => {
    expect(phoneDigitsOnly("")).toBe("");
  });
});

describe("sanitisePin", () => {
  it("keeps only digits and caps at four", () => {
    expect(sanitisePin("12a34")).toBe("1234");
    expect(sanitisePin("1")).toBe("1");
    expect(sanitisePin("1 2 3 4")).toBe("1234");
    expect(sanitisePin("999999")).toBe("9999");
    expect(sanitisePin("12345")).toBe("1234");
  });

  it("drops letters entirely rather than silently ignoring them", () => {
    // If letters were ignored, "abcd" would arrive as an empty PIN and the form
    // would submit with no feedback about why.
    expect(sanitisePin("abcd")).toBe("");
  });

  it("handles empty input", () => {
    expect(sanitisePin("")).toBe("");
  });
});