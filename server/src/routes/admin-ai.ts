import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireAdmin, auditAdminAction } from "../lib/admin-auth.js";
import { encryptSecret, maskSecret } from "../lib/ai-secret.js";
import { invalidateAiCache, resolveActiveModel, resolveSettings, DEFAULT_SETTINGS } from "../lib/ai-settings.js";
import { probeAgentic } from "../lib/agentic-probe.js";
import { fetchRoster, rankCandidates } from "../lib/free-model-roster.js";
import { modelHealth, sidelinedForMs, summariseUsage } from "../lib/model-health.js";
import { AI_PROVIDERS, getProvider } from "../ai-providers.js";

/**
 * Super-admin AI management.
 *
 * Mounted under /api/admin. Everything here is super_admin only — a support
 * agent who can read a customer's farm must not be able to repoint the
 * assistant, and model rows carry a provider credential.
 *
 * ── the one rule this module enforces ───────────────────────────────────
 * A model is NOT activatable until it has passed the agentic probe. That is the
 * whole reason the probe exists (see lib/agentic-probe.ts): a model that cannot
 * chain two tool calls looks perfectly healthy in a chat window and then leaves
 * the screen quiet halfway through recording a sale. Requiring a green probe is
 * what stops that from being discovered by a farmer during a demo.
 *
 * Two more guards, both deliberate:
 *   - activating a PAID model requires `allowPaidModels`, which defaults to
 *     FALSE. This account's balance is $0 and the cheapest accident available
 *     here is a real invoice.
 *   - the primary can never be the same row as the fallback, so a "fallback"
 *     that points at a dead model cannot silently become the only model.
 */

const router = Router();

/** Only super_admin. Passed explicitly so billing/support roles get 403. */
const superOnly = requireAdmin(["super_admin"]);

/** Roles the UI understands. Anything else is rejected rather than stored. */
const ROLES = new Set(["primary", "fallback", "candidate"]);
const PROBE_STATES = new Set(["untested", "passing", "failing", "error"]);

/**
 * What the UI is allowed to show and set.
 *
 * `apiKeyEnc` is excluded by name rather than by a blanket select, so a future
 * column added to the table cannot leak into an admin response by accident.
 */
const SAFE_SELECT = {
  id: true, provider: true, model: true, label: true, role: true,
  costInPerM: true, costOutPerM: true, isFree: true, contextLength: true,
  probeState: true, probeReason: true, probedAt: true, probeMs: true,
  lastLatencyMs: true, successCount: true, failureCount: true, lastUsedAt: true,
  enabled: true, createdAt: true, updatedAt: true,
} as const;

function hasStoredKey(row: { apiKeyEnc?: string | null }): boolean {
  return !!row.apiKeyEnc;
}

// ─── GET /api/admin/ai ─────────────────────────────────────────────────────
/**
 * Everything the module needs in one call: the registry, what is live right
 * now, the operator knobs, and the provider catalogue. Four round trips for a
 * page this dense would make the dashboard feel broken on a slow connection.
 */
router.get("/", superOnly, async (_req: Request, res: Response) => {
  try {
    const [rows, active, settings] = await Promise.all([
      // `apiKeyEnc` is selected so the UI can say whether a key exists, then
      // stripped below. Doing it in one query rather than per-row: the previous
      // version fanned out one findUnique per model, which is a round trip per
      // row on a page that shows them all.
      prisma.aiModel.findMany({
        select: { ...SAFE_SELECT, apiKeyEnc: true },
        orderBy: [{ role: "asc" }, { id: "asc" }],
      }),
      resolveActiveModel(),
      resolveSettings(),
    ]);

    res.json({
      models: rows.map(({ apiKeyEnc, ...rest }) => ({
        ...rest,
        hasKey: hasStoredKey({ apiKeyEnc }),
        // A stored key is never echoed, not even partially. Only the
        // environment key is ever masked for display — see maskSecret.
        keyHint: apiKeyEnc ? "stored (encrypted)" : active.apiKey ? maskSecret(active.apiKey) : null,
      })),
      active: {
        provider: active.provider,
        model: active.model,
        baseUrl: active.baseUrl,
        fallbacks: active.fallbacks,
        fromEnv: active.fromEnv,
        // Enough to prove a key is wired without disclosing it.
        hasKey: !!active.apiKey || active.provider === "ollama",
      },
      settings,
      defaults: DEFAULT_SETTINGS,
      providers: Object.values(AI_PROVIDERS).map((p) => ({
        id: p.id, name: p.name, baseUrl: p.baseUrl, defaultModel: p.defaultModel,
        creditCard: p.creditCard, openaiCompatible: p.openaiCompatible,
        rateLimit: p.rateLimit, setupUrl: p.setupUrl,
      })),
    });
  } catch (error) {
    console.error("Admin AI list error:", error);
    res.status(500).json({ error: "Failed to load AI configuration" });
  }
});

