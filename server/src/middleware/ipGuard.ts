import type { Request, Response, NextFunction } from "express";
import { verdictFor, clientIp } from "../lib/ip-rules.js";

/**
 * The first thing an inbound request meets.
 *
 * ── why it runs this early ────────────────────────────────────────────────
 * Ahead of the rate limiter, the JSON parser and every router, because the
 * whole value of a block is that a hostile request costs almost nothing. Once
 * a request reaches bcrypt it has already cost the server real time, and a
 * scan is measured in requests, not in politeness. Refusing here means a
 * thousand bad logins a second run off a cached array of patterns.
 *
 * ── what it must never do ─────────────────────────────────────────────────
 * Refuse a legitimate farmer. Hence three guarantees, all of which lean the
 * same way:
 *   - an allow rule beats a block rule (see lib/ip-rules.ts);
 *   - an unreachable rule table fails OPEN, so a database blip cannot become
 *     an outage of the people paying for the service;
 *   - a pattern that does not parse matches nothing.
 *
 * ── what it returns ───────────────────────────────────────────────────────
 * 403 with a JSON body, no detail about which rule matched. Telling a scanner
 * which range caught it turns this into a free oracle for walking the list,
 * and the operator already has the panel.
 */
export async function ipGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = clientIp(req);

  let verdict;
  try {
    verdict = await verdictFor(ip);
  } catch {
    // verdictFor already fails open internally; this is belt and braces for a
    // bug in the guard itself, because the alternative — refusing here — is an
    // outage.
    return next();
  }

  if (verdict.action !== "block") {
    return next();
  }

  // A blocked attempt is worth an audit row: "when did they start?" is the
  // first question of an incident, and without this the only record is a
  // counter nobody reads.
  console.warn(
    `[ipGuard] blocked ${ip} on ${req.method} ${req.path}` +
      (verdict.pattern ? ` (rule ${verdict.ruleId}: ${verdict.pattern})` : ""),
  );

  res.status(403).json({ error: "Access denied" });
}