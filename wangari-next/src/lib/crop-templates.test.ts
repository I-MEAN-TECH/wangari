import { describe, it, expect } from "vitest";
import {
  cropTemplates,
  getCropTemplate,
  normaliseCropType,
  currentStage,
  getAllCrops,
} from "./crop-templates";

describe("crop guidance resolution", () => {
  it("never returns another crop's advice for an unknown crop", () => {
    expect(getCropTemplate("sorghum")).toBeNull();
    expect(getCropTemplate("")).toBeNull();
    expect(getCropTemplate(null)).toBeNull();
    // There is no default crop. A farmer growing something we do not know
    // must get nothing rather than maize instructions.
    expect(getCropTemplate("wheat")).not.toBe(cropTemplates.maize);
  });

  it("resolves every crop it defines", () => {
    for (const id of Object.keys(cropTemplates)) {
      expect(getCropTemplate(id), id).not.toBeNull();
    }
  });

  it("understands the names Kenyan farmers actually type", () => {
    expect(getCropTemplate("maize")?.id).toBe("maize");
    expect(getCropTemplate("Corn")?.id).toBe("maize");
    expect(getCropTemplate("nyanya")?.id).toBe("tomatoes");
    expect(getCropTemplate("Tomato")?.id).toBe("tomatoes");
    expect(getCropTemplate("sukuma wiki")?.id).toBe("kale");
    expect(getCropTemplate("Sukumawiki")?.id).toBe("kale");
    expect(getCropTemplate("viazi")?.id).toBe("potatoes");
    expect(getCropTemplate("vitu")?.id).toBe("onions");
    expect(getCropTemplate("rojo")?.id).toBe("beans");
  });

  it("handles extra detail a farmer typed along with the crop", () => {
    expect(getCropTemplate("Tomatoes (Anna F1)")?.id).toBe("tomatoes");
    expect(getCropTemplate("  MAIZE  ")?.id).toBe("maize");
  });

  it("returns null rather than guessing at an unknown name", () => {
    expect(normaliseCropType("pyrethrum")).toBeNull();
  });
});

describe("crop guidance content", () => {
  it("gives tomatoes fertiliser and pest advice that is not maize advice", () => {
    const t = getCropTemplate("tomatoes")!;
    expect(t.baseFertilizer).toMatch(/DAP|CAN/i);
    // The potato note exists to prove crops are not sharing one template.
    expect(t.pests.some((p) => /late blight|early blight/i.test(p.problem))).toBe(true);
    expect(t.nutrientNeeds.potassium).toMatch(/high/i);
  });

  it("warns beans off nitrogen, which is the mistake that costs them the most", () => {
    const t = getCropTemplate("beans")!;
    expect(t.fertilizerReason).toMatch(/fix|low|zero/i);
    expect(t.criticalTiming).toMatch(/nitrogen/i);
  });

  it("gives every crop inputs and signs for its stages", () => {
    for (const crop of getAllCrops()) {
      expect(crop.stages.length, `${crop.id} stages`).toBeGreaterThan(2);
      for (const s of crop.stages) {
        expect(s.inputs.length, `${crop.id}/${s.id} inputs`).toBeGreaterThan(0);
        expect(s.signs.length, `${crop.id}/${s.id} signs`).toBeGreaterThan(0);
        expect(s.label, `${crop.id}/${s.id} label`).toBeTruthy();
      }
      expect(crop.pests.length, `${crop.id} pests`).toBeGreaterThan(0);
      expect(crop.criticalTiming.length, `${crop.id} timing`).toBeGreaterThan(10);
    }
  });

  it("gives each crop its own pest list", () => {
    const maize = getCropTemplate("maize")!;
    const kale = getCropTemplate("kale")!;
    const maizePests = maize.pests.map((p) => p.problem).join(" ");
    const kalePests = kale.pests.map((p) => p.problem).join(" ");
    expect(maizePests).not.toBe(kalePests);
    expect(maizePests).toMatch(/armyworm/i);
    expect(kalePests).toMatch(/diamondback|aphid/i);
  });
});

describe("currentStage", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

  it("puts a freshly planted maize field at the planting stage", () => {
    const stage = currentStage(getCropTemplate("maize")!, daysAgo(3));
    expect(stage?.id).toBe("planting");
  });

  it("moves to top-dressing around 4-5 weeks", () => {
    const stage = currentStage(getCropTemplate("maize")!, daysAgo(33)); // ~4.7 weeks
    expect(stage?.id).toBe("vegetative");
  });

  it("returns the harvest stage for a field well past its cycle", () => {
    const stage = currentStage(getCropTemplate("maize")!, daysAgo(150));
    expect(stage?.id).toBe("harvest");
  });

  it("returns null without a planting date rather than guessing the stage", () => {
    expect(currentStage(getCropTemplate("maize")!, null)).toBeNull();
    expect(currentStage(getCropTemplate("maize")!, "not-a-date")).toBeNull();
  });

  it("skips land prep, which is a before-planting step, not a timed one", () => {
    const stage = currentStage(getCropTemplate("maize")!, daysAgo(1));
    expect(stage?.id).not.toBe("land_prep");
  });
});