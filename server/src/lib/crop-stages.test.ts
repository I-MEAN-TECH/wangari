import { describe, it, expect } from "vitest";
import {
  normalizeCropType,
  getCropMilestones,
  findActiveMilestones,
} from "./crop-stages.js";

const DAY = 86400000;
const today = new Date("2026-10-13T00:00:00Z");

describe("crop-stages", () => {
  it("normalizes Kenyan crop names and aliases", () => {
    expect(normalizeCropType("Maize")).toBe("maize");
    expect(normalizeCropType("mahindi")).toBe("maize");
    expect(normalizeCropType("Sukuma Wiki")).toBe("kale");
    expect(normalizeCropType("Irish Potatoes")).toBe("potatoes");
    expect(normalizeCropType("Nyanya")).toBe("tomatoes");
    expect(normalizeCropType("UnknownCrop")).toBeNull();
  });

  it("returns milestones for maize including top dressing and weeding", () => {
    const milestones = getCropMilestones("maize");
    expect(milestones.length).toBeGreaterThanOrEqual(5);
    const topDressing = milestones.find((m) => m.stageKey === "maize-top-dressing");
    expect(topDressing).toBeDefined();
    expect(topDressing?.dayOffset).toBe(28);
  });

  it("detects top dressing milestone due today", () => {
    // Planted exactly 28 days ago
    const plantingDate = new Date(today.getTime() - 28 * DAY);
    const crops = [
      { id: 101, name: "Field A", cropType: "maize", plantingDate },
    ];
    const active = findActiveMilestones(crops, today);
    expect(active.length).toBe(1);
    expect(active[0].cropId).toBe(101);
    expect(active[0].title).toContain("Top dressing CAN");
    expect(active[0].title).toContain("TODAY");
    expect(active[0].isOverdue).toBe(false);
  });

  it("detects overdue milestone within the 3-day grace window", () => {
    // Planted 30 days ago (milestone was at day 28 -> 2 days overdue)
    const plantingDate = new Date(today.getTime() - 30 * DAY);
    const crops = [
      { id: 102, name: "Field B", cropType: "maize", plantingDate },
    ];
    const active = findActiveMilestones(crops, today);
    expect(active.length).toBe(1);
    expect(active[0].isOverdue).toBe(true);
    expect(active[0].title).toContain("2d overdue");
    expect(active[0].priority).toBe("high");
  });

  it("detects upcoming milestone within 2 days", () => {
    // Planted 26 days ago (milestone due in 2 days at day 28)
    const plantingDate = new Date(today.getTime() - 26 * DAY);
    const crops = [
      { id: 103, name: "Field C", cropType: "maize", plantingDate },
    ];
    const active = findActiveMilestones(crops, today);
    expect(active.length).toBe(1);
    expect(active[0].isOverdue).toBe(false);
    expect(active[0].title).toContain("in 2d");
  });

  it("does not trigger milestones far outside the window", () => {
    // Planted 50 days ago (milestones are at 28, 45, 60 days)
    // At day 50: day 45 is 5 days overdue (outside -3 grace window), day 60 is 10 days away
    const plantingDate = new Date(today.getTime() - 50 * DAY);
    const crops = [
      { id: 104, name: "Field D", cropType: "maize", plantingDate },
    ];
    const active = findActiveMilestones(crops, today);
    expect(active.length).toBe(0);
  });
});
