import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matches, isValidPattern, decide, type IpRule } from "./ip-rules.js";

/**
 * Getting a single character of this module wrong is not a crash. It is a
 * farmer locked out of the app they pay for, or an attacker nobody blocked.
 *
 * That asymmetry sets the direction of every default here:
 *
 *   - A pattern that does not parse matches NOTHING. Failing open is right for
 *     a ban list, where a typo must not become a blanket denial, and it is
 *     checked on save as well so the typo is caught before it can matter.
 *   - An unreachable rule table allows the request through. A database blip
 *     must not become an outage of paying customers.
 *   - `allow` beats `block`. An operator who wrote down their own office must
 *     never be locked out by a range somebody added later.
 *
 * The matching functions are pure, so all of it is testable without a database.
 * The wiring is not pure, so index.ts is read separately at the bottom — an
 * IP guard that exists but is never mounted is the classic way this looks fine
 * and blocks nobody.
 */

function rule(partial: Partial<IpRule> & { pattern: string }): IpRule {
  return {
    id: 1, action: "block", note: null, addedBy: null, hitCount: 0,
    lastHitAt: null, createdAt: new Date(0), ...partial,
  } as IpRule;
}

describe("an exact address", () => {
  it("matches only itself", () => {
    expect(matches("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(matches("203.0.113.7", "203.0.113.8")).toBe(false);
    expect(matches("203.0.113.7", "198.51.100.7")).toBe(false);
  });

  it("does not match a prefix of itself", () => {
    // "1.2.3.4" must not catch "1.2.3.40". A prefix match here would block a
    // neighbouring address for ever, with no way for the operator to see why.
    expect(matches("1.2.3.4", "1.2.3.40")).toBe(false);
  });
});

describe("a CIDR block", () => {
  it("covers the whole range it names", () => {
    expect(matches("203.0.113.0/24", "203.0.113.1")).toBe(true);
    expect(matches("203.0.113.0/24", "203.0.113.255")).toBe(true);
    expect(matches("203.0.113.0/24", "203.0.114.1")).toBe(false);
    expect(matches("203.0.113.0/24", "203.0.112.255")).toBe(false);
  });

  it("handles a /16 and a /8 without falling over", () => {
    expect(matches("10.0.0.0/8", "10.255.255.255")).toBe(true);
    expect(matches("10.0.0.0/8", "11.0.0.1")).toBe(false);
    expect(matches("172.16.0.0/12", "172.31.255.255")).toBe(true);
    expect(matches("172.16.0.0/12", "172.32.0.1")).toBe(false);
  });

  it("treats /32 as an exact address and /0 as everything", () => {
    expect(matches("203.0.113.7/32", "203.0.113.7")).toBe(true);
    expect(matches("203.0.113.7/32", "203.0.113.8")).toBe(false);
    expect(matches("0.0.0.0/0", "1.2.3.4")).toBe(true);
  });

  it("matches nothing when the prefix length is nonsense", () => {
    // /33, /-1 and a non-numeric suffix must not be read as "match
    // everything", which is what a careless parse of a stray slash would give.
    //
    // The trailing-slash case is the dangerous one and it is here because it
    // was a real bug: Number("") is 0, so "203.0.113.0/" read as /0 and would
    // have blocked EVERY address on the internet.
    for (const p of ["203.0.113.0/33", "203.0.113.0/-1", "203.0.113.0/abc", "203.0.113.0/"]) {
      expect(matches(p, "203.0.113.1"), p).toBe(false);
    }
    // And the paranoid version of the same assertion, for any future edit.
    expect(matches("203.0.113.0/", "8.8.8.8")).toBe(false);
  });
});

describe("a wildcard", () => {
  it("covers the octets it stands for", () => {
    expect(matches("203.0.113.*", "203.0.113.9")).toBe(true);
    expect(matches("203.0.113.*", "203.0.114.9")).toBe(false);
    expect(matches("203.0.*.*", "203.0.4.1")).toBe(true);
    expect(matches("*.*.*.*", "8.8.8.8")).toBe(true);
  });

  it("still respects the octets it does name", () => {
    // "203.0.113.*" is not "203.0.*.*". Reading it as the latter would block a
    // /16 on the strength of a /24 that was meant.
    expect(matches("203.0.113.*", "203.0.200.1")).toBe(false);
  });
});

describe("a pattern that cannot be read", () => {
  it("matches nothing, so a typo cannot become a blanket denial", () => {
    // Every one of these would, under a sloppy parse, match somebody. Under
    // this one, none of them match anything at all.
    for (const p of ["", "   ", "not-an-ip", "203.0.113", "203.0.113.999", "203.0.113.7.8", "203.*", "203.0.113.*.5"]) {
      expect(matches(p, "203.0.113.7"), `"${p}"`).toBe(false);
    }
  });

  it("is refused at save time too, so it never reaches the table", () => {
    for (const p of ["", "not-an-ip", "203.0.113", "203.0.113.999", "203.0.113.0/33", "203.*"]) {
      expect(isValidPattern(p), `"${p}" should be rejected`).toBe(false);
    }
    for (const p of ["203.0.113.7", "203.0.113.0/24", "203.0.113.*", "203.0.*.*", "0.0.0.0/0"]) {
      expect(isValidPattern(p), `"${p}" should be accepted`).toBe(true);
    }
  });

  it("cannot match an address that is not IPv4", () => {
    // An IPv6 client behind the proxy, or a unix socket. Nothing here parses
    // IPv6, and pretending otherwise would silently fail to block it — which is
    // why the guard fails open rather than guessing at v6 semantics.
    expect(matches("::1", "::1")).toBe(false);
    expect(matches("203.0.113.0/24", "2001:db8::1")).toBe(false);
    expect(matches("203.0.113.*", null)).toBe(false);
  });
});

describe("precedence", () => {
  const rules = [
    rule({ id: 1, pattern: "203.0.113.0/24", action: "block", note: "scanner" }),
    rule({ id: 2, pattern: "203.0.113.7", action: "allow", note: "the office" }),
  ];

  it("lets an allow override a broader block", () => {
    const v = decide(rules, "203.0.113.7");
    expect(v.action).toBe("allow");
    expect(v.ruleId).toBe(2);
    expect(v.note).toBe("the office");
  });

  it("still blocks the rest of the range", () => {
    const v = decide(rules, "203.0.113.8");
    expect(v.action).toBe("block");
    expect(v.ruleId).toBe(1);
  });

  it("holds regardless of the order the rows came back in", () => {
    // The table is ordered by hit count, which changes constantly. If allow
    // only won because it happened to be scanned first, the outcome would
    // silently depend on traffic volume.
    const v = decide([...rules].reverse(), "203.0.113.7");
    expect(v.action).toBe("allow");
  });

  it("lets an address through when nothing matches", () => {
    const v = decide(rules, "198.51.100.4");
    expect(v.action).toBe("allow");
    expect(v.ruleId).toBeNull();
    expect(v.reason).toMatch(/no rule/i);
  });
});

describe("the guard is actually in the request path", () => {
  const index = readFileSync(join(process.cwd(), "src", "index.ts"), "utf8").replace(/\r\n/g, "\n");
  const lines = index.split("\n");
  const at = (needle: string) => lines.findIndex((l) => l.includes(needle));

  it("is mounted on the app", () => {
    expect(index).toContain('import { ipGuard } from "./middleware/ipGuard.js"');
    expect(at("app.use(ipGuard)")).toBeGreaterThan(-1);
  });

  it("runs BEFORE the rate limiter and every router", () => {
    // After the limiter, a scan could still exhaust the quota of whatever
    // address it is imitating. After a router, it has already reached bcrypt.
    expect(at("app.use(ipGuard)")).toBeLessThan(at("app.use(\"/api/\", limiter)"));
    expect(at("app.use(ipGuard)")).toBeLessThan(at("app.use(express.json"));
    expect(at("app.use(ipGuard)")).toBeLessThan(at('app.use("/api/admin"'));
  });

  it("has a trust-proxy setting to read the real client address", () => {
    // Without this Express reports the nginx socket and every rule matches
    // 127.0.0.1 — the module would appear to work and block nobody at all.
    expect(index).toContain('app.set("trust proxy", 1)');
  });

  it("runs FIRST, ahead of the security headers too", () => {
    // This is the opposite of what a reflex says, so it is worth stating.
    // helmet and CORS decorate responses; a refused request has no page, no
    // frame and no script, so there is nothing for them to protect — and every
    // header added before the refusal is CPU a scanner gets for free. The
    // blocked response is a bare JSON 403 on purpose, with no CORS headers,
    // because CORS headers would tell a cross-origin caller more than it needs
    // to know about why it was refused.
    expect(at("app.use(ipGuard)")).toBeLessThan(at("app.use(helmet("));
    expect(at("app.use(ipGuard)")).toBeLessThan(at("cors({"));
    expect(at("app.use(ipGuard)")).toBeLessThan(at("app.use(compression())"));
  });

  it("returns a bare 403 that says nothing about which rule matched", () => {
    // Handing a scanner the matching pattern turns this into a free oracle for
    // walking the list. The operator already has the panel.
    const guard = readFileSync(join(process.cwd(), "src", "middleware", "ipGuard.ts"), "utf8");
    expect(guard).toContain('res.status(403).json({ error: "Access denied" })');
    const body = guard.slice(guard.indexOf("res.status(403)"));
    expect(body).not.toContain("verdict.pattern");
    expect(body).not.toContain("verdict.note");
  });
});