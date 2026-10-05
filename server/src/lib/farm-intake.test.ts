import { describe, it, expect } from "vitest";
import {
  buildIntake,
  cleanField,
  intakeKeys,
  isIntakeEntity,
  prefillIntake,
  toFlockCreateInput,
  validateIntake,
  intakeSource,
  type IntakeField,
} from "./farm-intake.js";

const countField: IntakeField = {
  key: "initialCount",
  label: "How many animals",
  type: "number",
  required: true,
  integer: true,
  min: 1,
};
const moneyField: IntakeField = { key: "costPerAnimal", label: "Cost per Animal (KES)", type: "money", min: 0 };
const dateField: IntakeField = { key: "hatchDate", label: "Date you got them", type: "date" };

describe("cleanField — one answer, one honest value", () => {
  it("forgives thousands separators and a currency mark, because farmers type them", () => {
    expect(cleanField(moneyField, "1,200")).toBe("1200");
    expect(cleanField(moneyField, "KES 450")).toBe("450");
    expect(cleanField(moneyField, " 60 000 ")).toBe("60000");
  });

  it("treats an empty number as absent rather than as zero", () => {
    // The bug this guards: `Number("")` is 0, which silently creates a flock
    // of no birds and a cost of nothing.
    expect(cleanField(moneyField, "")).toBeNull();
    expect(cleanField(moneyField, "   ")).toBeNull();
    expect(cleanField(moneyField, null)).toBeNull();
    expect(cleanField(moneyField, "KES")).toBeNull();
  });

  it("refuses a count that is not whole animals", () => {
    expect(cleanField(countField, "200")).toBe("200");
    expect(cleanField(countField, "12.5")).toBeNull();
    expect(cleanField(countField, "0")).toBeNull();
    expect(cleanField(countField, "-4")).toBeNull();
  });

  it("rejects a date that does not exist rather than rolling it over", () => {
    expect(cleanField(dateField, "2026-10-12")).toBe("2026-10-12");
    // new Date("2026-02-31") becomes 3 March; a farmer's birthday is not that.
    expect(cleanField(dateField, "2026-02-31")).toBeNull();
    expect(cleanField(dateField, "12/10/2026")).toBeNull();
    expect(cleanField(dateField, "")).toBeNull();
  });
});

describe("prefillIntake — the farmer's own words, mapped onto our names", () => {
  it("follows the aliases a farmer would actually use", () => {
    const pre = prefillIntake("flock", {
      flockName: "Sasso Kenya",
      count: 200,
      breed: "Sasso",
      deaths: 0,
      pen: "Pen A",
      supplier: "Mamboeo market",
      pricePerAnimal: 500,
      vet: "Dr Ochieng",
      firstTag: "1410001",
      lastTag: "1410200",
    });
    expect(pre).toMatchObject({
      name: "Sasso Kenya",
      initialCount: "200",
      breed: "Sasso",
      mortality: "0",
      location: "Pen A",
      source: "Mamboeo market",
      costPerAnimal: "500",
      vetName: "Dr Ochieng",
      tagFrom: "1410001",
      tagTo: "1410200",
    });
  });

  it("drops a key that is not a field, so nothing invented reaches the database", () => {
    const pre = prefillIntake("flock", { name: "Broilers", nonsense: "x", isAdmin: true });
    expect(pre).toEqual({ name: "Broilers" });
  });

  it("drops an unusable answer instead of guessing at it", () => {
    const pre = prefillIntake("flock", { name: "Flock A", initialCount: "many", breed: "" });
    expect(pre.initialCount).toBeUndefined();
    expect(pre.breed).toBeUndefined();
    expect(pre.name).toBe("Flock A");
  });

  it("survives a model that sends nothing, or sends nonsense", () => {
    expect(prefillIntake("flock", null)).toEqual({});
    expect(prefillIntake("flock", undefined)).toEqual({});
    expect(prefillIntake("flock", "not an object" as any)).toEqual({});
  });
});

describe("buildIntake — the card the farmer is shown", () => {
  it("carries the seven sections the livestock screen already has", () => {
    const card = buildIntake("flock", {});
    const titles = card.sections.map((s) => s.title);
    expect(titles).toEqual([
      "Basic Info",
      "Location & Housing",
      "Source & Cost",
      "Feed Plan",
      "Veterinarian & Health",
      "Production Target",
      "Insurance & Notes",
      "ANITRAC Tags",
    ]);
  });

  it("covers every extended column the flock screen can store", () => {
    // If one of these is missing from the intake, the AI is back to asking the
    // farmer for a name and a number and nothing else.
    const keys = intakeKeys("flock");
    for (const key of [
      "name", "initialCount", "type", "status", "breed", "mortality", "purpose",
      "gender", "genderRatio", "hatchDate", "location", "source",
      "supplierContact", "costPerAnimal", "targetMarket", "feedType",
      "feedSupplier", "feedCostPerMonth", "vetName", "vetPhone",
      "healthOnArrival", "insurancePolicy", "expectedYield", "expectedWeight",
      "expectedRevenue", "notes", "tagFrom", "tagTo",
    ]) {
      expect(keys, `${key} is missing from the intake`).toContain(key);
    }
  });

  it("asks for the two things it cannot do without", () => {
    const card = buildIntake("flock", {});
    expect(card.missingRequired).toEqual(["Flock Name", "How many animals"]);
    expect(card.ask).toMatch(/flock name/i);
    expect(card.ask).toMatch(/how many animals/i);
  });

  it("opens with the farmer's own words already in it", () => {
    const card = buildIntake("flock", {}, { name: "Sasso Kenya", count: 200 });
    expect(card.values.name).toBe("Sasso Kenya");
    expect(card.values.initialCount).toBe("200");
    expect(card.missingRequired).toEqual([]);
    expect(card.filled).toBe(2);
    expect(card.total).toBeGreaterThan(20);
    expect(card.ask).toMatch(/leave those blank and save now/i);
  });

  it("says the gaps are optional once the required two are known", () => {
    const card = buildIntake("flock", {}, { name: "Sasso Kenya", count: 200 });
    expect(card.missingOptional.length).toBeGreaterThan(5);
    expect(card.ask).toMatch(/leave those blank and save now/i);
  });

  it("never counts a default as an answer", () => {
    // `status` defaults to active on the database, but the farmer has not said
    // so, and a card claiming 1 of 2 filled when nothing was asked is a lie.
    const card = buildIntake("flock", {});
    expect(card.values.status).toBeUndefined();
  });

  it("lets the farmer's own answers win over the model's guesses", () => {
    const card = buildIntake("flock", { breed: "Kienyeji" }, { breed: "Sasso" });
    expect(card.values.breed).toBe("Kienyeji");
  });
});

