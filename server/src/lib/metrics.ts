/**
 * metrics — a lightweight, dependency-free view of process health.
 *
 * Why this exists: the ops runbook's standing gap was "growth is invisible
 * until it hurts". /health answers "is the process up"; this answers "for
 * how long, how much memory, and how many requests by outcome class since
 * boot" — enough to spot a restart loop (bootAt moving between scrapes), a
 * memory climb, or an error-rate spike after a deploy.
 *
 * Two rules this endpoint must keep:
 *  1. Aggregates only. No URLs, no IPs, no farm/user identifiers. It is
 *     unauthenticated (like /health), so the payload must never carry
 *     anything tenant-scoped.
 *  2. Per-worker honesty. PM2 runs a cluster, so each worker keeps its own
 *     counters and its own bootAt. A scrape that sees bootAt move has seen
 *     a worker restart — exactly the signal a log file cannot give you.
 */
import type { Request, Response, NextFunction } from "express";

const bootAt = Date.now();

let total = 0;
let ok = 0; // 2xx
let redirect = 0; // 3xx
let clientError = 0; // 4xx
let serverError = 0; // 5xx

/** Count one finished response by status class. 1xx counts in total only. */
export function recordStatus(status: number): void {
  total += 1;
  if (status >= 500) serverError += 1;
  else if (status >= 400) clientError += 1;
  else if (status >= 300) redirect += 1;
  else if (status >= 200) ok += 1;
}

/** Express middleware: count every response this worker finishes. */
export function metricsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => recordStatus(res.statusCode));
  next();
}

const mb = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;

/** The /metrics payload. Key set is pinned by a test — see metrics.test.ts. */
export function snapshot() {
  const mem = process.memoryUsage();
  return {
    bootAt: new Date(bootAt).toISOString(),
    uptimeSec: Math.round((Date.now() - bootAt) / 1000),
    node: process.version,
    pid: process.pid,
    memory: {
      rssMb: mb(mem.rss),
      heapUsedMb: mb(mem.heapUsed),
      heapTotalMb: mb(mem.heapTotal),
    },
    requests: {
      total,
      ok,
      redirect,
      clientError,
      serverError,
    },
  };
}
