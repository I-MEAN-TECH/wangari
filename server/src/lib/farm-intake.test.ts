import { describe, it, expect } from "vitest";
import {
  asRecord,
  buildIntake,
  cleanField,
  fieldDate,
  fieldNumber,
  fieldText,
  intakeEntities,
  intakeKeys,
  intakeModule,
  intakeSource,
  isIntakeEntity,
  prefillIntake,
  validateIntake,
  type IntakeEntity,
  type IntakeField,
} from "./farm-intake.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

const clientIntakeSrc = read("../../wangari-next/src/lib/ai-intake.ts");
const clientStreamSrc = read("../../wangari-next/src/lib/ai-stream.ts");
const serverTypesSrc = read("lib/intake-types.ts");

/** Extract field names from a TypeScript interface block. */
function fieldNames(src: string, typeName: string): string[] {
  const start = src.indexOf(`interface ${typeName}`);
  if (start === -1) return [];
  const openBrace = src.indexOf("{", start);
  if (openBrace === -1) return [];
  let depth = 1;
  let i = openBrace + 1;
  let lastBrace = openBrace;
  const lines: string[] = [];
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") depth--;
    if (depth === 1 && src[i] === "\n") {
      const line = src.slice(lastBrace + 1, i).trim();
      if (line) lines.push(line);
      lastBrace = i;
    }
    i++;
  }
  return lines.map((l) => l.split("/")[0].trim().split(":")[0].trim()).filter(Boolean);
}