// ─── POST /api/admin/ai/models ────────────────────────────────────────────
/** Register a model. It lands as a disabled candidate until it is probed. */
router.post("/models", superOnly, async (req: Request, res: Response) => {
  try {
    const { provider, model, label, apiKey, baseUrl, costInPerM, costOutPerM, isFree, contextLength } = req.body || {};
    if (!provider || !model) return res.status(400).json({ error: "provider and model are required" });
    if (!getProvider(String(provider))) {
      return res.status(400).json({ error: `Unknown provider "${provider}"` });
    }
    const p = String(provider);
    const m = String(model).trim();

    // A paid model is refused at REGISTRATION, not at activation. Finding out
    // after saving that the model cannot be used is a worse experience than
    // being told immediately, and the cost flag can be corrected on edit.
    const free = isFree === undefined ? m.endsWith(":free") : !!isFree;
    if (!free) {
      const s = await resolveSettings();
      if (!s.allowPaidModels) {
        return res.status(400).json({
          error: "Paid models are disabled. Enable 'allow paid models' in AI settings first.",
        });
      }
    }

    const row = await prisma.aiModel.upsert({
      where: { provider_model: { provider: p, model: m } },
      create: {
        provider: p, model: m,
        label: label ? String(label) : null,
        apiKeyEnc: apiKey ? encryptSecret(String(apiKey)) : null,
        baseUrl: baseUrl ? String(baseUrl) : null,
        costInPerM: costInPerM == null ? null : Number(costInPerM),
        costOutPerM: costOutPerM == null ? null : Number(costOutPerM),
        isFree: free,
        contextLength: contextLength == null ? null : Number(contextLength),
        role: "candidate",
        enabled: false,
      },
      update: {
        label: label ? String(label) : undefined,
        // An empty apiKey field means "leave the stored key alone" — the UI
        // never receives the real key, so re-submitting the form must not
        // blank a working credential.
        ...(apiKey ? { apiKeyEnc: encryptSecret(String(apiKey)) } : {}),
        ...(baseUrl !== undefined ? { baseUrl: baseUrl ? String(baseUrl) : null } : {}),
        costInPerM: costInPerM == null ? undefined : Number(costInPerM),
        costOutPerM: costOutPerM == null ? undefined : Number(costOutPerM),
        isFree: free,
        contextLength: contextLength == null ? undefined : Number(contextLength),
      },
      select: SAFE_SELECT,
    });
    invalidateAiCache();
    auditAdminAction((req as any).admin, "ai.model_registered", "ai_model", row.id, { provider: p, model: m, free });
    res.status(201).json(row);
  } catch (error) {
    console.error("Admin AI register error:", error);
    res.status(500).json({ error: "Failed to register model" });
  }
});

