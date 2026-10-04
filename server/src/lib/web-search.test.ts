import { describe, it, expect } from "vitest";
import {
  parseDuckResults,
  parseWikipediaResults,
  unwrapDuckUrl,
  clean,
  searchConfigured,
  searchTierLabel,
} from "./web-search";

/**
 * Wangari's internet access, without a key.
 *
 * The requirement was honest research that needs no API key. These tests
 * hold three things: that it needs no key, that it parses real markup, and
 * that it refuses rather than guesses.
 *
 * The refusals are the ones worth guarding. Measured live before this was
 * built, the search tool returned "not set up on this account" for every
 * question - correct, and completely useless. So the risk in the fix is not
 * that it fails; it is that it "succeeds" with something plausible and wrong.
 */

/** A trimmed slice of the real DuckDuckGo HTML endpoint's markup. */
const DUCK_HTML = `
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.animalfeeds.co.ke%2Fprices&amp;rut=1">
      Poultry Feed Prices Nairobi &amp;mdash; Layers Mash
    </a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=x">
    Prices and feeding guide last checked <b>28 July 2026</b>. 70kg layers mash from KES 3,400.
  </a>
</div>
<div class="result results_links web-result">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tridge.com%2Fmarkets">
      Layer Feed Suppliers &amp; Prices in Kenya
    </a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=y">
    Suppliers, trade, and price intelligence.
  </a>
</div>
`;

describe("keyless by default", () => {
  it("reports research as available with nothing configured at all", () => {
    // This is the whole point of the change. Before it, searchConfigured()
    // returned false without EXA_API_KEY and the agent refused every
    // research question - correct, honest, and useless.
    expect(searchConfigured()).toBe(true);
  });

  it("does not claim a paid tier it does not have", () => {
    // No EXA_API_KEY in this process, so the label must be the free path.
    // A label claiming an upgrade nobody paid for is the exact dishonesty
    // the rest of this file is written to prevent.
    expect(searchTierLabel()).toBe("open-web");
  });
});

describe("reading the open web", () => {
  it("unwraps DuckDuckGo's redirect to the real address", () => {
    // Handing a farmer "//duckduckgo.com/l/?uddg=..." is not a source, it is
    // a puzzle. The real page is what they need to check the price.
    expect(unwrapDuckUrl("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ffeed")).toBe(
      "https://example.com/feed",
    );
  });

  it("leaves a plain URL alone rather than mangling it", () => {
    expect(unwrapDuckUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("pulls title, url and snippet out of real markup", () => {
    const hits = parseDuckResults(DUCK_HTML);
    expect(hits).toHaveLength(2);
    expect(hits[0].title).toBe("Poultry Feed Prices Nairobi — Layers Mash");
    expect(hits[0].url).toBe("https://www.animalfeeds.co.ke/prices");
    expect(hits[0].snippet).toContain("28 July 2026");
    // Tags and entities must not reach the model: "<b>" in a snippet is
    // noise it will either echo or misparse.
    expect(hits[0].snippet).not.toContain("<b>");
  });

  it("never returns more than the model's budget allows", () => {
    // Four results, short snippets. More than that costs tokens the free tier
    // does not have and buries the answer the farmer actually asked for.
    const many = DUCK_HTML.repeat(6);
    expect(parseDuckResults(many).length).toBeLessThanOrEqual(4);
    for (const hit of parseDuckResults(many)) {
      expect(hit.snippet.length).toBeLessThanOrEqual(401);
    }
  });

  it("reads Wikipedia's JSON without pretending it is a web hit", () => {
    // Wikipedia is right for facts that do not move (laying age, feed
    // ratios) and wrong for this morning's price. The source is carried so
    // the model can be specific about which one answered.
    const hits = parseWikipediaResults({
      query: { search: [{ title: "Sasso", snippet: "brown <span>egg</span> layer" }] },
    });
    expect(hits[0].source).toBe("wikipedia");
    expect(hits[0].title).toBe("Sasso");
    expect(hits[0].snippet).toBe("brown egg layer");
    expect(hits[0].url).toBe("https://en.wikipedia.org/wiki/Sasso");
  });

  it("survives an empty or malformed response instead of throwing", () => {
    // A search endpoint changing its shape must degrade to "found nothing",
    // which the agent reports honestly. Throwing here would surface as a
    // crashed turn.
    expect(parseWikipediaResults(null)).toEqual([]);
    expect(parseWikipediaResults({})).toEqual([]);
    expect(parseDuckResults("")).toEqual([]);
    expect(parseDuckResults("<html>nope</html>")).toEqual([]);
  });
});

describe("staying honest", () => {
  it("does not answer a search with the model's own memory", () => {
    // Structural: the module exposes no completion function, no answer
    // generator, and nothing that could stand in for a lookup. If someone
    // adds one later to "help when offline", this fails.
    const src = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "src", "lib", "web-search.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/callAI|callAICompatible|chat\/completions|generateText/);
  });

  it("has exactly one way to report a failure, in the farmer's words", () => {
    const clean_src = clean("<b>no</b> such page");
    expect(clean_src).toBe("no such page");
    // Whatever the endpoint does, the tool's contract is ok/hits/note - never
    // a synthesised answer. Asserting the field names keeps a future
    // "helpful" fallback from changing the shape.
    const mod = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "src", "lib", "web-search.ts"),
      "utf8",
    );
    expect(mod).toMatch(/ok: false,[\s\S]*hits: \[\][\s\S]*note:/);
  });
});
describe("refusing rather than inventing", () => {
  /**
   * The mutation that caught this test missing: with the fetch stubbed to
   * return nothing, an earlier version happily returned a plausible KES
   * figure with a source attached. A farmer cannot tell that from a real
   * lookup - which is precisely why it must not be possible.
   */
  it("reports no results rather than a plausible answer", async () => {
    const { searchWeb } = await import("./web-search");
    const real = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("<html><body>no results here</body></html>", { status: 200 })) as any;
    try {
      const out = await searchWeb("layer mash price Kisumu");
      expect(out.ok).toBe(false);
      expect(out.hits).toEqual([]);
      expect(out.note).toBeTruthy();
    } finally {
      globalThis.fetch = real;
    }
  });

  it("does not invent anything when the network is gone", async () => {
    const { searchWeb } = await import("./web-search");
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("getaddrinfo ENOTFOUND"); }) as any;
    try {
      const out = await searchWeb("layer mash price Kisumu");
      expect(out.ok).toBe(false);
      expect(out.hits).toEqual([]);
      // The farmer is told the lookup failed, in words they can act on.
      expect(out.note).toMatch(/could not reach the internet/i);
    } finally {
      globalThis.fetch = real;
    }
  });

  it("refuses an empty question without pretending to search", async () => {
    const { searchWeb } = await import("./web-search");
    const out = await searchWeb("   ");
    expect(out.ok).toBe(false);
    expect(out.tier).toBe("none");
  });
});
