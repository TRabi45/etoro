"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { TargetSummary } from "@/src/db/repositories/targets";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { AgentPanel } from "@/components/agent/agent-panel";
import { Icon } from "@/components/ui/icon";

/**
 * The application frame.
 *
 * Owns exactly three pieces of state - is the rail collapsed, is the agent
 * open, is the mobile nav overlay showing - and nothing else. Page content
 * arrives as `children` and stays a Server Component: this file is a client
 * boundary, but React only serialises the boundary itself, so the briefing and
 * the target table still render on the server and never ship their data
 * fetching to the browser.
 *
 * Layout follows the responsive priority rather than Tailwind's default
 * breakpoints, which is why `shell` (900px) and `wide` (1200px) are named
 * tokens:
 *
 *   - 1200px and up: three columns - rail, content, agent panel inline.
 *   - 900 to 1199px: rail and content; the agent becomes an overlay drawer,
 *     because an inline panel here would push the main column under the 720px
 *     minimum usable width.
 *   - Below 900px: the rail stops being a column and becomes an overlay too.
 *
 * The breakpoints are read with `matchMedia` rather than inferred from CSS
 * because the behaviour changes, not just the styling: at 1100px the agent has
 * to close on Escape and dismiss on navigation, and at 1300px it must not.
 */

export interface AppShellProps {
  children: React.ReactNode;
  /** The target universe, loaded once by the layout for search and the agent. */
  targets: readonly TargetSummary[];
  targetsProblem: string | null;
  lastRunAt: string | null;
  lastRunStatus: "success" | "partial_success" | "failed" | "running" | "blocked" | null;
  healthWarning: string | null;
}

