/**
 * RichText rendering — proves the markup actually becomes elements.
 *
 * The parser tests prove `parseBlocks` returns the right data. These prove
 * that data becomes a heading, a bold run and a real numbered list on screen,
 * because the bug this whole file exists to fix was never a parsing bug: it
 * was that a farmer read "**Flocks: 0**" with the asterisks visible.
 *
 * Rendered with renderToStaticMarkup, which needs no DOM — the suite runs in
 * the `node` environment.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { RichText } from "./rich-text";

const render = (content: string, streaming = false) =>
  renderToStaticMarkup(createElement(RichText, { content, streaming }));

/** The reply that was streaming to a real farmer in production. */
const PRODUCTION_REPLY = [
  "I checked your farm records for this month, and here's what I found:",
  "",
  "## Flocks",
  "You currently have **0 flocks** registered in the system yet.",
  "",
  "## What to do next",
  "1. **Your flocks** — name, breed and bird count",
  "2. **Daily production** — eggs, feed and deaths",
  "",
  "Tell me about your first flock and I'll create it.",
].join("\n");

describe("RichText rendering", () => {
  it("renders a heading, not literal hashes", () => {
    const html = render("## Flocks");
    expect(html).not.toContain("##");
    expect(html).toMatch(/font-bold[^>]*>Flocks</);
  });

  it("renders bold as a <strong>, not literal asterisks", () => {
    const html = render("You have **0 flocks** today.");
    expect(html).not.toContain("**");
    expect(html).toContain("<strong");
    expect(html).toContain("0 flocks");
  });

  it("renders a numbered list as real list items", () => {
    const html = render("1. First thing\n2. Second thing");
    expect(html).toMatch(/<ol/);
    expect(html).toMatch(/<li/);
    expect(html).toContain("First thing");
    expect(html).toContain("Second thing");
  });

  it("renders bullets as a real list", () => {
    const html = render("- Record eggs\n- Record sales");
    expect(html).toMatch(/<ul/);
    expect(html.match(/<li/g) || []).toHaveLength(2);
  });

  it("renders the whole production reply with no markdown left on screen", () => {
    const html = render(PRODUCTION_REDUCTION_SAFE);
    // The single assertion that matters: nothing the farmer can see is a mark.
    expect(html).not.toContain("**");
    expect(html).not.toContain("##");
    expect(html).toMatch(/<h|<p|<ol|<li/);
    // ...and the words all survived.
    for (const phrase of ["I checked your farm records", "Flocks", "0 flocks", "first flock"]) {
      expect(html, `reply still says "${phrase}"`).toContain(phrase);
    }
  });

  it("keeps a caret only while streaming", () => {
    expect(render("Hello", true)).toMatch(/animate-pulse/);
    expect(render("Hello", false)).not.toMatch(/animate-pulse/);
  });

  it("renders nothing, without throwing, for an empty reply", () => {
    expect(() => render("")).not.toThrow();
    // The wrapper div is expected; what must be absent is any content, so an
    // empty bubble cannot flash a stray paragraph while tokens arrive.
    const html = render("");
    expect(html).not.toMatch(/<p|<strong|<ol|<ul/);
  });

  it("treats HTML in a reply as text, never as markup", () => {
    const html = render("Careful with <img src=x onerror=alert(1)> please");
    expect(html).not.toContain("<img");
    expect(html).toContain("onerror");
  });
});

/* Kept as a named constant so the test above reads as a sentence rather than
   a wall of escaped newlines. */
const PRODUCTION_REDUCTION_SAFE = PRODUCTION_REPLY;