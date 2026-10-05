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

describe("undo really undoes", () => {
  const intake = read("routes/ai-intake.ts");
  const del = intake.slice(intake.indexOf('router.delete("/:entity/:id"'));

  it("removes the purchase expense the save created", () => {
    // Found by the end-to-end run, not by reading: the first undo deleted the
    // flock and left a KES 100,000 expense in the books while the card said
    // "nothing was saved".
    expect(del).toContain("expenseTransactionId");
    expect(del).toContain("prisma.transaction.delete(");
  });

  it("only deletes a money row that really is this flock's purchase", () => {
    // Two flocks bought the same way produce identical descriptions, so the id
    // alone is not proof. All three checks must pass.
    expect(del).toMatch(/tx\.category === "animal_feed"/);
    expect(del).toContain("Livestock purchase: ${flock.name}");
    expect(del).toContain('tx.type === "expense"');
  });

  it("says so when the expense was kept, instead of claiming nothing was saved", () => {
    expect(del).toContain("expenseKeptReason");
    expect(del).toContain("expenseRemoved");
  });

  it("checks the flock belongs to this farm before touching anything", () => {
    expect(del.indexOf("findFirst({ where: { id, farmId } })")).toBeGreaterThan(-1);
    expect(del.indexOf("findFirst({ where: { id, farmId } })")).toBeLessThan(
      del.indexOf("prisma.flock.deleteMany"),
    );
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

  it("ends the turn itself instead of spending a second request on one sentence", () => {
    // Measured live: the form opened correctly, then the closing sentence
    // request hit the free tier's limit and the farmer saw a working form with
    // an error bubble on top of it. The sentence is ours to say now.
    expect(ai).toContain("let intakeAsk = \"\";");
    expect(ai).toMatch(/if \(intakeAsk\) \{\s*\n\s*send\("message", \{ content: intakeAsk \}\);\s*\n\s*answered = true;\s*\n\s*break;/);
  });

  it("never calls the model again once the form is open", () => {
    // The break has to sit inside the step loop, after the tool results are
    // recorded — otherwise the history the next turn sees is missing the
    // assistant's own tool call and the conversation stops making sense.
    const loop = ai.indexOf("while (steps < maxSteps)");
    const send = ai.indexOf('send("message", { content: intakeAsk })');
    const push = ai.indexOf("convo.push({ role: \"assistant\"");
    expect(loop).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(loop);
    expect(push).toBeLessThan(send);
  });
});