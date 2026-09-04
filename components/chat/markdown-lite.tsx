import type { ReactNode } from "react";

/**
 * A very small Markdown renderer for assistant replies.
 *
 * Deliberately not a full Markdown library. The agent produces a narrow subset -
 * headings, bullets, bold, inline code, and citation markers - and a tiny
 * renderer that handles exactly that has a much smaller surface than a general
 * parser plus a sanitiser. Everything is rendered as React text nodes, so no
 * model output is ever interpreted as HTML.
 *
 * Citation markers like `[1]` become links into the answer's source list, which
 * is what makes the citation discipline visible rather than merely textual.
 */

const CITATION_PATTERN = /(\[\d+\])/g;
const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderCitations(text: string, keyPrefix: string): ReactNode[] {
  return text.split(CITATION_PATTERN).map((chunk, index) => {
    const match = /^\[(\d+)\]$/.exec(chunk);
    if (!match) {
      return <span key={`${keyPrefix}-t${index}`}>{chunk}</span>;
    }
    return (
      <sup key={`${keyPrefix}-c${index}`} className="ml-0.5">
        <a
          href={`#chat-source-${match[1]}`}
          className="font-medium text-blue-700 hover:underline"
          aria-label={`Source ${match[1]}`}
        >
          [{match[1]}]
        </a>
      </sup>
    );
  });
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE_PATTERN).flatMap<ReactNode>((chunk, index): ReactNode[] => {
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
      return [
        <strong key={`${keyPrefix}-b${index}`} className="font-semibold">
          {renderCitations(chunk.slice(2, -2), `${keyPrefix}-b${index}`)}
        </strong>,
      ];
    }
    if (chunk.startsWith("`") && chunk.endsWith("`") && chunk.length > 2) {
      return [
        <code
          key={`${keyPrefix}-m${index}`}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {chunk.slice(1, -1)}
        </code>,
      ];
    }
    return renderCitations(chunk, `${keyPrefix}-i${index}`);
  });
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push(
      <ul key={key} className="my-1.5 space-y-1 pl-4">
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`} className="list-disc leading-relaxed">
            {renderInline(item, `${key}-${index}`)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }
    flushList(`list-${index}`);

    if (trimmed === "") {
      return;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push(
        <p
          key={`h-${index}`}
          className="mt-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {renderInline(heading[2], `h-${index}`)}
        </p>,
      );
      return;
    }

    blocks.push(
      <p key={`p-${index}`} className="my-1.5 leading-relaxed">
        {renderInline(trimmed, `p-${index}`)}
      </p>,
    );
  });

  flushList("list-final");
  return <div className="text-sm text-slate-800">{blocks}</div>;
}
