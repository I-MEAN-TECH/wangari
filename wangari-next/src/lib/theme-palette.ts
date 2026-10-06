/**
 * theme-palette — the JavaScript mirror of @theme in src/app/globals.css.
 *
 * WHY THIS EXISTS: email HTML, print documents and SVG/Recharts attributes
 * cannot resolve CSS variables (var() is invalid in presentation attributes
 * and unsupported by mail clients). Those contexts must inline a literal —
 * so the literal comes from HERE, one place, keyed exactly like the CSS.
 *
 * The mirror is enforced: theme-palette.test.ts fails the build if this file
 * and @theme ever disagree. Never add a color to a component that is not in
 * this palette (add it to @theme first — ui-ux-pro-max rule 6: semantic color
 * tokens, no raw hex in components).
 */
export const THEME = {
  "wangari-green-50": "#F0FDF4",
  "wangari-green-100": "#DCFCE7",
  "wangari-green-200": "#BBF7D0",
  "wangari-green-300": "#86EFAC",
  "wangari-green-400": "#4ADE80",
  "wangari-green-500": "#22C55E",
  "wangari-green-600": "#16A34A",
  "wangari-green-700": "#15803D",
  "wangari-green-800": "#166534",
  "wangari-green-900": "#14532D",
  "wangari-ink": "#0B1220",
  "wangari-cream": "#FAFBFC",
  "wangari-paper": "#FAFAF7",
  "wangari-card": "#FFFFFF",
  "wangari-border": "#E5E7EB",
  "wangari-rule": "#CBD5E1",
  "wangari-text": "#334155",
  "wangari-heading": "#0F172A",
  "wangari-muted": "#64748B",
  "wangari-sunken": "#F1F5F9",
  "wangari-subtle": "#5F6E85",
  "tone-good-bg": "#F0FDF4",
  "tone-good-border": "#BBF7D0",
  "tone-good-text": "#166534",
  "tone-warn-bg": "#FFFBEB",
  "tone-warn-border": "#FDE68A",
  "tone-warn-text": "#92400E",
  "tone-bad-bg": "#FEF2F2",
  "tone-bad-border": "#FECACA",
  "tone-bad-text": "#991B1B",
  "tone-neutral-bg": "#F8FAFC",
  "tone-neutral-border": "#E2E8F0",
  "tone-neutral-text": "#475569",
  "badge-orange-bg": "#FED7AA",
  "badge-orange-text": "#C2410C",
  "badge-yellow-bg": "#FEF9C3",
  "badge-yellow-text": "#A16207",
  "badge-blue-bg": "#DBEAFE",
  "badge-blue-text": "#1D4ED8",
  "badge-red-bg": "#FEE2E2",
  "badge-red-text": "#B91C1C",
} as const;

export type ThemeToken = keyof typeof THEME;

/** Literal value for a token, for contexts where var() cannot go. */
export function themeColor(token: ThemeToken): string {
  return THEME[token];
}
