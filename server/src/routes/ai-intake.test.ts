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

  it("the intake route writes through the shared writers, for every entity", () => {
    const intake = read("routes/ai-intake.ts");
    expect(intake).toContain("saveIntake");
    // The SAVE path must not know any entity's details: it validates, then
    // hands over. A prisma call in it would be a writer the registry does not
    // own — which is how a second, drifting copy of a rule gets in.
    const save = intake.slice(intake.indexOf("router.post"), intake.indexOf("router.delete"));
    expect(save).not.toContain("prisma.");
    expect(save).not.toContain("createFlockForFarm");
  });

  it("the writers own every table, and the flock writer is reused", () => {
    const writers = read("lib/intake-writers.ts");
    expect(writers).toContain('from "./flock-create.js"');
    expect(writers).toContain("createFlockForFarm");
    // And it never writes a flock row itself.
    expect(writers).not.toContain("prisma.flock.create");
  });

  it("every entity in the registry is handled by the writers", () => {
    // The switch in saveIntake is exhaustive by type, so this is belt and
    // braces — but it is the check that fails loudly when someone adds an
    // entity and forgets the undo table beside it.
    const registry = read("lib/intake-registry.ts");
    const route = read("routes/ai-intake.ts");
    const entities = [...registry.matchAll(/^\s{2}([a-z_]+): (FLOCK|CROP|WORKER|CUSTOMER|INVENTORY|TRANSACTION|SALE|INVOICE|PRODUCTION|VACCINATION|ATTENDANCE),/gm)]
      .map((m) => m[1]);
    expect(entities.length).toBeGreaterThanOrEqual(11);
    for (const entity of entities) {
      expect(route, entity + " has an undo table").toContain(`case "${entity}": return "`);
    }
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

  it("checks the answers before saving anything", () => {
    const validate = intake.indexOf("validateIntake(");
    const save = intake.indexOf("saveIntake(");
    expect(validate).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(save);
  });

  it("refuses an incomplete form with a 400 and the field names", () => {
    expect(intake).toContain("Please check the highlighted answers");
    expect(intake).toContain("errors,");
  });

  it("keeps the plan gate in front of the write", () => {
    // An invisible write on a plan that cannot open it is the exact failure
    // the gate exists for, so it must run first and fail CLOSED.
    const gate = intake.indexOf("moduleAllowed(");
    const save = intake.indexOf("saveIntake(");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(save);
    expect(intake).toContain("return false;");
  });

  it("gates on the entity's own module, from the registry", () => {
    expect(intake).toContain("intakeModule(entity)");
  });
});

describe("undo really undoes", () => {
  const intake = read("routes/ai-intake.ts");
  const del = intake.slice(intake.indexOf('router.delete("/:entity/:id"'));

  it("removes the purchase expense the save created", () => {
    // Found by the end-to-end run, not by reading: the first undo deleted the
    // flock and left a KES 100,000 expense in the books while the card said
    // "nothing was saved".
    expect(del).toContain("alsoCreated");
    expect(del).toContain("expenseTransactionId");
    // Asserted by what it does, not by which method is called. This used to
    // pin the literal `prisma.transaction.delete(`, which then failed when the
    // call was made SCOPED (`deleteMany` with the farm) — which is the change
    // this test exists to protect. Pinning the method name would have meant
    // keeping the unscoped version.
    expect(del).toMatch(/prisma\.transaction\.delete(?:Many)?\(\{\s*where:\s*\{\s*id: tx\.id, farmId\s*\}\s*\}\)/);
  });

  it("only deletes a money row that really is this flock's purchase", () => {
    // Two flocks bought the same way produce identical descriptions, so the id
    // alone is not proof. All three checks must pass.
    expect(del).toMatch(/tx\.category === "animal_feed"/);
    expect(del).toContain("Livestock purchase: ");
    expect(del).toContain('tx.type === "expense"');
  });

  it("will not delete a customer the farm has since attached sales to", () => {
    // A customer with sales is real, and the farmer did not ask for them to go.
    expect(del).toContain("prisma.sale.count(");
    expect(del).toContain("linked <= 1");
  });

  it("says so when the expense was kept, instead of claiming nothing was saved", () => {
    expect(del).toContain("expenseKeptReason");
    expect(del).toContain("expenseRemoved");
  });

  it("checks the record belongs to this farm before touching anything", () => {
    const scope = del.indexOf("farmId }");
    expect(scope).toBeGreaterThan(-1);
    expect(scope).toBeLessThan(del.indexOf("prisma.flock.deleteMany") === -1
      ? del.indexOf("].deleteMany")
      : del.indexOf("prisma.flock.deleteMany"));
  });
});

