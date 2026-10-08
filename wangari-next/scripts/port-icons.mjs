// ══════════════════════════════════════════════════════════════════════
//  Port the design system's icons into src/components/clone/icons.tsx
//
//  Why this exists
//  ───────────────
//  The public site we are cloning draws its icons with the source's OWN line
//  illustrations — not a generic icon package. Substituting a lookalike set
//  was the single biggest reason the first pass of the clone read as "not the
//  real page". So we lift the artwork verbatim from a rendered page rather
//  than redraw it.
//
//  Running it
//  ──────────
//    1. Save a copy of the live page's HTML:
//         curl -s https://<source-host>/ > /tmp/source.html
//    2. node scripts/port-icons.mjs /tmp/source.html
//
//  What it guarantees
//  ──────────────────
//  • Every icon paints with `currentColor`. The source ships a couple of
//    baked-in hex values (#1c1f21 and its 30%-alpha form); those are rewritten
//    to currentColor / fill-opacity, so an icon takes its colour from the
//    theme token of whatever slot it sits in. The script throws if any hex
//    survives, which keeps the "no colour literals" rule enforceable.
//  • `data-color="color-2"` markers are preserved, because the ported
//    stylesheet selects on them ([data-color=color-2] → fill currentColor at
//    30%). Dropping them silently changes how the badges render.
//  • Class names the stylesheet needs (stack-city-pin, verification-badge-icon,
//    mantality-orbit-rings) are kept and merged with any className a caller
//    passes, so styling never disappears just because a prop was supplied.
//
//  Icons are addressed by their ordinal position among the page's <svg>
//  elements, which is stable for a given source revision — re-run the script
//  and diff the output after a source update.
// ══════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("usage: node scripts/port-icons.mjs <saved-source-page.html>");
  process.exit(1);
}

const html = readFileSync(sourcePath, "utf8");

/** Every <svg>…</svg> on the page, in document order. */
function collectSvgs(doc) {
  const out = [];
  let i = 0;
  for (;;) {
    const start = doc.indexOf("<svg", i);
    if (start < 0) break;
    const end = doc.indexOf("</svg>", start);
    if (end < 0) break;
    out.push(doc.slice(start, end + 6));
    i = end + 6;
  }
  return out;
}

const svgs = collectSvgs(html);

// ── Ordinal map ────────────────────────────────────────────────────────
// name, source index, and a short note on where it is used.
const ICONS = [
  ["ProgramIcon1", 6, "program card 01"],
  ["ProgramIcon2", 10, "program card 02"],
  ["ProgramIcon3", 14, "program card 03 (also the orbit badge-6 mark)"],
  ["ProgramIcon4", 18, "program card 04"],
  ["BadgeIcon1", 22, "approach badge top-left, orbit badge-1"],
  ["BadgeIcon2", 23, "approach badge bottom-left, orbit avatar-2"],
  ["BadgeIcon3", 24, "approach badge top-right, orbit badge-3"],
  ["BadgeIcon4", 25, "approach badge bottom-right, orbit badge-4"],
  ["ProofBadgeIcon", 5, "16px mark beside the community proof line"],
  ["ProofBadgeAltIcon", 56, "16px mark on the closing social-proof line"],
  ["QuoteIcon", 32, "testimonial card quote mark"],
  ["CityPinIcon", 33, "city chip on a testimonial card"],
  ["VerifiedCheckIcon", 34, "verified tick on an avatar"],
  ["OrbitRings", 61, "the two arcs behind the closing orbit"],
  ["ArrowUpRightIcon", 7, "card-bottom and testimonial number arrows"],
  ["ArrowRightIcon", 28, "read-more link arrow"],
  ["SocialFacebookIcon", 75, "footer"],
  ["SocialInstagramIcon", 76, "footer"],
  ["SocialXIcon", 77, "footer"],
  ["SocialTikTokIcon", 78, "footer"],
];