// ─── PATCH /api/admin/ai/models/:id ───────────────────────────────────────
router.patch("/models/:id", superOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.aiModel.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Model not found" });

    const { label, apiKey, baseUrl, costInPerM, costOutPerM, isFree, contextLength, enabled } = req.body || {};
    const data: Record<string, unknown> = {};
    if (label !== undefined) data.label = label ? String(label) : null;
    if (apiKey) data.apiKeyEnc = encryptSecret(String(apiKey));
    if (baseUrl !== undefined) data.baseUrl = baseUrl ? String(baseUrl) : null;
    if (costInPerM !== undefined) data.costInPerM = costInPerM == null ? null : Number(costInPerM);
    if (costOutPerM !== undefined) data.costOutPerM = costOutPerM == null ? null : Number(costOutPerM);
    if (contextLength !== undefined) data.contextLength = contextLength == null ? null : Number(contextLength);
    if (isFree !== undefined) data.isFree = !!isFree;
    if (enabled !== undefined) {
      // Enabling is NOT the same as activating: a model can sit enabled as a
      // candidate without being live. Activation is its own guarded endpoint.
      data.enabled = !!enabled;
    }

    const row = await prisma.aiModel.update({ where: { id }, data, select: SAFE_SELECT });
    invalidateAiCache();
    auditAdminAction((req as any).admin, "ai.model_updated", "ai_model", id, data);
    res.json(row);
  } catch (error) {
    console.error("Admin AI update error:", error);
    res.status(500).json({ error: "Failed to update model" });
  }
});

// ─── POST /api/admin/ai/models/:id/test ───────────────────────────────────
/**
 * Run the two-step agentic probe against a registered model and record the
 * verdict. This is the gate: nothing reaches "primary" without a green one.
 *
 * The gap between step 1 and step 2 matters and is not optional — on a free
 * tier the second call lands inside the minute the first just used and returns
 * 429, which would fail every model for a reason that has nothing to do with
 * the model. See lib/agentic-probe.ts.
 */
router.post("/models/:id/test", superOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.aiModel.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: "Model not found" });

    const provider = getProvider(row.provider);
    const active = await resolveActiveModel();
    // Probe with THIS model's key where we have one; otherwise the environment
    // key, which is the normal case (the key stays in .env, only the model id
    // lives in the registry).
    const { decryptSecret } = await import("../lib/ai-secret.js");
    const apiKey = decryptSecret(row.apiKeyEnc) || active.apiKey;
    if (!apiKey && row.provider !== "ollama") {
      return res.status(400).json({ error: "No API key available to test this model with" });
    }

    const settings = await resolveSettings();
    const baseUrl = row.baseUrl || provider?.baseUrl || active.baseUrl;
    const result = await probeAgentic(row.model, apiKey, baseUrl, fetch, settings.rateLimitWindowMs + 1500);

    const updated = await prisma.aiModel.update({
      where: { id },
      data: {
        probeState: result.passed ? "passing" : "failing",
        probeReason: result.reason,
        probedAt: new Date(),
        probeMs: result.step1Ms != null && result.step2Ms != null ? result.step1Ms + result.step2Ms : (result.step1Ms ?? null),
      },
      select: SAFE_SELECT,
    });
    invalidateAiCache();
    auditAdminAction((req as any).admin, "ai.model_tested", "ai_model", id, { passed: result.passed, reason: result.reason });
    res.json({ model: updated, probe: result });
  } catch (error) {
    console.error("Admin AI test error:", error);
    res.status(500).json({ error: "Test failed to run" });
  }
});

// ─── POST /api/admin/ai/models/:id/activate ───────────────────────────────
/**
 * Promote a model to primary or fallback. Refuses anything that has not passed
 * the probe, and refuses a paid model while `allowPaidModels` is off.
 */