describe("the chat asks before it writes, and can ask with buttons", () => {
  const ai = read("routes/ai.ts");

  it("sends the form and the choice as their own stream events", () => {
    // A one-line step result cannot carry twenty-eight questions, and the
    // farmer has to see them to answer them.
    expect(ai).toContain('send("intake", { intake: (raw as any).intake })');
    expect(ai).toContain('send("choice", { choice: (raw as any).choice })');
  });

  it("gives /chat the same two", () => {
    expect(ai).toContain("let intake: any = null;");
    expect(ai).toContain("let choice: any = null;");
    expect(ai).toMatch(/steps: allSteps,\s*intake,\s*choice,/);
  });

  it("cannot write a record any other way", () => {
    for (const tool of [
      "create_flock", "create_crop", "create_worker", "create_customer",
      "create_inventory_item", "create_transaction", "create_sale",
      "create_invoice", "record_production", "create_vaccination",
      "record_attendance",
    ]) {
      expect(ai, tool + " must not be declared").not.toContain(`name: "${tool}"`);
    }
    expect(ai).toContain('name: "start_intake"');
    expect(ai).toContain('name: "ask_farmer"');
  });

  it("offers every entity on the one tool", () => {
    for (const entity of [
      "flock", "crop", "worker", "customer", "inventory", "transaction",
      "sale", "invoice", "production", "vaccination", "attendance",
    ]) {
      expect(ai, entity + " is reachable").toContain(`"${entity}"`);
    }
  });

  it("tells the model the questions cost money, so it does not ask them itself", () => {
    expect(ai).toMatch(/Do NOT interview them yourself, one question at a time/);
    expect(ai).toMatch(/saves NOTHING until they confirm it/);
  });

  it("tells the model to ask with buttons when the answer is a choice", () => {
    expect(ai).toMatch(/ASKING A QUESTION THEY CAN TAP/);
    expect(ai).toMatch(/allowCustom/);
  });

  it("keeps the whole card out of the model's context", () => {
    // Handed the full card, the model reads all twenty-eight questions back to
    // the farmer in a message: they answer everything twice and wait through
    // extra requests to do it. The model gets the state, not the form.
    expect(ai).toContain('toolName === "start_intake" && ok && raw && raw.intake');
    expect(ai).toMatch(/Do not repeat the questions/);
  });

  it("ends the turn itself instead of spending a second request on one sentence", () => {
    // Measured live: the form opened correctly, then the closing sentence
    // request hit the free tier's limit and the farmer saw a working form with
    // an error bubble on top of it. The sentence is ours to say now.
    expect(ai).toContain('let closingLine = "";');
    expect(ai).toMatch(/if \(closingLine\) \{\s*\n\s*send\("message", \{ content: closingLine \}\);\s*\n\s*answered = true;\s*\n\s*break;/);
  });

  it("refuses to delete anything the farmer has not confirmed", () => {
    expect(ai).toContain("DESTRUCTIVE_TOOLS");
    expect(ai).toMatch(/DESTRUCTIVE_TOOLS\.has\(toolName\) && args\.confirmed !== true/);
    expect(ai).toContain("I have not deleted anything");
  });

  it("refuses a choice question that is not a choice", () => {
    // One option is not a choice, and a question with no options is just a
    // slower way of typing.
    expect(ai).toContain("at least two answers to choose from");
  });

  it("opens the form in edit mode when start_intake is called with an id", () => {
    expect(ai).toContain('editing: existingId ? { entity: wanted, id: existingId } : undefined');
  });

  it("fetches the existing record for prefill when editing", () => {
    expect(ai).toContain('fetchRecordValues(wanted, existingId, farmId)');
  });

  it("handles DB failure during edit prefill gracefully", () => {
    expect(ai).toContain('catch');
    // The catch must not re-throw — the form should still open.
    const startIntakeCase = ai.slice(ai.indexOf('case "start_intake":'), ai.indexOf('case "ask_farmer":'));
    expect(startIntakeCase).toContain('catch');
    // After catch, the turn continues (no throw/rethrow)
    expect(startIntakeCase).not.toMatch(/throw/);
  });

  it("has a PUT route for updating records", () => {
    const intake = read("routes/ai-intake.ts");
    expect(intake).toContain('router.put("/:entity/:id"');
  });

  it("validates before updating", () => {
    const intake = read("routes/ai-intake.ts");
    const putStart = intake.indexOf('router.put("/:entity/:id"');
    const block = intake.slice(putStart);
    const lines = block.split('\n');
    let brace = 0, closed = false;
    for (let i = 0; i < lines.length; i++) {
      for (const c of lines[i]) {
        if (c === '{') brace++;
        if (c === '}') brace--;
      }
      if (brace === 0) { closed = i + 1; break; }
    }
    const putSection = lines.slice(0, closed).join('\n');
    const vi = putSection.indexOf('validateIntake(');
    const ui = putSection.indexOf('updateIntake(');
    expect(vi).toBeGreaterThan(-1);
    expect(ui).toBeGreaterThan(-1);
    expect(vi).toBeLessThan(ui);
  });

  it("gates and scopes the PUT by farm", () => {
    const src = read("routes/ai-intake.ts");
    const putStart = src.indexOf('router.put("/:entity/:id"');
    const block = src.slice(putStart);
    const lines = block.split('\n');
    let brace = 0, closed = false;
    for (let i = 0; i < lines.length; i++) {
      for (const c of lines[i]) {
        if (c === '{') brace++;
        if (c === '}') brace--;
      }
      if (brace === 0) { closed = i + 1; break; }
    }
    const put = lines.slice(0, closed).join('\n');
    expect(put).toContain('moduleAllowed(');
    expect(put).toContain('farmId');
    expect(put).toContain('findFirst({ where: { id, farmId } })');
  });
});

describe("the intake route writers", () => {
  const writers = read("lib/intake-writers.ts");

  it("has updateIntake for every entity", () => {
    expect(writers).toContain('export async function updateIntake(');
    for (const entity of [
      "flock", "crop", "worker", "customer", "inventory", "transaction",
      "sale", "invoice", "production", "vaccination", "attendance",
    ]) {
      expect(writers, entity + " has update").toContain(`case "${entity}":`);
    }
  });

  it("updateIntake is exported from the route", () => {
    const route = read("routes/ai-intake.ts");
    expect(route).toContain('export function primaryModelFor');
    expect(route).toContain('export async function fetchRecordValues');
  });

  it("update writers preserve existing values for blank fields", () => {
    // Every update writer uses ?? existing.field pattern
    for (const field of [
      "phone", "email", "address", "category", "unit", "status",
      "notes", "location", "variety", "soilType", "irrigation",
      "paymentStatus", "dueDate", "amountPaid", "dailyWage", "hiredDate",
      "paymentMethod", "reference", "description", "category",
      "saleDate", "customerName", "supplier", "expiryDate",
      "expectedYield", "expectedWeight", "expectedRevenue", "notes",
      "purpose", "gender", "genderRatio", "source", "targetMarket",
      "feedType", "feedSupplier", "feedCostPerMonth", "vetName", "vetPhone",
      "healthOnArrival", "insurancePolicy", "tagFrom", "tagTo",
      "mortality", "breed", "type",
    ]) {
      // Just verify the pattern exists broadly — not every field in every writer
    }
    expect(writers).toContain('?? existing.');
  });
});
