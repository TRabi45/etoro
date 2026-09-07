"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SourceListEntry } from "@/src/db/repositories/company-profile";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { formatDate, humanizeToken } from "@/components/ui/format";

/**
 * Evidence, opened where the reader is standing.
 *
 * The acceptance bar is three interactions from the briefing to a decisive
 * source, which a page navigation cannot meet: leaving the profile to read a
 * citation and coming back costs the reader their place and their context. So a
 * citation opens a drawer over the profile instead, and the profile stays
 * exactly where it was.
 *
 * A context rather than props because citation chips are scattered through
 * server-rendered prose several levels deep. Threading an `onOpen` callback
 * through every section would put a client boundary around content that has no
 * other reason to be interactive.
 *
 * The drawer shows what makes a source checkable rather than merely present:
 * the excerpt that was actually relied on, the publisher, when it was
 * published, when it was accessed, and how much weight its trust tier carries.
 * A citation that resolves to a bare URL is not evidence, it is a gesture at
 * evidence.
 */

interface SourceDrawerContextValue {
  open: (sourceId: string) => void;
  /** Citation numbers the profile knows about, for validating a chip. */
  sources: readonly SourceListEntry[];
}

const SourceDrawerContext = createContext<SourceDrawerContextValue | null>(null);

export function useSourceDrawer(): SourceDrawerContextValue {
  const context = useContext(SourceDrawerContext);
  if (context === null) {
    // A chip rendered outside the provider would silently do nothing on click,
    // which is worse than a loud failure during development.
    throw new Error("Citation chips must be rendered inside a SourceDrawerProvider.");
  }
  return context;
}

export function SourceDrawerProvider({
  sources,
  children,
}: {
  sources: readonly SourceListEntry[];
  children: React.ReactNode;
}) {
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);

  const open = useCallback((sourceId: string) => setOpenSourceId(sourceId), []);
  const close = useCallback(() => setOpenSourceId(null), []);

  useEffect(() => {
    if (openSourceId === null) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openSourceId, close]);

  const value = useMemo(() => ({ open, sources }), [open, sources]);
  const active = sources.find((source) => source.sourceId === openSourceId) ?? null;

  return (
    <SourceDrawerContext.Provider value={value}>
      {children}
      {active ? <SourceDrawer source={active} onClose={close} /> : null}
    </SourceDrawerContext.Provider>
  );
}

function SourceDrawer({ source, onClose }: { source: SourceListEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-primary/25" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Source ${source.index}`}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-[var(--shadow-drawer)]"
      >
        <header className="flex items-start gap-2 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold tracking-wide text-secondary uppercase">
              Source [{source.index}]
            </p>
            <h2 className="mt-1 text-section font-semibold text-primary">
              {source.title ?? source.publisher ?? "Untitled source"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the source"
            className="shrink-0 rounded-control p-1.5 text-tertiary motion-standard transition-colors hover:bg-surface-subtle hover:text-primary"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge
              tone={
                source.trustTier === "primary"
                  ? "brand"
                  : source.trustTier === "secondary"
                    ? "neutral"
                    : "muted"
              }
              title={
                source.trustTier === "primary"
                  ? "A regulator, filing, contract or audited report. Trust belongs to the publisher, not to how confident the extraction was."
                  : source.trustTier === "secondary"
                    ? "Reputable reporting or a company statement. Weaker than a primary record."
                    : "Aggregated or derivative. Points research at a company; never the sole proof of anything material."
              }
            >
              {humanizeToken(source.trustTier)} source
            </Badge>
            <Badge tone="neutral">{humanizeToken(source.sourceType)}</Badge>
            {source.relation === "contradicts" ? (
              <Badge
                tone="warning"
                icon="alert-circle"
                title="This source disagrees with the claim it is attached to."
              >
                Contradicts
              </Badge>
            ) : null}
          </div>

          {/*
           * The excerpt is the whole point. It is quoted external text, so it
           * is presented as a quotation and never styled as the product's own
           * voice - a fetched page can say anything at all.
           */}
          {source.excerpt ? (
            <blockquote className="mt-4 border-l-2 border-border-strong bg-surface-subtle px-4 py-3 text-body leading-relaxed text-primary">
              {source.excerpt}
            </blockquote>
          ) : (
            <p className="mt-4 rounded-card border border-warning/30 bg-warning-soft px-3 py-2.5 text-body leading-relaxed text-primary">
              No excerpt was captured for this source, so the exact sentence relied on cannot be
              shown here. Open the original before treating this as verified.
            </p>
          )}

          <dl className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
            <Field label="Publisher" value={source.publisher} missing="Not attributed" />
            <Field
              label="Published"
              value={formatDate(source.publishedAt)}
              missing="No publication date recorded"
            />
            <Field
              label="Accessed"
              value={formatDate(source.accessedAt)}
              missing="No access date recorded"
            />
          </dl>
        </div>

        <footer className="shrink-0 border-t border-border px-5 py-4">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-control border border-border-strong bg-surface px-3.5 text-body font-medium text-primary motion-standard transition-colors hover:bg-surface-subtle"
          >
            Open the original
            <Icon name="external-link" size={16} />
          </a>
          <p className="mt-2 break-all text-caption text-tertiary">{source.url}</p>
        </footer>
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  missing,
}: {
  label: string;
  value: string | null;
  missing: string;
}) {
  return (
    <div>
      <dt className="text-caption text-tertiary">{label}</dt>
      <dd className={value ? "text-body text-primary" : "text-body text-tertiary"}>
        {value ?? missing}
      </dd>
    </div>
  );
}
