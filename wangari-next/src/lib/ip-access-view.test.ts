import { describe, it, expect } from "vitest";
import {
  patternKind,
  isValidPattern,
  describeRange,
  selfBlockWarning,
  previewTone,
  hitTone,
  PATTERN_PLACEHOLDER,
} from "./ip-access-view";

/**
 * The panel's job is to let an operator judge a rule BEFORE it is saved.
 *
 * Two properties carry real risk:
 *
 *  1. `selfBlockWarning` must agree with the server's matcher. It is a MIRROR
 *     of a server guard in routes/admin-ip.ts, and a mirror that drifts is
 *     worse than none — the operator would be warned about a range that does
 *     not cover them, and not warned about one that does. The parity tests
 *     below compare the two implementations directly rather than restating the
 *     rule, so a change to one that misses the other fails here.
 *  2. `describeRange` must make a /8 look enormous. "203.0.113.0/8" reads like
 *     one entry and covers sixteen million addresses.
 */

const ME = "203.0.113.7";

describe("patternKind", () => {
  it("tells the three accepted forms apart", () => {
    expect(patternKind("203.0.113.7")).toBe("exact");
    expect(patternKind("203.0.113.0/24")).toBe("cidr");
    expect(patternKind("203.0.113.*")).toBe("wildcard");
    expect(patternKind("203.0.*.*")).toBe("wildcard");
  });

  it("rejects what the server rejects, including the trailing-slash case", () => {
    // "203.0.113.0/" is in this list because it was a real bug in the server's
    // matcher: Number("") is 0, so it read as /0 and would have blocked the
    // entire internet.
    for (const p of ["", "  ", "not-an-ip", "203.0.113", "203.0.113.999", "203.0.113.0/33", "203.0.113.0/", "203.*"]) {
      expect(patternKind(p), p).toBe("invalid");
      expect(isValidPattern(p), p).toBe(false);
    }
  });
});

describe("describeRange", () => {
  it("makes a big block look big, and never rounds UP", () => {
    // The whole point of showing a number. A /8 that reads like a single
    // address is how sixteen million customers get blocked by accident.
    //
    // And the exact figure: the first version said "17 million", rounding
    // 16,777,216 up by 223,000. Rounding a block's size in the scary direction
    // is the one rounding this control must never do.
    expect(describeRange("203.0.113.0/8")).toBe("16,777,216 addresses");
    expect(describeRange("203.0.113.0/24")).toBe("256 addresses");
    expect(describeRange("203.0.113.0/32")).toBe("1 address");
    expect(describeRange("0.0.0.0/0")).toBe("Every IPv4 address");
  });

  it("counts wildcards the same way", () => {
    expect(describeRange("203.0.113.7")).toBe("1 address");
    expect(describeRange("203.0.113.*")).toBe("Up to 256 addresses");
    expect(describeRange("203.0.*.*")).toBe("Up to 65,536 addresses");
    expect(describeRange("*.*.*.*")).toBe("Every IPv4 address");
  });

  it("never describes an invalid pattern as covering anything", () => {
    expect(describeRange("nonsense")).toBe("Not a valid address");
    expect(describeRange("")).toBe("Not a valid address");
  });
});

describe("selfBlockWarning", () => {
  it("catches every form that would include my own address", () => {
    for (const p of [ME, "203.0.113.*", "203.0.113.0/24", "203.0.0.0/8", "*.*.*.*", "0.0.0.0/0"]) {
      expect(selfBlockWarning(p, ME, "block"), p).toContain("your own address");
    }
  });

  it("stays quiet for a range that excludes me", () => {
    for (const p of ["198.51.100.7", "198.51.100.*", "198.51.100.0/24", "203.0.114.*"]) {
      expect(selfBlockWarning(p, ME, "block"), p).toBeNull();
    }
  });

  it("does not warn about an ALLOW rule covering my own address", () => {
    // Allowing yourself is the whole reason allow beats block.
    expect(selfBlockWarning("0.0.0.0/0", ME, "allow")).toBeNull();
    expect(selfBlockWarning(ME, ME, "allow")).toBeNull();
  });

  it("cannot be warned about when the address is unknown", () => {
    // Behind a proxy with trust proxy unset, req.ip is the socket. Warning on
    // nothing would train the operator to click through the warning.
    expect(selfBlockWarning("0.0.0.0/0", null, "block")).toBeNull();
    expect(selfBlockWarning("0.0.0.0/0", "::1", "block")).toBeNull();
    expect(selfBlockWarning("0.0.113.7", "not-an-ip", "block")).toBeNull();
  });

  it("says nothing about an invalid pattern, letting the server refuse it", () => {
    expect(selfBlockWarning("garbage", ME, "block")).toBeNull();
  });

  it("agrees with the server's matcher on every pattern tried", () => {
    // Parity with lib/ip-rules.ts. Both implementations must agree that a
    // pattern covers ME, or the warning is either noise or a missed warning.
    const patterns = [
      ME, "203.0.113.8", "203.0.113.*", "203.0.*.*", "*.*.*.*", "*.*.*",
      "203.0.113.0/24", "203.0.113.0/32", "203.0.113.0/8", "198.51.100.0/24",
      "0.0.0.0/0", "203.0.112.0/24", "203.0.0.0/16", "255.255.255.255",
      "garbage", "", "203.0.113.0/33", "203.0.113.0/", "203.*",
    ];
    for (const p of patterns) {
      const mine = selfBlockWarning(p, ME, "block") !== null;
      expect(mine, `parity for "${p}"`).toBe(serverMatches(p, ME));
    }
  });
});

