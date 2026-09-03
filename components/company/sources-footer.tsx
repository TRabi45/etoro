import type { SourceListEntry } from "@/src/db/repositories/company-profile";

/**
 * The sources footer that every inline citation points at.
 *
 * Each entry carries what is needed to check the claim independently: the
 * publisher, the exact URL, when it was published, when it was read, and what
 * kind of source it is. Publication date and access date are shown separately
 * because they answer different questions - how old the information is, and how
 * recently anyone confirmed it was still there.
 *
 * Source trust is shown here, next to the source. Extraction confidence lives
 * next to the claim. Keeping them apart matters: a primary source can still be
 * read badly, and a secondary source can still be read correctly.
 */

function relationLabel(relation: "supports" | "contradicts"): string {
  return relation === "contradicts" ? "contradicts a claim" : "supports";
}

export function SourcesFooter({ sources }: { sources: SourceListEntry[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-slate-200 pt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sources</h2>
      <ol className="mt-3 space-y-3">
        {sources.map((source) => (
          <li
            key={source.sourceId}
            id={`source-${source.index}`}
            className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-slate-500">[{source.index}]</span>
              <span className="font-medium text-slate-800">
                {source.publisher ?? "Unattributed source"}
              </span>
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[0.7rem] text-slate-600">
                {source.sourceType.replace(/_/g, " ")}
              </span>
              <span
                className="rounded-full border border-slate-200 px-2 py-0.5 text-[0.7rem] text-slate-600"
                title="Trust tier of the publisher, independent of extraction confidence"
              >
                {source.trustTier}
              </span>
              {source.relation === "contradicts" ? (
                <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[0.7rem] text-red-800">
                  {relationLabel(source.relation)}
                </span>
              ) : null}
            </div>

            {source.title ? <p className="mt-1 text-slate-700">{source.title}</p> : null}

            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all font-mono text-xs text-blue-700 hover:underline"
            >
              {source.url}
            </a>

            <p className="mt-1 text-xs text-slate-500">
              Published: {source.publishedAt ?? "not stated"} · Accessed:{" "}
              {source.accessedAt.slice(0, 10)}
            </p>

            {source.excerpt ? (
              <p className="mt-2 border-l-2 border-slate-200 pl-3 text-xs italic text-slate-600">
                {source.excerpt}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
