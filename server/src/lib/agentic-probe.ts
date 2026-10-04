/**
 * The agentic probe — can this model finish a farm job?
 *
 * ── why this exists ──────────────────────────────────────
 * A model that answers a question is not a model that can be Wangari. The
 * only thing that matters is whether it can call a farm tool, read the
 * result, then call a SECOND tool and use it. A model that stops after the
 * first call leaves the screen quiet halfway through recording a sale, which
 * is the most confusing failure this product has: the farmer asked for one
 * thing and got a dead panel.
 *
 * That is not hypothetical. It is how the previous default was caught —
 * the same space-bunny-alpha that FAILS this probe on OpenRouter PASSES it
 * on UnoRouter, at ~1.7s a call. The provider was the problem, not the model.
 *
 * ── the roster, and why it was wrongly written off ───────
 * An earlier version held a hardcoded list of "free" models and probed down
 * it. That list rotted the way rotted lists do — a retired model answers 404
 * and takes the assistant down — so it was replaced by live discovery and the
 * roster was deleted outright, on the stated grounds that "UnoRouter does not
 * publish per-model pricing, so discovery cannot run there".
 *
 * That ground was wrong, and checking rather than repeating the assumption is
 * what caught it. A live call returned 267 models with ZERO pricing fields —
 * so the old filter (pricing.prompt === 0) matched nothing. But the price IS
 * published: 116 ids end in ":free" and the rest are billable. The filter did
 * not apply to this provider; the roster was there the whole time.
 *
 * So discovery is back, in lib/free-model-roster.ts, using the signal this
 * endpoint actually carries. The probe is still what turns a shortlist into a
 * decision: run scripts/pick-free-model.cjs, and pin the winner in AI_MODEL.
 * Nothing here chooses a model per request — a model re-chosen mid-conversation
 * is a model that can vanish in front of a farmer.
 */

export interface AgenticProbeResult {
  model: string;
  /** Did it chain a second tool call after reading the first result? */
  passed: boolean;
  /** Why it failed, in words a human can act on. */
  reason: string;
  step1Ms?: number;
  step2Ms?: number;
}

/** The tools the probe offers: one write, one read. A read alone is too easy. */
const PROBE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_transaction",
      description: "Record a money transaction on the farm",
      parameters: {
        type: "object",
        properties: { amount_kes: { type: "number" }, reason: { type: "string" } },
        required: ["amount_kes"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_dashboard",
      description: "Read the farm summary for the last 30 days",
      parameters: { type: "object", properties: {} },
    },
  },
];

/**
 * The question. It has to be a TWO-part job on purpose: a model that answers
 * the first part and stops looks identical to a working one until you ask
 * what happens next.
 */
const PROBE_ASK =
  "Record a sale of 4500 shillings to customer 3, then tell me how my farm is doing this month.";

/**
 * Tool arguments must parse AND be a plain object.
 *
 * `JSON.parse("null")` succeeds, so a parse-only check would wave through a
 * payload the executor cannot spread into a tool call — and the farmer gets
 * a record with no amount.
 */
function assertUsableArgs(raw: unknown): Record<string, unknown> {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Tool arguments are not an object: ${JSON.stringify(raw).slice(0, 120)}`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Run the two-step probe against any OpenAI-compatible endpoint.
 *
 * Never throws. A model that is merely unavailable is a normal condition
 * here, not an exception — the caller wants a verdict to log, not a stack.
 */
export async function probeAgentic(
  model: string,
  apiKey: string,
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  /**
   * Milliseconds to wait BETWEEN step 1 and step 2.
   *
   * Zero by default, and that default is a trap this parameter exists to fix.
   * The probe issues two requests; on UnoRouter's free tier the second lands
   * inside the minute the first just used and comes back 429 — so EVERY
   * candidate "failed", and a model serving the farm job fine in production
   * was ruled out by the plan rather than by the model.
   *
   * Measured: four probed candidates all returned "step 2 answered 429".
   * Production survives this because callOpenAICompatible retries on the
   * window; the probe did not, so it was measuring the rate limiter.
   *
   * Default stays 0 so unit tests and any caller with spare quota are
   * unaffected; the selection script passes the real window.
   */
  gapMs = 0,
): Promise<AgenticProbeResult> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const call = (body: unknown) =>
    fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const firstToolCalls = async (r: Response): Promise<any[]> =>
    (((await r.json()) as any)?.choices?.[0]?.message?.tool_calls || []) as any[];

  try {
    const t0 = Date.now();
    const first = await call({
      model,
      tools: PROBE_TOOLS,
      tool_choice: "auto",
      messages: [{ role: "user", content: PROBE_ASK }],
    });
    const step1Ms = Date.now() - t0;
    if (!first.ok) {
      return { model, passed: false, reason: `step 1 answered ${first.status}`, step1Ms };
    }
    const calls = await firstToolCalls(first);
    if (!calls.length) {
      return { model, passed: false, reason: "step 1 made no tool call", step1Ms };
    }
    try {
      assertUsableArgs(calls[0].function.arguments);
    } catch (e: any) {
      return { model, passed: false, reason: `step 1 sent unusable arguments: ${e.message}`, step1Ms };
    }

    if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    const t1 = Date.now();
    const second = await call({
      model,
      tools: PROBE_TOOLS,
      messages: [
        { role: "user", content: PROBE_ASK },
        { role: "assistant", content: null, tool_calls: calls },
        { role: "tool", tool_call_id: calls[0].id, content: "Recorded sale KES 4,500" },
      ],
    });
    const step2Ms = Date.now() - t1;
    if (!second.ok) {
      return { model, passed: false, reason: `step 2 answered ${second.status}`, step1Ms, step2Ms };
    }
    const next = (await firstToolCalls(second))[0];
    if (!next) {
      return { model, passed: false, reason: "stopped after one tool call", step1Ms, step2Ms };
    }
    try {
      assertUsableArgs(next.function.arguments);
    } catch (e: any) {
      return {
        model,
        passed: false,
        reason: `step 2 sent unusable arguments: ${e.message}`,
        step1Ms,
        step2Ms,
      };
    }
    return { model, passed: true, reason: "completed a two-step agentic run", step1Ms, step2Ms };
  } catch (e: any) {
    return { model, passed: false, reason: e?.message || "probe could not run" };
  }
}