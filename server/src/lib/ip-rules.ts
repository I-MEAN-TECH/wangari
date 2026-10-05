/**
 * Who is reaching the server, and what may they have.
 *
 * ── the threat this exists for ────────────────────────────────────────────
 * The VPS is on the internet. Anything can find it: a port scan, a credential
 * stuffing run, a bot walking /api/* for endpoints that forgot to ask who is
 * calling. The app has never had anywhere to look at that traffic. An
 * operator could see it in a log file, but the logs are not the interface
 * anyone uses, so in practice nobody looks — which is the same as not having
 * the capability.
 *
 * ── what this deliberately is NOT ─────────────────────────────────────────
 * Not a firewall. Nothing here stops a packet from arriving, and nginx sits
 * in front of this process. What it does is stop the request being served,
 * which is the part that actually costs something: a blocked address burns no
 * database connection, no JWT verification and no bcrypt comparison, so the
 * cheapest possible thing an attacker can do — fire a thousand bad logins a
 * second at /api/auth/login — stops consuming the server's time.
 *
 * ── ranges, because the alternative is a lie ──────────────────────────────
 * Storing only the exact address an attacker happened to use is security
 * theatre. A scan comes from a /24 and rotates inside it. So entries may be a
 * single address, a CIDR block, or a leading wildcard on any octet — which
 * matches how these lists are actually distributed. `matches()` is where that
 * is enforced, and it is a pure function precisely because getting it wrong
 * silently locks every farmer out.
 *
 * ── why it is in the database and not in memory ───────────────────────────
 * A blocklist in a process's heap is undone by `pm2 reload`. An operator
 * would ban an address, the deploy would land an hour later, and the ban would
 * be silently forgotten — which is worse than not having it, because the panel
 * would still show the ban as active. It also has to survive a restart to mean
 * anything during an incident.
 */

import { prisma } from "../db.js";

/**
 * What a verdict means for the response.
 *
 * `blocked` is the only one that refuses. `observed` is recorded and served,
 * because a useful signal about a hostile request is often visible only in
 * what it asked for, and cutting the connection before logging loses that.
 */
export type IpAction = "block" | "allow";

export interface IpRule {
  id: number;
  /** Exact address, CIDR block, or `203.0.113.*`. */
  pattern: string;
  action: IpAction;
  note: string | null;
  /** Who decided this, for the audit trail. */
  addedBy: string | null;
  /** 0 = permanent. Otherwise seconds, counted from first request. */
  blockSeconds: number;
  createdAt: Date;
  lastHitAt: Date | null;
  hitCount: number;
}

/** Cache of the rules, because this runs on every request in the app. */
let cached: { rules: IpRule[]; loadedAt: number } | null = null;
const CACHE_MS = 5_000;

export function invalidateIpRules(): void {
  cached = null;
}

async function rules(): Promise<IpRule[]> {
  const now = Date.now();
  if (cached && now - cached.loadedAt < CACHE_MS) return cached.rules;
  const rows = await prisma.ipRule.findMany({ orderBy: { createdAt: "desc" } });
  cached = { rules: rows as unknown as IpRule[], loadedAt: now };
  return cached.rules;
}

/**
 * Expand one dotted-quad to its four octets, or null if it is not one.
 *
 * Rejects rather than coerces: a rule for "1.2.3" would otherwise be stored and
 * quietly match a /24 the operator did not mean to block.
 */
function octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/**
 * Does this pattern match this address?
 *
 * Three accepted forms, checked in this order:
 *   1. exact        203.0.113.7
 *   2. CIDR         203.0.113.0/24
 *   3. wildcard     203.0.113.*  and  203.0.*.*
 *
 * A pattern that parses as none of those matches NOTHING. That direction is
 * chosen on purpose: an unparseable block rule must fail open (let the farmer
 * in) rather than closed, because the alternative is that one typo locks every
 * user out of the app while an attacker walks in.
 */
