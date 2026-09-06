# ADR 0001: v0.3 is the sole active scoring model

**Status:** Accepted
**Date:** 2026-09-06
**Owner:** Corporate Development (Tom Rabinovich Fuhrer)

## Context

Milestone 1 shipped scoring configuration v0.2: two path-specific scorecards
(Platform, Tuck-in), a risk penalty and an evidence penalty subtracted from a
"positive normalized" score, and no reported uncertainty range. `getquin` was
scored once under v0.2 as part of the Milestone 2 vertical slice, using a
clearly labelled synthetic payload.

`docs/ACQUISITION_THESIS.md` - the extracted, section-numbered specification
of eToro's actual acquisition thesis - contradicts all three design choices:

- Section 26 specifies **one global weight set**. Section 27 puts family
  variation in _sub-metrics within a dimension_, never in a second weight
  vector: "Keep global weights, but vary sub-metrics by family."
- Section 27: a severe regulatory issue "is handled by a gate, not
  double-counted without policy." Risk lives in the dimension anchors and the
  hard gates, not in a subtracted penalty.
- Mandatory principle 5: "Never hide missing information inside a score."
  Coverage and an uncertainty range must be reported beside the score, always
  - never folded into it as a penalty.

Scoring configuration v0.3 (`src/config/scoring/v0-3.ts`,
`supabase/migrations/20260906150000_scoring_model_v0_3.sql`) implements
section 26 directly: eight dimensions, sub-metric contributions, coverage
measured over _scored ÷ applicable_ weight, and an explicit lower/upper range
assuming 0 and 5 respectively for every unknown criterion.

## Decision

1. **v0.3 is the only active decision-scoring model.** No runtime consumer -
   dashboard, profile page, AI tool, search or ranking - may select a score
   calculated under any other model as "the current score" for a company.
2. **Platform, Tuck-in and Hybrid remain classifications of operating shape**,
   stored on the assessment (`assessments.path`) and rendered separately from
   the score. They are not a second scorecard: a Hybrid gets the one v0.3
   score, never an average of two path-specific scores. This is unchanged
   from the locked product decisions for this milestone - the classification
   survives v0.2's retirement; the dual scorecard behind it does not.
3. **v0.2 score rows already written are immutable historical records.** They
   are never edited, backfilled, or deleted. `scores.model_version` and
   `scores.scoring_model_id` continue to identify exactly which configuration
   produced each row, so a v0.2-era score stays reproducible and auditable -
   it simply stops being anyone's "current" answer.
4. **Only one global model may be active at a time.** `scoring_models.is_active`
   is enforced unique per `(path is null)` by
   `scoring_models_one_active_global`; publishing a new version deactivates
   its predecessor in the same transaction (`ensureScoringModel`). A stored
   configuration is immutable once it has produced a score
   (`scoring_models_immutable_after_use`), so a published model's weights or
   gates can never be edited out from under scores that already exist.

## Enforcement

"No runtime consumer may select v0.2" is a runtime guarantee, not a
convention, because it was already violated once and only running the code
found it: `company-profile.ts` and `targets.ts` both selected "the newest
score" by sorting on `calculated_at` alone, which is timestamp order, not
model order. A company scored once under v0.2 and never re-scored under v0.3
would have kept winning that sort forever, since nothing after it would ever
exist to be newer.

Both call sites now go through
`getActiveScoringModelId` (`src/db/repositories/scoring-models.ts`), which
reads the one row `scoring_models` itself marks active, and filter on it
_before_ picking "the latest" score. The active model is selected explicitly,
by database state, not inferred from a timestamp or a hardcoded version
string that the next model bump would silently invalidate.

## Consequences

- A company that has never been re-scored under v0.3 reads as unscored, not
  as scored-under-v0.2. This is correct under this decision, and is visible
  in the UI as "not yet scored" rather than a stale number.
- The nine target families of section 10 and full per-family sub-metrics
  remain future work; today's sub-metrics are the degenerate one-per-dimension
  case, which is enough to implement section 26's mechanism without also
  requiring the evidence taxonomy that a real family breakdown would need.
- Any future model version (v0.4+) inherits the same explicit-selection
  requirement automatically, because the mechanism keys off `is_active`
  rather than a specific version string.

## Related

- Locked product decisions, Claude Code Build Milestone 5.
- `tests/unit/thesis-conformance.test.ts` - executable conformance checks
  against `docs/ACQUISITION_THESIS.md`.
- `tests/unit/scoring-engine.test.ts` - engine-level unit coverage.
