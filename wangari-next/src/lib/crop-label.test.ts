import { describe, expect, it } from "vitest";
import { cropLabel } from "./crop-label";

describe("cropLabel", () => {
  it("leads with what grows, then the field it grows in", () => {
    expect(cropLabel({ cropType: "Maize", name: "land " })).toBe("Maize · land");
  });

  it("keeps a descriptive field name readable after the crop", () => {
    expect(cropLabel({ cropType: "Onions", name: "kiambu onion farm" })).toBe("Onions · kiambu onion farm");
    expect(cropLabel({ cropType: "Coffee", name: "Coffee Plantation - Block A" })).toBe(
      "Coffee · Coffee Plantation - Block A",
    );
  });

  it("does not repeat itself when the field is just named after the crop", () => {
    expect(cropLabel({ cropType: "Avocado", name: "Avocado" })).toBe("Avocado");
    expect(cropLabel({ cropType: "Tea", name: " tea " })).toBe("Tea");
  });

  it("falls back to whichever name exists", () => {
    expect(cropLabel({ cropType: "", name: "Plot 4" })).toBe("Plot 4");
    expect(cropLabel({ cropType: "Maize", name: null })).toBe("Maize");
    expect(cropLabel({ cropType: null, name: "   " })).toBe("Crop");
    expect(cropLabel({})).toBe("Crop");
    expect(cropLabel(null)).toBe("Crop");
    expect(cropLabel(undefined)).toBe("Crop");
  });
});
