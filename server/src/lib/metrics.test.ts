/**
 * Tests for the /metrics lib.
 *
 * The interesting guarantee here is the snapshot key set: /metrics is
 * unauthenticated, so a future edit that adds a URL, an IP or a tenant id
 * to the payload must fail CI rather than leak. Counting arithmetic gets
 * the same prove-it-can-fail treatment as the other guards.
 */
import { describe, it, expect } from "vitest";
import { recordStatus, snapshot } from "./metrics.js";

function deltas(before: ReturnType<typeof snapshot>) {
  const after = snapshot();
  const d = { ...after.requests };
  for (const k of Object.keys(d) as (keyof typeof d)[]) {
    d[k] = d[k] - before.requests[k];
  }
  return d;
}

describe("metrics", () => {
  it("classifies responses into the right buckets, and the guard can fail", () => {
    // Prove the arithmetic on a known sequence first — a broken classifier
    // would otherwise only show up as a silently empty counter.
    const before = snapshot();
    recordStatus(200);
    recordStatus(201);
    recordStatus(301);
    recordStatus(404);
    recordStatus(429);
    recordStatus(500);
    recordStatus(503);
    recordStatus(100); // informational: total only
    const d = deltas(before);
    expect(d).toEqual({
      total: 8,
      ok: 2,
      redirect: 1,
      clientError: 2,
      serverError: 2,
    });

    // Prove the test can fail: a misclassified status must show up.
    const b2 = snapshot();
    recordStatus(500);
    expect(deltas(b2).serverError).toBe(1);
    expect(deltas(b2).ok).toBe(0);
  });

  it("the snapshot exposes aggregates only — the key set is pinned", () => {
    const snap = snapshot();
    expect(Object.keys(snap).sort()).toEqual([
      "bootAt",
      "memory",
      "node",
      "pid",
      "requests",
      "uptimeSec",
    ]);
    expect(Object.keys(snap.requests).sort()).toEqual([
      "clientError",
      "ok",
      "redirect",
      "serverError",
      "total",
    ]);
    expect(Object.keys(snap.memory).sort()).toEqual([
      "heapTotalMb",
      "heapUsedMb",
      "rssMb",
    ]);
    // Nothing tenant-shaped anywhere in the payload.
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/farm|user|email|phone|authorization|url/i);
    expect(snap.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(snap.bootAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