export function matches(pattern: string, ip: string | null): boolean {
  if (!pattern || !ip) return false;
  const addr = octets(ip);
  if (!addr) return false; // IPv6, a unix socket, a proxy's own name

  const p = pattern.trim();

  // ── CIDR ──
  if (p.includes("/")) {
    const [base, bitsRaw] = p.split("/");
    const baseOctets = octets(base);
    // The suffix must be DIGITS, and Number("") is 0 — so a trailing slash
    // with nothing after it ("203.0.113.0/") would otherwise read as /0 and
    // match every address on the internet. That is the worst bug this function
    // could have, so the digits are checked rather than coerced.
    if (!baseOctets || !/^\d{1,2}$/.test(bitsRaw ?? "")) return false;
    const bits = Number(bitsRaw);
    if (bits > 32) return false;
    let acc = 0;
    for (let i = 0; i < bits; i++) {
      acc = acc << 1 | (baseOctets[i >> 3] >> (7 - (i % 8))) & 1;
    }
    let want = 0;
    for (let i = 0; i < bits; i++) {
      want = want << 1 | (addr[i >> 3] >> (7 - (i % 8))) & 1;
    }
    return acc === want;
  }

  // ── wildcard ──
  if (p.includes("*")) {
    const parts = p.split(".");
    if (parts.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
      const part = parts[i];
      if (part === "*") continue;
      if (!/^\d{1,3}$/.test(part) || Number(part) !== addr[i]) return false;
    }
    return true;
  }

  // ── exact ──
  const exact = octets(p);
  return !!exact && exact.every((n, i) => n === addr[i]);
}

/** Every pattern that is syntactically usable. Used to refuse bad saves. */
export function isValidPattern(pattern: string): boolean {
  const p = (pattern || "").trim();
  if (!p) return false;
  if (octets(p)) return true;
  if (p.includes("*")) {
    const parts = p.split(".");
    return parts.length === 4 && parts.every((x) => x === "*" || (/^\d{1,3}$/.test(x) && Number(x) <= 255));
  }
  if (p.includes("/")) {
    const [base, bits] = p.split("/");
    return !!octets(base) && /^\d{1,2}$/.test(bits ?? "") && Number(bits) <= 32;
  }
  return false;
}

export interface Verdict {
  action: "allow" | "block";
  ruleId: number | null;
  pattern: string | null;
  note: string | null;
  reason: string;
}

/**
 * The single decision every request passes through, as a PURE function.
 *
 * Split out from `verdictFor` deliberately. The precedence rule below is the
 * most dangerous line in this module — it is the difference between a farmer
 * locked out and an attacker walking in — and it cannot be tested through a
 * function that needs a database. Pure means it is testable without one.
 *
 * `allow` WINS over `block`. That is the one precedence rule here and it is
 * deliberate: an operator who has written down that their office, or their own
 * home connection, may reach this app must never be locked out by a range
 * somebody else added later. The failure mode of getting this backwards is a
 * locked-out farmer; the failure mode of getting it right is one hostile
 * address that has to be listed individually.
 */
export function decide(rules: IpRule[], ip: string | null): Verdict {
  for (const r of rules) {
    if (r.action === "allow" && matches(r.pattern, ip)) {
      return { action: "allow", ruleId: r.id, pattern: r.pattern, note: r.note, reason: "explicitly allowed" };
    }
  }
  for (const r of rules) {
    if (r.action === "block" && matches(r.pattern, ip)) {
      return { action: "block", ruleId: r.id, pattern: r.pattern, note: r.note, reason: "blocked by rule" };
    }
  }
  return { action: "allow", ruleId: null, pattern: null, note: null, reason: "no rule matches" };
}

/** `decide` plus the rule table lookup and the hit counter. */
export async function verdictFor(ip: string | null): Promise<Verdict> {
  let all: IpRule[];
  try {
    all = await rules();
  } catch {
    // If the rule table is unreachable the app must keep serving farmers.
    // Failing closed here would turn a database blip into a total outage of
    // exactly the people paying for the service.
    return { action: "allow", ruleId: null, pattern: null, note: null, reason: "rule store unavailable — failing open" };
  }

  const verdict = decide(all, ip);
  if (verdict.action === "block" && verdict.ruleId != null) void recordHit(verdict.ruleId);
  return verdict;
}

/**
 * Count a hit without making the request wait for the database.
 *
 * Fire and forget on purpose: this is telemetry, and a blocked scanner must
 * not be able to slow itself down — or slow a real farmer down — by arriving
 * often enough to make the counter the bottleneck. A failure here loses one
 * number, not a request.
 */
function recordHit(ruleId: number): void {
  setImmediate(() => {
    prisma.ipRule
      .update({ where: { id: ruleId }, data: { hitCount: { increment: 1 }, lastHitAt: new Date() } })
      .catch(() => { /* telemetry is never worth an unhandled rejection */ });
  });
}

/**
 * The caller's address.
 *
 * `req.ip` is only honest because index.ts sets `trust proxy` to 1 — with it
 * unset, Express would report the nginx socket and every rule would match
 * `127.0.0.1`. That is the single most likely way this whole module could
 * appear to work while blocking nobody, so the test suite asserts the setting
 * is present rather than trusting it.
 */
export function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}