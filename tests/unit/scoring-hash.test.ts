import { describe, expect, it } from "vitest";
import {
  buildCanonicalScoringPayload,
  hashScoringInput,
} from "@/src/domain/scoring/canonical-hash";
import { platformInput, platformWithStatuses } from "@/tests/fixtures/scoring";

/**
 * The input hash decides whether a recalculation counts as a new score. It has
 * to be stable against how a payload happened to be assembled, and sensitive to
 * anything that changes the arithmetic.
 */
describe("scoring input hash", () => {
  it("ignores object key order", () => {
    const base = platformInput(4);

    // The same dimensions, inserted in reverse order.
    const reordered = {
      ...base,
      dimensions: Object.fromEntries(Object.entries(base.dimensions).reverse()),
      risk: Object.fromEntries(Object.entries(base.risk).reverse()),
      hardGates: Object.fromEntries(Object.entries(base.hardGates).reverse()),
    };

    expect(hashScoringInput(reordered)).toBe(hashScoringInput(base));
  });

  it("ignores explanatory text and analyst notes", () => {
    const base = platformInput(4);
    const annotated = {
      ...base,
      notes: "Rewritten rationale for the committee pack.",
      dimensions: {
        ...base.dimensions,
        strategic_fit: { status: "scored" as const, score: 4, reason: "Reworded justification." },
      },
      risk: {
        ...base.risk,
        regulatory_change_of_control: { value: 0, reason: "Reviewed again, still nil." },
      },
      hardGates: {
        ...base.hardGates,
        evidence_floor: { state: "clear" as const, evidence: "Register checked on a later date." },
      },
      routeAssessment: {
        ...base.routeAssessment,
        acquire: { score: base.routeAssessment.acquire.score, reason: "Reworded." },
      },
    };

    // Rewording a justification must not create a new score row.
    expect(hashScoringInput(annotated)).toBe(hashScoringInput(base));
  });

  it("changes when a dimension score changes", () => {
    const before = hashScoringInput(platformInput(4));
    const after = hashScoringInput(
      platformWithStatuses({ why_now: { status: "scored", score: 5 } }, 4),
    );
    expect(after).not.toBe(before);
  });

  it("changes when a dimension moves from scored to unknown", () => {
    const before = hashScoringInput(platformInput(4));
    const after = hashScoringInput(
      platformWithStatuses({ fundamental_quality_durable_scale: { status: "unknown" } }, 4),
    );
    expect(after).not.toBe(before);
  });

  it("changes when a risk value, evidence penalty, gate state or route score changes", () => {
    const base = platformInput(4);
    const baseHash = hashScoringInput(base);

    expect(
      hashScoringInput({
        ...base,
        risk: {
          ...base.risk,
          regulatory_change_of_control: { value: 2, reason: "Approval risk identified." },
        },
      }),
    ).not.toBe(baseHash);

    expect(hashScoringInput({ ...base, evidencePenalty: 1 })).not.toBe(baseHash);

    expect(
      hashScoringInput({
        ...base,
        hardGates: { ...base.hardGates, entity_mismatch: { state: "unresolved" } },
      }),
    ).not.toBe(baseHash);

    expect(
      hashScoringInput({
        ...base,
        routeAssessment: { ...base.routeAssessment, partner: { score: 5 } },
      }),
    ).not.toBe(baseHash);
  });

  it("produces a canonical payload with sorted keys and no free text", () => {
    const payload = buildCanonicalScoringPayload(
      platformInput(4, { notes: "Should not appear anywhere in the payload." }),
    );
    const serialized = JSON.stringify(payload);

    expect(Object.keys(payload)).toEqual([...Object.keys(payload)].sort());
    expect(serialized).not.toContain("Should not appear");
    expect(serialized).not.toContain("reason");
    expect(serialized).not.toContain("notes");
  });

  it("is a hex sha-256 digest", () => {
    expect(hashScoringInput(platformInput(4))).toMatch(/^[0-9a-f]{64}$/);
  });
});
