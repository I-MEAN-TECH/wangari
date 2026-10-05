/**
 * Wangari's guided intake — the endpoints the form in the chat saves into.
 *
 * ── what this is for ────────────────────────────────────
 * Ask Wangari to add livestock and she used to answer by writing a row with a
 * name and a number. Twenty-seven other columns stayed empty because nobody
 * asked the farmer about them, and an empty column is a question they were
 * never given. This is where that changes for EVERY record the assistant can
 * write: the server describes the questions (lib/intake-registry.ts), the
 * farmer fills them in, and the answers come here and are written through the
 * writers in lib/intake-writers.ts.
 *
 * ── why it is a plain REST endpoint, not a chat turn ─────
 * Each extra conversation turn costs the farmer a minute of the provider's free
 * tier, so the interview is deliberately NOT a conversation. One request opens
 * the form and one saves it, whatever the number of questions. A twelve-question
 * form costs what a one-question form costs: nothing.
 *
 * ── stateless on purpose ─────────────────────────────────
 * Nothing is stored between the two calls. The form is fully described by its
 * entity name, so it can be rebuilt from the definition rather than remembered,
 * and this keeps working across PM2's cluster workers where an in-memory session
 * would land on the wrong process about half the time. A farmer who loses their
 * connection mid-form loses nothing but the typing.
 */

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { prisma } from "../db.js";
import {
  buildIntake,
  isIntakeEntity,
  intakeSource,
  validateIntake,
} from "../lib/farm-intake.js";
import { intakeModule } from "../lib/intake-registry.js";
import { saveIntake, updateIntake } from "../lib/intake-writers.js";
import type { IntakeEntity } from "../lib/intake-types.js";

const router = Router();
router.use(authMiddleware, requireOwner);

/**
 * The plan rule, and it is the SAME function the screens obey (see
 * middleware/plan-gate.ts and the regression test that walks the registry).
 *
 * Fails CLOSED on the write path. Failing open here would let a Starter farm
 * write a record its owner can never open — the invisible-write failure the
 * gate exists to prevent, and the one a farmer only discovers when they go
 * looking for work the app said it had saved.
 */
async function moduleAllowed(userId: number, entity: IntakeEntity): Promise<boolean> {
  try {
    const { isModuleAllowed } = await import("../middleware/plan-gate.js");
    return await isModuleAllowed(userId, intakeModule(entity));
  } catch {
    return false;
  }
}

function entityOf(req: Request, res: Response): IntakeEntity | null {
  const { entity } = req.params;
  if (!isIntakeEntity(entity)) {
    res.status(404).json({ error: "There is no such form." });
    return null;
  }
  return entity;
}

const NOT_SIGNED_IN = { error: "No account on this session" };

/**
 * GET /api/ai/intake/:entity — the questions, with nothing filled in.
 *
 * The chat normally ships the whole card inside the stream event, so this is the
 * way back: a farmer who dismissed the form, or an older build of the app, can
 * still reach it.
 */
router.get("/:entity", async (req: Request, res: Response) => {
  const entity = entityOf(req, res);
  if (!entity) return;
  const userId = req.user!.userId;
  if (!userId) return res.status(400).json(NOT_SIGNED_IN);
  try {
    if (!(await moduleAllowed(userId, entity))) {
      return res.status(403).json({
        error:
          "That part of the farm is not in your plan yet, so I cannot keep these details. " +
          "Ask me about something your plan includes instead, or upgrade to unlock it.",
      });
    }
    res.json(buildIntake(entity, {}));
  } catch (error) {
    console.error("Intake definition error:", error);
    res.status(500).json({ error: "I could not open that form. Please try again." });
  }
});

/**
 * POST /api/ai/intake/:entity — save what the farmer answered.
 *
 * Validation comes first and answers with the field that is wrong, because
 * "something went wrong" gives a farmer nothing to act on. Only a complete,
 * sane form reaches a writer.
 */
