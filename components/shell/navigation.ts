import type { IconName } from "@/components/ui/icon";

/**
 * The product's five destinations.
 *
 * One exported list, consumed by the sidebar, the top bar's breadcrumb and the
 * agent panel's context line - so a route cannot appear in the navigation with
 * one name and in the breadcrumb with another.
 *
 * The rule this encodes is that navigation describes what exists. Nothing is
 * listed here that the application cannot actually render, and no destination
 * is added ahead of the screen behind it.
 */

export interface NavDestination {
  href: string;
  label: string;
  icon: IconName;
  /** One line, shown as the nav item's title attribute and in the help sheet. */
  purpose: string;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    href: "/",
    label: "Briefing",
    icon: "briefing",
    purpose: "What changed since your last review, and what needs attention today.",
  },
  {
    href: "/targets",
    label: "Targets",
    icon: "targets",
    purpose: "The ranked target universe, with search, filters and comparison.",
  },
  {
    href: "/market-map",
    label: "Market Map",
    icon: "market-map",
    purpose: "Coverage by category and geography, and where the gaps are.",
  },
  {
    href: "/competitors",
    label: "Competitors",
    icon: "competitors",
    purpose: "Competitor transactions and the capabilities they bought.",
  },
  {
    href: "/monitoring",
    label: "Monitoring",
    icon: "monitoring",
    purpose: "Watchlist, recent runs, review dates and source failures.",
  },
];

/**
 * Which destination a path belongs to.
 *
 * A company profile lives under Targets rather than owning a sixth nav entry,
 * so opening a target from the briefing still highlights where the reader is in
 * the information architecture. Longest-prefix wins, and "/" only matches
 * exactly - otherwise the root would claim every route in the product.
 */
export function activeDestination(pathname: string): NavDestination | null {
  if (pathname === "/") {
    return NAV_DESTINATIONS[0];
  }
  if (pathname.startsWith("/companies")) {
    return NAV_DESTINATIONS[1];
  }
  return (
    NAV_DESTINATIONS.filter((item) => item.href !== "/").find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? null
  );
}
