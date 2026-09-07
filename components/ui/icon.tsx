import type { ReactNode } from "react";

/**
 * The product's icon set.
 *
 * Drawn inline rather than pulled from an icon package: the set below is the
 * whole vocabulary this UI needs, and shipping a dependency to render twenty
 * outlines costs more than it saves. Every glyph shares one grid (24x24), one
 * stroke weight and round caps, so they read as a family at the 18-20px the
 * design direction calls for.
 *
 * Icons are decorative by default (`aria-hidden`). An icon that carries meaning
 * on its own must be given a `label`, which turns it into an `img` role with an
 * accessible name - but the stronger rule in this product is that status is
 * never icon-only, so `label` is rare and a text partner is the norm.
 */

export type IconName =
  | "briefing"
  | "targets"
  | "market-map"
  | "competitors"
  | "monitoring"
  | "search"
  | "refresh"
  | "panel-right"
  | "panel-left"
  | "close"
  | "chevron-right"
  | "chevron-down"
  | "chevron-left"
  | "arrow-up-right"
  | "external-link"
  | "alert-triangle"
  | "alert-circle"
  | "check-circle"
  | "info"
  | "clock"
  | "help"
  | "filter"
  | "sort"
  | "compare"
  | "agent"
  | "quote"
  | "spark"
  | "minus"
  | "plus"
  | "database";

const PATHS: Record<IconName, ReactNode> = {
  // A folded brief rather than a sun: this is the morning read, not a greeting.
  briefing: (
    <>
      <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M15 4v5h5" />
      <path d="M7.5 13h7" />
      <path d="M7.5 17h4" />
    </>
  ),
  // Ranked rows, which is what the targets screen actually is.
  targets: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h11" />
      <path d="M4 18h7" />
      <circle cx="19" cy="16" r="3" />
    </>
  ),
  "market-map": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  competitors: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l6-4v18" />
      <path d="M19 21V11l-8-4" />
      <path d="M8 10h.01M8 14h.01M15 14h.01M15 17h.01" />
    </>
  ),
  // A pulse: monitoring is a heartbeat, not a bell.
  monitoring: (
    <>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-13.7-5.3L3 9" />
      <path d="M4 13a8 8 0 0 0 13.7 5.3L21 15" />
      <path d="M3 4v5h5" />
      <path d="M21 20v-5h-5" />
    </>
  ),
  "panel-right": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  "panel-left": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  "chevron-right": <path d="m9 5 7 7-7 7" />,
  "chevron-down": <path d="m5 9 7 7 7-7" />,
  "chevron-left": <path d="m15 5-7 7 7 7" />,
  "arrow-up-right": (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  "external-link": (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  "alert-triangle": (
    <>
      <path d="M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </>
  ),
  "alert-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16.5h.01" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 1.9" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2.1-2.5 3.9" />
      <path d="M12 17h.01" />
    </>
  ),
  filter: <path d="M4 5h16l-6.2 7.4V19l-3.6-2v-4.6Z" />,
  sort: (
    <>
      <path d="M7 4v16" />
      <path d="m3.5 16.5 3.5 3.5 3.5-3.5" />
      <path d="M14 7h7" />
      <path d="M14 12h5" />
      <path d="M14 17h3" />
    </>
  ),
  compare: (
    <>
      <path d="M12 4v16" />
      <path d="M7 8H4l3-4 3 4H7Z" />
      <path d="M17 16h3l-3 4-3-4h3Z" />
    </>
  ),
  // The agent's mark: an abstract aperture, deliberately not a face.
  agent: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
    </>
  ),
  quote: (
    <>
      <path d="M9 6H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4v2a3 3 0 0 1-3 3" />
      <path d="M19 6h-4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4v2a3 3 0 0 1-3 3" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.3l-1.8-5.6-5.7-1.9L10.2 9Z" />
      <path d="M18.5 17.5 19.2 19.6l2.1.7-2.1.7-.7 2.1" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** Rendered size in px. The design direction uses 18 for inline, 20 for nav. */
  size?: number;
  className?: string;
  /**
   * Supply only when the icon is the sole carrier of its meaning. Leaving it
   * undefined hides the glyph from assistive technology, which is correct
   * whenever adjacent text already says the same thing.
   */
  label?: string;
}

export function Icon({ name, size = 18, className, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Never let an icon shrink inside a flex row - a squashed glyph is worse
      // than a wrapped label.
      style={{ flexShrink: 0 }}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}