describe("type drift guard — server and client stay in sync", () => {
  it("shared IntakeField fields are identical", () => {
    const server = fieldNames(serverTypesSrc, "IntakeField");
    const client = fieldNames(clientIntakeSrc, "IntakeField");
    // Client may have fewer fields (if not re-declared) but shared ones must match
    for (const f of client) expect(server).toContain(f);
  });

  it("shared IntakeSection fields are identical", () => {
    const server = fieldNames(serverTypesSrc, "IntakeSection");
    const client = fieldNames(clientIntakeSrc, "IntakeSection");
    for (const f of client) expect(server).toContain(f);
  });

  it("StreamIntake has the editing field for edit mode", () => {
    const fields = fieldNames(clientStreamSrc, "StreamIntake");
    // Strip trailing `?` so `editing?:` becomes `editing`.
    const cleaned = fields.map((f) => f.replace(/\?$/, ""));
    expect(cleaned).toContain("editing");
  });
});

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

  it("does NOT claim the farmer said things when they said nothing", () => {
    // Caught by running the bare case live and reading what she actually said:
    // "I have opened the add your livestock form with what you told me", to a
    // farmer who had said nothing. The first job of this sentence is to be
    // believed.
    const bare = buildIntake("flock", {});
    expect(bare.ask).not.toMatch(/what you told me/i);
    expect(bare.ask).toMatch(/so you can fill in the details/i);
    expect(bare.ask).toMatch(/livestock form/);
    // And never "the add your livestock form", which is grammatical and useless.
    expect(bare.ask).not.toMatch(/the add your/i);
  });

  it("does claim it once the farmer HAS said something", () => {
    const partial = buildIntake("flock", {}, { breed: "Sasso" });
    expect(partial.ask).toMatch(/what you told me/i);
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

describe("the registry covers every record the assistant can write", () => {
  const ALL = intakeEntities();

  it("has a form for each of them, and none of them is empty", () => {
    // Eleven entities: the ten thin create_* tools this replaced, plus livestock.
    expect(ALL).toContain("flock");
    expect(ALL.length).toBeGreaterThanOrEqual(11);
    for (const entity of ALL) {
      const source = intakeSource(entity);
      expect(source.sections.length, entity + " has sections").toBeGreaterThan(0);
      expect(intakeKeys(entity).length, entity + " has fields").toBeGreaterThan(1);
      expect(source.formNoun, entity + " can be named in a sentence").toBeTruthy();
      expect(source.module, entity + " is gated like its screen").toBeTruthy();
      // Field keys are unique inside a form: a duplicate would make one of them
      // unreachable and silently drop a farmer's answer.
      const keys = intakeKeys(entity);
      expect(new Set(keys).size, entity + " has no duplicate fields").toBe(keys.length);
    }
  });

  it("asks for a name on every record that is a THING", () => {
    // Money records and daily tallies have no name of their own — a
    // transaction is an amount and a description, a vaccination belongs to a
    // flock. Everything that IS a thing on the farm has one.
    const NAMELESS: IntakeEntity[] = ["transaction", "production", "attendance", "sale", "invoice", "vaccination"];
    for (const entity of ALL.filter((e) => !NAMELESS.includes(e))) {
      const keys = intakeKeys(entity);
      expect(keys, entity + " requires a name").toContain(
        entity === "inventory" ? "itemName" : "name",
      );
    }
  });

  it("asks for an amount wherever money is involved", () => {
    for (const entity of ["transaction", "sale", "invoice"] as IntakeEntity[]) {
      const card = buildIntake(entity, {});
      expect(card.missingRequired.join(), entity).toMatch(/KES/);
    }
  });

  it("does not demand what a farmer may simply not know", () => {
    // A form that will not save without a vet's phone number is a form that
    // gets abandoned, and the record is lost either way.
    for (const entity of ALL) {
      const card = buildIntake(entity, {});
      expect(card.missingRequired.length, entity + " asks only the essentials").toBeLessThanOrEqual(3);
    }
  });

  it("gates each entity on the module its own screen uses", () => {
    expect(intakeModule("flock")).toBe("flocks");
    expect(intakeModule("crop")).toBe("crops");
    expect(intakeModule("transaction")).toBe("transactions");
    expect(intakeModule("inventory")).toBe("inventory");
    expect(intakeModule("attendance")).toBe("attendance");
  });
});

describe("asRecord — whatever shape the model sends", () => {
  it("takes an object", () => {
    expect(asRecord({ name: "A" })).toEqual({ name: "A" });
  });

  it("parses a JSON string rather than opening an EMPTY form", () => {
    // A model that sends values as a string is not rare, and dropping it opens
    // a blank form on a farmer who has just said everything — the exact failure
    // the intake exists to prevent.
    expect(asRecord('{"name":"Sasso Kenya","count":200}')).toEqual({
      name: "Sasso Kenya",
      count: 200,
    });
  });

  it("survives rubbish without throwing", () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord("")).toEqual({});
    expect(asRecord("not json")).toEqual({});
    expect(asRecord("[1,2]")).toEqual({});
    expect(asRecord(42)).toEqual({});
  });
});

describe("field helpers — empty means absent, never zero", () => {
  it("reads numbers and text without re-inventing the rules", () => {
    expect(fieldNumber({ a: "1,200" }, "a")).toBe(1200);
    expect(fieldNumber({ a: "" }, "a")).toBeNull();
    expect(fieldText({ a: "  Pen A  " }, "a")).toBe("Pen A");
    expect(fieldText({ a: "" }, "a")).toBeNull();
    expect(fieldText({}, "a")).toBeNull();
    expect(fieldDate({ a: "2026-10-12" }, "a")?.toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(fieldDate({ a: "" }, "a")).toBeNull();
  });
});

describe("isIntakeEntity", () => {
  it("knows what it has a form for, and nothing else", () => {
    expect(isIntakeEntity("flock")).toBe(true);
    expect(isIntakeEntity("crop")).toBe(true);
    expect(isIntakeEntity("livestock")).toBe(false);
    expect(isIntakeEntity("flocks")).toBe(false);
    expect(isIntakeEntity("__proto__")).toBe(false);
    expect(isIntakeEntity("constructor")).toBe(false);
    expect(isIntakeEntity(undefined)).toBe(false);
  });

  it("exposes the source for the entity that exists", () => {
    expect(intakeSource("flock").title).toBe("Add your livestock");
    expect(intakeSource("flock").formNoun).toBe("livestock");
  });
});