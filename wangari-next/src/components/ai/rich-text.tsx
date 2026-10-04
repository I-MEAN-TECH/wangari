"use client";

/**
 * Wangari's replies, rendered.
 *
 * ── why this exists ──────────────────────────────────────
 * The panel used to ship replies as raw text, on the reasoning that letting a
 * model emit markdown into a farmer's screen is how you get
 * "**Total:** KES 4,500" read aloud as asterisks. That reasoning is right and
 * the mitigation was wrong, because the model emits markdown WHETHER OR NOT
 * we render it. The live replies come back full of `**bold**`, `## headings`
 * and numbered lists, so refusing to render them did not protect the farmer —
 * it just left the asterisks on screen. This renders them instead.
 *
 * ── why not a markdown library ────────────────────────────
 * `marked` or `remark` would parse more than we need and hand back HTML
 * strings, which then have to be sanitised. A mistake in that sanitiser puts
 * a farmer's reply on a page with script in it.
 *
 * This parser is deliberately small: it understands the handful of marks a
 * farm answer actually uses and NOTHING else. It never produces an HTML
 * string — it returns plain data that is turned into React elements — so
 * there is no injection surface to get wrong, and no new dependency in a
 * bundle that already ships to a 2G handset in rural Kenya.
 *
 * Everything is also normalised into plain sentences, because a model that
 * answers "**1. Flocks**" is answering for a reader who can parse that. The
 * farmer needs "Flocks — tell me the breed and the number of birds", and
 * that is a PROMPT change, not a rendering one (see the system prompt).
 */

import * as React from "react";

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string; level: 2 | 3 }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

/**
 * Normalise a line to the subset of marks this renderer understands.
 *
 * It deliberately does NOT touch `**bold**`. That mark is the one thing
 * `renderInline` needs to survive so it can turn it into real emphasis —
 * an earlier version stripped it here, which quietly made bold work in
 * paragraphs (where this was not called) and vanish inside list items
 * (where it was). One normalisation path, one behaviour.
 *
 * Everything it does remove is something we never render: links, code fences
 * and the block markers that a wrapped line can carry.
 */
function normalise(text: string): string {
  return text
    // [label](url) -> label. A farmer cannot follow a link on a phone in a
    // field, and rendering the raw URL as text is noise, so the label wins.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Fenced blocks collapse to their contents; the fence itself is chrome a
    // farmer gains nothing from.
    .replace(/```[a-zA-Z]*\n?/g, "")
    // `code` -> code, rendered as plain text. It is a tool name; the farmer
    // reads it, it is not monospaced trivia.
    .replace(/`([^`]+)`/g, "$1")
    // A wrapped line can carry the heading or list marker of the block it
    // continues, so drop leading markers wherever they appear.
    .replace(/^[ \t]*#{1,6}[ \t]+/, "")
    .replace(/^[ \t]*[-*•][ \t]+/, "")
    .replace(/^[ \t]*\d+[.)][ \t]+/, "")
    .trim();
}

/**
 * Split a reply into blocks.
 *
 * Pure and total: any input produces a valid block list, so a malformed or
 * truncated stream can never throw inside a render. That matters because
 * `content` grows token by token and is parsed on every frame while
 * streaming — a throw here would blank the whole conversation.
 */
export function parseBlocks(input: string): Block[] {
  const blocks: Block[] = [];
  const lines = (input ?? "").replace(/\r\n/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      const text = normalise(paragraph.join(" "));
      if (text) blocks.push({ kind: "p", text });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list.ordered ? { kind: "ol", items: list.items } : { kind: "ul", items: list.items });
      list = null;
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Headings — "## Flocks" / "### Summary"
    const heading = /^(#{2,3})\s+(.*)$/.exec(line.trim());
    if (heading) {
      flushAll();
      blocks.push({
        kind: "h",
        text: normalise(heading[2]),
        level: heading[1].length === 2 ? 2 : 3,
      });
      continue;
    }

    // Bullets — "- item", "* item", "• item"
    const bullet = /^[-*•]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(normalise(bullet[1]));
      continue;
    }

    // Numbered — "1. item", "1) item". A wrapped continuation line is
    // appended to the current item rather than starting a new one, because
    // models wrap long list items and a farmer would otherwise see the tail
    // of their own bullet as a separate paragraph.
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line.trim());
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(normalise(numbered[2]));
      continue;
    }
    if (list && line.trim() && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += " " + normalise(line);
      continue;
    }

    // Blank line ends whatever we were collecting.
    if (!line.trim()) {
      flushAll();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

/**
 * Render one block's text, turning **bold** into real emphasis.
 *
 * `bold` is passed down as an array of alternating plain/strong segments, not
 * as HTML — so a reply containing <script> renders as the literal characters
 * a farmer would see typed, which is exactly right.
 */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const strong = m[2] ?? m[3] ?? "";
    out.push(
      <strong key={`${keyBase}-b${i++}`} className="font-bold text-wangari-heading">
        {strong}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({
  content,
  streaming = false,
  className = "",
}: {
  content: string;
  /** Appends a caret while tokens are still arriving. */
  streaming?: boolean;
  className?: string;
}) {
  const blocks = React.useMemo(() => parseBlocks(content), [content]);
  const lastIndex = blocks.length - 1;

  return (
    <div className={className}>
      {blocks.map((b, i) => {
        const key = `${b.kind}-${i}`;
        switch (b.kind) {
          case "h":
            return (
              <p
                key={key}
                className={
                  b.level === 2
                    ? "mb-1.5 mt-4 text-base font-bold text-wangari-heading first:mt-0"
                    : "mb-1 mt-3 text-sm font-bold text-wangari-heading first:mt-0"
                }
              >
                {b.text}
              </p>
            );
          case "ul":
            return (
              <ul key={key} className="my-2 space-y-1.5 pl-1">
                {b.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="flex gap-2.5 text-[15px] leading-relaxed text-wangari-text">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-wangari-green-500" aria-hidden />
                    <span>{renderInline(item, `${key}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="my-2 space-y-2 pl-1">
                {b.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="flex gap-2.5 text-[15px] leading-relaxed text-wangari-text">
                    {/* A numeral rather than an ordered-list marker: it is
                        bigger, it cannot be mistaken for a bullet, and it
                        survives the low-contrast rendering of some cheap
                        Android browsers. */}
                    <span
                      className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-wangari-green-100 text-[11px] font-bold text-wangari-green-800"
                      aria-hidden
                    >
                      {j + 1}
                    </span>
                    <span>{renderInline(item, `${key}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case "p":
          default:
            return (
              <p key={key} className="my-2 text-[15px] leading-relaxed text-wangari-text first:mt-0 last:mb-0">
                {renderInline(b.text, key)}
              </p>
            );
        }
      })}

      {/* The caret rides after the final block, so a streaming reply reads as
          one growing thought rather than a list that keeps restarting. */}
      {streaming && (
        <span
          className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-wangari-green-500"
          aria-hidden
        />
      )}
    </div>
  );
}

export default RichText;