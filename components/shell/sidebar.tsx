"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_DESTINATIONS, activeDestination } from "@/components/shell/navigation";
import { Icon } from "@/components/ui/icon";
import { Wordmark } from "@/components/ui/wordmark";

/**
 * Left navigation.
 *
 * Five destinations, the masthead above them, and a data-health indicator plus
 * help at the foot. Collapsed it keeps the icons and drops the labels, which is
 * why every item still carries a `title` and an `aria-label` - an icon rail
 * with no accessible names is a rail nobody can navigate by keyboard.
 *
 * The active item is marked three ways: a brand-tinted background, a 2px left
 * rule, and `aria-current="page"`. Colour alone would not survive a
 * greyscale print or a reader who cannot distinguish the tint from the hover
 * state.
 */

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Rendered inside the mobile drawer, where the rail is an overlay. */
  onNavigate?: () => void;
  /** A short data-health line, e.g. "3 sources failed". Null when healthy. */
  healthWarning?: string | null;
}

export function Sidebar({ collapsed, onToggle, onNavigate, healthWarning }: SidebarProps) {
  const pathname = usePathname();
  const active = activeDestination(pathname);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full flex-col border-r border-border bg-surface"
    >
      <div
        className={`flex h-[var(--topbar-height)] shrink-0 items-center border-b border-border ${
          collapsed ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        <Link
          href="/"
          onClick={onNavigate}
          className="min-w-0 rounded-control"
          aria-label="eToro Corp Dev Intelligence, go to Briefing"
        >
          <Wordmark showLabel={!collapsed} />
        </Link>
        {collapsed ? null : (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse navigation"
            title="Collapse navigation"
            className="hidden shrink-0 rounded-control p-1.5 text-tertiary motion-standard transition-colors hover:bg-surface-subtle hover:text-primary lg:block"
          >
            <Icon name="panel-left" size={18} />
          </button>
        )}
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_DESTINATIONS.map((destination) => {
          const isActive = active?.href === destination.href;
          return (
            <li key={destination.href}>
              <Link
                href={destination.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? `${destination.label} - ${destination.purpose}` : destination.purpose}
                aria-label={collapsed ? destination.label : undefined}
                className={`flex h-10 items-center gap-3 rounded-control border-l-2 text-body font-medium motion-standard transition-colors ${
                  collapsed ? "justify-center px-0" : "px-3"
                } ${
                  isActive
                    ? "border-l-brand bg-brand-soft text-primary"
                    : "border-l-transparent text-secondary hover:bg-surface-subtle hover:text-primary"
                }`}
              >
                <Icon name={destination.icon} size={20} />
                {collapsed ? null : <span className="truncate">{destination.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="shrink-0 border-t border-border p-2">
        {/*
         * Data health lives in the navigation rather than on one screen,
         * because "the numbers you are reading may be incomplete" is true
         * everywhere, not only on Monitoring.
         */}
        <Link
          href="/monitoring"
          onClick={onNavigate}
          title={
            healthWarning
              ? `Data health: ${healthWarning}. Open Monitoring for detail.`
              : "Data health: no source failures recorded on the last run."
          }
          className={`flex h-10 items-center gap-3 rounded-control text-caption font-medium motion-standard transition-colors hover:bg-surface-subtle ${
            collapsed ? "justify-center px-0" : "px-3"
          } ${healthWarning ? "text-warning" : "text-secondary"}`}
        >
          <Icon name={healthWarning ? "alert-circle" : "database"} size={18} />
          {collapsed ? null : (
            <span className="truncate">{healthWarning ?? "Data health normal"}</span>
          )}
        </Link>

        <Link
          href="/monitoring#help"
          onClick={onNavigate}
          title="How this product decides what to show you"
          className={`flex h-10 items-center gap-3 rounded-control text-caption font-medium text-secondary motion-standard transition-colors hover:bg-surface-subtle hover:text-primary ${
            collapsed ? "justify-center px-0" : "px-3"
          }`}
        >
          <Icon name="help" size={18} />
          {collapsed ? null : <span className="truncate">Help &amp; definitions</span>}
        </Link>

        {collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand navigation"
            title="Expand navigation"
            className="mt-1 hidden h-10 w-full items-center justify-center rounded-control text-tertiary motion-standard transition-colors hover:bg-surface-subtle hover:text-primary lg:flex"
          >
            <Icon name="panel-right" size={18} />
          </button>
        ) : null}
      </div>
    </nav>
  );
}
