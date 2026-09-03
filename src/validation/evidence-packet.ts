import { z } from "zod";
import {
  CLAIM_KINDS,
  CONFIDENCE_LEVELS,
  SOURCE_TRUST_TIERS,
  SOURCE_TYPES,
} from "@/src/config/taxonomy";

/**
 * The evidence packet: the shape every material statement in the UI is assembled
 * from.
 *
 * This is the contract that makes "every fact on screen is traceable to a
 * source" enforceable rather than aspirational. A fact carries its own
 * citations, so a component cannot render a claim without also being handed the
 * evidence for it - there is no code path that produces a sentence with nothing
 * behind it.
 *
 * Three things are deliberately first-class here rather than being flattened
 * away, because each of them is a real research state that a naive model would
 * lose:
 *
 *   - `contradictions`: sources that disagree are both kept and surfaced. The
 *     packet never silently picks a winner.
 *   - `unknowns`: an applicable fact nobody has established is listed by name,
 *     not omitted. Absence from a profile would read as "nothing to report".
 *   - `freshness`: when the underlying records were last updated, and which
 *     fields are stale, so age is visible instead of implied.
 *
 * `analysis` is intentionally excluded from `facts`. Analysis is the system's
 * own judgement and belongs to the assessment, which cites the facts it rested
 * on; presenting it inside the evidence list would blur exactly the line the
 * project is built to keep sharp.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date (YYYY-MM-DD)");

/** A resolved, renderable pointer to a source, carrying its own dates. */
export const packetCitationSchema = z.object({
  sourceId: z.uuid(),
  /** Stable 1-based number used for the inline `[1]` marker in the UI. */
  index: z.number().int().positive(),
  url: z.string().regex(/^https?:\/\//),
  title: z.string().nullable(),
  publisher: z.string().nullable(),
  sourceType: z.enum(SOURCE_TYPES),
  trustTier: z.enum(SOURCE_TRUST_TIERS),
  publishedAt: isoDateSchema.nullable(),
  accessedAt: z.string().min(1),
  excerpt: z.string().nullable(),
  /** supports vs contradicts, so the UI can show which way a source cuts. */
  relation: z.enum(["supports", "contradicts"]),
});

/**
 * Facts are sourced statements. The kind stays attached all the way to the
 * screen: a precise company-reported number is still company-reported, and the
 * UI is expected to say so rather than presenting it as verified.
 */
export const packetFactSchema = z.object({
  claimId: z.uuid(),
  statement: z.string().min(1),
  kind: z.enum(["verified_fact", "company_reported", "estimate"]),
  asOf: isoDateSchema.nullable(),
  /** Extraction confidence. Source trust lives on each citation. */
  confidence: z.enum(CONFIDENCE_LEVELS).nullable(),
  citations: z.array(packetCitationSchema).min(1, "a fact must carry at least one citation"),
});

export const packetContradictionSchema = z.object({
  topic: z.string().min(1),
  claimIds: z.array(z.uuid()).min(2, "a contradiction needs at least two claims"),
  explanation: z.string().min(1),
  /** Both sides, kept whole, so the UI can show the disagreement itself. */
  claims: z
    .array(
      z.object({
        claimId: z.uuid(),
        statement: z.string(),
        kind: z.enum(CLAIM_KINDS),
        asOf: isoDateSchema.nullable(),
        citations: z.array(packetCitationSchema),
      }),
    )
    .min(2),
});

export const evidencePacketSchema = z.object({
  facts: z.array(packetFactSchema),
  contradictions: z.array(packetContradictionSchema),
  /** Applicable things nobody has established. Named, never omitted. */
  unknowns: z.array(z.string()),
  freshness: z.object({
    lastUpdatedAt: z.string().nullable(),
    staleFields: z.array(z.string()),
  }),
});

export type PacketCitation = z.infer<typeof packetCitationSchema>;
export type PacketFact = z.infer<typeof packetFactSchema>;
export type PacketContradiction = z.infer<typeof packetContradictionSchema>;
export type EvidencePacket = z.infer<typeof evidencePacketSchema>;
