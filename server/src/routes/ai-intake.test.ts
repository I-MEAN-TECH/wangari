import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The wiring facts that unit tests on lib/farm-intake.ts cannot see.
 *
 * Each of these is a way the feature could exist in the library and still not
 * reach the farmer: a router mounted behind another one, a second copy of the
 * writer that drifts, a save that runs before validation, a stream event the
 * browser never receives. They are read from the source on purpose — the
 * alternative is booting Express with a live database, which this suite does
 * not have and should not need to prove a mount order.
 */
/**
 * Read a source file with its line endings normalised.
 *
 * Several of these files are CRLF on disk (git checked them out that way with
 * core.autocrlf=true), so a multi-line pattern written with \n would silently
 * match nothing — and a test that passes because it found nothing is worse
 * than no test at all.
 */
const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

describe("the intake is reachable", () => {
  const index = read("index.ts");

  it("is mounted", () => {
    expect(index).toContain('import aiIntakeRoutes from "./routes/ai-intake.js"');
    expect(index).toContain('app.use("/api/ai/intake", aiIntakeRoutes)');
  });

  it("is mounted BEFORE /api/ai, or the AI router answers first", () => {
    // The AI router carries router-level middleware and matches every path
    // under /api/ai. Registered second, it would swallow the intake paths and
    // the form would 404 on save — with the farmer's answers already typed.
    const intake = index.indexOf('app.use("/api/ai/intake"');
    const ai = index.indexOf('app.use("/api/ai", aiRoutes)');
    expect(intake).toBeGreaterThan(-1);
    expect(ai).toBeGreaterThan(-1);
    expect(intake).toBeLessThan(ai);
  });
});

describe("one writer, not two", () => {
  it("the flocks screen writes through lib/flock-create.ts", () => {
    const flocks = read("routes/flocks.ts");
    expect(flocks).toContain('from "../lib/flock-create.js"');
    // A leftover inline prisma.flock.create here would be the second writer:
    // the screen would get tag ranges and vaccination schedules that chat
    // does not, and the two records would disagree for the life of the flock.
    expect(flocks).not.toContain("prisma.flock.create");
  });

  it("the intake writes through the same one", () => {
    const intake = read("routes/ai-intake.ts");
    expect(intake).toContain("createFlockForFarm");
    expect(intake).not.toContain("prisma.flock.create");
  });

  it("the library owns the category map, so a flock is filed the same way twice", () => {
    expect(read("lib/flock-create.ts")).toContain("export const SPECIES_CATEGORY");
    // It used to be declared inside the route, where the intake could not
    // reach it and would have had to guess.
    expect(read("routes/flocks.ts")).not.toContain("const SPECIES_CATEGORY");
  });
});

describe("validation runs before the write", () => {
  const intake = read("routes/ai-intake.ts");

  it("checks the answers before creating anything", () => {
    const validate = intake.indexOf("validateIntake(");
    const write = intake.indexOf("createFlockForFarm(");
    expect(validate).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(write);
  });

  it("refuses an incomplete form with a 400 and the field names", () => {
    expect(intake).toContain("Please check the highlighted answers");
    expect(intake).toContain("errors,");
  });

  it("keeps the plan gate in front of the write", () => {
    // An invisible write on a plan that cannot open it is the exact failure
    // the gate exists for, so it must run first and fail CLOSED.
    const gate = intake.indexOf("flocksAllowed(");
    const write = intake.indexOf("createFlockForFarm(");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(write);
    expect(intake).toContain("return false;");
  });
});

describe("the chat tells the farmer to answer the form", () => {
  const ai = read("routes/ai.ts");

  it("sends the card as its own stream event", () => {
    // A one-line step result cannot carry twenty-eight questions, and the
    // farmer has to see them to answer them.
    expect(ai).toContain('send("intake", { intake: (raw as any).intake })');
  });

  it("gives /chat the same card", () => {
    expect(ai).toContain("let intake: any = null;");
    expect(ai).toContain("intake,");
  });

  it("cannot add a flock any other way", () => {
    expect(ai).not.toContain('function: { name: "create_flock"');
    expect(ai).toContain('function: {\n      name: "start_flock_intake"');
  });

  it("tells the model the questions cost money, so it does not ask them itself", () => {
    expect(ai).toContain("start_flock_intake");
    expect(ai).toMatch(/Do NOT interview them yourself, one question at a time/);
    expect(ai).toMatch(/Nothing is saved until they confirm the form/);
  });

  it("keeps the whole card out of the model's context", () => {
    // Handed the full card, the model reads all twenty-eight questions back to
    // the farmer in a message: they answer everything twice and wait through
    // extra requests to do it. The model gets the state, not the form.
    expect(ai).toContain('toolName === "start_flock_intake" && ok && raw && raw.intake');
    expect(ai).toMatch(/Do not repeat the questions/);
  });
});