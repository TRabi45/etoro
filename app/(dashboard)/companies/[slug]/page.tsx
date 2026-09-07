import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChatPanel } from "@/components/chat/chat-panel";
import { AssessmentSection } from "@/components/company/assessment-section";
import { FundamentalsSection } from "@/components/company/fundamentals-section";
import { ResearchStateBadge, ResearchTierBadge } from "@/components/company/research-status";
import { ScoreBreakdown } from "@/components/company/score-breakdown";
import { SourcesFooter } from "@/components/company/sources-footer";
import { Notice } from "@/components/ui/notice";
import {
  getCompanyProfileWithEvidence,
  type CompanyProfileView,
} from "@/src/db/repositories/company-profile";
import type { EnablingLayer, StrategicTheme, TargetPath } from "@/src/config/taxonomy";

/**
 * The company deep-dive profile.
 *
 * Everything on this page comes out of the database through the repository
 * layer: identity, research status, evidence, fundamentals, assessment and the
 * deterministic score. Nothing is hard-coded, and every material statement
 * carries a citation that resolves to the sources footer.
 *
 * `connection()` moves rendering to request time, so the page is never a
 * build-time snapshot and `next build` does not need database credentials.
 */

const THEME_LABELS: Record<StrategicTheme, string> = {
  trading: "Trading",
  investing: "Investing",
  wealth_management: "Wealth Management",
  neo_banking: "Neo-Banking",
};

const LAYER_LABELS: Record<EnablingLayer, string> = {
  ai: "AI",
  data: "Data",
  community: "Community",
  none: "No enabling layer",
};

const PATH_LABELS: Record<TargetPath, string> = {
  platform: "Platform",
  tuck_in: "Tuck-in",
  hybrid: "Hybrid",
};

function DateValue({ value, empty }: { value: string | null; empty: string }) {
  return value ? <time dateTime={value}>{value.slice(0, 10)}</time> : empty;
}

function ResearchStatusNotice({ profile }: { profile: CompanyProfileView }) {
  const { company } = profile;
  const reason = company.researchTierReason ?? "No detailed reason was recorded for this state.";

  switch (company.researchState) {
    case "pending":
      return (
        <Notice
          tone="warning"
          title={
            company.recordOrigin === "bootstrap_identity"
              ? "Bootstrap identity - research pending"
              : "Company research pending"
          }
        >
          <p>
            {company.recordOrigin === "bootstrap_identity"
              ? "This is an identity/search lead. No company-specific research has completed yet."
              : "This company was discovered by the monitoring pipeline. Company-specific research has not completed yet."}
          </p>
        </Notice>
      );
    case "running":
      return (
        <Notice tone="neutral" title="Company research is running">
          <p>
            Existing evidence remains visible while the current bounded research pass is in
            progress.
          </p>
        </Notice>
      );
    case "partial":
      return (
        <Notice tone="warning" title="Company research completed partially">
          <p>
            Some sources or fields could not be established. The evidence below is retained; absent
            material remains unknown. {reason}
          </p>
        </Notice>
      );
    case "blocked":
      return (
        <Notice tone="warning" title="Company research is blocked">
          <p>{reason}</p>
        </Notice>
      );
    case "failed":
      return (
        <Notice tone="error" title="The latest company-research attempt failed">
          <p>{reason}</p>
        </Notice>
      );
    case "complete":
      return profile.hasResearch ? null : (
        <Notice tone="warning" title="Research is marked complete without a rendered profile">
          <p>
            No claims, assessment, or active v0.3 score are available to render for this company.
          </p>
        </Notice>
      );
  }
}

