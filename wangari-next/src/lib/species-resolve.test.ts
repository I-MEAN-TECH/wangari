import { describe, it, expect } from "vitest";
import {
  resolveSpecies,
  speciesFor,
  cattleDirection,
} from "./species-resolve";
import { speciesTemplates } from "./species-templates";

/**
 * Regression tests for the reported bug: a farmer added cows and was shown
 * "Starter Mash — 110-120g per bird".
 *
 * The old code was `speciesTemplates[flock.type] || speciesTemplates.layers`.
 * Every test here is written against the consequence of that fallback, not
 * against the implementation, so the suite keeps its value if the lookup is
 * rewritten.
 */
describe("resolveSpecies", () => {
  it("never shows poultry advice for an animal that is not poultry", () => {
    const livestock = [
      { type: "cattle_dairy", category: "livestock", breed: "Ayrshire" },
      { type: "cattle_beef", category: "livestock", breed: "Hereford" },
      { type: "goats", category: "livestock", breed: "Boer" },
      { type: "sheep", category: "livestock", breed: "Dorper" },
      { type: "pigs", category: "livestock", breed: "Landrace" },
      { type: "rabbits", category: "livestock", breed: "New Zealand" },
      { type: "fish", category: "aquaculture", breed: "Tilapia" },
      { type: "bees", category: "other", breed: "Kiganda" },
    ];

    for (const lookup of livestock) {
      const t = speciesFor(lookup);
      expect(t, `${lookup.type} must resolve`).not.toBeNull();
      expect(t!.category, `${lookup.type} resolved to ${t!.category}`).not.toBe("poultry");
      // The literal symptom: per-bird feed language.
      expect(t!.feedPerDay, `${lookup.type} feed text`).not.toMatch(/per bird/i);
      expect(t!.feedTypes.join(" "), `${lookup.type} feed list`).not.toMatch(/mash/i);
    }
  });

  it("gives dairy cattle cattle feed, not mash", () => {
    const dairy = speciesFor({ type: "cattle_dairy", category: "livestock" })!;
    expect(dairy.name).toBe("Dairy Cattle");
    expect(dairy.feedPerDay).toMatch(/kg per cow/i);
    expect(dairy.vaccinationSchedule.map((v) => v.vaccine).join(" ")).toMatch(
      /Blackquarter|Anthrax/
    );
  });

  it("still resolves poultry correctly — the fallback was never the problem", () => {
    expect(speciesFor({ type: "layers", category: "poultry" })!.name).toMatch(/Layers/);
    expect(speciesFor({ type: "broilers", category: "poultry" })!.name).toMatch(/Broilers/);
  });

  it("recovers cattle from breed when type was lost offline", () => {
    // This is the reported case: an offline write returns { queued: true },
    // so the caller has a flock object with no type at all.
    const dairy = speciesFor({ category: "livestock", breed: "Ayrshire" });
    expect(dairy?.name).toBe("Dairy Cattle");

    const beef = speciesFor({ category: "livestock", breed: "Hereford" });
    expect(beef?.name).toBe("Beef Cattle");
  });

  it("returns null for a genuinely unknown animal rather than inventing poultry", () => {
    const r = resolveSpecies({ type: "unrecognised-thing", category: "livestock" });
    expect(r.template).toBeNull();
    expect(r.match).toBe("none");
    expect(r.reason).toMatch(/do not know/i);
    // The old code returned layers here. That is the bug, stated as a test.
    expect(r.template).not.toBe(speciesTemplates.layers);
  });

  it("returns null when it has nothing to go on", () => {
    expect(resolveSpecies({}).template).toBeNull();
    expect(resolveSpecies({ type: null, category: null }).template).toBeNull();
  });

  it("reports how it identified the species", () => {
    expect(resolveSpecies({ type: "goats" }).match).toBe("exact");
    expect(resolveSpecies({ category: "livestock", breed: "Ayrshire" }).match).toBe("breed");
  });

  it("accepts every id the species library defines", () => {
    for (const id of Object.keys(speciesTemplates)) {
      expect(speciesFor({ type: id }), `id ${id} must resolve`).not.toBeNull();
    }
  });

  it("survives a whitespace or case difference in stored type", () => {
    expect(speciesFor({ type: "  Cattle_Dairy " })?.name).toBe("Dairy Cattle");
    expect(speciesFor({ type: "GOATS" })?.name).toBe("Goats");
  });
});

describe("cattleDirection", () => {
  it("reads real Kenyan and international dairy breeds", () => {
    for (const b of ["Ayrshire", "Friesian", "Holstein", "Jersey", "Brown Swiss"]) {
      expect(cattleDirection(b), b).toBe("dairy");
    }
  });

  it("reads beef breeds", () => {
    for (const b of ["Hereford", "Angus", "Sahiwal", "Boran", "Charolais"]) {
      expect(cattleDirection(b), b).toBe("beef");
    }
  });

  it("admits when a breed tells us nothing instead of guessing", () => {
    expect(cattleDirection("Mystery Cow")).toBeNull();
    expect(cattleDirection("")).toBeNull();
    expect(cattleDirection(null)).toBeNull();
  });

  it("prefers dairy when a name mentions both", () => {
    // "Friesian Beef" is rare, but dairy-first is the safer default for a
    // farmer who wrote a confusing name.
    expect(cattleDirection("Friesian Beef")).toBe("dairy");
  });
});