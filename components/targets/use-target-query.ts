"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MAX_COMPARISON } from "@/src/domain/targets/target-filters";

/**
 * Filters live in the URL, not in React state.
 *
 * Three things fall out of that choice, and all three are requirements rather
 * than conveniences:
 *
 *   - a filtered view is shareable, which is how an analyst sends a colleague
 *     "the four German targets I mean";
 *   - the agent panel reads the same params, so what it is told about the
 *     active filters is what the table actually applied;
 *   - going back from a company profile restores the list exactly, because the
 *     list was never holding state that a navigation could drop.
 *
 * `replace` rather than `push`: adjusting a filter is refining one view, not
 * arriving somewhere new, and pushing would make Back walk through every
 * keystroke instead of returning to where the reader came from.
 */
export function useTargetQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const commit = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      // `scroll: false` keeps the reader's place in a long table. Jumping to the
      // top on every filter change is disorienting when they are comparing rows
      // halfway down.
      router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [pathname, router],
  );

  /** Sets or clears one param. Null and empty string both mean "remove it". */
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      commit(next);
    },
    [commit, searchParams],
  );

  /** Clears every filter but keeps the comparison set and the sort order. */
  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of ["q", "view", "recommendation", "category", "country", "path", "minScore", "coverage", "freshness"]) {
      next.delete(key);
    }
    commit(next);
  }, [commit, searchParams]);

  /**
   * Adds or removes a slug from the comparison set.
   *
   * Silently refuses to exceed the cap rather than dropping the oldest
   * selection: a checkbox that quietly unticks a different row is worse than
   * one that does nothing, because the reader does not notice the first.
   */
  const toggleCompare = useCallback(
    (slug: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const current = (next.get("compare") ?? "").split(",").filter((value) => value !== "");
      const without = current.filter((value) => value !== slug);

      let updated: string[];
      if (without.length !== current.length) {
        updated = without;
      } else if (current.length >= MAX_COMPARISON) {
        return;
      } else {
        updated = [...current, slug];
      }

      if (updated.length === 0) {
        next.delete("compare");
      } else {
        next.set("compare", updated.join(","));
      }
      commit(next);
    },
    [commit, searchParams],
  );

  const clearCompare = useCallback(() => setParam("compare", null), [setParam]);

  return { searchParams, setParam, clearFilters, toggleCompare, clearCompare };
}
