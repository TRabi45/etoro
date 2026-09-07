"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * The last line of defence.
 *
 * Repository reads already return failures as values, so a page reaching this
 * boundary means something genuinely unexpected threw - not a database being
 * unreachable, which each screen reports in its own words. The message says
 * exactly that, because telling a reader "the database may be down" when it is
 * not sends them to check the wrong thing.
 *
 * Retry is offered because a boundary reset re-runs the render and nothing here
 * has side effects. The shell around this stays mounted, so navigation still
 * works even when this screen does not.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack, which is not sent
    // to the browser. Logging it here is what makes a user report actionable.
    console.error("Unhandled error on a dashboard screen", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <ErrorState
        title="This screen could not be rendered"
        impact={
          <>
            Something failed in a way the page did not anticipate. This is not the database being
            unreachable - that case is reported in place, on the screen that needed the data - so
            treat it as a defect rather than an outage.
            {error.digest ? (
              <>
                {" "}
                Quote reference <span className="font-mono">{error.digest}</span> if you report it.
              </>
            ) : null}
          </>
        }
        detail={error.message || null}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="refresh" onClick={reset}>
              Try again
            </Button>
            <Link
              href="/"
              className="inline-flex h-10 items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3.5 text-body font-medium text-primary motion-standard transition-colors hover:bg-surface-subtle"
            >
              <Icon name="briefing" size={16} />
              Back to the briefing
            </Link>
          </div>
        }
      />
    </div>
  );
}
