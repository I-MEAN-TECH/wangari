import { describe, it, expect, beforeEach } from "vitest";
import {
  ModelHealthStore,
  classifyFailure,
  healthyModel,
  sidelinedForMs,
  summariseUsage,
} from "./model-health.js";

/**
 * Why this exists.
 *
 * The assistant answered "UnoRouter: 503" to farmers for an entire afternoon
 * while a working backup sat unused in the environment. One pinned model id is
 * a single point of failure on a free tier, where upstream channels are capped
 * without warning.
 *
 * The fix is to stop treating one id as the answer and start treating a list as
 * the answer, keeping a live picture of which of them are actually working.
 *
 * Design rules this file encodes:
 *
 *  - Optimistic. A model we have never seen is tried, because refusing to try
 *    an unknown model means a fresh deploy answers nobody.
 *  - Forget the failures that were somebody else's fault. A 400 for a malformed
 *    request says nothing about whether the model works.
 *  - A rate limit is a pause, a missing model is a retirement. The first earns
 *    a short cooldown, the second never returns until an operator says so.
 *  - Always answer. If every candidate is unhealthy we still return one, because
 *    "Wangari is down" helps nobody and the upstream may have recovered.
 *
 * Everything here is pure or a plain in-memory store so it can be reasoned
 * about without a database, a network, or a clock you do not control.
 */

const NOW = 1_700_000_000_000;

describe("classifyFailure — telling apart failures that deserve different answers", () => {
  it("treats success as healthy", () => {
    expect(classifyFailure(200, "")).toEqual({ state: "healthy", reason: null });
  });

  it("treats a per-account rate limit as a short pause", () => {
    const r = classifyFailure(429, "rate limit exceeded");
    expect(r.state).toBe("rate_limited");
  });

  it("treats an exhausted free-tier channel as a pause, not a retirement", () => {
    // This is the exact body that broke the panel: every provider behind the
    // model was capped at once. The model still exists and still works.
    const body = JSON.stringify({
      error: { code: "get_channel_failed", message: "All providers for model are busy right now" },
    });
    expect(classifyFailure(503, body).state).toBe("exhausted");
  });

  it("treats a missing model as retired", () => {
    expect(classifyFailure(404, "").state).toBe("gone");
    expect(classifyFailure(400, '{"error":{"code":"model_not_found"}}').state).toBe("gone");
  });

  it("does NOT blame the model for a bad request", () => {
    // A 400 about the prompt or the tool schema is our bug. Counting it against
    // the model would rotate us off a perfectly good model.
    for (const s of [400, 401, 403, 422]) {
      expect(classifyFailure(s, "bad request").state, `status ${s}`).toBe("neutral");
    }
  });

  it("treats a 5xx with no channel language as a blip, not exhaustion", () => {
    expect(classifyFailure(500, "internal").state).toBe("neutral");
    expect(classifyFailure(502, "bad gateway").state).toBe("neutral");
    expect(classifyFailure(503, "Service Unavailable").state).toBe("neutral");
  });

  it("keeps a reason a human can read", () => {
    const r = classifyFailure(503, "All providers for model \"x\" are busy right now");
    expect(r.reason).toBeTruthy();
    expect(String(r.reason).length).toBeLessThan(160);
  });
});