describe("validateIntake — nothing reaches the database unasked for", () => {
  it("accepts a form with only the required pair", () => {
    const result = validateIntake("flock", { name: "Sasso Kenya", initialCount: "200" });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("names the field, in words, when something required is missing", () => {
    const result = validateIntake("flock", { name: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.name).toMatch(/flock name is needed/i);
    expect(result.missingRequired).toEqual(["name", "initialCount"]);
  });

  it("does NOT let an empty number read as zero", () => {
    // The failure this exists for: a cleared count becoming 0, and a flock of
    // zero birds being saved as though the farmer had said so.
    const result = validateIntake("flock", { name: "Flock A", initialCount: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.initialCount).toMatch(/how many animals is needed/i);
  });

  it("reports a number the farmer could not have meant, rather than dropping it", () => {
    const result = validateIntake("flock", { name: "Flock A", initialCount: "twenty" });
    expect(result.ok).toBe(false);
    expect(result.errors.initialCount).toMatch(/use a number of 1 or more, not "twenty"/i);
  });

  it("refuses an option that is not on the list", () => {
    const result = validateIntake("flock", { name: "F", initialCount: "10", purpose: "altruistic" });
    expect(result.ok).toBe(false);
    expect(result.errors.purpose).toMatch(/choose one of the options/i);
  });

  it("accepts an option spoken rather than selected", () => {
    const result = validateIntake("flock", { name: "F", initialCount: "10", purpose: "Production" });
    expect(result.ok).toBe(true);
    expect(result.values.purpose).toBe("production");
  });

  it("survives an empty body", () => {
    const result = validateIntake("flock", null);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).length).toBeGreaterThan(0);
  });

  it("returns the cleaned answers, not the raw ones", () => {
    const result = validateIntake("flock", {
      name: "  Sasso Kenya  ",
      initialCount: "200",
      costPerAnimal: "KES 1,200",
      hatchDate: "2026-10-12",
    });
    expect(result.values).toMatchObject({
      name: "Sasso Kenya",
      costPerAnimal: "1200",
      hatchDate: "2026-10-12",
    });
  });
});

describe("toFlockCreateInput — the line between the form and the database", () => {
  it("turns strings into the types Prisma wants", () => {
    const result = toFlockCreateInput({
      name: "Sasso Kenya",
      initialCount: "200",
      costPerAnimal: "500",
      feedCostPerMonth: "24000",
      expectedRevenue: "600000",
      mortality: "3",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      name: "Sasso Kenya",
      initialCount: 200,
      costPerAnimal: 500,
      feedCostPerMonth: 24000,
      expectedRevenue: 600000,
      mortality: 3,
      totalInvestment: 100000,
    });
  });

  it("writes blanks as null, never as an empty string or a zero", () => {
    const result = toFlockCreateInput({ name: "Flock A", initialCount: "10" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const key of ["breed", "location", "vetName", "feedCostPerMonth", "notes", "tagFrom"]) {
      expect(result.data[key], `${key} should be null`).toBeNull();
    }
    expect(result.data.costPerAnimal).toBeNull();
    expect(result.data.totalInvestment).toBeNull();
  });

  it("defaults status to active, which is what a new flock is", () => {
    const result = toFlockCreateInput({ name: "Flock A", initialCount: "10" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("active");
  });

  it("refuses without a name, in a sentence rather than a Prisma error", () => {
    const result = toFlockCreateInput({ initialCount: "10" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/name/i);
  });

  it("refuses a count of nothing", () => {
    for (const count of ["0", "-5", "", "abc"]) {
      const result = toFlockCreateInput({ name: "Flock A", initialCount: count });
      expect(result.ok, `count "${count}" should be refused`).toBe(false);
    }
  });
});

describe("isIntakeEntity", () => {
  it("knows what it has a form for, and nothing else", () => {
    expect(isIntakeEntity("flock")).toBe(true);
    expect(isIntakeEntity("crop")).toBe(false);
    expect(isIntakeEntity("__proto__")).toBe(false);
    expect(isIntakeEntity("constructor")).toBe(false);
    expect(isIntakeEntity(undefined)).toBe(false);
  });

  it("exposes the source for the entity that exists", () => {
    expect(intakeSource("flock").title).toBe("Add your livestock");
  });
});