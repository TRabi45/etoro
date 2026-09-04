import { describe, expect, it } from "vitest";
import { mergeCitations } from "@/src/ai/tools/citations";
import type { Citation } from "@/src/ai/tools/envelope";

function citation(sourceId: string, index: number, url: string): Citation {
  return {
    sourceId,
    index,
    url,
    title: null,
    publisher: null,
    sourceType: "trade_press",
    trustTier: "secondary",
    publishedAt: null,
    accessedAt: "2026-01-01",
    excerpt: null,
    relation: "supports",
  };
}

describe("mergeCitations", () => {
  it("renumbers so one index means one source", () => {
    // Each profile numbers its own sources from [1]. Concatenating them - which
    // is what compare_companies used to do - produced two sources both called
    // [1], so a sentence about one company could be footnoted with the other
    // company's evidence.
    const getquin = [
      citation("aaaaaaaa-0000-0000-0000-000000000001", 1, "https://example.com/getquin-register"),
      citation("aaaaaaaa-0000-0000-0000-000000000002", 2, "https://example.com/getquin-press"),
    ];
    const other = [
      citation("bbbbbbbb-0000-0000-0000-000000000001", 1, "https://example.com/other-register"),
    ];

    const merged = mergeCitations([getquin, other]);

    expect(merged.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(new Set(merged.map((entry) => entry.index)).size).toBe(merged.length);
    expect(merged[2].url).toBe("https://example.com/other-register");
  });

  it("gives a source cited by two companies a single number", () => {
    const shared = "cccccccc-0000-0000-0000-000000000001";
    const merged = mergeCitations([
      [citation(shared, 1, "https://example.com/shared")],
      [citation(shared, 1, "https://example.com/shared")],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].index).toBe(1);
  });

  it("closes gaps left by records that carry no source", () => {
    // get_recent_events numbered by event position, so an event with no source
    // left a hole in the sequence and the model was offered a [2] that did not
    // exist.
    const merged = mergeCitations([
      [citation("dddddddd-0000-0000-0000-000000000001", 0, "https://example.com/one")],
      [],
      [citation("dddddddd-0000-0000-0000-000000000003", 0, "https://example.com/three")],
    ]);

    expect(merged.map((entry) => entry.index)).toEqual([1, 2]);
  });

  it("returns nothing when there is nothing to cite", () => {
    expect(mergeCitations([])).toEqual([]);
    expect(mergeCitations([[], []])).toEqual([]);
  });
});
