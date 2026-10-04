/**
 * Live free-model discovery for Wangari.
 *
 * ── why this exists ──────────────────────────────────────
 * The free-model roster at OpenRouter turns over constantly, and the
 * failure is silent and total: a retired model answers HTTP 404
 * "This model is unavailable for free", which takes the whole assistant
 * down rather than degrading. A hard-coded list therefore rots — the
 * previous default, meta-llama/llama-3.3-70b-instruct:free, was retired
 * this way and took the demo with it.
 *
 * So the roster is fetched live rather than trusted, and the app falls
 * back to the next working model when one disappears.
 *
 * ── what "best" actually means here ───────────────────────
 * Not parameter count and not context length. A model is only usable as
 * Wangari if it can do the thing Wangari does: call a farm tool, read the
 * result, then call a SECOND tool. Measured live against the real API:
 *
 *   stealth/space-bunny-alpha   1M ctx, step 1 ok, step 2 NONE  ✗ rejected
 *   thinkingmachines/inkling     1M ctx, HTTP 403 (harness only) ✗ rejected
 *   qwen/qwen3.8-27b:free      256k ctx, both steps ok          ✓ used
 *
 * Space Bunny is the flashier model and would have been the obvious pick
 * on paper. It cannot finish a job, which for a farmer means the screen
 * goes quiet halfway through recording a sale — the single most
 * confusing failure this product has. That is why the probe below
 * requires the SECOND tool call, not just the first.
 */

export interface DiscoveredModel {
  id: string;
  contextLength: number;
  supportsTools: boolean;
}

/** How many candidates to probe per discovery run. */
const MAX_PROBES = 4;

/**
 * Models verified to complete a two-step agentic run, most-trusted first.
 *
 * Used when the network cannot be reached, and as the first choice when
 * discovery is disabled. Everything here has been exercised against the
 * live API, not read off a marketing page.
 */
export const VERIFIED_MODELS = ["qwen/qwen3.8-27b:free"];

/** Cheap probe: can the model call a tool, then call a SECOND one? */
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

const PROBE_ASK =
  "Record a sale of 4500 shillings to customer 3, then tell me how my farm is doing this month.";

/** Cheap in memory, not in tokens: one tiny two-step run. */
function headersFor(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost",
    "X-Title": "Wangari model probe",
  };
}

/**
 * List every genuinely free model that advertises tool support.
 *
 * "Free" is both prices at exactly zero — a model can be free to call but
 * charge for output, which would quietly bill the account.
 */
export async function discoverFreeModels(
  apiKey: string,
  baseUrl = "https://openrouter.ai/api/v1",
): Promise<DiscoveredModel[]> {
  const res = await fetch(`${baseUrl}/models`, { headers: headersFor(apiKey) });
  if (!res.ok) throw new Error(`Model discovery failed (${res.status})`);
  const json: any = await res.json();

  return (json.data || [])
    .filter(
      (m: any) =>
        String(m.pricing?.prompt) === "0" && String(m.pricing?.completion) === "0",
    )
    .filter((m: any) => m.supported_parameters?.includes("tools"))
    .map((m: any) => ({
      id: m.id as string,
      contextLength: (m.context_length as number) || 0,
      supportsTools: true,
    }));
}

/**
 * Can this model finish a job — call a tool, then a second?
 *
 * Returns false rather than throwing on any failure, because a model that
 * is merely unavailable is a normal condition here, not an exception.
 */
export async function canRunAgenticLoop(
  model: string,
  apiKey: string,
  baseUrl = "https://openrouter.ai/api/v1",
): Promise<boolean> {
  const headers = headersFor(apiKey);
  try {
    const first = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        tools: PROBE_TOOLS,
        tool_choice: "auto",
        messages: [{ role: "user", content: PROBE_ASK }],
      }),
    });
    if (!first.ok) return false;
    const firstJson: any = await first.json();
    const calls = firstJson.choices?.[0]?.message?.tool_calls;
    if (!calls?.length) return false;

    // A malformed argument payload is the free models' most common defect;
    // it means the executor would silently record the wrong thing. Parsing
    // is not sufficient on its own: `null` and bare numbers are valid JSON
    // and still unusable as tool arguments, so the shape is checked too.
    assertUsableArgs(calls[0].function.arguments);

    const second = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        tools: PROBE_TOOLS,
        messages: [
          { role: "user", content: PROBE_ASK },
          { role: "assistant", content: null, tool_calls: calls },
          { role: "tool", tool_call_id: calls[0].id, content: "Recorded sale KES 4,500" },
        ],
      }),
    });
    if (!second.ok) return false;
    const secondJson: any = await second.json();
    const next = secondJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!next) return false;
    assertUsableArgs(next.function.arguments);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tool arguments must parse AND be a plain object.
 *
 * `JSON.parse("null")` succeeds, so a parse-only check would wave through a
 * payload the executor cannot spread into a tool call.
 */
function assertUsableArgs(raw: unknown): void {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments are not an object");
  }
}

/**
 * Pick the best currently-working model.
 *
 * Probes a bounded number of candidates and returns the first that
 * completes the agentic loop. Bounded because each probe is two live
 * calls, and the free tier is 50 requests a day ACCOUNT-WIDE — a
 * discovery sweep must not spend a farmer's demo quota.
 *
 * Verified models are probed first so the common case costs two calls and
 * never touches the wider roster.
 */
export async function pickBestFreeModel(
  apiKey: string,
  opts: { baseUrl?: string; maxProbes?: number } = {},
): Promise<{ model: string; verified: boolean; probed: number } | null> {
  const baseUrl = opts.baseUrl || "https://openrouter.ai/api/v1";
  const maxProbes = opts.maxProbes ?? MAX_PROBES;
  let probed = 0;

  for (const model of VERIFIED_MODELS) {
    probed++;
    if (probed > maxProbes) break;
    if (await canRunAgenticLoop(model, apiKey, baseUrl)) {
      return { model, verified: true, probed };
    }
  }

  // The verified default is gone. Widen the search rather than 404.
  let free: DiscoveredModel[] = [];
  try {
    free = await discoverFreeModels(apiKey, baseUrl);
  } catch {
    return null;
  }

  // Largest context first, purely as a tie-break between models that have
  // all passed the same behavioural probe.
  free.sort((a, b) => b.contextLength - a.contextLength);

  for (const m of free) {
    if (VERIFIED_MODELS.includes(m.id)) continue;
    if (probed >= maxProbes) break;
    probed++;
    if (await canRunAgenticLoop(m.id, apiKey, baseUrl)) {
      return { model: m.id, verified: false, probed };
    }
  }

  return null;
}
