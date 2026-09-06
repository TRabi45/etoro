import { describe, expect, it } from "vitest";
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_BY_SUBTYPE,
  EVENT_SUBTYPES_BY_CATEGORY,
  EVENT_TYPES,
} from "@/src/config/taxonomy";
import { extractedPayloadSchema } from "@/src/ai/prompts/v1/extractor";

/**
 * The two-level taxonomy only works if the levels stay consistent with each
 * other and with the database. A subtype that belongs to no category, or belongs
 * to two, would make the CHECK constraint in the migration reject rows the
 * application believes are valid.
 */
describe("event taxonomy", () => {
  it("assigns every subtype to exactly one category", () => {
    const assigned = Object.values(EVENT_SUBTYPES_BY_CATEGORY).flat();
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual([...EVENT_TYPES].sort());
  });

  it("gives every category at least one subtype", () => {
    for (const category of EVENT_CATEGORIES) {
      expect(EVENT_SUBTYPES_BY_CATEGORY[category].length, category).toBeGreaterThan(0);
    }
  });

  it("derives the reverse lookup without drifting", () => {
    for (const [category, subtypes] of Object.entries(EVENT_SUBTYPES_BY_CATEGORY)) {
      for (const subtype of subtypes) {
        expect(EVENT_CATEGORY_BY_SUBTYPE[subtype]).toBe(category);
      }
    }
  });
});

/**
 * The extractor's output contract. What matters here is not that valid payloads
 * parse - it is that the shapes a model most plausibly gets wrong are rejected
 * before anything reaches the database.
 */
describe("extractedPayloadSchema", () => {
  const valid = {
    entities_mentioned: ["Bit2C"],
    fintech_entities: [{ name: "Bit2C", role: "operating_company" as const }],
    events: [
      {
        summary: "Bit2C completed the transfer of its trading platform.",
        subject_entity_name: "Bit2C",
        type: "acquisition",
        event_date: "2026-06-30",
        materiality: "high",
        etoro_relevance_explanation: "Adds a regulated Israeli trading operation.",
      },
    ],
    claims: [
      {
        subject_entity_name: "Bit2C",
        statement: "Bit2C transferred its trading platform into the eToro group.",
        kind: "company_reported",
        confidence: "medium",
        asOf_date: "2026-06-30",
      },
    ],
  };

  it("accepts a well-formed payload", () => {
    expect(extractedPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an empty extraction, which is a real answer", () => {
    const parsed = extractedPayloadSchema.safeParse({
      entities_mentioned: [],
      fintech_entities: [],
      events: [],
      claims: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an article that names companies but qualifies none of them", () => {
    // The common case, and the one the relevance gate exists for: a retail
    // story names a dozen brands and establishes none of them as a financial
    // services business, so none may enter the monitored universe.
    const parsed = extractedPayloadSchema.safeParse({
      entities_mentioned: ["Home Depot", "Fanta", "Bran Castle"],
      fintech_entities: [],
      events: [],
      claims: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fintech_entities).toEqual([]);
    }
  });

  it("accepts an event whose subject the document never makes clear", () => {
    // Null attribution is recoverable; a wrong one is not, because it reads
    // exactly like a correct record later.
    const payload = {
      ...valid,
      events: [{ ...valid.events[0], subject_entity_name: null }],
    };
    expect(extractedPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects a payload with no relevance gate at all", () => {
    const withoutGate: Record<string, unknown> = { ...valid };
    delete withoutGate.fintech_entities;
    expect(extractedPayloadSchema.safeParse(withoutGate).success).toBe(false);
  });

  it("accepts a null relevance explanation, which is the honest default", () => {
    const payload = {
      ...valid,
      events: [{ ...valid.events[0], etoro_relevance_explanation: null }],
    };
    expect(extractedPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects an event category outside the controlled vocabulary", () => {
    // A model reaching for a finer label than it can justify. The subtype is
    // recorded later, from better evidence, not guessed here.
    const payload = { ...valid, events: [{ ...valid.events[0], type: "license_suspension" }] };
    expect(extractedPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a date that is not a date", () => {
    const payload = { ...valid, events: [{ ...valid.events[0], event_date: "last summer" }] };
    expect(extractedPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a claim with no subject entity", () => {
    const payload = { ...valid, claims: [{ ...valid.claims[0], subject_entity_name: "" }] };
    expect(extractedPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invented claim kind", () => {
    const payload = { ...valid, claims: [{ ...valid.claims[0], kind: "rumour" }] };
    expect(extractedPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
