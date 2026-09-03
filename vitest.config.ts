import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests run in a plain Node environment with no database connection.
 *
 * Domain logic (scoring, validation, bootstrap invariants) is pure by design, so
 * the suite that guards it must stay runnable in CI without secrets or Docker.
 * Anything that needs a live Supabase instance belongs in `pnpm db:verify`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