export function AppShell({
  children,
  targets,
  targetsProblem,
  lastRunAt,
  lastRunStatus,
  healthWarning,
}: AppShellProps) {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [navOverlayOpen, setNavOverlayOpen] = useState(false);
  // Server rendering has no viewport. Both default to the desktop case so the
  // first client render matches the server markup exactly; the effect below
  // corrects them after mount.
  const [isNarrow, setIsNarrow] = useState(false);
  const [agentIsDrawer, setAgentIsDrawer] = useState(false);
  const [railForcedCollapsed, setRailForcedCollapsed] = useState(false);

  const pathname = usePathname();

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 899px)");
    const drawer = window.matchMedia("(max-width: 1199px)");
    /*
     * The band where the inline agent and a full-width rail cannot both fit.
     *
     * The layout spec asks for two things that collide between 1200 and 1343px:
     * the agent stays an inline column above 1200, and the main content keeps at
     * least 720px. A 224px rail plus a 400px panel needs 1344px to leave that
     * much. Collapsing the rail to 64px in this band satisfies both - the
     * navigation loses its labels, which is recoverable, rather than the target
     * table losing columns, which is not.
     */
    const tight = window.matchMedia("(min-width: 1200px) and (max-width: 1343px)");

    function sync() {
      setIsNarrow(narrow.matches);
      setAgentIsDrawer(drawer.matches);
      setRailForcedCollapsed(tight.matches);
      // An overlay that survives a resize back to desktop would leave a
      // backdrop over a layout that no longer needs one.
      if (!narrow.matches) {
        setNavOverlayOpen(false);
      }
      // The agent is a persistent surface on wide screens and an opt-in drawer
      // on narrow ones, so it starts closed whenever it is a drawer.
      if (drawer.matches) {
        setAgentOpen(false);
      }
    }

    sync();
    narrow.addEventListener("change", sync);
    drawer.addEventListener("change", sync);
    tight.addEventListener("change", sync);
    return () => {
      narrow.removeEventListener("change", sync);
      drawer.removeEventListener("change", sync);
      tight.removeEventListener("change", sync);
    };
  }, []);

  /*
   * Navigating is an implicit dismissal of both overlays. Without this, tapping
   * a target on a phone leaves the reader looking at the nav they just used.
   *
   * Adjusted during render rather than in an effect. This is React's documented
   * pattern for "reset state when a prop changes": the extra render happens
   * before anything is committed to the DOM, so the overlay never paints for a
   * frame on the new route the way an effect-based reset would.
   */
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    setNavOverlayOpen(false);
    if (agentIsDrawer) {
      setAgentOpen(false);
    }
  }

  useEffect(() => {
    if (!navOverlayOpen && !(agentOpen && agentIsDrawer)) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOverlayOpen(false);
        if (agentIsDrawer) {
          setAgentOpen(false);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOverlayOpen, agentOpen, agentIsDrawer]);

  const toggleAgent = useCallback(() => setAgentOpen((open) => !open), []);

  // Below 900px the rail is always full width when it is shown at all, so the
  // collapse preference only applies to real column layouts. Between 1200 and
  // 1343px the collapse is not a preference at all - it is what keeps the main
  // column above its 720px floor.
  const collapsed = (railCollapsed || railForcedCollapsed) && !isNarrow;

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Skip link: the first tab stop on every page, because the rail plus the
          top bar is a dozen stops before the content starts. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:border focus:border-border-strong focus:bg-surface focus:px-3 focus:py-2 focus:text-body focus:font-medium"
      >
        Skip to main content
      </a>

      <div
        className="hidden shrink-0 motion-standard transition-[width] shell:block"
        style={{ width: collapsed ? "var(--nav-width-collapsed)" : "var(--nav-width)" }}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setRailCollapsed((value) => !value)}
          healthWarning={healthWarning}
        />
      </div>

      {navOverlayOpen ? (
        <div className="fixed inset-0 z-50 shell:hidden">
          <div
            className="absolute inset-0 bg-primary/25"
            onClick={() => setNavOverlayOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[var(--nav-width)] shadow-[var(--shadow-drawer)]">
            <Sidebar
              collapsed={false}
              onToggle={() => setNavOverlayOpen(false)}
              onNavigate={() => setNavOverlayOpen(false)}
              healthWarning={healthWarning}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          targets={targets}
          targetsProblem={targetsProblem}
          lastRunAt={lastRunAt}
          lastRunStatus={lastRunStatus}
          agentOpen={agentOpen}
          onToggleAgent={toggleAgent}
          onOpenNav={() => setNavOverlayOpen(true)}
        />

        <div className="flex min-h-0 flex-1">
          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>

          {/* Inline column, wide screens only. */}
          {agentOpen && !agentIsDrawer ? (
            <aside
              aria-label="M&amp;A Intelligence"
              className="hidden w-[var(--agent-width)] shrink-0 border-l border-border bg-surface wide:block"
            >
              {/* The panel reads the active filters out of the search params,
                  which Next requires to sit behind a Suspense boundary. */}
              <Suspense fallback={<AgentPanelFallback />}>
                <AgentPanel targets={targets} onClose={toggleAgent} presentation="panel" />
              </Suspense>
            </aside>
          ) : null}
        </div>
      </div>

      {/* Drawer, below 1200px. Rendered outside the content row so it covers the
          full height including the top bar. */}
      {agentOpen && agentIsDrawer ? (
        <div className="fixed inset-0 z-50 wide:hidden">
          <div
            className="absolute inset-0 bg-primary/25"
            onClick={toggleAgent}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[var(--agent-width)] flex-col bg-surface shadow-[var(--shadow-drawer)]">
            <Suspense fallback={<AgentPanelFallback />}>
              <AgentPanel targets={targets} onClose={toggleAgent} presentation="drawer" />
            </Suspense>
          </div>
        </div>
      ) : null}

      {/* With the agent closed the top-bar toggle still exists; this keeps it
          reachable at the edge the panel came from, which is where a reader
          looks for it. */}
      {!agentOpen ? (
        <button
          type="button"
          onClick={toggleAgent}
          aria-label="Show the intelligence panel"
          title="Show the intelligence panel"
          className="fixed bottom-5 right-5 z-30 flex h-11 items-center gap-2 rounded-pill border border-border-control bg-surface px-4 text-body font-medium text-primary shadow-[var(--shadow-menu)] motion-standard transition-colors hover:bg-surface-subtle"
        >
          <Icon name="agent" size={18} />
          Intelligence
        </button>
      ) : null}
    </div>
  );
}

/**
 * Holds the panel's shape while its search-param context resolves.
 *
 * Shaped like the real header rather than being a spinner, so the column does
 * not change width or jump when the panel arrives.
 */
function AgentPanelFallback() {
  return (
    <div className="flex h-full flex-col bg-surface" role="status" aria-busy="true">
      <span className="sr-only">Loading the intelligence panel</span>
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Icon name="agent" size={22} className="text-tertiary" />
        <span className="text-body font-semibold text-tertiary">M&amp;A Intelligence</span>
      </div>
    </div>
  );
}
