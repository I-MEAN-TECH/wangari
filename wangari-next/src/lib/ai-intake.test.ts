import { describe, it, expect } from "vitest";
import {
  canSave,
  firstSectionNeedingAnswer,
  isAnswered,
  missingRequiredKeys,
  progressOf,
  savedSummary,
  sectionLabel,
  submitIntake,
  type IntakeSection,
} from "./ai-intake";

/**
 * The card's rules, without a card.
 *
 * The panel cannot be rendered in this environment — it is a client component
 * and the suite runs in node, where useEffect does not run. So the decisions
 * that matter live in lib/ai-intake.ts as plain functions, and these are the
 * tests for them. What is being defended here is not the styling; it is that
 * the farmer cannot be shown a Save button that silently discards their work,
 * and cannot be stopped from saving a flock with no name.
 */

const sections: IntakeSection[] = [
  {
    id: "basic",
    title: "Basic Info",
    fields: [
      { key: "name", label: "Flock Name", type: "text", required: true },
      { key: "initialCount", label: "How many animals", type: "number", required: true },
      { key: "breed", label: "Breed", type: "text" },
    ],
  },
  {
    id: "location",
    title: "Location & Housing",
    fields: [{ key: "location", label: "Location / Pen", type: "text" }],
  },
  {
    id: "insurance",
    title: "Insurance & Notes",
    fields: [{ key: "notes", label: "Notes", type: "textarea" }],
  },
];

describe("isAnswered", () => {
  it("counts a blank as no answer, however it is blank", () => {
    expect(isAnswered({ key: "k", label: "K", type: "text" }, "")).toBe(false);
    expect(isAnswered({ key: "k", label: "K", type: "text" }, "   ")).toBe(false);
    expect(isAnswered({ key: "k", label: "K", type: "text" }, undefined)).toBe(false);
  });

  it("counts a zero as an answer, because zero deaths is a real fact", () => {
    expect(isAnswered({ key: "mortality", label: "Deaths", type: "number" }, "0")).toBe(true);
  });
});

describe("canSave", () => {
  it("says no until the two required answers are in", () => {
    expect(canSave(sections, {})).toBe(false);
    expect(canSave(sections, { name: "Sasso Kenya" })).toBe(false);
    expect(canSave(sections, { name: "Sasso Kenya", initialCount: "200" })).toBe(true);
  });

  it("does not demand the things a farmer may simply not know", () => {
    // Vet name, insurance, target revenue: a required field here would mean the
    // form can only be completed by someone who already had every answer.
    expect(canSave(sections, { name: "A", initialCount: "10" })).toBe(true);
  });

  it("treats a whitespace-only name as missing", () => {
    expect(canSave(sections, { name: "   ", initialCount: "200" })).toBe(false);
  });
});

describe("missingRequiredKeys", () => {
  it("names only what is required and absent", () => {
    expect(missingRequiredKeys(sections, {})).toEqual(["name", "initialCount"]);
    expect(missingRequiredKeys(sections, { name: "A", initialCount: "1" })).toEqual([]);
  });
});

describe("firstSectionNeedingAnswer", () => {
  it("opens on the section holding a missing answer, not always the first", () => {
    // The farmer's words already covered Basic Info, so starting them there
    // would show them a page they have completed.
    const first = firstSectionNeedingAnswer(sections, { name: "A", initialCount: "1", breed: "Sasso" });
    expect(sections[first].title).toBe("Location & Housing");
  });

  it("stays on the required answers first when one is still missing", () => {
    // A later page is prettier than a blocked save, but only if the save can
    // happen at all.
    const first = firstSectionNeedingAnswer(sections, { name: "A" });
    expect(sections[first].title).toBe("Basic Info");
  });

  it("lands on the last section when everything is answered", () => {
    // Not the first: re-reading the page they just filled is not useful.
    const done = {
      name: "A",
      initialCount: "1",
      breed: "Sasso",
      location: "Pen A",
      notes: "Bought at Mamboeo",
    };
    expect(sections[firstSectionNeedingAnswer(sections, done)].title).toBe("Insurance & Notes");
  });

  it("is 0 with nothing known, which is where an empty interview starts", () => {
    expect(firstSectionNeedingAnswer(sections, {})).toBe(0);
  });

  it("does not fall over an empty form", () => {
    expect(firstSectionNeedingAnswer([], {})).toBe(0);
  });
});

describe("progressOf", () => {
  it("counts answers across every section, not just the visible one", () => {
    const { answered, total } = progressOf(sections, { name: "A", initialCount: "1", location: "Pen A" });
    expect(answered).toBe(3);
    expect(total).toBe(5);
  });
});

describe("sectionLabel", () => {
  it("says where the farmer is, because a form that jumps is a form that loses people", () => {
    expect(sectionLabel(sections, 0)).toBe("Section 1 of 3 — Basic Info");
    expect(sectionLabel(sections, 2)).toBe("Section 3 of 3 — Insurance & Notes");
  });

  it("is empty rather than nonsense when asked about a section that is not there", () => {
    expect(sectionLabel(sections, 9)).toBe("");
  });
});

describe("savedSummary", () => {
  it("reads like a sentence a farmer would say", () => {
    expect(savedSummary({ name: "Sasso Kenya", currentCount: 200 })).toBe("Sasso Kenya — 200 animals");
  });

  it("uses the singular for one animal", () => {
    expect(savedSummary({ name: "Kienyeji batch", currentCount: 1 })).toBe("Kienyeji batch — 1 animal");
  });

  it("mentions the breed when there is one, and stays quiet when there is not", () => {
    expect(savedSummary({ name: "A", currentCount: 10, breed: "Sasso" })).toContain(", Sasso");
    expect(savedSummary({ name: "A", currentCount: 10, breed: null })).toBe("A — 10 animals");
  });
});

describe("submitIntake", () => {
  it("sends every answer, blanks included, so the server owns the rules", () => {
    const calls: any[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: any) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true, entity: "flock", flock: { id: 1, name: "A" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;
    return submitIntake("flock", { name: "A", initialCount: "10", vetName: "" }).then((result) => {
      globalThis.fetch = original;
      expect(result.ok).toBe(true);
      const body = JSON.parse(calls[0].init.body);
      expect(body.values).toEqual({ name: "A", initialCount: "10", vetName: "" });
      expect(calls[0].init.method).toBe("POST");
    });
  });

  it("hands back the field errors the server named, not a generic failure", () => {
    // "Something went wrong" gives a farmer nothing to act on; "this field" does.
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: "Please check the highlighted answers.",
          errors: { initialCount: "How many animals is needed before I can save this." },
          missingRequired: ["initialCount"],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )) as any;
    return submitIntake("flock", { name: "A" }).then((result) => {
      globalThis.fetch = original;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors?.initialCount).toMatch(/how many animals/i);
      expect(result.missingRequired).toEqual(["initialCount"]);
    });
  });

  it("survives a response that is not JSON at all", () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("<html>502</html>", { status: 502 })) as any;
    return submitIntake("flock", { name: "A" }).then((result) => {
      globalThis.fetch = original;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.length).toBeGreaterThan(0);
    });
  });

  it("says so when the network is gone, rather than reporting a server failure", () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as any;
    return submitIntake("flock", { name: "A" }).then((result) => {
      globalThis.fetch = original;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/no connection/i);
    });
  });
});