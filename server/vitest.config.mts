import { defineConfig } from "vitest/config";

/**
 * Server tests.
 *
 * Scope is deliberately narrow: pure logic only (record-grade, tag-range,
 * doc-codes, farm-code). Route handlers need a live Postgres and a JWT, and
 * pretending otherwise is how suites become theatre. Pure maths is where a
 * wrong number actually hurts a farmer, so that is what is pinned here.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
