import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration tests, which need a live local Supabase instance.
 *
 * Kept in a separate project from `pnpm test` on purpose: the unit suite must
 * stay runnable in CI with no database, no Docker and no secrets, so the two
 * cannot share a config. Run these with `pnpm test:integration` after
 * `pnpm db:start`.
 *
 * The timeout is generous because each test round-trips to Postgres.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Credentials are loaded once, for every file. Leaving each test to do it
    // meant a new file could silently skip it and fail as though the local
    // database were misconfigured.
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
    // Shared database state: these tests must not race each other.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
