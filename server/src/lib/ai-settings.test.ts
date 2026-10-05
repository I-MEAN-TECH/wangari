import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The one guarantee this module exists to keep:
 *
 *   A BROKEN REGISTRY MUST NEVER TAKE THE ASSISTANT DOWN.
 *
 * The registry is a convenience — it lets a super-admin change the model from
 * a form instead of an SSH session. If it is empty, unreachable, or holds a row
 * whose key will not decrypt, every farmer must still get the assistant they
 * had before this module existed, served from .env.
 *
 * The direction of that fallback is the whole design. "Env wins unless the DB
 * is healthy" would mean a database blip silently downgrades every farmer to a
 * model the operator chose months ago, with nothing in any log.
 *
 * Prisma is mocked rather than a database stood up: the property under test is
 * "what happens when this query fails", which is precisely what a real database
 * cannot be asked to do on demand.
 */

const aiModel = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
};
const aiSettings = { findUnique: vi.fn(), upsert: vi.fn() };

vi.mock("../db.js", () => ({
  prisma: {
    aiModel,
    aiSettings,
    $transaction: vi.fn(),
  },
}));

const ENV = {
  AI_PROVIDER: "unorouter",
  AI_API_KEY: "env-key-123",
  AI_BASE_URL: "",
  AI_MODEL: "space-bunny-alpha:free",
  AI_MODEL_FALLBACKS: "env-fallback-model",
};

async function load() {
  vi.resetModules();
  return await import("./ai-settings");
}

const PASSING_ROW = {
  id: 1,
  provider: "unorouter",
  model: "admin-chosen-model:free",
  baseUrl: null,
  apiKeyEnc: null,
  enabled: true,
  role: "primary",
};

describe("resolveActiveModel", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of Object.keys(ENV)) {
      saved[k] = process.env[k];
      if (ENV[k as keyof typeof ENV]) process.env[k] = ENV[k as keyof typeof ENV];
      else delete process.env[k];
    }
    aiModel.findFirst.mockReset();
    aiModel.findMany.mockReset();
    aiSettings.findUnique.mockReset();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("uses the registry when a probe-passed primary is enabled", async () => {
    aiModel.findFirst.mockResolvedValue(PASSING_ROW);
    aiModel.findMany.mockResolvedValue([{ model: "registry-fallback:free" }]);
    const { resolveActiveModel } = await load();

    const resolved = await resolveActiveModel();
    expect(resolved.model).toBe("admin-chosen-model:free");
    expect(resolved.fromEnv).toBe(false);
    expect(resolved.apiKey).toBe("env-key-123"); // no stored key, so env's
    expect(resolved.fallbacks).toContain("registry-fallback:free");
  });

  it("falls back to the environment when the registry is EMPTY", async () => {
    // The state of every server that has never had this module used.
    aiModel.findFirst.mockResolvedValue(null);
    const { resolveActiveModel } = await load();

    const resolved = await resolveActiveModel();
    expect(resolved.model).toBe("space-bunny-alpha:free");
    expect(resolved.fromEnv).toBe(true);
    expect(resolved.apiKey).toBe("env-key-123");
  });

  it("falls back to the environment when the DATABASE THROWS", async () => {
    // The critical one. A database blip must not become a 500 for every farmer.
    aiModel.findFirst.mockImplementation(() => Promise.reject(new Error("connection terminated unexpectedly")));
    const { resolveActiveModel } = await load();

    const resolved = await resolveActiveModel();
    expect(resolved.model).toBe("space-bunny-alpha:free");
    expect(resolved.fromEnv).toBe(true);
  });

  it("falls back to the environment when the key cannot be decrypted AND none is in env", async () => {
    delete process.env.AI_API_KEY;
    aiModel.findFirst.mockResolvedValue({ ...PASSING_ROW, apiKeyEnc: "v1.bad.bad.bad" });
    const { resolveActiveModel } = await load();

    // A row that exists but cannot be used must not leave the farm with no
    // assistant at all.
    const resolved = await resolveActiveModel();
    expect(resolved.fromEnv).toBe(true);
    expect(resolved.apiKey).toBe("");
  });

  it("still uses the registry when there is no env key but the row has a key", async () => {
    delete process.env.AI_API_KEY;
    // Set the master key BEFORE importing either module: ai-secret reads it
    // lazily on every call, and load() resets the module registry, so an
    // encrypt done under one secret and a decrypt done under another fails.
    process.env.AI_KEY_ENCRYPTION_SECRET = "test";
    const { encryptSecret } = await import("./ai-secret");
    aiModel.findFirst.mockResolvedValue({ ...PASSING_ROW, apiKeyEnc: encryptSecret("stored-key") });
    aiModel.findMany.mockResolvedValue([]);
    const { resolveActiveModel } = await load();

    const resolved = await resolveActiveModel();
    expect(resolved.model).toBe("admin-chosen-model:free");
    expect(resolved.apiKey).toBe("stored-key");
    delete process.env.AI_KEY_ENCRYPTION_SECRET;
  });

  it("keeps BOTH the registry fallback and the env fallback", async () => {
    aiModel.findFirst.mockResolvedValue(PASSING_ROW);
    aiModel.findMany.mockResolvedValue([{ model: "registry-fallback:free" }]);
    const { resolveActiveModel } = await load();

    const resolved = await resolveActiveModel();
    expect(resolved.fallbacks).toEqual(["registry-fallback:free", "env-fallback-model"]);
  });

  it("serves the cached value within the TTL and re-reads after invalidation", async () => {
    aiModel.findFirst.mockResolvedValue(PASSING_ROW);
    aiModel.findMany.mockResolvedValue([]);
    const { resolveActiveModel, invalidateAiCache } = await load();

    await resolveActiveModel();
    await resolveActiveModel();
    // One query, not two: the cache exists so the AI route does not hit the
    // database once per agent step.
    expect(aiModel.findFirst).toHaveBeenCalledTimes(1);

    invalidateAiCache();
    await resolveActiveModel();
    expect(aiModel.findFirst).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure, so recovery is immediate", async () => {
    aiModel.findFirst.mockRejectedValueOnce(new Error("db down"));
    const { resolveActiveModel } = await load();
    const first = await resolveActiveModel();
    expect(first.fromEnv).toBe(true);

    // The DB comes back. If the failure had been cached, the farm would stay on
    // the env model until the TTL expired — and nothing would say so.
    aiModel.findFirst.mockResolvedValue(PASSING_ROW);
    aiModel.findMany.mockResolvedValue([]);
    const second = await resolveActiveModel();
    expect(second.model).toBe("admin-chosen-model:free");
  });
});

