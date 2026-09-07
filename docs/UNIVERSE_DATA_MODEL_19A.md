# Universe Data Model Contract — Milestone 19A.1

Status: test-first specification. No production schema or repository implementation exists in this phase.

## Why this contract comes first

Universe expansion will combine identifiers and observations from sources that disagree, repeat records, and often arrive before a canonical company is known. Encoding the expected behavior before choosing SQL, repository APIs, or providers prevents the implementation from defining its own acceptance criteria.

The acceptance suite deliberately uses behavior at the persistence boundary. It does not require particular index, constraint, policy, function, or repository names.

## Company external identifiers

The future persistence model conceptually named `company_external_ids` has this minimum contract:

- `company_id`: required reference to one canonical company.
- `provider`: required, non-empty namespace stored as extensible text rather than a closed enum. Examples include `wikidata`, `gleif`, `eba`, and `companies_house`; those examples are not an allowlist.
- `external_id`: required, non-empty identifier in that provider namespace.
- One company may have many identifiers, including identifiers from different providers.
- `(provider, external_id)` identifies at most one canonical company and supports exact lookup.

Case folding, provider-specific validation, identifier history, and provider adapters are intentionally unspecified.

## Discovery observations

The future persistence model conceptually named `company_discovery_observations` records discovery provenance, not research evidence:

- `company_id`: nullable while the observation is unresolved and updateable when a canonical company is later established.
- `provider`: required, non-empty source namespace.
- `observed_name`: required and non-empty.
- `observed_domain` and `observed_geography`: optional observed values, not canonical conclusions.
- `source_record_id`: optional stable identifier supplied by the source.
- `source_url`: optional URL for the observed record.
- `first_seen_at` and `last_seen_at`: required timestamps with `last_seen_at >= first_seen_at`.
- `raw_metadata`: optional JSON payload retained for audit/debug use.

When `source_record_id` exists, re-observing the same `(provider, source_record_id)` updates the observation instead of creating an unbounded series of duplicates. `first_seen_at` remains the earliest sighting and `last_seen_at` advances. No de-duplication behavior is specified for observations without a stable source record ID.

Two observations from independent providers may resolve to the same canonical company. An observation does not become a claim, citation, score input, or verified company fact merely because it has been associated with a company.

Ordinary public/user-facing access must not expose `raw_metadata`. Phase 19A.2 may enforce that with table privacy, column privileges, a safe view, or another equivalent boundary; the test asserts the behavior rather than a specific mechanism.

## Company stage

The future canonical company field is named `company_stage` in this contract:

```text
pre_seed
seed
series_a
series_b
series_c_plus
growth
late_stage
public
bootstrapped
unknown
```

`unknown` is the truthful default. The six existing bootstrap identities must migrate to `unknown`; the migration must not infer stage from funding search leads, names, research tier, M&A state, or any other indirect signal.

This is a distinct concept from three existing axes:

- `ma_state`: ownership/transaction availability such as independent, pending, or completed.
- `lifecycle_status`: discovery and candidate workflow status.
- `research_state`: completeness/outcome of the latest company research.

The UI and Agent currently use the word “stage” for an `ma_state` filter. Phase 19A.2 must preserve that behavior or rename it deliberately; it must not silently reinterpret the existing filter as company maturity.

## Compatibility and security

- All six bootstrap company identities and their existing identity fields survive unchanged.
- Milestone 18's stub-intelligence RLS isolation remains effective.
- Existing public company-list and target-search behavior remains unchanged until later product work deliberately consumes the new fields.
- External identifiers and observations are discovery/identity data. They do not bypass evidence, scoring, prompt-injection, permission, or provenance safeguards.

## Explicit non-goals

This phase does not specify fuzzy matching, automatic merging, provider integrations, web search, tier promotion, scheduling, Universe Builder orchestration, or a UI stage filter.
