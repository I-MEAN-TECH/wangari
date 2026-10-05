/**
 * What model does Wangari actually talk to right now?
 *
 * Until this file existed the answer was four environment variables read once
 * at import time, which is fine until a super-admin needs to change it: the
 * only route to a different model was an SSH session, an editor, a `tsc`, and
 * a service restart. The super-admin AI module makes that a form.
 *
 * ── the rule that keeps this safe ───────────────────────────────────────
 * THE DATABASE NEVER OVERRIDES A WORKING ENVIRONMENT. If the registry has no
 * usable primary — the table is empty, every row was deleted, a key fails to
 * decrypt, the query throws — the resolver returns the env configuration and
 * the assistant carries on exactly as it did before this module existed.
 *
 * That direction matters. The alternative (env wins only when the DB is
 * healthy) means a database blip silently degrades every farmer's assistant to
 * a model the operator chose months ago, with nothing in the logs. A config
 * module that can take the product down is worse than no config module.
 *
 * ── why it is cached ────────────────────────────────────────────────────
 * This is read on the request path of the AI route, once per agent step. A
 * Prisma query per step would add a database round trip to the slowest thing in
 * the product, for data that changes a few times a year. The cache is
 * invalidated explicitly by the admin routes the moment anything changes, so the
 * TTL is a safety net rather than the mechanism.
 */

import { prisma } from "../db.js";
import { decryptSecret } from "./ai-secret.js";
import { getProvider, type AIProviderConfig } from "../ai-providers.js";

export interface ResolvedModel {
  provider: string;
  model: string;
  baseUrl: string;
  /** Plaintext, for the outbound Authorization header. Never returned by an API. */
  apiKey: string;
  /** Which model takes over if this one is retired. */
  fallbacks: string[];
  /** True when this came from .env rather than the registry. */
  fromEnv: boolean;
}

export interface ResolvedSettings {
  searchesPerTurn: number;
  rateLimitWindowMs: number;
  /** Ceiling on a single retry sleep. Kept beside the window because the two
   *  only make sense together: a window longer than the ceiling is unreachable
   *  by definition (see lib/rate-limit-window.ts). */
  rateLimitMaxWaitMs: number;
  rateLimitMaxRetries: number;
  maxSteps: number;
  allowPaidModels: boolean;
}

/** Code defaults, identical to the values in routes/ai.ts. */
export const DEFAULT_SETTINGS = {
  searchesPerTurn: 2,
  rateLimitWindowMs: 60_000,
  rateLimitMaxWaitMs: 90_000,
  rateLimitMaxRetries: 2,
  maxSteps: 8,
  allowPaidModels: false,
} as const;

interface CacheEntry {
  value: ResolvedModel;
  expiresAt: number;
}

const TTL_MS = 30_000;
let cache: CacheEntry | null = null;
let settingsCache: { value: ResolvedSettings; expiresAt: number } | null = null;

/**
 * Drop the cache. Called by every admin route that changes the registry, so a
 * newly activated model is live on the next request rather than up to 30s later.
 */
export function invalidateAiCache(): void {
  cache = null;
  settingsCache = null;
}

function envFallback(): ResolvedModel {
  const providerId = process.env.AI_PROVIDER || "unorouter";
  const provider: AIProviderConfig = getProvider(providerId) || getProvider("gemini")!;
  return {
    provider: providerId,
    model: process.env.AI_MODEL || provider.defaultModel,
    baseUrl: process.env.AI_BASE_URL || provider.baseUrl,
    apiKey: process.env.AI_API_KEY || "",
    fallbacks: (process.env.AI_MODEL_FALLBACKS || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    fromEnv: true,
  };
}

/**
 * The model the assistant should use, from the registry if it is usable.
 *
 * Never throws: a database that is down must not become a 500 on the AI route.
 * Any failure returns the environment configuration and says so via `fromEnv`.
 */
export async function resolveActiveModel(): Promise<ResolvedModel> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  try {
    const primary = await prisma.aiModel.findFirst({
      where: { role: "primary", enabled: true },
    });
    if (!primary) return envFallback();

    // A row with no stored key falls back to the env key for its provider,
    // which is the common case: the key stays in .env and only the model moves
    // into the registry.
    const storedKey = decryptSecret(primary.apiKeyEnc);
    const apiKey = storedKey || process.env.AI_API_KEY || "";
    if (!apiKey && primary.provider !== "ollama") return envFallback();

    const provider = getProvider(primary.provider);
    const fallbacks = await prisma.aiModel
      .findMany({ where: { role: "fallback", enabled: true }, select: { model: true } })
      .catch(() => []);

    const value: ResolvedModel = {
      provider: primary.provider,
      model: primary.model,
      baseUrl: primary.baseUrl || provider?.baseUrl || "",
      apiKey,
      // An explicitly configured fallback outranks the registry's, because an
      // operator who set it in .env meant it.
      fallbacks: [
        ...fallbacks.map((f) => f.model),
        ...(process.env.AI_MODEL_FALLBACKS || "")
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      ],
      fromEnv: false,
    };
    cache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    return envFallback();
  }
}

/** Operator-tunable knobs, with the code defaults as the floor. */
export async function resolveSettings(): Promise<ResolvedSettings> {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) return settingsCache.value;
  try {
    const row = await prisma.aiSettings.findUnique({ where: { id: 1 } });
    const value: ResolvedSettings = {
      searchesPerTurn: row?.searchesPerTurn ?? DEFAULT_SETTINGS.searchesPerTurn,
      rateLimitWindowMs: row?.rateLimitWindowMs ?? DEFAULT_SETTINGS.rateLimitWindowMs,
      // Not operator-tunable in the UI on purpose: raising the retry ceiling
      // means holding an SSE connection open past nginx's 120s read timeout,
      // and the farmer watches a connection die with no word. The window below
      // IS adjustable, because that is the one the provider actually reports.
      rateLimitMaxWaitMs: DEFAULT_SETTINGS.rateLimitMaxWaitMs,
      rateLimitMaxRetries: DEFAULT_SETTINGS.rateLimitMaxRetries,
      maxSteps: row?.maxSteps ?? DEFAULT_SETTINGS.maxSteps,
      allowPaidModels: row?.allowPaidModels ?? DEFAULT_SETTINGS.allowPaidModels,
    };
    settingsCache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Record a real outcome against a model.
 *
 * Fire-and-forget. This exists so the admin UI can show a model that passes its
 * probe but is slow or flapping under real traffic — a probe measures one
 * synthetic call, and the interesting failures happen on step 3 of a real farm
 * job. A failure to record health must never delay or fail a farmer's turn.
 */
export async function recordModelOutcome(
  model: string,
  ok: boolean,
  latencyMs: number,
): Promise<void> {
  try {
    const row = await prisma.aiModel.findFirst({
      where: { model },
      select: { id: true },
    });
    if (!row) return;
    await prisma.aiModel.update({
      where: { id: row.id },
      data: {
        lastLatencyMs: latencyMs,
        lastUsedAt: new Date(),
        ...(ok ? { successCount: { increment: 1 } } : { failureCount: { increment: 1 } }),
      },
    });
  } catch {
    /* health telemetry is never worth failing a turn over */
  }
}
