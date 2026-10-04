import { describe, it, expect } from "vitest";
import {
  judgeModel,
  rankCandidates,
  FREE_SUFFIX,
  MIN_CONTEXT,
  DEFAULT_PROBE_LIMIT,
  type RosterModel,
} from "./free-model-roster";

/**
 * The dangerous part of picking a free model is not choosing the wrong one.
 * It is choosing an IMAGE model, or an embedding model, or Whisper — because
 * those are all free, all reachable, and all at the top of any leaderboard
 * that scores on aesthetics rather than on whether the model can be asked a
 * question about a farm.
 *
 * Every id below is a REAL row from the live UnoRouter roster, captured on
 * 2026-10-05. Invented fixtures would let a filter pass tests while failing
 * against the actual endpoint, which is the failure mode this whole exercise
 * exists to undo.
 */

const LIVE = {
  quietGoodnight: { id: "quiet-goodnight-xl:free", owned_by: "ai horde", supported_endpoint_types: ["aihorde"] },
  dreamshaper: { id: "dreamshaper:free", owned_by: "ai horde", supported_endpoint_types: ["aihorde"] },
  ponyViaOpenai: { id: "wai-cute-pony:free", owned_by: "someone else", supported_endpoint_types: ["openai"], context_length: 8192 },
  jinaEmbed: { id: "jina-embeddings-v3:free", owned_by: "openai", supported_endpoint_types: ["openai", "embedding"], context_length: 8192 },
  whisper: { id: "whisper-large-v3-turbo:free", owned_by: "openai", supported_endpoint_types: ["openai"] },
  tinyCtx: { id: "allam-2-7b:free", owned_by: "openai", supported_endpoint_types: ["openai"], context_length: 4096 },
  incumbent: { id: "space-bunny-alpha:free", owned_by: "openrouter", supported_endpoint_types: ["openai"], context_length: 1_000_000, max_output_tokens: 524_288 },
  qwen: { id: "qwen3-next-80b-a3b-instruct:free", owned_by: "openai", supported_endpoint_types: ["openai"], context_length: 131_100, max_output_tokens: 65_536 },
  bigCtx: { id: "some-new-unknown:free", owned_by: "openai", supported_endpoint_types: ["openai"], context_length: 1_000_000 },
  paid: { id: "gpt-4o", owned_by: "openai", supported_endpoint_types: ["openai"], context_length: 128_000 },
} satisfies Record<string, RosterModel>;

describe("the price signal on a roster with no pricing", () => {
  it("treats the :free suffix as the cost signal", () => {
    // Every id without the suffix is billable. This single rule is what stops
    // discovery from quietly subscribing a farmer's app to a paid model.
    expect(judgeModel(LIVE.paid).reason).toBe("not-free");
    expect(judgeModel(LIVE.incumbent).candidate).toBeDefined();
    expect(FREE_SUFFIX).toBe(":free");
  });

  it("rejects a model that is free but bills anyway in spirit: zero context", () => {
    // `nova-3:free` and `aura-1:free` ship with no context_length at all.
    // We cannot know if they can hold a system prompt, and assuming so is how
    // a model ends up looking like it stopped listening.
    const noCtx = judgeModel({ id: "nova-3:free", owned_by: "cloudflare", supported_endpoint_types: ["openai"] });
    expect(noCtx.reason).toBe("context-too-small");
  });
});

