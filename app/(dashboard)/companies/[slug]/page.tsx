import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCompanyProfileWithEvidence } from "@/src/db/repositories/company-profile";
import { getScoreHistory } from "@/src/db/repositories/scores";
import { getRecentEvents } from "@/src/db/repositories/events";
import { SourceDrawerProvider } from "@/components/company/source-drawer";
import { ProfileHeader } from "@/components/company/profile-header";
import { DecisionSummary } from "@/components/company/decision-summary";
import { ProfileTabs, parseProfileTab } from "@/components/company/profile-tabs";
import { OverviewTab } from "@/components/company/overview-tab";
import { ScoreBreakdown } from "@/components/company/score-breakdown";
import { EvidenceTab } from "@/components/company/evidence-tab";
import { ActivityTab } from "@/components/company/activity-tab";
import { ErrorState } from "@/components/ui/error-state";
import { Notice } from "@/components/ui/notice";

/**
 * The company deep-dive.
 *
 * Ordered as a decision rather than a dossier: identity and conclusion in the
 * header, then the decision summary, then the four tabs that support it. An
 * executive can stop after the summary and still have the answer; an analyst
 * carries on into the score inputs and the evidence behind them.
 *
 * Everything comes out of the repository layer, and every material statement
 * carries a citation that opens the source in a drawer over this page - so
 * checking a claim never costs the reader their place.
 *
 * The three reads are independent and only the profile is essential. Events and
 * score history failing degrade the Activity tab and are reported there; they
 * do not take the page down, because the decision summary is still the most
 * useful thing on screen without them.
 */
export default async function CompanyProfilePage(props: PageProps<"/companies/[slug]">) {
  await connection();

  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const activeTab = parseProfileTab(searchParams.tab);

  const [profileResult, historyResult, eventsResult] = await Promise.all([
    getCompanyProfileWithEvidence(slug),
    getScoreHistory(slug),
    getRecentEvents({ companySlug: slug, sinceDate: "1970-01-01", limit: 50 }),
  ]);

  if (!profileResult.ok) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <ErrorState
          title="This company profile could not be read"
          impact={
            <>
              Nothing is shown rather than a partial profile, because a half-loaded evidence tree
              would leave claims without their sources - which is exactly the state the evidence
              rules exist to prevent.
            </>
          }
          detail={profileResult.problem.message}
        />
      </div>
    );
  }

  if (profileResult.data === null) {
    // A missing slug is a 404, distinct from a database failure. The reader
    // needs to be told which of the two happened.
    notFound();
  }

  const profile = profileResult.data;
  const events = eventsResult.ok ? eventsResult.data : [];
  const scoreHistory = historyResult.ok ? historyResult.data : [];

  const activityProblems = [
    eventsResult.ok ? null : `Events: ${eventsResult.problem.message}`,
    historyResult.ok ? null : `Score history: ${historyResult.problem.message}`,
  ].filter((problem): problem is string => problem !== null);

  return (
    <SourceDrawerProvider sources={profile.sources}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6">
        <ProfileHeader profile={profile} />

        {profile.company.researchState === "running" ? (
          <Notice tone="info" title="A research pass is running">
            <p>
              Existing evidence stays visible while it completes. Anything below reflects the last
              finished pass, not the one in progress.
            </p>
          </Notice>
        ) : null}

        {profile.company.researchState === "failed" ||
        profile.company.researchState === "blocked" ? (
          <Notice
            tone="warning"
            title={
              profile.company.researchState === "blocked"
                ? "Research is blocked for this company"
                : "The last research pass failed"
            }
          >
            <p>
              {profile.company.researchTierReason ??
                "No reason was recorded. Whatever is shown below predates the failure and may be out of date."}
            </p>
          </Notice>
        ) : null}

        <DecisionSummary profile={profile} />

        <div>
          <ProfileTabs
            slug={profile.company.slug}
            active={activeTab}
            counts={{
              evidence: profile.evidence.facts.length,
              activity: events.length + scoreHistory.length,
            }}
          />

          <div className="pt-5">
            {activeTab === "overview" ? <OverviewTab profile={profile} /> : null}
            {activeTab === "score" ? <ScoreBreakdown score={profile.score} /> : null}
            {activeTab === "evidence" ? <EvidenceTab profile={profile} /> : null}
            {activeTab === "activity" ? (
              <ActivityTab
                events={events}
                scoreHistory={scoreHistory}
                problems={activityProblems}
              />
            ) : null}
          </div>
        </div>
      </div>
    </SourceDrawerProvider>
  );
}
