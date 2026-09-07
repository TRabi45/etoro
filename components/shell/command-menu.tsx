"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetSummary } from "@/src/db/repositories/targets";
import { NAV_DESTINATIONS } from "@/components/shell/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { useClientValue } from "@/components/ui/use-client-value";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { humanizeToken } from "@/components/ui/format";

/**
 * Global search and command menu, on Cmd+K / Ctrl+K.
 *
 * Searches the target universe the layout already loaded rather than issuing a
 * query per keystroke: the universe is a bounded internal watchlist, so
 * filtering in memory is both faster and quieter than a debounced round trip,
 * and it means the menu still works while a slow page is rendering.
 *
 * Results are typed `TargetSummary` values straight from the repository - the
 * recommendation shown here is the same one the target table shows, because it
 * is literally the same field, not a second copy that could drift.
 *
 * Keyboard model is a combobox over a listbox: the input keeps DOM focus
 * throughout and `aria-activedescendant` moves the *virtual* cursor, which is
 * what lets a screen-reader user type and arrow at the same time.
 */

interface CommandItem {
  id: string;
  kind: "destination" | "target";
  label: string;
  hint: string | null;
  href: string;
  icon: IconName;
  target?: TargetSummary;
}

export interface CommandMenuProps {
  targets: readonly TargetSummary[];
  /** Set when the target universe could not be read; search says so honestly. */
  loadProblem: string | null;
}

const MAX_RESULTS = 8;

export function CommandMenu({ targets, loadProblem }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /**
   * Opening resets the query here rather than in an effect watching `open`.
   * Clearing state is part of the act of opening, so it belongs in the handler;
   * an effect would do it one render later, after the stale query had already
   * painted.
   */
  const openMenu = useCallback(() => {
    setQuery("");
    setCursor(0);
    setOpen(true);
  }, []);

  // Cmd+K / Ctrl+K anywhere, and Escape to leave. Bound on the document
  // because the shortcut has to work regardless of what currently has focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        // Reset unconditionally: clearing a query the reader is about to stop
        // seeing costs nothing, and it keeps this out of the updater, where
        // calling other setters would be a side effect in a pure function.
        setQuery("");
        setCursor(0);
        setOpen((wasOpen) => !wasOpen);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Moving focus is a DOM side effect, which is exactly what an effect is for.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const needle = query.trim().toLowerCase();

    const destinations: CommandItem[] = NAV_DESTINATIONS.filter(
      (destination) => needle === "" || destination.label.toLowerCase().includes(needle),
    ).map((destination) => ({
      id: `nav:${destination.href}`,
      kind: "destination",
      label: destination.label,
      hint: destination.purpose,
      href: destination.href,
      icon: destination.icon,
    }));

    const matched: CommandItem[] = targets
      .filter((target) => {
        if (needle === "") {
          // With no query the menu offers the highest-ranked targets, which is
          // more useful than an empty pane and matches how the list is sorted.
          return true;
        }
        return (
          target.canonicalName.toLowerCase().includes(needle) ||
          (target.legalEntityName?.toLowerCase().includes(needle) ?? false) ||
          (target.primaryDomain?.toLowerCase().includes(needle) ?? false) ||
          (target.hqCountry?.toLowerCase().includes(needle) ?? false)
        );
      })
      .slice(0, MAX_RESULTS)
      .map((target) => ({
        id: `target:${target.slug}`,
        kind: "target",
        label: target.canonicalName,
        hint:
          [humanizeToken(target.themeTags[0]), target.hqCountry].filter(Boolean).join(" · ") || null,
        href: `/companies/${target.slug}`,
        icon: "targets",
        target,
      }));

    return [...destinations, ...matched];
  }, [query, targets]);

  const go = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) {
        return;
      }
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  if (!open) {
    return <CommandTrigger onOpen={openMenu} />;
  }

  const activeId = items[cursor]?.id;

  return (
    <>
      <CommandTrigger onOpen={openMenu} />
      {/* Clicking the backdrop dismisses; it is not a focus trap, because the
          menu closes on blur-out rather than imprisoning the reader. */}
      <div
        className="fixed inset-0 z-50 bg-primary/20 p-4 pt-[12vh]"
        onClick={() => setOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search targets and pages"
          className="mx-auto w-full max-w-xl overflow-hidden rounded-card border border-border bg-surface shadow-[var(--shadow-menu)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Icon name="search" size={18} className="text-tertiary" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCursor((index) => (index + 1) % Math.max(items.length, 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCursor((index) => (index - 1 + items.length) % Math.max(items.length, 1));
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  go(items[cursor]);
                }
              }}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-menu-results"
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              placeholder="Search targets, or jump to a page"
              className="h-12 w-full bg-transparent text-lead text-primary outline-none placeholder:text-tertiary"
            />
            <kbd className="rounded border border-border px-1.5 py-0.5 text-caption text-tertiary">
              Esc
            </kbd>
          </div>

          <ul id="command-menu-results" role="listbox" className="max-h-80 overflow-y-auto py-1.5">
            {loadProblem ? (
              <li className="px-4 py-3 text-body text-secondary">
                Pages are searchable, but the target universe could not be loaded, so company
                results are missing rather than incomplete.
              </li>
            ) : null}

            {items.length === 0 ? (
              <li className="px-4 py-3 text-body text-secondary">
                Nothing matches “{query}”. Try a company name, domain or country.
              </li>
            ) : null}

            {items.map((item, index) => (
              <li
                key={item.id}
                id={item.id}
                role="option"
                aria-selected={index === cursor}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(item)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${
                  index === cursor ? "bg-brand-soft" : ""
                }`}
              >
                <Icon name={item.icon} size={18} className="text-tertiary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-primary">
                    {item.label}
                  </span>
                  {item.hint ? (
                    <span className="block truncate text-caption text-tertiary">{item.hint}</span>
                  ) : null}
                </span>
                {item.kind === "target" && item.target ? (
                  <RecommendationBadge recommendation={item.target.recommendation} />
                ) : (
                  <span className="text-caption text-tertiary">Page</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

/**
 * The always-visible affordance in the top bar.
 *
 * Shows the shortcut rather than hiding it behind discovery, and stays a real
 * button so the menu is reachable without a keyboard.
 */
function CommandTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      /*
       * Collapses to an icon button below 640px rather than disappearing.
       * Search is one of the three things the responsive priority requires to
       * survive at every width, alongside citations and agent access.
       */
      className="flex h-10 w-10 items-center justify-center rounded-control border border-border-control bg-surface-subtle text-tertiary motion-standard transition-colors hover:border-secondary hover:text-secondary sm:w-full sm:max-w-xs sm:justify-start sm:gap-2.5 sm:px-3 sm:text-body"
      aria-label="Search targets and pages"
    >
      <Icon name="search" size={16} />
      <span className="hidden flex-1 text-left sm:block">Search targets…</span>
      {/* Rendered platform-neutral: the modifier label is resolved client-side
          after mount in `ShortcutHint` to avoid a hydration mismatch. */}
      <span className="hidden sm:block">
        <ShortcutHint />
      </span>
    </button>
  );
}

/**
 * The modifier key, named for the reader's actual platform.
 *
 * `navigator` does not exist while the server renders, so Ctrl is the server's
 * answer and the browser substitutes the command key during hydration.
 */
function ShortcutHint() {
  const label = useClientValue(
    () => (/mac|iphone|ipad/i.test(navigator.userAgent) ? "⌘ K" : "Ctrl K"),
    "Ctrl K",
  );

  return (
    <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-caption text-tertiary">
      {label}
    </kbd>
  );
}
