import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turns off every stylistic rule that would fight Prettier. Formatting is
  // enforced by `format:check`, correctness by ESLint - the two never overlap.
  prettier,
  {
    rules: {
      // The architecture forbids `any` at module boundaries: unvalidated shapes
      // must go through a Zod schema instead of being asserted into existence.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Architectural boundary, enforced by the linter rather than by convention:
    // UI code renders data that a repository already fetched and validated.
    files: ["app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              message:
                "UI components must not talk to the database directly. Use a repository from src/db/repositories.",
            },
          ],
          patterns: [
            {
              group: ["@/src/db/client", "**/db/client"],
              message:
                "UI components must not construct database clients. Use a repository from src/db/repositories.",
            },
            {
              group: ["@/tests/**", "**/tests/evaluation/**"],
              message: "Benchmark and test fixtures must never be importable from production code.",
            },
          ],
        },
      ],
    },
  },
  {
    // The gold benchmark is evaluation-only material. Nothing under src/ may
    // import it, so a bad merge cannot leak researched conclusions into the
    // runtime data path. (app/ and components/ are covered by the block above,
    // which would otherwise be overridden for the files they share.)
    files: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/tests/evaluation/**", "@/tests/**"],
              message: "Gold benchmark fixtures must not be importable from production modules.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from the database schema; not hand-maintained.
    "src/db/types.generated.ts",
  ]),
]);

export default eslintConfig;
