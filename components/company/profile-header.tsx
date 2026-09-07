import type { CompanyProfileView } from "@/src/db/repositories/company-profile";
import { RefreshCompany } from "@/components/company/refresh-company";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { ScoreDisplay } from "@/components/ui/score-display";
import { FreshnessLabel } from "@/components/ui/freshness-label";
import { Badge } from "@/components/ui/badge";
import { humanizeToken } from "@/components/ui/format";

/**
 * Company identity and the decision at a glance.
 *
 * The header answers "who is this and what did we conclude" in one block, so an
 * executive reading over an analyst's shoulder gets the conclusion without
 * scrolling and without learning the system.
 *
 * The legal entity is printed as its own line rather than folded into the
 * name. In M&A the brand and the signable entity are routinely different, and a
 * header that shows only the brand invites the wrong assumption. When no entity
 * has been established the header says so explicitly.
 *
 * Score, coverage and range travel together through ScoreDisplay - there is no
 * arrangement of this header that shows the number alone.
 */

export function ProfileHeader({ profile }: { profile: CompanyProfileView }) {
  const { company, score, path } = profile;

  return (
    <header className="rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-page font-semibold text-primary">{company.canonicalName}</h1>
          <p className="mt-0.5 text-body text-secondary">
            {company.legalEntityName ?? (
              <span
                className="text-tertiary"
                title="No source has established the legal entity. It is not assumed to match the brand name."
              >
                Legal entity unknown
              </span>
            )}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {path ? (
              <Badge
                tone="neutral"
                title="A classification of operating shape, not a second scorecard. A hybrid gets the one global score, never an average of two."
              >
                {humanizeToken(path)}
              </Badge>
            ) : (
              <Badge tone="muted" title="No assessment has classified this company's target path.">
                Path unclassified
              </Badge>
            )}

            {company.themeTags.map((theme) => (
              <Badge key={theme} tone="neutral">
                {humanizeToken(theme)}
              </Badge>
            ))}

            {company.enablingLayers
              .filter((layer) => layer !== "none")
              .map((layer) => (
                <Badge
                  key={layer}
                  tone="muted"
                  title="A cross-cutting enabler, not a strategic pillar."
                >
                  {humanizeToken(layer)}
                </Badge>
              ))}

            {company.primaryDomain ? (
              <a
                href={`https://${company.primaryDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption text-info hover:underline"
              >
                {company.primaryDomain}
              </a>
            ) : null}
          </div>

          <div className="mt-3">
            <FreshnessLabel lastResearchedAt={company.lastResearchedAt} showExact />
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <RecommendationBadge recommendation={score?.recommendation ?? null} />
          <ScoreDisplay
            score={score?.normalizedScore ?? null}
            coverage={score?.coverage ?? null}
            lowerBound={score?.lowerBound ?? null}
            upperBound={score?.upperBound ?? null}
            variant="full"
          />
          <RefreshCompany slug={company.slug} name={company.canonicalName} />
        </div>
      </div>
    </header>
  );
}
