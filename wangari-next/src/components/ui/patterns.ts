/**
 * patterns.ts — the class strings that were copy-pasted across the app.
 *
 * Each constant is one repeated shell, byte-identical to what the files
 * used before this extraction — deduplication, not restyling. Use these
 * instead of re-spelling "rounded-2xl border border-wangari-border p-3.5"
 * for the Nth time (ui-ux-pro-max rule 6: consistency, one source).
 *
 * Patterns referenced by only one place are NOT here: a constant with one
 * consumer just adds a jump. Add one when a second site appears.
 *
 * Repeated <button> variants are included even where the kit's <Button>
 * differs (rounded-full base) — adopting the kit there is a visual change
 * and needs eyes on the result, so it waits.
 *
 * Regenerate candidates: node scripts/standardize-patterns.mjs
 */

export const CARD_PANEL =
  "rounded-2xl border border-wangari-border p-3.5";

export const CARD_PANEL_P4 =
  "rounded-2xl border border-wangari-border p-4";

export const CARD_PANEL_P5 =
  "rounded-2xl border border-wangari-border bg-white p-5";

export const CARD_PANEL_XL =
  "rounded-xl border border-wangari-border p-4";

export const CARD_PANEL_CREAM =
  "rounded-xl border border-wangari-border bg-wangari-cream/50 p-3.5";

export const CARD_RAISED =
  "rounded-xl border border-wangari-border bg-white px-4 py-3 shadow-lg";

export const CARD_WELL_DASHED =
  "rounded-xl border border-dashed border-wangari-border px-3 py-4 text-center text-xs text-wangari-subtle";

export const CARD_ROW_SM =
  "flex items-center justify-between rounded-lg border border-wangari-border px-3 py-2 text-sm";

export const CARD_ROW_ICON =
  "flex items-center gap-3 rounded-xl border border-wangari-border bg-white p-3.5 transition-colors hover:bg-wangari-gray-50";

export const CARD_ROW_CREAM =
  "flex items-center justify-between p-3 rounded-xl border border-wangari-border hover:bg-wangari-cream transition-colors";

export const ALERT_DANGER_SM =
  "rounded-lg border border-tone-bad-border bg-tone-bad-bg px-3 py-2 text-xs text-badge-red-text";

export const BTN_TOOL =
  "p-2 rounded-lg hover:bg-wangari-gray-100 transition-colors cursor-pointer";

export const BTN_CANCEL =
  "px-4 py-2 rounded-xl text-sm font-medium text-wangari-gray-500 hover:bg-white border border-wangari-border transition-colors cursor-pointer";

export const BTN_CANCEL_BLOCK =
  "mt-4 px-4 py-2 rounded-xl text-sm font-medium text-wangari-gray-500 hover:bg-wangari-gray-100 border border-wangari-border cursor-pointer";

export const BTN_LINK_SM =
  "ml-auto text-wangari-subtle hover:text-wangari-muted cursor-pointer";

export const BTN_PRIMARY_H11 =
  "h-11 rounded-xl bg-wangari-green-800 px-4 text-sm font-semibold text-white shadow-md hover:bg-wangari-green-900 disabled:opacity-60";

export const BTN_REMOVE =
  "mt-2 flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-bold text-tone-bad-text shadow-sm";

export const BTN_CTA_EMERALD =
  "px-6 py-2 rounded-xl text-sm font-semibold bg-wangari-green-700 text-white hover:bg-wangari-green-800 shadow-md transition-all cursor-pointer disabled:opacity-50";

export const BTN_GLASS =
  "p-2 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer";