describe("resolveSettings", () => {
  beforeEach(() => {
    aiSettings.findUnique.mockReset();
    aiSettings.findUnique.mockResolvedValue(null);
  });
  afterEach(() => vi.resetModules());

  it("uses the code defaults when no row exists", async () => {
    aiSettings.findUnique.mockResolvedValue(null);
    const { resolveSettings, DEFAULT_SETTINGS } = await load();
    const s = await resolveSettings();
    expect(s.searchesPerTurn).toBe(DEFAULT_SETTINGS.searchesPerTurn);
    expect(s.maxSteps).toBe(DEFAULT_SETTINGS.maxSteps);
    expect(s.allowPaidModels).toBe(false); // the safe default, deliberately
  });

  it("uses the code defaults when the row is only PARTIALLY filled", async () => {
    // A half-filled row must not silently zero the others: 0 searches would
    // silently disable research entirely.
    aiSettings.findUnique.mockResolvedValue({ searchesPerTurn: 4, rateLimitWindowMs: null, maxSteps: null });
    const { resolveSettings, DEFAULT_SETTINGS } = await load();
    const s = await resolveSettings();
    expect(s.searchesPerTurn).toBe(4);
    expect(s.rateLimitWindowMs).toBe(DEFAULT_SETTINGS.rateLimitWindowMs);
    expect(s.maxSteps).toBe(DEFAULT_SETTINGS.maxSteps);
  });

  it("returns the defaults when the database throws", async () => {
    aiSettings.findUnique.mockImplementation(() => Promise.reject(new Error("down")));
    const { resolveSettings, DEFAULT_SETTINGS } = await load();
    const s = await resolveSettings();
    expect(s.searchesPerTurn).toBe(DEFAULT_SETTINGS.searchesPerTurn);
  });

  it("keeps paid models off unless explicitly allowed", async () => {
    aiSettings.findUnique.mockResolvedValue({ allowPaidModels: false });
    const { resolveSettings } = await load();
    expect((await resolveSettings()).allowPaidModels).toBe(false);
  });
});

describe("recordModelOutcome", () => {
  beforeEach(() => {
    aiModel.findFirst.mockReset();
    aiModel.update.mockReset();
  });
  afterEach(() => vi.resetModules());

  it("records a success and a latency", async () => {
    aiModel.findFirst.mockResolvedValue({ id: 7 });
    aiModel.update.mockResolvedValue({});
    const { recordModelOutcome } = await load();
    await recordModelOutcome("some-model", true, 1234);
    expect(aiModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ lastLatencyMs: 1234, successCount: { increment: 1 } }),
      }),
    );
  });

  it("never throws when the health write fails", async () => {
    // Health telemetry is not worth failing a farmer's turn over.
    aiModel.findFirst.mockImplementation(() => Promise.reject(new Error("db down")));
    const { recordModelOutcome } = await load();
    await expect(recordModelOutcome("some-model", true, 10)).resolves.toBeUndefined();
  });

  it("does nothing for a model that is not registered", async () => {
    aiModel.findFirst.mockResolvedValue(null);
    const { recordModelOutcome } = await load();
    await recordModelOutcome("unknown-model", true, 10);
    expect(aiModel.update).not.toHaveBeenCalled();
  });
});