router.post("/models/:id/activate", superOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const role = String(req.body?.role || "primary");
    if (!ROLES.has(role) || role === "candidate") {
      return res.status(400).json({ error: "role must be primary or fallback" });
    }
    const row = await prisma.aiModel.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: "Model not found" });

    if (row.probeState !== "passing") {
      return res.status(400).json({
        error: `This model has not passed the agentic test (${row.probeState}). Run the test before activating it.`,
      });
    }
    const settings = await resolveSettings();
    if (!row.isFree && !settings.allowPaidModels) {
      return res.status(400).json({ error: "Paid models are disabled in AI settings" });
    }

    // Demote whoever holds the seat, then promote. Inside a transaction so a
    // failure cannot leave the farm with no model at all; the partial unique
    // index is the real guarantee, and this just makes the intent obvious.
    await prisma.$transaction(async (tx) => {
      await tx.aiModel.updateMany({ where: { role }, data: { role: "candidate" } });
      await tx.aiModel.update({
        where: { id },
        data: { role, enabled: true, probeState: row.probeState },
      });
    });

    invalidateAiCache();
    auditAdminAction((req as any).admin, `ai.model_activated_${role}`, "ai_model", id, { model: row.model, provider: row.provider });
    const fresh = await resolveActiveModel();
    res.json({ ok: true, active: { provider: fresh.provider, model: fresh.model, fallbacks: fresh.fallbacks, fromEnv: fresh.fromEnv } });
  } catch (error: any) {
    // The unique index firing is the database refusing two primaries, which is
    // the guarantee working. Report it as such rather than a 500.
    if (String(error?.code) === "P2002") {
      return res.status(409).json({ error: "Another model already holds that role" });
    }
    console.error("Admin AI activate error:", error);
    res.status(500).json({ error: "Failed to activate model" });
  }
});

// ─── POST /api/admin/ai/models/:id/deactivate ─────────────────────────────
router.post("/models/:id/deactivate", superOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.aiModel.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: "Model not found" });
    // Deactivating the PRIMARY is refused here, but /ai/release exists for
    // exactly that case — see its comment. Without it, a model promoted here
    // could never be removed again: the delete route refuses the primary, and
    // this route refused to step it down, so the row was stuck permanently.
    if (row.role === "primary") {
      return res.status(400).json({
        error: "Use 'Release to environment' to hand control back to the server's own configuration.",
      });
    }
    await prisma.aiModel.update({ where: { id }, data: { role: "candidate", enabled: false } });
    invalidateAiCache();
    auditAdminAction((req as any).admin, "ai.model_deactivated", "ai_model", id, { model: row.model });
    res.json({ ok: true });
  } catch (error) {
    console.error("Admin AI deactivate error:", error);
    res.status(500).json({ error: "Failed to deactivate model" });
  }
});

// ─── POST /api/admin/ai/release ───────────────────────────────────────────
/**
 * Hand control of the model back to the server's own configuration.
 *
 * This exists because of a real trap found while testing: a model promoted
 * here could not be undone. /ai/models/:id/deactivate refused to step down a
 * primary ("the assistant must always have a model") and the delete route
 * refused to delete one — so once a model was made live from this dashboard,
 * the only way back was to edit the database by hand.
 *
 * The reasoning behind those refusals was right, and it is still enforced:
 * neither route will leave the farm with NO model. What was missing is the
 * third option — stop managing the model here, and let .env be the answer
 * again, which is a safe place to be because that is exactly what every server
 * did before this module existed.
 */
router.post("/release", superOnly, async (req: Request, res: Response) => {
  try {
    const { role } = req.body || {};
    const target = role === "fallback" ? "fallback" : "primary";
    const { count } = await prisma.aiModel.updateMany({
      where: { role: target },
      data: { role: "candidate", enabled: false },
    });
    invalidateAiCache();
    const active = await resolveActiveModel();
    auditAdminAction((req as any).admin, `ai.${target}_released`, "ai_model", null, { released: count, nowUsing: active.model, fromEnv: active.fromEnv });
    res.json({ ok: true, released: count, active: { model: active.model, fromEnv: active.fromEnv } });
  } catch (error) {
    console.error("Admin AI release error:", error);
    res.status(500).json({ error: "Failed to release the model back to the environment" });
  }
});

