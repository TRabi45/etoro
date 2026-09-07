import Link from "next/link";
import { ResearchStateBadge, ResearchTierBadge } from "@/components/company/research-status";
import type { CompanyListItem } from "@/src/db/repositories/companies";
import type { EnablingLayer, StrategicTheme } from "@/src/config/taxonomy";

/**
 * The company list.
 *
 * A deliberately plain component: it receives rows a repository already fetched
 * and renders them. It holds no data-fetching logic, no client-side state and no
 * mock data - if this list is empty, the database is empty, which is exactly
 * what an evaluator should be able to conclude from looking at it.
 *
 * It renders identity plus stored research allocation and execution state. It
 * never implies a score or profile exists merely because a company has been
 * discovered.
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

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
      {children}
    </span>
  );
}

function ResearchSummary({ company }: { company: CompanyListItem }) {
  const observed =
    company.claimCount === 0 && company.eventCount === 0
      ? "No claims or events are recorded yet."
      : `${company.claimCount} claim${company.claimCount === 1 ? "" : "s"} and ${company.eventCount} event${company.eventCount === 1 ? "" : "s"} recorded.`;

  switch (company.researchState) {
    case "pending":
      return company.recordOrigin === "bootstrap_identity"
        ? `Bootstrap identity - research has not started. ${observed}`
        : `Discovered by monitoring - company research is pending. ${observed}`;
    case "running":
      return `Company research is currently running. ${observed}`;
    case "complete":
      return `Research completed. ${observed}`;
    case "partial":
      return `Research completed partially; recorded evidence remains available. ${observed}`;
    case "blocked":
      return `Research is blocked. ${company.researchTierReason ?? observed}`;
    case "failed":
      return `The last research attempt failed. ${company.researchTierReason ?? observed}`;
  }
}

export function CompanyList({ companies }: { companies: CompanyListItem[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {companies.map((company) => (
        <li
          key={company.id}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              <Link href={`/companies/${company.slug}`} className="hover:underline">
                {company.canonicalName}
              </Link>
            </h3>
            {company.primaryDomain ? (
              <span className="font-mono text-xs text-slate-500">{company.primaryDomain}</span>
            ) : null}
          </div>

          {/* The brand and the acquirable legal entity are separate facts, so
              they are shown separately - and an unresolved entity is stated
              rather than back-filled from the brand name. */}
          <p className="mt-1 text-xs text-slate-500">
            {company.legalEntityName ?? "Legal entity not yet established"}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {company.themeTags.map((theme) => (
              <Tag key={theme}>{THEME_LABELS[theme]}</Tag>
            ))}
            {company.enablingLayers
              .filter((layer) => layer !== "none")
              .map((layer) => (
                <Tag key={layer}>{LAYER_LABELS[layer]}</Tag>
              ))}
            <ResearchTierBadge tier={company.researchTier} />
            <ResearchStateBadge state={company.researchState} />
          </div>

          <p className="mt-3 border-t border-dashed border-slate-200 pt-2 text-xs text-slate-600">
            <ResearchSummary company={company} />
            {company.researchTierReason &&
            company.researchState !== "blocked" &&
            company.researchState !== "failed" ? (
              <span> Tier reason: {company.researchTierReason}</span>
            ) : null}
          </p>

          <p className="mt-2 text-xs font-medium">
            <Link href={`/companies/${company.slug}`} className="text-blue-700 hover:underline">
              View company profile →
            </Link>
          </p>
        </li>
      ))}
    </ul>
  );
}
