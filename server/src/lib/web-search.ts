/**
 * Wangari's internet access.
 *
 * The requirement was research that is honest, correct, and needs no API key.
 * That last clause was not a preference, it was the whole point: this is a
 * farm SaaS for Kenyan farmers, and a feature that only works for whoever
 * paid for a key is not a feature, it is a bill. So the default path here is
 * keyless and public:
 *
 *   1. DuckDuckGo's HTML endpoint - real web results with snippets. Verified
 *      live from the server: 863ms, 10 results, current Kenyan pricing pages.
 *   2. Wikipedia's API - free, stable, no key, and the right source for the
 *      half of farming that is fact rather than price: breeds, laying cycles,
 *      feed formulation ratios, disease. 657ms.
 *
 * Exa is still supported, but only as an upgrade when an operator has set
 * EXA_API_KEY. It is never required, and the app never pretends it exists.
 *
 * ── the rule this file exists to keep ──
 *
 * If the search fails, the tool says it failed. It does not fall back to the
 * model's memory dressed up as a lookup. A farmer told "I looked and found
 * layer mash at KES 3,400 a 70kg bag" when nothing was ever fetched is worse
 * off than one told plainly that the lookup failed, because the first answer
 * looks exactly as trustworthy as the second.
 */

/** Search results, already trimmed for the model's budget. */
export interface SearchHit {
  title: string;
  /** A snippet, never a whole page. 400 chars is roughly one sentence of cost. */
  snippet: string;
  url: string;
  /** Which source produced this, so a claim can be attributed. */
  source: "web" | "wikipedia";
}

export interface SearchOutcome {
  ok: boolean;
  hits: SearchHit[];
  /** Plain words for the farmer when there is nothing to report. */
  note?: string;
  /** Which path actually ran. Useful in the server log and in tests. */
  tier: "exa" | "open" | "none";
}

const MAX_HITS = 4;
const MAX_SNIPPET = 400;
const TIMEOUT_MS = 12_000;

/**
 * A browser-ish user agent.
 *
 * DuckDuckGo's HTML endpoint serves a different, near-empty page to clients it
 * does not recognise. This is not impersonation to get around a paywall — the
 * endpoint is free and public — it is the header that gets the public page
 * instead of the fallback one.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Fetch with a deadline. A search that never answers is worse than none. */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "*/*", ...(init.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip tags, decode entities, collapse whitespace.
 *
 * Exported because it is where the correctness of every title and snippet is
 * decided, and it is worth testing directly.
 *
 * Entity decoding is not cosmetic. Caught by a test on real DuckDuckGo
 * markup: `&mdash;` came through as the literal string `&mdash;`, so a title
 * reading "Feed Prices &mdash; Layers Mash" reached the model as noise it
 * would either echo back at the farmer or misparse. Named entities beyond
 * the common few are decoded generically, because the endpoint uses more of
 * them than anyone would hand-list.
 */
export function clean(html: string): string {
  const NAMED: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", rsquo: "\u2019",
    lsquo: "\u2018", ldquo: "\u201C", rdquo: "\u201D", deg: "\u00B0",
    eacute: "\u00E9", egrave: "\u00E8", agrave: "\u00E0", ccedil: "\u00E7",
    pound: "\u00A3", euro: "\u20AC", times: "\u00D7", reg: "\u00AE",
  };
  const decodeOnce = (s: string) =>
    s
      // Numeric entities first: &#8212; is the em dash and must not be
      // matched by the named-entity rule below.
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&([a-z]+);/gi, (whole, name) => NAMED[name.toLowerCase()] ?? whole);

  // Two passes, not one. Titles come back double-escaped often enough to
  // matter - `&amp;mdash;` in the markup is the literal text `&mdash;`, so a
  // single pass leaves an entity in a title the model will echo at a farmer.
  // Two is enough and bounded; an unbounded loop would be a hang on input
  // like `&amp;amp;amp;`.
  let out = html.replace(/<[^>]+>/g, " ");
  out = decodeOnce(out);
  if (/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(out)) out = decodeOnce(out);
  return out.replace(/\s+/g, " ").trim();
}

function clip(text: string): string {
  return text.length <= MAX_SNIPPET ? text : text.slice(0, MAX_SNIPPET) + "…";
}

/**
 * DuckDuckGo hands back redirect URLs of the form
 * `//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F`. Passing those to a
 * farmer is useless, so they are unwrapped to the real address.
 */
