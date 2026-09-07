import { describe, expect, it } from "vitest";
import { zodSchema } from "ai";
import {
  ANALYST_DIMENSION_KEYS,
  analystOutputSchema,
  EMPTY_ANALYST_OUTPUT,
} from "@/src/ai/prompts/v1/analyst";

/**
 * The shape of the schema actually sent to the provider.
 *
 * Regression guard for a defect that no fixture test could have caught: every
 * automated test injects a fake analyst, so the real schema was never
 * validated by a real provider until a live run. Anthropic rejected it
 * outright - "Schemas contains too many parameters with union types (27
 * parameters ... limit: 16)" - which meant live analysis could not run at all
 * while every test stayed green.
 *
 * A nullable field is a union (`["string", "null"]`); an optional field is
 * not. Both express "unknown", and the schema must keep choosing the one the
 * provider will accept.
 */

/** Anthropic's documented ceiling on union-typed parameters in a tool schema. */
const PROVIDER_UNION_PARAMETER_LIMIT = 16;

function countUnionParameters(node: unknown, path = "$", found: string[] = []): string[] {
  if (!node || typeof node !== "object") return found;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.type) || Array.isArray(record.anyOf) || Array.isArray(record.oneOf)) {
    found.push(path);
  }
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === "object") countUnionParameters(value, `${path}.${key}`, found);
  }
  return found;
}

/**
 * A minimal payload in the shape the provider is actually asked for: every
 * unestablished field simply absent, and dimensions as a list.
 */
function validWireOutput() {
  return {
    entityResolution: { matchesRecordedIdentity: false, note: "Nothing confirmed." },
    claims: [
      {
        subject: "Fixture Co",
        predicate: "annual revenue",
        valueStatus: "unknown",
        claimKind: "company_reported",
        documentIndex: 0,
      },
    ],
    dimensions: ANALYST_DIMENSION_KEYS.map((key) => ({
      key,
      status: "unknown",
      reason: "Nothing found.",
      citingClaimIndexes: [],
    })),
    gates: Object.fromEntries(
      ["regulatory", "client_assets", "security", "integrity", "deal"].map((key) => [
        key,
        { state: "unresolved", reason: "Nothing found.", citingClaimIndexes: [] },
      ]),
    ),
    routes: Object.fromEntries(
      ["build", "partner", "buy", "invest", "watch"].map((key) => [
        key,
        { score: 0, reason: "Nothing found." },
      ]),
    ),
    classification: "tuck_in",
    fundamentals: { archetype: "b2b_infrastructure_saas", unknowns: [] },
    assessment: { unknowns: [] },
  };
}

describe("analyst output schema", () => {
  it("stays within the provider's union-parameter limit", () => {
    const unions = countUnionParameters(zodSchema(analystOutputSchema).jsonSchema);

    expect(
      unions.length,
      `Union-typed parameters the provider will reject:\n${unions.join("\n")}`,
    ).toBeLessThanOrEqual(PROVIDER_UNION_PARAMETER_LIMIT);
  });

  it("treats an omitted field as unknown rather than as a missing key", () => {
    // The wire format drops what the evidence does not establish; the parsed
    // object still carries one explicit representation of unknown, so no
    // consumer has to handle both `undefined` and `null`.
    const parsed = analystOutputSchema.parse(validWireOutput());

    expect(parsed.entityResolution.legalEntityConfirmed).toBeNull();
    expect(parsed.claims[0].valueNumeric).toBeNull();
    expect(parsed.claims[0].excerpt).toBeNull();
    expect(parsed.dimensions.strategic_fit.score).toBeNull();
    expect(parsed.fundamentals.revenueQuality).toBeNull();
    expect(parsed.assessment.counterThesis).toBeNull();

    // Null, never zero: an unestablished number is not a measured zero.
    expect(parsed.claims[0].valueNumeric).not.toBe(0);
    expect(parsed.dimensions.strategic_fit.score).not.toBe(0);
  });

  it("fills in a dimension the analyst omitted as unknown, not as zero", () => {
    // Dimensions travel as a list, so an incomplete list is possible in a way
    // eight named properties made impossible. The engine still has to receive
    // all eight, and a missing one must be distinguishable from a bad one.
    const parsed = analystOutputSchema.parse({
      ...validWireOutput(),
      dimensions: [
        {
          key: "strategic_fit",
          status: "scored",
          score: 4,
          reason: "Strong fit.",
          citingClaimIndexes: [],
        },
      ],
    });

    expect(Object.keys(parsed.dimensions).sort()).toEqual([...ANALYST_DIMENSION_KEYS].sort());
    expect(parsed.dimensions.strategic_fit.score).toBe(4);
    expect(parsed.dimensions.deal_feasibility.status).toBe("unknown");
    expect(parsed.dimensions.deal_feasibility.score).toBeNull();
    expect(parsed.dimensions.deal_feasibility.score).not.toBe(0);
  });

  it("keeps the empty output shaped like the type every consumer reads", () => {
    // EMPTY_ANALYST_OUTPUT is a parsed value, not a wire payload, so it holds
    // the keyed dimensions object rather than the list the provider is sent.
    expect(Object.keys(EMPTY_ANALYST_OUTPUT.dimensions).sort()).toEqual(
      [...ANALYST_DIMENSION_KEYS].sort(),
    );
    for (const key of ANALYST_DIMENSION_KEYS) {
      expect(EMPTY_ANALYST_OUTPUT.dimensions[key].score).toBeNull();
    }
  });
});
