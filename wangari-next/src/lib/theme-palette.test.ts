/**
 * The theme is one file: src/app/globals.css @theme.
 *
 * Three ways components were allowed to disagree with it, all now enforced:
 *
 *  1. `theme-palette.ts` is the JS mirror for contexts that cannot resolve
 *     var() (email HTML, print documents, Recharts/SVG attributes). This
 *     test fails if the mirror and @theme ever drift.
 *  2. Tailwind classes must use token utilities (bg-wangari-green-800),
 *     never raw hex (bg-[#166534]). ui-ux-pro-max rule 6: semantic color
 *     tokens; raw hex in components is the anti-pattern.
 *  3. The exceptions are enumerated, not vibes: artwork (the weather
 *     night sky), brand colours (WhatsApp green), one-off category accents
 *     and the invoice/quote document design palette. Anything NEW fails
 *     until it becomes a token or joins this list deliberately.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { THEME } from "./theme-palette";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const CSS = readFileSync(join(SRC, "app/globals.css"), "utf8");

/** file (relative to src/) -> raw hex values deliberately allowed there. */
const RAW_HEX_ALLOWLIST: Record<string, string[]> = {
  // Invoice/quote document design palette (template accents, washes).
  "app/(dashboard)/invoices/page.tsx": ["#1E3A5F", "#EFF6FF", "#BFDBFE", "#7C2D12", "#FFF7ED"],
  "app/(dashboard)/quotes/page.tsx": ["#E7EBD8", "#F1F5E8"],
  // WhatsApp brand green — brand colour, not ours to retheme.
  "app/(dashboard)/whatsapp/page.tsx": ["#25D366"],
  // Category accents: CRM stage dot, admin badge lilac, early-access amber.
  "app/(admin)/waadmin/crm/page.tsx": ["#7E22CE"],
  "components/admin/ui.tsx": ["#F3E8FF", "#7E22CE"],
  "components/landing/EarlyAccessPanel.tsx": ["#78350F"],
  // WeatherWidget illustration: a 12-step night-sky gradient, artwork.
  "components/dashboard/WeatherWidget.tsx": [
    "#0B1026", "#101B3F", "#1B2A5E", "#0A0F1D", "#141D33", "#22304D",
    "#0B0A18", "#1C1633", "#2A2350", "#0D1224", "#15203C", "#243457",
  ],
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

describe("theme palette", () => {
  it("the JS mirror equals @theme, token for token and value for value", () => {
    const cssTokens = new Map<string, string>();
    for (const m of CSS.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      cssTokens.set(m[1], m[2].toUpperCase());
    }
    expect(cssTokens.size).toBeGreaterThan(30);

    const jsTokens = new Map<string, string>(
      Object.entries(THEME).map(([k, v]) => [k, v.toUpperCase()])
    );
    // Same keys both ways — a token added to CSS but not the mirror (or the
    // reverse) is exactly the drift this guards.
    expect([...jsTokens.keys()].sort()).toEqual([...cssTokens.keys()].sort());
    for (const [name, value] of cssTokens) {
      expect(jsTokens.get(name), `THEME["${name}"] disagrees with @theme`).toBe(value);
    }
  });

  it("no component spells a color as raw hex in a Tailwind class", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split("\\").join("/");
      const allowed = new Set(RAW_HEX_ALLOWLIST[rel] ?? []);
      const src = readFileSync(file, "utf8");
      for (const hit of src.match(/-\[[^\]]*#[0-9a-fA-F]{6}[^\]]*\]/g) ?? []) {
        const hex = hit.match(/#[0-9a-fA-F]{6}/)![0].toUpperCase();
        if (!allowed.has(hex)) offenders.push(`${rel}: ${hit}`);
      }
    }
    expect(
      offenders,
      "Use a token utility instead (see scripts/tokenize-hex.mjs), or add a token to @theme"
    ).toEqual([]);
  });

  it("no component uses a default Tailwind palette class — theme tokens only", () => {
    // Every default-palette value the app uses has been either mapped to an
    // existing token (exact value), mirrored as wangari-<family>-<step>, or
    // unified onto wangari-green (emerald). A new default-palette class means
    // a color entered the system outside the theme.
    const families =
      "gray|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
    const re = new RegExp(
      "(?:bg|text|border|ring|fill|stroke|from|via|to|divide|decoration|placeholder|outline|accent|caret)-" +
        `(?:(?:${families})-\\d{2,3})\\b`,
      "g"
    );
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split("\\").join("/");
      const src = readFileSync(file, "utf8");
      for (const hit of src.match(re) ?? []) offenders.push(`${rel}: ${hit}`);
    }
    expect(
      offenders,
      "Use wangari-*/tone-*/badge-* tokens (see scripts/theme-extend.mjs)"
    ).toEqual([]);
  });
});
