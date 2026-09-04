import type { Citation } from "@/src/ai/tools/envelope";

/**
 * Merging citations from several sources into one numbered list.
 *
 * Citation numbers are assigned per company profile, each starting at `[1]`. A
 * tool that returns one profile can pass them straight through. A tool that
 * returns several - `compare_companies` is the case that matters - cannot: two
 * profiles both contribute a `[1]`, and the result is a citation list where the
 * same number means two different sources.
 *
 * That is not a cosmetic problem. The model is instructed to cite by index, and
 * the UI resolves `[1]` by looking it up in this list, so a duplicate index means
 * a sentence about one company can be footnoted with the other company's source.
 * In a system whose entire claim is that every fact traces to evidence, a
 * citation pointing at the wrong evidence is worse than no citation at all: it
 * looks verified.
 *
 * Renumbering here, once, at the point where lists are combined, keeps the
 * invariant the rest of the system assumes - within a single tool result, an
 * index identifies exactly one source.
 */
export function mergeCitations(groups: Citation[][]): Citation[] {
  const indexBySourceId = new Map<string, number>();
  const merged: Citation[] = [];

  for (const group of groups) {
    for (const citation of group) {
      // The same source cited by two companies keeps one number, so the reader
      // sees one entry rather than the same URL listed twice.
      if (indexBySourceId.has(citation.sourceId)) {
        continue;
      }
      const index = merged.length + 1;
      indexBySourceId.set(citation.sourceId, index);
      merged.push({ ...citation, index });
    }
  }

  return merged;
}