export function unwrapDuckUrl(href: string): string {
  try {
    const absolute = href.startsWith("//") ? "https:" + href : href;
    const parsed = new URL(absolute, "https://duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : absolute;
  } catch {
    return href;
  }
}

/** Pull titles, urls and snippets out of the HTML endpoint's markup. */
export function parseDuckResults(html: string): SearchHit[] {
  const titles = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  const hits: SearchHit[] = [];
  for (const [i, m] of titles.entries()) {
    const title = clean(m[2]);
    if (!title) continue;
    hits.push({
      title,
      url: unwrapDuckUrl(m[1]),
      snippet: clip(clean(snippets[i]?.[1] ?? "")),
      source: "web",
    });
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}

/** Wikipedia is JSON, so this is a map rather than a scrape. */
export function parseWikipediaResults(json: any): SearchHit[] {
  const rows: any[] = json?.query?.search ?? [];
  return rows.slice(0, MAX_HITS).map((r) => ({
    title: String(r.title ?? "").trim(),
    snippet: clip(clean(String(r.snippet ?? ""))),
    url: r.title
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, "_"))}`
      : "",
    source: "wikipedia" as const,
  }));
}

/**
 * `reached` is the whole point of this function's shape.
 *
 * It used to return only the hits, built with Promise.allSettled so one dead
 * endpoint could not take the other down with it. Tidy, and it made the tool
 * lie: with the network down, allSettled swallowed the failure, returned [],
 * and the farmer was told "I looked, and found nothing on that" - a claim
 * that a search happened. It did not. A test pins that.
 *
 * So the caller gets to know whether anything actually answered.
 */
async function searchOpenWeb(query: string): Promise<{ hits: SearchHit[]; reached: boolean }> {
  // Run both at once. They answer different halves of farming — one finds
  // this week's Nairobi feed price, the other is right about a breed's laying
  // age — and the free tier already makes every extra second expensive.
  const [web, wiki] = await Promise.allSettled([
    fetchWithTimeout("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
      headers: { accept: "text/html" },
    }).then(async (r) => (r.ok ? parseDuckResults(await r.text()) : [])),
    fetchWithTimeout(
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
        encodeURIComponent(query) +
        "&format=json&srlimit=3&origin=*",
    ).then(async (r) => (r.ok ? parseWikipediaResults(await r.json()) : [])),
  ]);

  const hits: SearchHit[] = [];
  if (web.status === "fulfilled") hits.push(...web.value.filter((h) => h.title && h.url));
  if (wiki.status === "fulfilled") hits.push(...wiki.value.filter((h) => h.title && h.url));
  // One endpoint answering is enough to say we reached the internet.
  const reached = web.status === "fulfilled" || wiki.status === "fulfilled";
  return { hits: hits.slice(0, MAX_HITS), reached };
}

async function searchExa(query: string): Promise<SearchHit[]> {
  const key = process.env.EXA_API_KEY!;
  const res = await fetchWithTimeout("https://api.exa.ai/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ query, numResults: MAX_HITS, text: true }),
  });
  if (!res.ok) throw new Error(`exa ${res.status}`);
  const data: any = await res.json();
  return (data.results ?? [])
    .slice(0, MAX_HITS)
    .map((r: any) => ({
      title: String(r.title ?? "").trim(),
      snippet: clip(clean(String(r.text ?? r.snippet ?? ""))),
      url: String(r.url ?? ""),
      source: "web" as const,
    }))
    .filter((h: SearchHit) => h.title && h.url);
}

/**
 * Look something up.
 *
 * Prefers Exa when an operator has paid for it, and falls back to the
 * keyless public endpoints otherwise. A fallback that is silent about the
 * downgrade would be dishonest: a farmer told "here is what the market is
 * doing" has no way to know whether the citation is from a paid index or a
 * free one, so `tier` travels with the result and the prompt tells the model
 * to name it when the answer is contested.
 */
export async function searchWeb(query: string): Promise<SearchOutcome> {
  const trimmed = String(query ?? "").trim().slice(0, 300);
  if (!trimmed) {
    return { ok: false, hits: [], tier: "none", note: "There was nothing to look up." };
  }

  if (process.env.EXA_API_KEY) {
    try {
      const hits = await searchExa(trimmed);
      if (hits.length) return { ok: true, hits, tier: "exa" };
    } catch (e: any) {
      // Fall through to the free path rather than failing the question. The
      // provider is an upgrade, not a dependency.
      console.warn("exa search failed, falling back to the open web:", e?.message);
    }
  }

  try {
    const { hits, reached } = await searchOpenWeb(trimmed);
    if (hits.length) return { ok: true, hits, tier: "open" };
    // Two different failures, two different sentences. Collapsing them is how
    // "the network is down" becomes "the web has no answer on that" - which is
    // false, and false in a way a farmer would act on.
    return {
      ok: false,
      hits: [],
      tier: reached ? "open" : "none",
      note: reached
        ? "I looked, and found nothing on that. Say so plainly rather than guessing."
        : "I could not reach the internet just then. I would rather say that than give you an answer I cannot stand behind.",
    };
  } catch (e: any) {
    return {
      ok: false,
      hits: [],
      tier: "none",
      note: `I could not reach the internet just then (${e?.name === "AbortError" ? "it timed out" : "connection failed"}). I would rather say that than give you an answer I cannot stand behind.`,
    };
  }
}

/**
 * Whether research works at all.
 *
 * True with no configuration, because the default path is keyless. Kept as a
 * function so the answer stays in one place if the open endpoints ever need
 * gating — and so nothing claims to have a key it does not have.
 */
export function searchConfigured(): boolean {
  return true;
}

/** Human label for /status. */
export function searchTierLabel(): string {
  return process.env.EXA_API_KEY ? "exa" : "open-web";
}