describe("selection — answering rather than failing", () => {
  let store: ModelHealthStore;
  beforeEach(() => {
    store = new ModelHealthStore();
  });

  it("uses the preferred model when nothing is known yet", () => {
    const pick = healthyModel(["a:free", "b:free"], store.snapshot(), NOW);
    expect(pick.model).toBe("a:free");
    expect(pick.reason).toMatch(/preferred/i);
  });

  it("moves on when the preferred model's channels are exhausted", () => {
    // This is the one that produced "UnoRouter: 503" for a whole afternoon:
    // every upstream behind that model id was capped at once, and the model
    // itself still exists and still works.
    store.observe("a:free", 503, "get_channel_failed: all providers busy", NOW);
    const pick = healthyModel(["a:free", "b:free"], store.snapshot(), NOW);
    expect(pick.model).toBe("b:free");
    expect(pick.reason).toMatch(/a:free/);
  });

  it("does NOT move on for a rate limit, because the cap is on the key", () => {
    // UnoRouter meters one request a minute ACCOUNT-WIDE. Every model behind
    // this key is refused at the same instant, so switching id would be
    // refused identically — and the call site is already waiting the window
    // out using the key's own last-accepted time. Moving here would only
    // discard the model that was about to answer.
    store.observe("a:free", 429, "rate limit", NOW);
    const pick = healthyModel(["a:free", "b:free"], store.snapshot(), NOW);
    expect(pick.model).toBe("a:free");
    // Still reported, so the panel can say WHY the farmer waited.
    expect(store.snapshot()["a:free"].state).toBe("rate_limited");
  });

  it("comes back to the preferred model once the pause expires", () => {
    store.observe("a:free", 503, "get_channel_failed: all providers busy", NOW);
    const snap = store.snapshot();
    // Five minutes later the saturated channels have come back.
    expect(healthyModel(["a:free", "b:free"], snap, NOW + 300_000).model).toBe("a:free");
    // Five seconds later they have not.
    expect(healthyModel(["a:free", "b:free"], snap, NOW + 5_000).model).toBe("b:free");
  });

  it("tells the panel how long is left, and -1 when only a human can help", () => {
    store.observe("a:free", 503, "get_channel_failed", NOW);
    store.observe("b:free", 404, "", NOW);
    const snap = store.snapshot();
    expect(sidelinedForMs(snap["a:free"], NOW + 60_000)).toBe(240_000);
    expect(sidelinedForMs(snap["b:free"], NOW + 86_400_000)).toBe(-1);
    expect(sidelinedForMs(snap["c:free"], NOW)).toBe(0); // unknown → try it
  });

  it("skips a retired model permanently", () => {
    store.observe("a:free", 404, "", NOW);
    const pick = healthyModel(["a:free", "b:free"], store.snapshot(), NOW + 86_400_000);
    expect(pick.model).toBe("b:free");
    expect(pick.reason).toMatch(/gone|retired/i);
  });

  it("still answers when every model is unhealthy", () => {
    for (const m of ["a:free", "b:free"]) store.observe(m, 404, "", NOW);
    const pick = healthyModel(["a:free", "b:free"], store.snapshot(), NOW + 86_400_000);
    // Not undefined. A farmer gets a real upstream error instead of silence.
    expect(pick.model).toBe("a:free");
    expect(pick.reason).toMatch(/nothing healthy/i);
  });

  it("survives an empty candidate list without throwing", () => {
    expect(() => healthyModel([], store.snapshot(), NOW)).not.toThrow();
    expect(healthyModel([], store.snapshot(), NOW).model).toBeNull();
  });

  it("recovers a retired model when an operator clears it", () => {
    store.observe("a:free", 404, "", NOW);
    store.clear("a:free");
    expect(healthyModel(["a:free", "b:free"], store.snapshot(), NOW + 86_400_000).model).toBe("a:free");
  });

  it("does not spend two requests proving the same model is dead", () => {
    /* The call site recurses with the remaining backups. If the primary is also
       listed among its own backups — an easy .env mistake — the second call
       would name a model already recorded as gone. On a free tier that is one
       of fifty requests a day spent re-learning something we know. */
    const pick = healthyModel(["a:free", "a:free", "b:free"], store.snapshot(), NOW);
    expect(pick.model).toBe("a:free");
    // No fallback, so no predecessor. Falsy rather than null: this branch simply
    // omits the field, and the call site normalises with `?? null` anyway.
    expect(pick.fellBackFrom).toBeFalsy();
    // And with the primary dead, the duplicate must not be tried twice.
    store.observe("a:free", 404, "", NOW);
    expect(healthyModel(["a:free", "a:free", "b:free"], store.snapshot(), NOW).model).toBe("b:free");
  });
});

