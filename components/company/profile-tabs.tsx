import Link from "next/link";

/**
 * The profile's four views.
 *
 * Links rather than client state, so each tab is a URL: an analyst can send a
 * colleague the evidence tab of a specific company, and going back from a
 * source returns to the tab they were reading. It also keeps every tab's
 * content server-rendered, which matters most for Evidence - the heaviest tab
 * and the one nobody should wait on a client fetch for.
 *
 * Rendered as a tablist for assistive technology even though the panels are
 * separate documents. `aria-current` carries the selection, and the underline
 * is reinforcement rather than the only signal.
 */

export const PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "score", label: "Score" },
  { id: "evidence", label: "Evidence" },
  { id: "activity", label: "Activity" },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]["id"];

export function parseProfileTab(value: string | string[] | undefined): ProfileTabId {
  const raw = Array.isArray(value) ? value[0] : value;
  return PROFILE_TABS.some((tab) => tab.id === raw) ? (raw as ProfileTabId) : "overview";
}

export function ProfileTabs({
  slug,
  active,
  counts,
}: {
  slug: string;
  active: ProfileTabId;
  /** Shown beside a tab where a number tells the reader whether to bother. */
  counts: Partial<Record<ProfileTabId, number>>;
}) {
  return (
    <nav aria-label="Company profile sections" className="border-b border-border">
      <ul className="flex gap-1">
        {PROFILE_TABS.map((tab) => {
          const isActive = tab.id === active;
          const count = counts[tab.id];
          return (
            <li key={tab.id}>
              <Link
                href={`/companies/${slug}?tab=${tab.id}`}
                aria-current={isActive ? "page" : undefined}
                scroll={false}
                className={`flex h-10 items-center gap-1.5 border-b-2 px-3 text-body font-medium motion-standard transition-colors ${
                  isActive
                    ? "border-b-brand text-primary"
                    : "border-b-transparent text-secondary hover:text-primary"
                }`}
              >
                {tab.label}
                {count !== undefined ? (
                  <span className="tabular rounded-pill bg-surface-subtle px-1.5 text-caption text-tertiary">
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
