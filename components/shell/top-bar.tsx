"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TargetSummary } from "@/src/db/repositories/targets";
import { activeDestination } from "@/components/shell/navigation";
import { CommandMenu } from "@/components/shell/command-menu";
import { RunIntelligence } from "@/components/shell/run-intelligence";
import { Icon } from "@/components/ui/icon";
import { formatDateTime, formatRelative } from "@/components/ui/format";

/**
 * The top bar: where am I, what am I looking at, and how fresh is it.
 *
 * The `Last updated` slot is the one that earns its place. In a monitoring
 * product the age of the data is part of the data, so it sits in the chrome on
 * every screen rather than being something the reader has to go and check. Its
 * three states are distinct on purpose:
 *
 *   - a successful run, with its age;
 *   - a *partial* run, which produced usable data and missed sources - said in
 *     words, because rounding it up to "updated" would overstate coverage;
 *   - never run, which is not the same as stale.
 */

export interface TopBarProps {
  targets: readonly TargetSummary[];
  targetsProblem: string | null;
  /** ISO timestamp of the last run that finished, whatever its outcome. */
  lastRunAt: string | null;
  lastRunStatus: "success" | "partial_success" | "failed" | "running" | "blocked" | null;
  agentOpen: boolean;
  onToggleAgent: () => void;
  /** Shown below 900px, where the nav rail is an overlay rather than a column. */
  onOpenNav: () => void;
}

export function TopBar({
  targets,
  targetsProblem,
  lastRunAt,
  lastRunStatus,
  agentOpen,
  onToggleAgent,
  onOpenNav,
}: TopBarProps) {
  const pathname = usePathname();
  const destination = activeDestination(pathname);
  const onCompanyProfile = pathname.startsWith("/companies/");

  return (
    <header className="flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="rounded-control p-2 text-secondary motion-standard transition-colors hover:bg-surface-subtle hover:text-primary shell:hidden"
      >
        <Icon name="panel-right" size={20} />
      </button>

      {/*
       * A breadcrumb, not a heading. Each page renders its own `h1`, and a
       * second one in the chrome would give every screen two competing titles -
       * both visually and in the heading outline a screen reader announces.
       */}
      <nav aria-label="Breadcrumb" className="min-w-0 shrink">
        <ol className="flex items-center gap-1.5">
          <li className="flex items-center gap-1.5">
            {onCompanyProfile ? (
              <Link
                href="/targets"
                className="rounded text-body text-secondary motion-standard transition-colors hover:text-primary"
              >
                {destination?.label ?? "Targets"}
              </Link>
            ) : (
              <span className="truncate text-body font-medium text-primary">
                {destination?.label ?? "Corp Dev Intelligence"}
              </span>
            )}
          </li>
          {onCompanyProfile ? (
            <>
              <li aria-hidden="true" className="text-tertiary">
                <Icon name="chevron-right" size={14} />
              </li>
              <li>
                {/* The company's own name is the profile page's H1, which is
                    where a reader looks for it; repeating it here would give the
                    page two competing titles. */}
                <span className="truncate text-body font-medium text-primary">Company profile</span>
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 flex-1 justify-end">
          <CommandMenu targets={targets} loadProblem={targetsProblem} />
        </div>

        <LastUpdated at={lastRunAt} status={lastRunStatus} />

        <RunIntelligence />

        <button
          type="button"
          onClick={onToggleAgent}
          aria-pressed={agentOpen}
          aria-label={agentOpen ? "Hide the intelligence panel" : "Show the intelligence panel"}
          title={agentOpen ? "Hide the intelligence panel" : "Show the intelligence panel"}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control border motion-standard transition-colors ${
            agentOpen
              ? "border-brand/40 bg-brand-soft text-primary"
              : "border-border-control bg-surface text-secondary hover:bg-surface-subtle hover:text-primary"
          }`}
        >
          <Icon name="agent" size={18} />
        </button>
      </div>
    </header>
  );
}

function LastUpdated({
  at,
  status,
}: {
  at: string | null;
  status: TopBarProps["lastRunStatus"];
}) {
  if (!at) {
    return (
      <span
        className="hidden shrink-0 items-center gap-1.5 text-caption text-tertiary lg:flex"
        title="No monitoring run has completed yet. This is different from data being out of date - there is no data."
      >
        <Icon name="minus" size={14} />
        Never run
      </span>
    );
  }

  const partial = status === "partial_success";
  const failed = status === "failed" || status === "blocked";
  const relative = formatRelative(at);
  const exact = formatDateTime(at);

  return (
    <span
      className={`hidden shrink-0 items-center gap-1.5 text-caption lg:flex ${
        failed ? "text-danger" : partial ? "text-warning" : "text-secondary"
      }`}
      title={
        failed
          ? `The last run failed at ${exact}. Nothing on screen reflects sources newer than the previous successful run.`
          : partial
            ? `The last run completed at ${exact} but some sources failed, so coverage may be incomplete.`
            : `Last successful run finished ${exact}.`
      }
    >
      <Icon name={failed || partial ? "alert-circle" : "clock"} size={14} />
      {/* The qualifier is in the words, not only the colour. */}
      {failed ? "Last run failed" : partial ? `Partial · ${relative}` : `Updated ${relative}`}
    </span>
  );
}