describe("the store keeps the forensics the admin panel needs", () => {
  let store: ModelHealthStore;
  beforeEach(() => {
    store = new ModelHealthStore();
  });

  it("counts calls and failures per model", () => {
    store.observe("a:free", 200, "", NOW);
    store.observe("a:free", 429, "rate limit", NOW + 1000);
    store.observe("a:free", 200, "", NOW + 2000);
    const h = store.snapshot()["a:free"];
    expect(h.calls).toBe(3);
    expect(h.failures).toBe(1);
    expect(h.state).toBe("healthy");
  });

  it("remembers the last reason a model failed", () => {
    store.observe("a:free", 503, "All providers are busy", NOW);
    const h = store.snapshot()["a:free"];
    // Normalised, not the raw provider body — the panel shows an operator a
    // sentence they can act on, never whatever the upstream happened to say.
    expect(h.lastReason).toMatch(/channel/i);
    expect(h.lastReason).not.toMatch(/All providers/);
    expect(h.lastStatus).toBe(503);
    expect(h.lastFailureAt).toBe(NOW);
  });

  it("does not let a neutral failure change the verdict", () => {
    store.observe("a:free", 200, "", NOW);
    store.observe("a:free", 400, "bad tool schema", NOW + 100);
    const h = store.snapshot()["a:free"];
    expect(h.state).toBe("healthy");
    expect(h.failures).toBe(1); // still counted for the panel...
  });

  it("records which model answered, for the admin panel", () => {
    store.recordUse("a:free", { userId: 7, ip: "197.1.1.1" }, NOW);
    const uses = store.recentUses();
    expect(uses).toHaveLength(1);
    expect(uses[0].model).toBe("a:free");
    expect(uses[0].userId).toBe(7);
    expect(uses[0].ip).toBe("197.1.1.1");
  });

  it("bounds the usage log so it cannot grow without limit", () => {
    for (let i = 0; i < 5000; i++) store.recordUse("a:free", { userId: i, ip: "1.1.1.1" }, NOW + i);
    expect(store.recentUses().length).toBeLessThanOrEqual(500);
  });

  it("reports uptime as the share of calls that succeeded", () => {
    store.observe("a:free", 200, "", NOW);
    store.observe("a:free", 200, "", NOW);
    store.observe("a:free", 200, "", NOW);
    store.observe("a:free", 429, "", NOW);
    const h = store.snapshot()["a:free"];
    expect(h.uptime).toBeCloseTo(0.75, 5);
  });
});

describe("summariseUsage — how many farmers, not how many questions", () => {
  let store: ModelHealthStore;
  beforeEach(() => {
    store = new ModelHealthStore();
  });

  it("counts distinct farmers and addresses, not requests", () => {
    // "480 requests" during an incident does not tell an operator whether that
    // is 480 farmers or three. The distinction is the whole reason this number
    // is computed at all.
    store.recordUse("a:free", { userId: 1, ip: "1.1.1.1" }, NOW);
    store.recordUse("a:free", { userId: 1, ip: "1.1.1.1" }, NOW);
    store.recordUse("a:free", { userId: 1, ip: "2.2.2.2" }, NOW);
    store.recordUse("a:free", { userId: 9, ip: "1.1.1.1" }, NOW);
    const r = summariseUsage(store.recentUses());
    expect(r.total).toBe(4);
    expect(r.uniqueUsers).toBe(2);
    expect(r.uniqueIps).toBe(2);
  });

  it("counts unattributed traffic rather than dropping it", () => {
    // It still happened, and it still came from somewhere. Hiding it would make
    // a suspicious address look absent.
    store.recordUse("a:free", { userId: null, ip: "9.9.9.9" }, NOW);
    const r = summariseUsage(store.recentUses());
    expect(r.uniqueUsers).toBe(0);
    expect(r.anonymous).toBe(1);
    expect(r.uniqueIps).toBe(1);
  });

  it("counts the whole window, not only the rows the panel receives", () => {
    // The reason this function is on the server. The API sends the most recent
    // 60 records; a client counting those would report 60 farmers during a
    // spike that involved 300 — under-reporting exactly when the number is
    // worth believing.
    for (let i = 0; i < 300; i++) store.recordUse("a:free", { userId: i, ip: `10.0.0.${i % 250}` }, NOW + i);
    const r = summariseUsage(store.recentUses());
    expect(r.total).toBeGreaterThan(60);
    expect(r.uniqueUsers).toBe(300);
  });
});