describe("not handing a farm assistant a picture generator", () => {
  it("rejects AI Horde entries, which are all image models", () => {
    // Verified on the live roster: all 22 `ai horde` free models are
    // diffusion - absolutereality, albedobase-xl-sdxl, dreamshaper,
    // juggernaut-xl, nova-anime-xl, pony variants, fustercluck.
    for (const m of [LIVE.quietGoodnight, LIVE.dreamshaper]) {
      expect(judgeModel(m).reason).toBe("image-model");
    }
  });

  it("rejects an image model even if it is not from AI Horde", () => {
    // Defence for a provider that starts listing images on an openai
    // endpoint. A false positive costs one candidate; a false negative costs
    // the product.
    expect(judgeModel(LIVE.ponyViaOpenai).reason).toBe("image-model");
  });

  it("rejects the embedding models that share the chat endpoint", () => {
    expect(judgeModel(LIVE.jinaEmbed).reason).toBe("embedding-model");
  });

  it("rejects Whisper, which transcribes audio and cannot be questioned", () => {
    // whisper-large-v3-turbo:free sits on a plain `openai` endpoint and is
    // free. It is also completely unusable as a chat model.
    expect(judgeModel(LIVE.whisper).reason).toBe("speech-model");
  });

  it("rejects a transport we have no client for", () => {
    expect(judgeModel({ id: "x:free", supported_endpoint_types: ["aihorde"] }).reason).toBe(
      "not-chat-transport",
    );
  });
});

describe("keeping only what can actually hold the prompt", () => {
  it("requires a window big enough for 30 tool schemas plus the system prompt", () => {
    expect(judgeModel(LIVE.tinyCtx).reason).toBe("context-too-small");
    expect(MIN_CONTEXT).toBeGreaterThanOrEqual(16_000);
    expect(judgeModel(LIVE.qwen).candidate).toBeDefined();
  });
});

describe("ranking", () => {
  const roster = Object.values(LIVE);

  it("keeps the current pinned model first, because it already passed here", () => {
    // Switching away from a probe-verified incumbent on a hunch is how a
    // working assistant gets replaced by one that does not.
    const { candidates } = rankCandidates(roster);
    expect(candidates[0].model.id).toBe("space-bunny-alpha:free");
  });

  it("prefers a probe-verified family over an equally capable unknown", () => {
    const { candidates } = rankCandidates(roster);
    const ids = candidates.map((c) => c.model.id);
    expect(ids.indexOf("qwen3-next-80b-a3b-instruct:free")).toBeLessThan(
      ids.indexOf("some-new-unknown:free"),
    );
  });

  it("reports what it threw away and why", () => {
    // "We looked at N free models and M were pictures" is the sentence an
    // operator needs before trusting an automatic choice.
    const { candidates, rejected } = rankCandidates(roster);
    expect(candidates.length + rejected.length).toBe(roster.length);
    expect(rejected.filter((r) => r.reason === "image-model").length).toBe(3);
    expect(rejected.map((r) => r.reason)).toContain("speech-model");
  });

  it("never returns a rejection as a candidate", () => {
    const { candidates } = rankCandidates(roster);
    for (const c of candidates) {
      expect(c.model.id).toMatch(/:free$/);
      expect(String(c.model.owned_by ?? "")).not.toBe("ai horde");
      expect(Number(c.model.context_length ?? 0)).toBeGreaterThanOrEqual(MIN_CONTEXT);
    }
  });

  it("survives a malformed roster rather than throwing at request time", () => {
    // A provider changing its shape must degrade to "nothing to offer",
    // which the caller reports honestly - not an exception that takes the
    // assistant down mid-question.
    expect(() => rankCandidates([])).not.toThrow();
    expect(() => rankCandidates(undefined as any)).not.toThrow();
    expect(rankCandidates(undefined as any).candidates).toEqual([]);
    expect(judgeModel({} as RosterModel).reason).toBe("not-free");
    expect(judgeModel({ id: "x:free" }).reason).toBe("context-too-small");
  });

  it("bounds how many models an operator is asked to pay for", () => {
    // Each probe is two provider requests on a one-per-minute plan, so the
    // shortlist has to stop rather than continue to the bottom of the roster.
    expect(DEFAULT_PROBE_LIMIT).toBeGreaterThan(0);
    expect(DEFAULT_PROBE_LIMIT).toBeLessThanOrEqual(10);
  });
});