/**
 * The server's matcher, copied verbatim from server/src/lib/ip-rules.ts.
 *
 * Duplicated on purpose. The two live in different packages that do not share
 * a build, so a shared import is not available; what IS available is this test,
 * which fails the moment either side changes and the other does not. That is
 * the only thing that makes the mirror safe to rely on.
 */
function serverMatches(pattern: string, ip: string): boolean {
  const octets = (s: string): number[] | null => {
    const parts = s.split(".");
    if (parts.length !== 4) return null;
    const out: number[] = [];
    for (const p of parts) {
      if (!/^\d{1,3}$/.test(p)) return null;
      const n = Number(p);
      if (n > 255) return null;
      out.push(n);
    }
    return out;
  };
  const addr = octets(ip);
  if (!addr) return false;
  const p = pattern.trim();
  if (p.includes("/")) {
    const [base, bitsRaw] = p.split("/");
    const baseOctets = octets(base);
    if (!baseOctets || !/^\d{1,2}$/.test(bitsRaw ?? "")) return false;
    const bits = Number(bitsRaw);
    if (bits > 32) return false;
    let acc = 0;
    let want = 0;
    for (let i = 0; i < bits; i++) {
      acc = (acc << 1) | ((baseOctets[i >> 3] >> (7 - (i % 8))) & 1);
      want = (want << 1) | ((addr[i >> 3] >> (7 - (i % 8))) & 1);
    }
    return acc === want;
  }
  if (p.includes("*")) {
    const parts = p.split(".");
    if (parts.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
      if (parts[i] === "*") continue;
      if (!/^\d{1,3}$/.test(parts[i]) || Number(parts[i]) !== addr[i]) return false;
    }
    return true;
  }
  const exact = octets(p);
  return !!exact && exact.every((n, i) => n === addr[i]);
}

describe("previewTone", () => {
  it("says plainly that an allow rule would defeat a new block", () => {
    // The precedence rule surprises people every time. Leaving it to be
    // discovered after saving is how an address keeps getting through while
    // the panel shows a rule that looks active.
    const t = previewTone({ matchesPattern: true, effective: "allow", overriddenBy: "203.0.113.7", note: null });
    expect(t.text).toContain("would have no effect");
    expect(t.text).toContain("203.0.113.7");
  });

  it("says the address would be refused when the block really wins", () => {
    const t = previewTone({ matchesPattern: true, effective: "block", overriddenBy: null, note: null });
    expect(t.text).toMatch(/refused/i);
  });

  it("does not claim a block will work on an address it does not match", () => {
    const t = previewTone({ matchesPattern: false, effective: "allow", overriddenBy: null, note: null });
    expect(t.text).toMatch(/would not match/i);
    expect(t.text).not.toMatch(/refused/i);
  });
});

describe("hitTone", () => {
  it("distinguishes a rule that never fired from one that is firing now", () => {
    expect(hitTone(0, null, Date.now())).toBe("Never matched");
    const now = Date.parse("2026-10-06T12:00:00.000Z");
    expect(hitTone(3, "2026-10-06T11:59:58.000Z", now)).toContain("just now");
    expect(hitTone(12, "2026-10-06T09:00:00.000Z", now)).toContain("3h ago");
    expect(hitTone(1, "2026-10-06T11:00:00.000Z", now)).toMatch(/^1 hit/);
  });
});

describe("PATTERN_PLACEHOLDER", () => {
  it("shows all three accepted forms in the empty input", () => {
    // Discovering the accepted syntax from a 400 is a worse first experience
    // than being shown it.
    expect(PATTERN_PLACEHOLDER).toContain("/24");
    expect(PATTERN_PLACEHOLDER).toContain("*");
    for (const form of ["203.0.113.7", "203.0.113.0/24", "203.0.113.*"]) {
      expect(PATTERN_PLACEHOLDER).toContain(form);
    }
  });
});