// ── Colour normalisation ───────────────────────────────────────────────
function normaliseColour(svg, name) {
  // Work element by element: the decision to add a data-color marker depends
  // on whether that same element already carries one.
  const out = svg.replace(/<[a-zA-Z][\w:-]*[^>]*>/g, (tag) => {
    let next = tag
      .replace(/fill="#1c1f214D"/gi, 'fill="currentColor" fill-opacity=".3"')
      .replace(/fill="#1c1f21"/gi, 'fill="currentColor"')
      .replace(/stroke="#1c1f21"/gi, 'stroke="currentColor"');

    const hadAlphaInk = /fill="#1c1f214D"/i.test(tag);
    if (hadAlphaInk && !/data-color=/.test(tag)) {
      next = next.replace(/\s*\/?>\s*$/, (tail) => ` data-color="color-2"${tail}`);
    }
    return next;
  });

  const leftover = out.match(/#[0-9a-fA-F]{3,8}\b/g);
  if (leftover) {
    throw new Error(`${name}: unresolved colour literal(s) ${leftover.join(", ")}`);
  }
  return out;
}

// ── HTML attributes → JSX ──────────────────────────────────────────────
const RENAME = {
  class: "className",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-miterlimit": "strokeMiterlimit",
  "stroke-opacity": "strokeOpacity",
  "stroke-dasharray": "strokeDasharray",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
  "vector-effect": "vectorEffect",
  "paint-order": "paintOrder",
  "shape-rendering": "shapeRendering",
  "text-anchor": "textAnchor",
  "dominant-baseline": "dominantBaseline",
  "clip-path": "clipPath",
  "stroke-linejoin ": "strokeLinejoin",
};

/** Attributes that describe the sprite/asset wrapper, not the drawing. */
const DROP = new Set(["xmlns", "xmlns:xlink", "x", "y", "role", "aria-label", "style", "focusable", "loading"]);

const VOID_ELEMENTS = new Set(["path", "circle", "rect", "line", "polygon", "polyline", "ellipse", "use", "stop"]);

/**
 * Convert one element's HTML attributes to JSX. The root <svg>'s own class is
 * pulled out rather than emitted, because the component builds its className
 * itself (base class + whatever the caller passes).
 */
function convertAttrs(attrs, isRoot) {
  const parts = [];
  let rootClass = "";
  const re = /([\w:.-]+)(?:\s*=\s*"([^"]*)")?/g;
  let m;
  while ((m = re.exec(attrs))) {
    const rawName = m[1];
    if (!rawName) continue;
    let value = m[2];
    if (DROP.has(rawName)) continue;

    let name = RENAME[rawName] ?? rawName;
    if (name === "class" || name === "className") name = "className";

    if (value === undefined) {
      parts.push(` ${name}`);
      continue;
    }

    if (name === "className") {
      // Only keep the classes the ported stylesheet actually consumes —
      // lucide/nc bookkeeping markers would be dead weight in our markup.
      const kept = value
        .split(/\s+/)
        .filter((c) => c && c !== "nc-icon-wrapper" && !c.startsWith("lucide"));
      if (kept.length === 0) continue;
      const joined = kept.join(" ");
      if (isRoot) {
        rootClass = joined;
        continue;
      }
      parts.push(` className="${joined}"`);
      continue;
    }

    // JSX needs every attribute quoted; escape any quote that sneaks in.
    parts.push(` ${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  return { parts: parts.join(""), rootClass };
}

function svgToJsx(svg, name) {
  let rootClass = "";
  const withTags = svg.replace(
    /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g,
    (_full, close, tag, attrs, selfClose, offset) => {
      if (close) return `</${tag}>`;
      const isRoot = tag === "svg" && offset === 0;
      const converted = convertAttrs(attrs, isRoot);
      if (isRoot) rootClass = converted.rootClass;
      // Shapes are void elements in JSX; containers (<svg>, <g>) keep their
      // explicit end tag, which is why they are not in VOID_ELEMENTS.
      return `<${tag}${converted.parts}${VOID_ELEMENTS.has(tag) || selfClose ? " /" : ""}>`;
    }
  );

  // Drop the end tags belonging to the void elements we just self-closed.
  const out = withTags.replace(/<\/([a-zA-Z][\w:-]*)>/g, (full, tag) =>
    VOID_ELEMENTS.has(tag) ? "" : full
  );

  if (!out.startsWith("<svg") || !out.endsWith("</svg>")) {
    throw new Error(`${name}: unbalanced markup after conversion`);
  }
  if (out.includes('className="') && rootClass) {
    throw new Error(`${name}: root class was emitted twice`);
  }
  return { jsx: out, rootClass };
}

// ── Emit ───────────────────────────────────────────────────────────────
const HEADER = `// ══════════════════════════════════════════════════════════════════════
//  GENERATED FILE — do not edit by hand.
//
//  Regenerate with:  node scripts/port-icons.mjs <saved-source-page.html>
//
//  These are the design system's own line illustrations, lifted from the
//  rendered page rather than redrawn — the card marks especially, because a
//  lookalike icon set is what made the first pass of this clone read wrong.
//
//  Every icon paints with currentColor, so it takes its colour from the theme
//  token of the slot it sits in (see styles/wc-theme.css). No icon in here
//  carries a colour of its own.
// ══════════════════════════════════════════════════════════════════════

import * as React from "react";

export type IconProps = React.SVGProps<SVGSVGElement>;

/** Join a required slot class with any className the caller supplies. */
const cx = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(" ");
`;

const chunks = [];
for (const [name, index, note] of ICONS) {
  const raw = svgs[index];
  if (!raw) throw new Error(`${name}: no <svg> at index ${index}`);
  const clean = normaliseColour(raw, name);
  const { jsx, rootClass } = svgToJsx(clean, name);

  // Keep the slot class the stylesheet keys on, then let the caller add more
  // via className — never one or the other.
  const merged = [rootClass && `"${rootClass}"`, "className"].filter(Boolean).join(", ");

  // Inject the class and the props spread at the END of the root tag, so a
  // caller can override width/height/viewBox but never lose the slot class.
  const close = jsx.indexOf(">");
  const rootTag = jsx.slice(0, close);
  const rest = jsx.slice(close);
  const body = `${rootTag} className={cx(${merged})} {...props}${rest}`;

  chunks.push(
    `/** ${note} */\nexport function ${name}({ className, ...props }: IconProps) {\n  return (\n    ${body}\n  );\n}`
  );
}

const BARRELS = `
/** The four program-card marks, in card order. */
export const PROGRAM_ICONS = [ProgramIcon1, ProgramIcon2, ProgramIcon3, ProgramIcon4] as const;

/** The four tint-circle marks, shared by the approach badges and the orbit. */
export const BADGE_ICONS = [BadgeIcon1, BadgeIcon2, BadgeIcon3, BadgeIcon4] as const;

/** Footer social marks, in the order the source lays them out. */
export const SOCIAL_ICONS = [
  SocialFacebookIcon,
  SocialInstagramIcon,
  SocialXIcon,
  SocialTikTokIcon,
] as const;
`;

writeFileSync(resolve(here, "../src/components/clone/icons.tsx"), HEADER + "\n" + chunks.join("\n\n") + "\n" + BARRELS, "utf8");
console.log(`wrote src/components/clone/icons.tsx — ${ICONS.length} icons`);