export default async function CompanyProfilePage({ params }: PageProps<"/companies/[slug]">) {
  await connection();
  const { slug } = await params;
  const result = await getCompanyProfileWithEvidence(slug);

  if (!result.ok) {
    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-10">
        <Notice
          tone={result.problem.kind === "configuration" ? "warning" : "error"}
          title={
            result.problem.kind === "configuration"
              ? "Supabase is not configured"
              : "The database could not be reached"
          }
        >
          <p>{result.problem.message}</p>
        </Notice>
      </main>
    );
  }

  // A missing company is a 404, which is a different answer from a database
  // failure and must not be shown as one.
  if (!result.data) {
    notFound();
  }

  const profile = result.data;
  const { company } = profile;

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <Link href="/" className="text-xs text-blue-700 hover:underline">
        ← Monitored universe
      </Link>

      <header className="mt-3 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">{company.canonicalName}</h1>
          {company.primaryDomain ? (
            <a
              href={`https://${company.primaryDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-blue-700 hover:underline"
            >
              {company.primaryDomain}
            </a>
          ) : null}
        </div>

        {/* Brand and acquirable legal entity are separate facts and are shown
            separately. An unresolved entity is stated, never back-filled. */}
        <p className="mt-1 text-sm text-slate-600">
          {company.legalEntityName ?? "Legal entity not yet established"}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {company.themeTags.map((theme) => (
            <span
              key={theme}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600"
            >
              {THEME_LABELS[theme]}
            </span>
          ))}
          {company.enablingLayers
            .filter((layer) => layer !== "none")
            .map((layer) => (
              <span
                key={layer}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600"
              >
                {LAYER_LABELS[layer]}
              </span>
            ))}
          <ResearchTierBadge tier={company.researchTier} />
          <ResearchStateBadge state={company.researchState} />
          {profile.path ? (
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              Classification: {PATH_LABELS[profile.path]}
            </span>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-2">
            <dt>Last researched</dt>
            <dd className="font-medium text-slate-800">
              <DateValue value={company.lastResearchedAt} empty="Not yet" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt>Next refresh due</dt>
            <dd className="font-medium text-slate-800">
              <DateValue value={company.nextRefreshAt} empty="Not scheduled" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt>Tier confidence</dt>
            <dd className="font-medium capitalize text-slate-800">
              {company.researchTierConfidence ?? "Not established"}
            </dd>
          </div>
          {company.researchTierReason ? (
            <div className="sm:col-span-2">
              <dt className="inline">Tier reason: </dt>
              <dd className="inline text-slate-800">{company.researchTierReason}</dd>
            </div>
          ) : null}
        </dl>

        {profile.evidence.freshness.lastUpdatedAt ? (
          <p className="mt-3 text-xs text-slate-500">
            Last evidence update {profile.evidence.freshness.lastUpdatedAt.slice(0, 10)}
            {profile.evidence.freshness.staleFields.length > 0
              ? ` · stale: ${profile.evidence.freshness.staleFields.join(", ")}`
              : ""}
          </p>
        ) : null}
      </header>

      <div className="mt-6 space-y-4">
        <ResearchStatusNotice profile={profile} />

        {company.legalEntityName === null ? (
          <Notice tone="warning" title="Acquirable legal entity unresolved">
            <p>
              Evidence may be collected, but a v0.3 score must not be written until the target legal
              entity is established.
            </p>
          </Notice>
        ) : null}
      </div>

      {profile.hasResearch ? (
        <>
          {/* The provenance of this data is stated plainly, and it is read from
              the run that actually produced it - never hard-coded - so a real
              pipeline run can never be mislabelled stub data, or the reverse. */}
          {profile.assessment?.isStub ? (
            <div className="mt-6">
              <Notice tone="neutral" title="Pipeline stub data">
                <p>
                  This profile was produced by the Milestone 2 vertical-slice pipeline using a
                  hardcoded stub payload with synthetic sources. The evidence structure, scoring and
                  citations are real; the underlying facts are not.
                </p>
              </Notice>
            </div>
          ) : null}

          <FundamentalsSection fundamentals={profile.fundamentals} metrics={profile.metrics} />
          <AssessmentSection assessment={profile.assessment} evidence={profile.evidence} />
          {profile.score ? <ScoreBreakdown score={profile.score} /> : null}
          <SourcesFooter sources={profile.sources} />
        </>
      ) : null}

      {/* The page context lets the agent resolve "their score" or "compare them
          to Dfns" without the user having to name this company again. */}
      <ChatPanel selectedCompanySlug={company.slug} selectedCompanyName={company.canonicalName} />
    </main>
  );
}