// ─── DELETE /api/admin/ai/models/:id ──────────────────────────────────────
router.delete("/models/:id", superOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.aiModel.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: "Model not found" });
    if (row.role === "primary") {
      return res.status(400).json({ error: "Cannot delete the live primary. Activate a different model first." });
    }
    await prisma.aiModel.delete({ where: { id } });
    invalidateAiCache();
    auditAdminAction((req as any).admin, "ai.model_deleted", "ai_model", id, { model: row.model, provider: row.provider });
    res.json({ ok: true });
  } catch (error) {
    console.error("Admin AI delete error:", error);
    res.status(500).json({ error: "Failed to delete model" });
  }
});

// ─── PATCH /api/admin/ai/settings ─────────────────────────────────────────
router.patch("/settings", superOnly, async (req: Request, res: Response) => {
  try {
    const { searchesPerTurn, rateLimitWindowMs, maxSteps, allowPaidModels } = req.body || {};
    const data: Record<string, unknown> = {};
    // Bounded rather than merely parsed: an operator setting maxSteps to 100000
    // would hang a farmer's tab for hours on one question.
    if (searchesPerTurn !== undefined) {
      const n = Number(searchesPerTurn);
      if (!Number.isFinite(n) || n < 0 || n > 10) return res.status(400).json({ error: "searchesPerTurn must be 0-10" });
      data.searchesPerTurn = Math.floor(n);
    }
    if (rateLimitWindowMs !== undefined) {
      const n = Number(rateLimitWindowMs);
      if (!Number.isFinite(n) || n < 1000 || n > 300_000) return res.status(400).json({ error: "rateLimitWindowMs must be 1000-300000" });
      data.rateLimitWindowMs = Math.floor(n);
    }
    if (maxSteps !== undefined) {
      const n = Number(maxSteps);
      if (!Number.isFinite(n) || n < 1 || n > 20) return res.status(400).json({ error: "maxSteps must be 1-20" });
      data.maxSteps = Math.floor(n);
    }
    if (allowPaidModels !== undefined) data.allowPaidModels = !!allowPaidModels;

    const row = await prisma.aiSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data, updatedBy: (req as any).admin?.adminId ?? null },
      update: { ...data, updatedBy: (req as any).admin?.adminId ?? null },
    });
    invalidateAiCache();
    auditAdminAction((req as any).admin, "ai.settings_updated", "ai_settings", 1, data);
    res.json(row);
  } catch (error) {
    console.error("Admin AI settings error:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ─── POST /api/admin/ai/discover ──────────────────────────────────────────
/**
 * Fetch the provider's roster and return the filtered shortlist, so an operator
 * picks from what is actually usable rather than typing model ids from memory.
 *
 * Costs one live request. On the free tier that is one of the 50 a day, which
 * is why this is an explicit button rather than something the page does on load.
 */
router.post("/discover", superOnly, async (req: Request, res: Response) => {
  try {
    const providerId = String(req.body?.provider || "unorouter");
    const provider = getProvider(providerId);
    if (!provider) return res.status(400).json({ error: `Unknown provider "${providerId}"` });
    if (!provider.openaiCompatible) {
      return res.status(400).json({ error: `${provider.name} is not OpenAI-compatible, so roster discovery does not apply to it.` });
    }
    const active = await resolveActiveModel();
    const apiKey = active.apiKey;
    if (!apiKey) return res.status(400).json({ error: "No API key configured for this provider" });

    const rows = await fetchRoster(provider.baseUrl, apiKey);
    const { candidates, rejected } = rankCandidates(rows);
    res.json({
      total: rows.length,
      candidates: candidates.slice(0, 40).map((c) => ({
        model: c.model.id, rank: c.rank, why: c.why,
        contextLength: c.model.context_length ?? null, free: true,
      })),
      rejectedSummary: rejected.reduce<Record<string, number>>((acc, r) => {
        acc[r.reason] = (acc[r.reason] || 0) + 1; return acc;
      }, {}),
    });
  } catch (error: any) {
    console.error("Admin AI discover error:", error);
    res.status(500).json({ error: `Discovery failed: ${error?.message || "unknown error"}` });
  }
});

// ─── GET /api/admin/ai/health ───────────────────────────────────────────────
/**
 * Which models are actually working, and who is feeling it.
 *
 * The registry above says what the operator CHOSE. This says what the upstream
 * is DOING — the two diverge on a free tier, and only the second one explains
 * why a farmer says the assistant is broken.
 *
 * ── on the cluster ───────────────────────────────────────────────────────
 * PM2 runs two workers, and this store is in memory per process, so this
 * response is one worker's view. That is stated rather than hidden: `pid` is in
 * the payload so an operator reading two different views knows why, instead of
 * concluding the data is wrong. Each worker learns the same thing from the same
 * upstream within a request or two, and a shared store would cost a database
 * round trip on the hot path to save one cooldown calculation.
 *
 * ── what is deliberately NOT here ─────────────────────────────────────────
 * No request text, no response text, no tool arguments. An operator asking for
 * AI forensics is asking "is it up, for whom, from where" — and the AI's own
 * tenant isolation guarantee is that farm data does not travel between farms.
 * A panel that logged prompt text would be the one place that promise broke.
 */
router.get("/health", superOnly, async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const active = await resolveActiveModel();
    const snapshot = modelHealth.snapshot();
    const uses = modelHealth.recentUses().slice().reverse(); // newest first

    const models = Object.values(snapshot)
      .map((h) => ({ ...h, sidelinedForMs: sidelinedForMs(h, now) }))
      // Busy and broken first: the models an operator needs to act on, not the
      // alphabetical ones.
      .sort((a, b) => b.consecutiveFailures - a.consecutiveFailures || a.uptime - b.uptime);

    // Every distinct fallback, with the reason that caused it. This is the
    // answer to "why is it using that model instead of the one I configured" —
    // which, before the selection was automatic, had no answer at all.
    const fallbacks = uses
      .filter((u) => u.fellBackFrom)
      .slice(0, 50)
      .map((u) => ({
        at: u.at,
        from: u.fellBackFrom,
        to: u.model,
        reason: u.reason,
        userId: u.userId,
        ip: u.ip,
      }));

    res.json({
      // Per-process, and the reason two panels can disagree. See the docblock.
      pid: process.pid,
      now,
      // The ordered, probe-verified list selection is choosing from right now.
      candidates: [active.model, ...active.fallbacks],
      models,
      fallbacks,
      usage: {
        // Computed over EVERY record the store holds, not over the 60 sent
        // below. See summariseUsage's docblock — a client-side count would
        // under-report exactly when traffic got interesting.
        ...summariseUsage(uses),
        byModel: uses.reduce<Record<string, number>>((acc, u) => {
          acc[u.model] = (acc[u.model] || 0) + 1;
          return acc;
        }, {}),
        // Newest first. Enough to spot one farm hammering the assistant from
        // one address; the counts above are the ones not limited by this slice.
        recent: uses.slice(0, 60).map((u) => ({ ...u, at: new Date(u.at).toISOString() })),
      },
    });
  } catch (error) {
    console.error("Admin AI health error:", error);
    res.status(500).json({ error: "Failed to load model health" });
  }
});

// ─── POST /api/admin/ai/health/clear ────────────────────────────────────────
/**
 * An operator says "try that model again, I have fixed it".
 *
 * The only way out of `gone`, by design. A retirement that expires on its own
 * is a trap: it would quietly reintroduce a model the operator retired, and
 * the next farmer to ask would be the one who discovers it.
 */
router.post("/health/clear", superOnly, async (req: Request, res: Response) => {
  try {
    const model = String(req.body?.model ?? "").trim();
    if (!model) return res.status(400).json({ error: "model is required" });
    modelHealth.clear(model);
    auditAdminAction((req as any).admin, "ai.model_health_cleared", "model", null, { model, pid: process.pid });
    res.json({ ok: true, model, note: `Cleared on worker ${process.pid}. Other workers learn on their next call.` });
  } catch (error) {
    console.error("Admin AI health clear error:", error);
    res.status(500).json({ error: "Failed to clear the model" });
  }
});

export default router;
