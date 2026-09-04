import { z } from "zod";

/**
 * AI provider configuration.
 *
 * The model identifier is environment configuration, never a literal in code.
 * Swapping models - for cost, latency or capability - must not require editing
 * application logic, and every stored `agent_runs` row records which model
 * actually produced an answer.
 *
 * Missing configuration is returned as a value rather than thrown, matching the
 * database client: an unconfigured deployment should render an honest "chat is
 * not configured" state, and `next build` must succeed in CI where no API key
 * exists.
 */

const aiEnvironmentSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1),
});

export interface AiConfigurationProblem {
  kind: "configuration";
  message: string;
  missing: string[];
}

export interface AiConfig {
  apiKey: string;
  model: string;
}

export type AiConfigResult =
  { ok: true; config: AiConfig } | { ok: false; problem: AiConfigurationProblem };

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfigResult {
  const parsed = aiEnvironmentSchema.safeParse(env);
  if (!parsed.success) {
    const missing = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    return {
      ok: false,
      problem: {
        kind: "configuration",
        message: `The AI provider is not configured. Set ${missing.join(", ")} in .env.local (see .env.example).`,
        missing,
      },
    };
  }

  return {
    ok: true,
    config: { apiKey: parsed.data.ANTHROPIC_API_KEY, model: parsed.data.ANTHROPIC_MODEL },
  };
}
