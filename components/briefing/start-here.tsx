"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useClientValue } from "@/components/ui/use-client-value";

/**
 * The first-run orientation strip.
 *
 * A single dismissible line, not a multi-step modal tour. An analyst opening an
 * internal tool wants to read the brief, and a tour that must be clicked
 * through four times before the page is usable is a tax on every first visit
 * that pays for itself only in demos.
 *
 * Dismissal is stored per browser in `localStorage` - the right scope for a UI
 * preference nobody else needs to know about, and what makes the strip
 * acceptable to show at all, since it cannot return on every page load.
 *
 * The server renders it as already-dismissed. That way the HTML never contains
 * a strip that hydration is about to remove, so a reader who dismissed it last
 * week does not watch it flash past on every load.
 */

const STORAGE_KEY = "etoro-corpdev.start-here.dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private mode, or site data blocked. Showing the strip is the safe
    // default: the cost is one line of orientation, not a broken page.
    return false;
  }
}

export function StartHere() {
  const persistedDismissal = useClientValue(readDismissed, true);
  const [dismissedNow, setDismissedNow] = useState(false);

  if (persistedDismissal || dismissedNow) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 rounded-card border border-brand/30 bg-brand-soft px-4 py-3">
      <Icon name="spark" size={18} className="mt-0.5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-body leading-relaxed text-primary">
        <span className="font-semibold">Start here: </span>
        review the brief, open a target, then ask the intelligence panel why it scored that way.
      </p>
      <button
        type="button"
        onClick={() => {
          setDismissedNow(true);
          try {
            window.localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            // Dismissal still applies for this page view; it just will not
            // persist. Failing silently is correct - there is nothing the
            // reader could do about it and nothing at stake.
          }
        }}
        aria-label="Dismiss the getting started tip"
        className="shrink-0 rounded-control p-1 text-secondary motion-standard transition-colors hover:bg-surface/60 hover:text-primary"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
