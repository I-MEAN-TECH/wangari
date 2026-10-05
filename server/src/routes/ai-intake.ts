/**
 * Wangari's guided intake — the endpoint the form in the chat saves into.
 *
 * ── what this is for ────────────────────────────────────
 * Ask Wangari to add livestock and she used to answer by writing a row with a
 * name and a number. Twenty-six other columns stayed empty because nobody asked
 * the farmer about them, and an empty column is a question they were never
 * given. This route is where that changes: the server describes every question
 * (lib/farm-intake.ts), the farmer fills them in, and the answers come here and
 * are written through the SAME writer the flocks screen uses
 * (lib/flock-create.ts).
 *
 * ── why it is a plain REST endpoint, not a chat turn ─────
 * Each extra conversation turn costs the farmer a minute of the provider's
 * free tier (see lib/agentic-probe.ts), so the interview is deliberately NOT a
 * conversation. One request opens the form and one saves it, whatever the
 * number of questions. A twelve-question form costs what a one-question form
 * costs: nothing.
 *
 * ── stateless on purpose ─────────────────────────────────
 * Nothing is stored between the two calls. The form is fully described by its
 * entity name, so it can be rebuilt from the definition rather than remembered,
 * and this keeps working across PM2's cluster workers where an in-memory
 * session would land on the wrong process about half the time. A farmer who
 * loses their connection mid-form loses nothing but the typing.
 */

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { prisma } from "../db.js";
import {
  buildIntake,
  isIntakeEntity,
  toFlockCreateInput,
  validateIntake,
  type IntakeEntity,
} from "../lib/farm-intake.js";
import { createFlockForFarm } from "../lib/flock-create.js";

const router = Router();
router.use(authMiddleware, requireOwner);

/** The plan rule is the one the livestock screen obeys — see plan-gate.test.ts. */
async function flocksAllowed(userId: number): Promise<boolean> {
  try {
    const { isModuleAllowed } = await import("../middleware/plan-gate.js");
    return await isModuleAllowed(userId, "flocks");
  } catch {
    // Failing OPEN here would let a Starter farm write a record it can never
    // open, which is the invisible-write failure this gate exists to prevent.
    // So the write path fails CLOSED; only the read of the form fails open.
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

/**
 * GET /api/ai/intake/:entity — the questions, with nothing filled in.
 *
 * The chat normally ships the whole card inside the stream event, so this is
 * the way back: a farmer who dismissed the form, or an older build of the app,
 * can still reach it.
 */
router.get("/:entity", async (req: Request, res: Response) => {
  const entity = entityOf(req, res);
  if (!entity) return;
  const userId = req.user!.userId;
  if (!userId) return res.status(400).json({ error: "No account on this session" });
  try {
    const allowed = await flocksAllowed(userId);
    if (!allowed) {
      return res.status(403).json({
        error:
          "Livestock is not part of your plan yet, so I cannot keep these details. " +
          "Ask me about Money, Stock or the weather instead, or upgrade to unlock it.",
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
 * sane form reaches the writer.
 */
router.post("/:entity", async (req: Request, res: Response) => {
  const entity = entityOf(req, res);
  if (!entity) return;
  const userId = req.user!.userId;
  const farmId = req.user!.farmId;
  if (!userId || !farmId) return res.status(400).json({ error: "No farm associated with account" });

  try {
    if (!(await flocksAllowed(userId))) {
      return res.status(403).json({
        error:
          "That part of the farm is not in your plan yet, so I have not saved it. " +
          "Ask for something in Money, Stock or the weather instead, or upgrade to unlock it.",
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

    if (entity === "flock") {
      const payload = toFlockCreateInput(values);
      if (!payload.ok) return res.status(400).json({ error: payload.error, errors, values });

      const created = await createFlockForFarm(farmId, userId, {
        ...(payload.data as any),
        // The intake never collects a vaccination schedule — that comes from
        // the species template when a flock is created through the screen.
        // Scheduling a vaccine the farmer was not shown would be inventing a
        // medical instruction.
        vaccinationSchedule: null,
      });
      if (!created.ok) return res.status(400).json({ error: created.error, errors, values });

      return res.status(201).json({
        ok: true,
        entity,
        flock: created.value.flock,
        alsoCreated: created.value.alsoCreated,
        tagWarning: created.value.tagWarning,
        values,
      });
    }

    /* Every entity the intake knows has a writer. An entity added to
       farm-intake.ts without one must fail loudly here rather than answer
       200 with nothing saved — a form that silently drops a farmer's work is
       worse than no form. */
    return res.status(501).json({ error: "I cannot save that yet." });
  } catch (error) {
    console.error("Intake save error:", error);
    res.status(500).json({ error: "I could not save that just now. Please try again." });
  }
});

/**
 * DELETE /api/ai/intake/:entity/:id — undo a flock saved from the chat.
 *
 * One tap, because the whole promise of the assistant is that a misheard
 * instruction is reversible.
 *
 * It removes the flock, the vaccinations scheduled with it, AND the purchase
 * expense the save created. That last one was found by testing, not by review:
 * the first version of this route deleted the flock and left a KES 100,000
 * expense sitting in the books, while the card told the farmer "nothing was
 * saved". A half-undone record is worse than no undo — the margin now shows a
 * purchase of animals the farm does not have.
 *
 * The expense is only removed when the farmer names it AND it really is the
 * one this flock was bought with. Deleting by description alone would be
 * guessing: two flocks bought from the same place on the same day at the same
 * price produce identical descriptions, and a farmer's own carefully entered
 * transaction is not ours to remove on a hunch.
 */
router.delete("/:entity/:id", async (req: Request, res: Response) => {
  const entity = entityOf(req, res);
  if (!entity) return;
  if (entity !== "flock") return res.status(400).json({ error: "That cannot be undone here." });

  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Which flock?" });
    const farmId = req.user!.farmId!;

    // Scope by farm BEFORE deleting anything: an id from another farm must be
    // refused, not merely not found, so the row is never touched.
    const flock = await prisma.flock.findFirst({ where: { id, farmId } });
    if (!flock) return res.status(404).json({ error: "That flock is not on your farm." });

    let expenseRemoved = false;
    const claimedExpenseId = Number(req.body?.expenseTransactionId);
    if (Number.isInteger(claimedExpenseId) && claimedExpenseId > 0) {
      const tx = await prisma.transaction.findFirst({ where: { id: claimedExpenseId, farmId } });
      // Three things must line up before a money row is deleted: it is on this
      // farm, it is the category the save used, and its description names this
      // flock. Anything less is a coincidence, and a coincidence is not
      // permission to remove a farmer's books.
      if (
        tx &&
        tx.type === "expense" &&
        tx.category === "animal_feed" &&
        String(tx.description || "").includes(`Livestock purchase: ${flock.name}`)
      ) {
        await prisma.transaction.delete({ where: { id: tx.id } });
        expenseRemoved = true;
      }
    }

    await prisma.vaccination.deleteMany({ where: { flockId: id } });
    await prisma.flock.deleteMany({ where: { id, farmId } });

    res.json({
      ok: true,
      removed: flock.name,
      expenseRemoved,
      // Said out loud rather than assumed: if the expense stayed, the farmer
      // must be able to see that rather than find it in next month's margin.
      expenseKeptReason: expenseRemoved
        ? null
        : "The purchase cost was recorded separately and has been left in your books for you to check.",
    });
  } catch (error) {
    console.error("Intake undo error:", error);
    res.status(500).json({ error: "I could not remove that. Please try again." });
  }
});

export default router;