/**
 * How the IP panel turns a rule into something an operator can judge.
 *
 * Same reasoning as ai-admin-decisions.ts: this page is a client component that
 * fetches in `useEffect`, so a test written against the rendered page would
 * only ever see a spinner. The judgement calls live here.
 *
 * The one that matters most is `selfBlockWarning`. The server refuses to store
 * a block that covers the operator's own address, and that refusal is
 * unrecoverable from inside the app — the panel you would use to undo it is the
 * panel you just locked yourself out of. So the warning is computed here to be
 * shown BEFORE the save, not discovered from a 400 after it.
 */

export type PatternKind = "exact" | "cidr" | "wildcard" | "invalid";

/** Which of the three accepted forms this is. Mirrors lib/ip-rules.ts exactly. */
export function patternKind(pattern: string): PatternKind {
  const p = (pattern || "").trim();
  if (!p) return "invalid";
  const parts = p.split(".");
  const octetOk = (x: string) => /^\d{1,3}$/.test(x) && Number(x) <= 255;
  if (parts.length === 4 && parts.every((x) => x === "*" || octetOk(x)) && p.includes("*")) return "wildcard";
  if (p.includes("/")) {
    const [base, bits] = p.split("/");
    const baseParts = base.split(".");
    return baseParts.length === 4 && baseParts.every(octetOk) && /^\d{1,2}$/.test(bits ?? "") && Number(bits) <= 32
      ? "cidr"
      : "invalid";
  }
  return parts.length === 4 && parts.every(octetOk) ? "exact" : "invalid";
}

export function isValidPattern(pattern: string): boolean {
  return patternKind(pattern) !== "invalid";
}

/**
 * How much of the internet does this rule actually cover?
 *
 * Shown next to every rule because "203.0.113.0/8" looks like a single entry
 * and covers 16 MILLION addresses — sixteen million farms' customers. An
 * operator who is about to write that needs to see the number first, in the
 * same gesture as saving it.
 */
export function describeRange(pattern: string): string {
  const kind = patternKind(pattern);
  if (kind === "invalid") return "Not a valid address";
  if (kind === "exact") return "1 address";
  if (kind === "wildcard") {
    const wild = pattern.trim().split(".").filter((x) => x === "*").length;
    if (wild === 0) return "1 address";
    // Each wildcard octet stands for 256 values.
    return wild === 4 ? "Every IPv4 address" : `Up to ${formatCount(256 ** wild)} addresses`;
  }
  const bits = Number(pattern.split("/")[1]);
  const size = 2 ** (32 - bits);
  return bits === 0 ? "Every IPv4 address" : `${formatCount(size)} address${size === 1 ? "" : "es"}`;
}

/**
 * The exact number, never abbreviated.
 *
 * The first version divided by a million and rounded to zero decimals, which
 * turned 16,777,216 into "17 million" — rounding UP, and overstating a block's
 * blast radius by 223,000 addresses. On a control whose entire job is to stop
 * someone blocking more than they meant to, rounding in the scary direction is
 * the one rounding that is not allowed. Exact costs a few characters.
 */
function formatCount(n: number): string {
  return n.toLocaleString();
}

/** The example shown in the empty input, so the accepted forms are obvious. */
export const PATTERN_PLACEHOLDER = "203.0.113.7 · 203.0.113.0/24 · 203.0.113.*";

/**
 * Would saving this block lock ME out?
 *
 * Mirrors the server guard in routes/admin-ip.ts. Returns a sentence naming the
 * operator's own address, because "your own address" without saying which one
 * is not a warning anybody acts on.
 */
export function selfBlockWarning(pattern: string, youAre: string | null, action: string): string | null {
  if (action !== "block") return null;
  if (!youAre) return null;
  const addr = youAre.trim().split(".").map(Number);
  if (addr.length !== 4 || !addr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return null;
  const p = pattern.trim();

  if (patternKind(p) === "exact") return p === youAre ? `That is your own address (${youAre}).` : null;
  if (patternKind(p) === "wildcard") {
    const parts = p.split(".");
    for (let i = 0; i < 4; i++) {
      if (parts[i] !== "*" && Number(parts[i]) !== addr[i]) return null;
    }
    return `That range includes your own address (${youAre}).`;
  }
  if (patternKind(p) === "cidr") {
    const [base, bitsRaw] = p.split("/");
    const baseParts = base.split(".").map(Number);
    const bits = Number(bitsRaw);
    if (!baseParts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return null;
    // Compare the first `bits` of the two addresses as one integer, which is
    // the same masking the server does — and avoids a floating-point shift bug
    // that a naive /8..//32 loop is prone to.
    let acc = 0;
    let want = 0;
    for (let i = 0; i < bits; i++) {
      acc = (acc << 1) | ((baseParts[i >> 3] >> (7 - (i % 8))) & 1);
      want = (want << 1) | ((addr[i >> 3] >> (7 - (i % 8))) & 1);
    }
    return acc === want ? `That range includes your own address (${youAre}).` : null;
  }
  return null;
}

export interface PreviewResult {
  matchesPattern: boolean;
  effective: "allow" | "block";
  overriddenBy: string | null;
  note: string | null;
}

/**
 * The one line under the dry-run box.
 *
 * The precedence rule — allow beats block — surprises people every time, so
 * the preview says plainly that the block "would have no effect" instead of
 * saving a rule and leaving the operator to work out why the address is still
 * getting through.
 */
export function previewTone(r: PreviewResult): { cls: string; text: string } {
  if (!r.matchesPattern) {
    return { cls: "bg-wangari-cream text-wangari-muted", text: "That rule would not match that address." };
  }
  if (r.effective === "allow" && r.overriddenBy) {
    return {
      cls: "bg-badge-yellow-bg text-tone-warn-text",
      text: `An existing allow rule (${r.overriddenBy}) wins, so this block would have no effect.`,
    };
  }
  return { cls: "bg-badge-red-bg text-badge-red-text", text: "That address would be refused at the door." };
}

/** Whether a block rule has ever done anything, in words rather than a number. */
export function hitTone(hitCount: number, lastHitAt: string | null, now: number): string {
  if (!hitCount) return "Never matched";
  if (!lastHitAt) return `${hitCount} hit${hitCount === 1 ? "" : "s"}`;
  const s = Math.round((now - Date.parse(lastHitAt)) / 1000);
  if (!Number.isFinite(s)) return `${hitCount} hits`;
  if (s < 60) return `${hitCount} hit${hitCount === 1 ? "" : "s"} · just now`;
  if (s < 3600) return `${hitCount} hits · ${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${hitCount} hits · ${Math.round(s / 3600)}h ago`;
  return `${hitCount} hits · ${Math.round(s / 86400)}d ago`;
}