/**
 * PerCowMilkPanel — rendered shell, plus source pins for the part that matters.
 *
 * The panel's whole reason for existing is a distinction the UI can get wrong
 * in a way that LOOKS right: the flock total and the per-cow rows are different
 * grains of fact. If the panel ever divided the flock total by the number of
 * cows to produce a per-cow average, a farmer would take a confident wrong
 * number to a co-op — which is the exact failure this codebase refuses
 * elsewhere (unit-economics, record-grade).
 *
 * ── What this file can and cannot prove ────────────────────────────────────
 * The vitest environment is `node` — no jsdom, no testing-library — so this is
 * renderToStaticMarkup, the same convention FlockBatchesPanel.test.tsx uses:
 *
 *  1. Effects do not run, so the panel renders in its LOADING state. The
 *     loaded table, the coverage banner and the form are not reachable here.
 *  2. Nothing is clickable. So the behaviour whose risk is "a wrong number
 *     reaches a co-op" is pinned against the component SOURCE instead.
 *
 * Both are real regression guards; neither pretends to be a browser.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PerCowMilkPanel } from "./PerCowMilkPanel";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "PerCowMilkPanel.tsx"),
  "utf8"
);

describe("PerCowMilkPanel — the shell a farmer sees first", () => {
  it("renders its heading rather than an empty div", () => {
    const html = renderToStaticMarkup(createElement(PerCowMilkPanel));
    expect(html).toContain("Per-cow milk");
    expect(html.length).toBeGreaterThan(200);
  });

  it("renders the loading state, not an error, before the fetch resolves", () => {
    const html = renderToStaticMarkup(createElement(PerCowMilkPanel));
    expect(html).toContain("Loading per-cow records");
  });
});

describe("the panel never invents a per-cow figure from the flock total", () => {
  it("does not divide the flock total to get an average per cow", () => {
    // The precise mistake: flockTotalLitres / cowsInHerd (or / cowsRecorded).
    // Either would look authoritative and be wrong for any farm that does not
    // record every cow every day.
    expect(source).not.toMatch(/flockTotalLitres\s*\//);
    expect(source).not.toMatch(/cowsInHerd\s*\//);
    expect(source).not.toMatch(/herdTotalLitres\s*\//);
  });

  it("shows the unattributed litres as a gap rather than hiding them", () => {
    expect(source).toContain("not");
    expect(source).toContain("attributed to a cow");
    expect(source).toContain("cov.unattributedLitres");
  });

  it("says it cannot work out coverage when no flock total was logged", () => {
    expect(source).toContain("cov.coveragePct == null");
    expect(source).toContain("No flock total was logged in this window");
  });

  it("flags per-cow rows that exceed the flock total as a data error", () => {
    expect(source).toContain("cov.exceedsFlockTotal");
    expect(source).toContain("entered wrongly");
  });
});

describe("capture — one cow, one milking, correctable", () => {
  it("records against the per-cow endpoint, not the flock record", () => {
    expect(source).toContain('api.post("/api/production/animal"');
    expect(source).not.toContain('api.post("/api/production"');
  });

  it("offers the three real milking sessions", () => {
    expect(source).toContain('value: "morning"');
    expect(source).toContain('value: "evening"');
    expect(source).toContain('value: "full_day"');
  });

  it("stops a save with no cow chosen instead of writing a row against nobody", () => {
    expect(source).toContain("Pick which cow gave the milk first");
    expect(source).toContain("disabled={saving || !animalId}");
  });

  it("lets a wrong milking be removed, and asks before it does not — it is a delete by id", () => {
    expect(source).toContain("api.delete(`/api/production/animal/${id}`)");
  });

  it("keeps a 300-bird house out of the cow picker", () => {
    expect(source).toContain("function milkable(");
    expect(source).toContain("MILK_WORDS.test(");
    expect(source).toContain("useMemo(() => milkable(cows)");
  });
});

describe("reproduction timeline — computed, never guessed", () => {
  it("reads the reproduction endpoint the breeding records already feed", () => {
    expect(source).toContain('api.get("/api/production/repro")');
  });

  it("leaves an unrecorded date blank instead of inventing one", () => {
    expect(source).toContain("no birth recorded yet");
    expect(source).toContain("left blank rather than guessed");
  });

  it("quotes the farmer's own figures without grading them against a benchmark", () => {
    expect(source).toContain("meanCalvingIntervalDays");
    expect(source).toContain("meanServicesPerConception");
    // No target/ideal/benchmark language may sneak in — this project refuses to
    // assert a standard the farmer never chose.
    expect(source).not.toMatch(/should be at least|target interval|ideal calving/i);
  });

  it("survives having no breeding records at all — the milk half still loads", () => {
    expect(source).toContain("Promise.allSettled");
  });
});
