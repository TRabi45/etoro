import Link from "next/link";
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
 * It renders identity only. There is no score, recommendation or profile in this
 * milestone, and showing a placeholder for one would misrepresent seed data as
 * research the agent had done.
 */

const THEME_LABELS: Record<StrategicTheme, string> = {
  active_trading: "Active trading",
  wealth_long_term_savings: "Wealth / long-term savings",
  on_chain_infrastructure: "On-chain infrastructure",
  money_payments: "Money / payments",
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
          </div>

          {/* Three states, not two.
              The card used to print "Bootstrap identity - research pending" for
              anything without an assessment, which mislabelled every company the
              monitoring pipeline discovered as a hand-seeded identity - and told
              the reader nothing was known about a company the pipeline had
              already collected a dozen sourced claims on. Provenance and
              emptiness are separate facts and the card now says both. */}
          {company.isResearchPending && company.recordOrigin === "bootstrap_identity" ? (
            <p className="mt-3 border-t border-dashed border-slate-200 pt-2 text-xs font-medium text-amber-700">
              Bootstrap identity — research pending
            </p>
          ) : company.isResearchPending ? (
            <p className="mt-3 border-t border-dashed border-slate-200 pt-2 text-xs font-medium text-slate-600">
              <span className="font-semibold text-slate-700">Discovered by monitoring</span> —{" "}
              {company.claimCount === 0 && company.eventCount === 0
                ? "named in a source, nothing recorded yet"
                : `${company.claimCount} claim${company.claimCount === 1 ? "" : "s"}, ${company.eventCount} event${company.eventCount === 1 ? "" : "s"}`}
              . Not scored: a score needs fundamentals, which news does not establish.
            </p>
          ) : (
            <p className="mt-3 border-t border-dashed border-slate-200 pt-2 text-xs font-medium">
              <Link href={`/companies/${company.slug}`} className="text-blue-700 hover:underline">
                View evidence-backed profile →
              </Link>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
