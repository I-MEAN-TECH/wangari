/** Thin re-export so ai.ts can reach primaryModelFor and fetchRecordValues
 *  without importing the full route (which would pull in Express types). */

export { primaryModelFor, fetchRecordValues } from "../routes/ai-intake.js";