router.post("/:entity", async (req: Request, res: Response) => {
  const entity = entityOf(req, res);
  if (!entity) return;
  const userId = req.user!.userId;
  const farmId = req.user!.farmId;
  if (!userId || !farmId) return res.status(400).json({ error: "No farm associated with account" });

  try {
    if (!(await moduleAllowed(userId, entity))) {
      return res.status(403).json({
        error:
          "That part of the farm is not in your plan yet, so I have not saved it. " +
          "Ask for something your plan includes instead, or upgrade to unlock it.",
      });
    }

    const { values, errors, ok, missingRequired } = validateIntake(entity, req.body?.values);
    if (!ok) {
      return res.status(400).json({
        error: "Please check the highlighted answers.",
        errors,
        // Which fields are still needed, so the form can jump to them rather
        // than making the farmer hunt.
        missingRequired,
        values,
      });
    }

    const saved = await saveIntake(entity, farmId, userId, values);
    if (!saved.ok) return res.status(400).json({ error: saved.error, errors, values });

    return res.status(201).json({
      ok: true,
      entity,
      record: saved.record,
      summary: saved.summary,
      alsoCreated: saved.alsoCreated ?? {},
      warning: saved.warning ?? null,
      values,
    });
  } catch (error) {
    console.error("Intake save error:", error);
    res.status(500).json({ error: "I could not save that just now. Please try again." });
  }
});

/**
 * DELETE /api/ai/intake/:entity/:id — undo a record saved from the chat.
 *
 * One tap, because the whole promise of the assistant is that a misheard
 * instruction is reversible. It removes the record AND the rows the save
 * created alongside it.
 *
 * That second part was found by testing, not by review: the first version of
 * this route deleted the flock and left a KES 100,000 expense sitting in the
 * books, while the card told the farmer "nothing was saved". A half-undone
 * record is worse than no undo — the margin now shows a purchase of animals the
 * farm does not have.
 *
 * Every companion row is removed only when the farmer names it AND it is
 * verifiably the one this save created. Deleting by description alone would be
 * guessing: two flocks bought the same way produce identical descriptions, and a
 * farmer's own carefully entered transaction is not ours to remove on a hunch.
 */
router.delete("/:entity/:id", async (req: Request, res: Response) => {
  const entity = entityOf(req, res);
  if (!entity) return;
  const farmId = req.user!.farmId;
  if (!farmId) return res.status(400).json({ error: "No farm associated with account" });

  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Which record?" });

    // Scope by farm BEFORE touching anything: an id from another farm must be
    // refused, not merely not found, so the row is never deleted.
    const model = primaryModelFor(entity);
    const found = await (prisma as any)[model].findFirst({ where: { id, farmId } });
    if (!found) return res.status(404).json({ error: "That record is not on your farm." });

    const claimed = asIdRecord(req.body?.alsoCreated);
    let expenseRemoved = false;
    let companionRemoved = 0;
    let expenseKeptReason: string | null = null;

    // The purchase expense a flock save created.
    const expenseId = claimed.expenseTransactionId;
    if (expenseId) {
      const tx = await prisma.transaction.findFirst({ where: { id: expenseId, farmId } });
      // Three things must line up before a money row goes: it is on this farm,
      // it is the category the save used, and its description names this flock.
      if (
        entity === "flock" &&
        tx &&
        tx.type === "expense" &&
        tx.category === "animal_feed" &&
        String(tx.description || "").includes(`Livestock purchase: ${found.name}`)
      ) {
        await prisma.transaction.deleteMany({ where: { id: tx.id, farmId } });
        expenseRemoved = true;
      } else {
        expenseKeptReason =
          "The purchase cost was recorded separately and has been left in your books for you to check.";
      }
    }

    // A customer the save created alongside a sale: only removed when nothing
    // else has been attached to them since, because a customer with sales is
    // real and the farmer did not ask for them to be deleted.
    const customerId = claimed.customer;
    if (customerId) {
      /* Scoped to this farm even though `customerId` came from a record we just
         created, which makes an unscoped count provably harmless today. It is
         scoped anyway because the alternative is a query whose safety depends
         on reasoning about provenance three functions away — and the day that
         provenance changes, this silently becomes a cross-tenant count. */
      const linked = await prisma.sale.count({ where: { customerId, farmId } });
      if (linked <= 1) {
        await prisma.customer.deleteMany({ where: { id: customerId, farmId } });
        companionRemoved++;
      }
    }

    // Children that exist only because of this record. `id` was resolved
    // through this farm above, so flockId is too — but the flock is looked up
    // rather than assumed below, because "it belongs to us" should be a fact
    // the database agrees with at the moment of the write.
    if (entity === "flock") {
      const { count } = await prisma.vaccination.deleteMany({ where: { flock: { farmId }, flockId: id } });
      companionRemoved += count;
    }

    await (prisma as any)[model].deleteMany({ where: { id, farmId } });

    res.json({
      ok: true,
      removed: found.name ?? found.itemName ?? found.flockId ?? "record",
      expenseRemoved,
      companionRemoved,
      expenseKeptReason,
    });
  } catch (error) {
    console.error("Intake undo error:", error);
    res.status(500).json({ error: "I could not remove that. Please try again." });
  }
});

function asIdRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) out[key] = n;
  }
  return out;
}

/**
 * Which table holds each entity's record.
 *
 * A switch rather than a map built from the entity name, because the names and
 * the models do not line up ("inventory" → inventory, "flock" → flock, but
 * "transaction" → transaction and "production" → dailyProduction) and a
 * computed lookup would quietly send an undo at the wrong table.
 */
export function primaryModelFor(entity: IntakeEntity): string {
  switch (entity) {
    case "flock": return "flock";
    case "crop": return "crop";
    case "worker": return "worker";
    case "customer": return "customer";
    case "inventory": return "inventory";
    case "transaction": return "transaction";
    case "sale": return "sale";
    case "invoice": return "invoice";
    case "production": return "dailyProduction";
    case "vaccination": return "vaccination";
    case "attendance": return "attendance";
    default: {
      const unreachable: never = entity;
      throw new Error(`no model for ${String(unreachable)}`);
    }
  }
}

/**
 * Pull the existing values for a record, as a map suitable for prefill.
 *
 * Returns every field the intake knows about, filled from the row where the
 * database has it and left blank where it does not. The caller passes this to
 * buildIntake as prefill so the form opens showing what is already there.
 *
 * undefined is returned when the record was not found — the caller decides
 * whether that is an error or "nothing to prefill".
 */
export async function fetchRecordValues(
  entity: IntakeEntity,
  id: number,
  farmId: number,
): Promise<Record<string, string> | undefined> {
  const model = primaryModelFor(entity);
  const row = await (prisma as any)[model].findFirst({ where: { id, farmId } });
  if (!row) return undefined;
  const source = intakeSource(entity);
  const out: Record<string, string> = {};
  for (const field of source.sections.flatMap((s) => s.fields)) {
    const val = row[field.key];
    if (val === null || val === undefined) continue;
    if (field.type === "date" && val instanceof Date) {
      out[field.key] = val.toISOString().slice(0, 10);
    } else if (field.type === "number" || field.type === "money") {
      const n = Number(val);
      if (Number.isFinite(n)) out[field.key] = String(n);
    } else {
      out[field.key] = String(val);
    }
  }
  return out;
}

/**
 * PUT /api/ai/intake/:entity/:id — update a record the farmer already saved.
 *
 * Same validation as the create path, but writes through Prisma's update so
 * only the fields the farmer sent change. Blank fields keep their existing
 * value — an update is a correction, not a rewrite from nothing.
 */
router.put("/:entity/:id", async (req: Request, res: Response) => {
  const entity = entityOf(req, res);
  if (!entity) return;
  const userId = req.user!.userId;
  const farmId = req.user!.farmId;
  if (!userId || !farmId) return res.status(400).json({ error: "No farm associated with account" });

  try {
    if (!(await moduleAllowed(userId, entity))) {
      return res.status(403).json({
        error:
          "That part of the farm is not in your plan yet, so I have not updated it. " +
          "Ask for something your plan includes instead, or upgrade to unlock it.",
      });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Which record?" });

    // Scope by farm before touching anything.
    const model = primaryModelFor(entity);
    const found = await (prisma as any)[model].findFirst({ where: { id, farmId } });
    if (!found) return res.status(404).json({ error: "That record is not on your farm." });

    const { values, errors, ok, missingRequired } = validateIntake(entity, req.body?.values);
    if (!ok) {
      return res.status(400).json({
        error: "Please check the highlighted answers.",
        errors,
        missingRequired,
        values,
      });
    }

    const saved = await updateIntake(entity, farmId, userId, values, id);
    if (!saved.ok) return res.status(400).json({ error: saved.error, errors, values });

    return res.status(200).json({
      ok: true,
      entity,
      record: saved.record,
      summary: saved.summary,
      alsoCreated: saved.alsoCreated ?? {},
      warning: saved.warning ?? null,
      values,
      updated: true,
    });
  } catch (error) {
    console.error("Intake update error:", error);
    res.status(500).json({ error: "I could not update that just now. Please try again." });
  }
});

export default router;