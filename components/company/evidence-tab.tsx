import type { CompanyProfileView } from "@/src/db/repositories/company-profile";
import { CitationChip } from "@/components/company/citation-chip";
import { ContradictionCallout } from "@/components/company/contradiction-callout";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { formatDate, humanizeToken } from "@/components/ui/format";

/**
 * What the profile actually knows, and how well.
 *
 * Three sections in decreasing order of certainty: sourced facts, claims where
 * sources disagree, and named gaps. That order is deliberate - a reader who
 * stops early has read the strongest material, and a reader who reaches the end
 * has met every reason for doubt.
 *
 * The claim kind travels with every fact and is never dropped. A precise
 * company-reported number is still company-reported, and an estimate is still
 * an estimate however tight its range: an analyst who cannot see which is which
 * cannot tell a filing from a press guess.
 */

const CLAIM_KIND: Record<string, { label: string; tone: BadgeTone; hint: string }> = {
  verified_fact: {
    label: "Verified",
    tone: "brand",
    hint: "Confirmed by a primary source such as a regulator, filing or contract.",
  },
  company_reported: {
    label: "Company-reported",
    tone: "info",
    hint: "The company's own statement. Precise, but not independently confirmed.",
  },
  estimate: {
    label: "Estimate",
    tone: "warning",
    hint: "A third-party estimate, not a disclosed figure.",
  },
  analysis: {
    label: "Analysis",
    tone: "neutral",
    hint: "Research judgement. Never promoted to a verified fact.",
  },
  unknown: {
    label: "Unknown",
    tone: "muted",
    hint: "Recorded as not established, which is a finding rather than an absence.",
  },
};

const CONFIDENCE_TONE: Record<string, BadgeTone> = {
  high: "neutral",
  medium: "neutral",
  low: "warning",
};

export function EvidenceTab({ profile }: { profile: CompanyProfileView }) {
  const { evidence, sources } = profile;

  if (evidence.facts.length === 0 && evidence.contradictions.length === 0 && evidence.unknowns.length === 0) {
    return (
      <EmptyState
        icon="quote"
        title="No evidence has been recorded"
        nextStep={
          <>
            No claim, contradiction or named gap exists for this company yet. Evidence appears here
            once a research pass extracts it from a fetched source - refresh the company to start
            one.
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="facts-heading">
        <h3 id="facts-heading" className="text-section font-semibold text-primary">
          Decisive claims
        </h3>
        <p className="mt-1 text-body text-secondary">
          Every statement below is attached to at least one source. Click a citation to read the
          excerpt it rests on without leaving this page.
        </p>

        {evidence.facts.length === 0 ? (
          <p className="mt-3 rounded-card border border-border bg-surface px-4 py-3 text-body text-secondary">
            No sourced claim has been recorded. Anything shown elsewhere on this profile is
            assessment judgement rather than an established fact.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {evidence.facts.map((fact) => {
              const kind = CLAIM_KIND[fact.kind] ?? CLAIM_KIND.analysis;
              return (
                <li
                  key={fact.claimId}
                  className="rounded-card border border-border bg-surface px-4 py-3"
                >
                  <p className="text-body leading-relaxed text-primary">
                    {fact.statement}
                    <CitationChip numbers={fact.citations.map((citation) => citation.index)} />
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={kind.tone} title={kind.hint}>
                      {kind.label}
                    </Badge>
                    {fact.confidence ? (
                      <Badge
                        tone={CONFIDENCE_TONE[fact.confidence] ?? "neutral"}
                        title="How confident the extraction was in reading this claim from its source. Separate from how much the publisher is trusted."
                      >
                        {humanizeToken(fact.confidence)} confidence
                      </Badge>
                    ) : (
                      <Badge tone="muted" title="No extraction confidence was recorded.">
                        Confidence unrecorded
                      </Badge>
                    )}
                    {fact.asOf ? (
                      <span className="tabular text-caption text-tertiary">
                        As of {formatDate(fact.asOf)}
                      </span>
                    ) : (
                      <span
                        className="text-caption text-tertiary"
                        title="No source established when this was true."
                      >
                        Undated
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="contradictions-heading">
        <h3 id="contradictions-heading" className="text-section font-semibold text-primary">
          Contradictions
        </h3>
        <p className="mt-1 text-body text-secondary">
          Where sources disagree, both sides are kept and neither is preferred. Resolving them is an
          analyst&rsquo;s judgement, not the pipeline&rsquo;s.
        </p>

        {evidence.contradictions.length === 0 ? (
          <p className="mt-3 rounded-card border border-border bg-surface px-4 py-3 text-body text-secondary">
            No contradictions recorded. That means none were detected among the sources reviewed -
            not that every figure has been independently confirmed.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {evidence.contradictions.map((contradiction) => (
              <ContradictionCallout key={contradiction.topic} contradiction={contradiction} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="unknowns-heading">
        <h3 id="unknowns-heading" className="text-section font-semibold text-primary">
          Named unknowns
        </h3>
        <p className="mt-1 text-body text-secondary">
          Gaps the pipeline recorded by name. These are the research tasks - each one is a specific
          thing nobody has established, not a general shortage of information.
        </p>

        {evidence.unknowns.length === 0 ? (
          <p className="mt-3 rounded-card border border-border bg-surface px-4 py-3 text-body text-secondary">
            No unknowns are recorded. On a thinly researched company this usually means the evidence
            has not been examined closely enough to find any, rather than that nothing is missing.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {evidence.unknowns.map((unknown) => (
              <li
                key={unknown}
                className="flex items-start gap-2 rounded-card border border-warning/25 bg-warning-soft px-4 py-2.5 text-body leading-relaxed text-primary"
              >
                <Icon name="help" size={16} className="mt-0.5 shrink-0 text-warning" />
                {unknown}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sources-heading">
        <h3 id="sources-heading" className="text-section font-semibold text-primary">
          Sources
        </h3>
        <p className="mt-1 text-body text-secondary">
          {sources.length === 0
            ? "No sources are attached to this profile."
            : "Every citation number on this profile resolves to one of these."}
        </p>

        {sources.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-1.5">
            {sources.map((source) => (
              <li
                key={source.sourceId}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-card border border-border bg-surface px-4 py-2.5 text-body"
              >
                <span className="tabular font-medium text-primary">[{source.index}]</span>
                <span className="text-primary">{source.publisher ?? "Unattributed"}</span>
                <Badge
                  tone={
                    source.trustTier === "primary"
                      ? "brand"
                      : source.trustTier === "secondary"
                        ? "neutral"
                        : "muted"
                  }
                >
                  {humanizeToken(source.trustTier)}
                </Badge>
                <span className="tabular text-caption text-tertiary">
                  {formatDate(source.publishedAt) ?? "No publication date"}
                </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 text-caption text-info hover:underline"
                >
                  <span className="truncate">{source.url}</span>
                  <Icon name="external-link" size={12} />
                </a>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}
