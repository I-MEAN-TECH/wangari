/**
 * chart-series — the data-color palettes, in one place.
 *
 * Recharts renders series colors as SVG presentation attributes, where
 * var() is invalid — so these must be JS strings. They used to be literals
 * scattered across seven components (hardcoded data in the UI); now every
 * value that equals a theme token is a THEME[...] reference, so a theme
 * change reaches the charts too. Values with no token (sky/amber accents
 * used to separate chart series, and the retired #94A3B8 kept as a DATA
 * grey — it encodes a series, it is not text) stay literal on purpose.
 *
 * Regenerate: node scripts/centralize-chart-series.mjs
 */
import { THEME } from "./theme-palette";

export const eventSeries = [THEME["wangari-green-600"], THEME["wangari-sky-500"], THEME["wangari-amber-500"], THEME["wangari-violet-500"], THEME["wangari-red-500"], THEME["wangari-teal-500"], THEME["wangari-orange-500"]];

export const cropsSeries = [THEME["wangari-green-800"], THEME["wangari-green-500"], THEME["wangari-green-300"], "#94A3B8", THEME["wangari-rule"]];

export const financesSeries = [THEME["wangari-green-800"], THEME["wangari-green-500"], THEME["wangari-green-300"], "#94A3B8", THEME["wangari-rule"], THEME["wangari-amber-500"], THEME["wangari-red-500"], THEME["wangari-blue-500"], THEME["wangari-violet-500"], THEME["wangari-pink-500"]];

export const inventorySeries = [THEME["wangari-green-800"], THEME["wangari-green-500"], THEME["wangari-green-300"], "#94A3B8", THEME["wangari-rule"], THEME["wangari-amber-500"], THEME["wangari-red-500"], THEME["wangari-blue-500"]];

export const salesSeries = [THEME["wangari-green-800"], THEME["wangari-green-500"], THEME["wangari-green-300"], THEME["wangari-amber-500"], THEME["wangari-blue-500"], "#94A3B8"];

export const pieSeries = [THEME["wangari-green-600"], THEME["wangari-green-400"], THEME["wangari-green-300"], THEME["wangari-green-200"], "#FACC15", "#94A3B8"];

export const flockSeries = [THEME["wangari-green-800"], THEME["wangari-green-600"], THEME["wangari-green-400"], THEME["wangari-green-300"], THEME["wangari-green-200"]];
