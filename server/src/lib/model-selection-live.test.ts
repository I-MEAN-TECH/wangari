import { describe, it, expect, beforeEach } from "vitest";
import { ModelHealthStore, classifyFailure, healthyModel } from "./model-health.js";

/**
 * The claim this file exists to support.
 *
 * "Wangari answered 'UnoRouter: 503' to farmers for an afternoon, while a
 * probe-verified backup sat unused in the environment." The mechanism was that
 * selection happened only AFTER a failure: try the pinned model, and reach for
 * a backup once it returned 404 or an exhausted-channel 503. One model id is a
 * single point of failure on a free tier, where upstream channels saturate
 * without warning and stay saturated for minutes.
 *
 * ── what is real here ────────────────────────────────────────────────────
 * The response bodies are the ones reproduced live against UnoRouter, not
 * invented. The selection and classification functions are the real ones,
 * imported from lib/model-health.ts — the same functions the route calls.
 *
 * ── what is simulated, and why that is stated ────────────────────────────
 * The HTTP round trip. Standing up a fake provider server would still leave the
 * decision unproven unless it ran the real route function, and the route needs
 * a live Postgres and a JWT to mount. The harness below replays a response
 * SEQUENCE through the real decision functions, which is the part that was
 * wrong. The wiring between them — that the route actually calls healthyModel
 * before the request and observes every response — is pinned separately by
 * source assertions in model-fallback.test.ts.
 *
 * So: this proves the policy. That file proves the policy is in the request
 * path. Neither alone would be worth much, which is why both exist.
 */

const T0 = 1_700_000_000_000;

/** What UnoRouter actually returned for the pinned model. */
const EXHAUSTED_503 = JSON.stringify({
  error: {
    code: "get_channel_failed",
    message: "All providers for model space-bunny-alpha:free are busy right now",
  },
});

/** What it returns for the free tier's per-minute cap. Account-wide. */
const RATE_LIMIT_429 = JSON.stringify({
  error: { code: "rate_limit_exceeded", message: "Rate limit reached for requests per minute" },
});

/** A healthy completion. */
const OK_200 = JSON.stringify({
  choices: [{ message: { role: "assistant", content: "The farm recorded 240 eggs today." } }],
});

const PREFERRED = "space-bunny-alpha:free";
const BACKUP = "qwen3-next-80b-a3b-instruct:free";
const CANDIDATES = [PREFERRED, BACKUP];

/**
 * What the request path does, using the real functions.
 *
 * Mirrors callOpenAICompatible: choose first from live health, call, fold the
 * response in, and on a retired/exhausted model try the next candidate. Kept
 * honest by only using exported production functions — if the route's policy
 * and this diverge, the assertions below stop describing the system.
 */
function replay(statuses: Array<{ status: number; body: string }>, store: ModelHealthStore) {
  const tried: string[] = [];
  const answeredBy: string | null = null;
  let remaining = CANDIDATES;
  let clock = T0;
  let answer: string | null = answeredBy;

  for (const { status, body } of statuses) {
    const pick = healthyModel(remaining, store.snapshot(), clock);
    const model = pick.model ?? PREFERRED;
    tried.push(model);
    store.observe(model, status, body, clock);

    const verdict = classifyFailure(status, body).state;
    const retired = verdict === "gone" || verdict === "exhausted";

    if (status >= 200 && status < 300) {
      answer = model;
      break;
    }
    // A 429, a plain 5xx or a 400 is NOT our reason to abandon this model:
    // that failure is about the account or the prompt, not the model.
    if (!retired) {
      answer = model;
      break;
    }
    remaining = remaining.filter((m) => m !== model);
    if (!remaining.length) {
      // Every candidate has now been given its chance. The route throws here
      // rather than answering from a model already known to be dead.
      break;
    }
    clock += 1_000; // the call itself took a second
  }

  return { tried, answeredBy: answer };
}

describe("the assistant keeps working when the pinned model's channels die", () => {
  let store: ModelHealthStore;
  beforeEach(() => {
    store = new ModelHealthStore();
  });

  it("answers the very next farmer instead of showing them the 503", () => {
    // The first request of the session learns the truth and still answers. In
    // the old code this farmer got the 503 on screen and the backup was only
    // reached on a SECOND attempt, if one ever came.
    const r = replay([{ status: 503, body: EXHAUSTED_503 }, { status: 200, body: OK_200 }], store);
    expect(r.answeredBy).toBe(BACKUP);
    expect(r.tried).toEqual([PREFERRED, BACKUP]);
  });

  it("skips the dead model for the next FIVE MINUTES without re-probing it", () => {
    replay([{ status: 503, body: EXHAUSTED_503 }, { status: 200, body: OK_200 }], store);
    const snap = store.snapshot();
    expect(healthyModel(CANDIDATES, snap, T0 + 30_000).model).toBe(BACKUP);
    expect(healthyModel(CANDIDATES, snap, T0 + 299_000).model).toBe(BACKUP);
    // At the five-minute mark the saturated channels have come back and the
    // preferred model gets another chance — it is the operator's first choice.
    expect(healthyModel(CANDIDATES, snap, T0 + 300_000).model).toBe(PREFERRED);
  });

  it("gives the backup its turn when the preferred model dies", () => {
    // Being honest about the limit: with BOTH models exhausted there is nothing
    // to answer from, and the route raises an error. What must not happen is
    // dying on the first call — the verified backup exists precisely so the
    // farmer is not left on the first failure.
    const r = replay(
      [
        { status: 503, body: EXHAUSTED_503 },
        { status: 503, body: EXHAUSTED_503 },
      ],
      store,
    );
    expect(r.tried).toEqual([PREFERRED, BACKUP]);
    expect(r.answeredBy).toBeNull();
  });

  it("does NOT burn a second request on a key-level rate limit", () => {
    // UnoRouter meters one request a minute ACCOUNT-WIDE, so the backup would be
    // refused identically. Rotating here would spend two of the 50 a day and
    // still not answer. One call, on the preferred model, is correct.
    const r = replay([{ status: 429, body: RATE_LIMIT_429 }], store);
    expect(r.tried).toEqual([PREFERRED]);
    expect(store.snapshot()[PREFERRED].state).toBe("rate_limited");
  });

  it("recovers on its own after a retirement, without anyone touching a setting", () => {
    // An operator promoting a replacement adds it below; the retired id is
    // never retried, so the farmer is not spent as evidence.
    store.observe(PREFERRED, 404, "", T0);
    const chain = [PREFERRED, BACKUP, "backup-two:free"];
    const pick = healthyModel(chain, store.snapshot(), T0 + 86_400_000);
    expect(pick.model).toBe(BACKUP);
    expect(pick.reason).toMatch(/retired|gone/i);
  });

  it("shows uptime that reflects reality, not optimism", () => {
    replay([{ status: 503, body: EXHAUSTED_503 }, { status: 200, body: OK_200 }], store);
    const snap = store.snapshot();
    // The pinned model is 0% — that is the honest number an operator needs.
    expect(snap[PREFERRED].uptime).toBe(0);
    expect(snap[PREFERRED].failures).toBe(1);
    // The backup is perfect, because it has only been asked once.
    expect(snap[BACKUP].uptime).toBe(1);
    expect(snap[BACKUP].lastHealthyAt).toBe(T0 + 1_000);
  });
});