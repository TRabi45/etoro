"use client";

import { useSourceDrawer } from "@/components/company/source-drawer";

/**
 * The inline citation marker.
 *
 * Renders as a real button rather than an anchor to a footnote, because the
 * evidence opens in a drawer over the page instead of scrolling the reader away
 * from what they were reading.
 *
 * A chip can only exist for a source the profile actually loaded: the numbers
 * come from the evidence packet, and one that does not resolve is rendered
 * inert rather than as a dead link. A citation that goes nowhere is worse than
 * no citation, because it looks like corroboration.
 */

export function CitationChip({ numbers }: { numbers: readonly number[] }) {
  const { open, sources } = useSourceDrawer();

  if (numbers.length === 0) {
    return null;
  }

  return (
    <span className="ml-1 inline-flex gap-0.5 align-super">
      {numbers.map((number) => {
        const source = sources.find((entry) => entry.index === number);
        if (!source) {
          return (
            <span
              key={number}
              className="tabular text-[0.65rem] font-medium text-tertiary"
              title="This citation number does not resolve to a loaded source."
            >
              [{number}]
            </span>
          );
        }
        return (
          <button
            key={number}
            type="button"
            onClick={() => open(source.sourceId)}
            title={`${source.publisher ?? "Unattributed"} - open the excerpt`}
            aria-label={`Open source ${number}: ${source.publisher ?? "unattributed"}`}
            className="tabular rounded px-0.5 text-[0.65rem] font-medium text-info motion-standard transition-colors hover:bg-info-soft hover:underline"
          >
            [{number}]
          </button>
        );
      })}
    </span>
  );
}
