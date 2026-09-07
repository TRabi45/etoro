import type { CompanyProfileView, MetricView } from "@/src/db/repositories/company-profile";

/**
 * Aligning companies for side-by-side comparison.
 *
 * A comparison table is the easiest place in a product like this to mislead
 * someone, because putting two numbers in adjacent cells asserts that they are
 * the same kind of number. Three rules follow, and they are the reason this is
 * a tested pure function rather than JSX:
 *
 *   1. **A gap is a cell, not an omission.** Every company gets a cell in every
 *      row. A blank would read as "nothing to report" when it means "we never
 *      found out", and the difference decides whether an analyst does more work.
 *
 *   2. **Unknown and not-applicable stay apart.** Assets under administration
 *      missing for a B2B API vendor is not the same gap as it missing for a
 *      wealth manager, and collapsing them invents a research task or hides one.
 *
 *   3. **Different measurement periods are a warning, not a footnote.**
 *      Comparing one company's 2025 revenue with another's 2023 revenue is the
 *      classic way a comparison table produces a confident wrong answer, so a
 *      row whose periods disagree carries the warning that says so.
 */

export interface ComparisonCell {
  kind: "value" | "unknown" | "not_applicable";
  /** Present when `kind` is "value". */
  text: string | null;
  /** Qualifies the value - a measurement period, an estimate label, a reason. */
  note: string | null;
}

export interface ComparisonRow {
  key: string;
  label: string;
  /** One cell per company, in the order the companies were supplied. */
  cells: ComparisonCell[];
  /**
   * Set when the row itself cannot be read straight across - most often
   * because the companies report the same measure over different periods.
   */
  warning: string | null;
}

export interface ComparisonSection {
  title: string;
  rows: ComparisonRow[];
}

export interface ComparisonSubject {
  slug: string;
  name: string;
  profile: CompanyProfileView;
}

function value(text: string | null, note: string | null = null): ComparisonCell {
  return text === null || text.trim() === ""
    ? { kind: "unknown", text: null, note }
    : { kind: "value", text, note };
}

function unknown(reason: string): ComparisonCell {
  return { kind: "unknown", text: null, note: reason };
}

/** A row is worth showing when at least one company has something to say. */
function anyKnown(cells: readonly ComparisonCell[]): boolean {
  return cells.some((cell) => cell.kind === "value");
}

function textRow(
  key: string,
  label: string,
  subjects: readonly ComparisonSubject[],
  read: (subject: ComparisonSubject) => string | null,
): ComparisonRow {
  return {
    key,
    label,
    cells: subjects.map((subject) => {
      const text = read(subject);
      return text === null
        ? unknown("Not recorded for this company.")
        : value(text);
    }),
    warning: null,
  };
}

/**
 * Describes a metric's measurement period in the words the record supports.
 *
 * Returns null when no period was captured, which is itself important: an
 * undated figure cannot be declared comparable with a dated one.
 */
function periodOf(metric: MetricView): string | null {
  return metric.periodLabel ?? metric.asOfDate ?? null;
}

function formatMetric(metric: MetricView): ComparisonCell {
  if (metric.valueStatus === "not_applicable") {
    return { kind: "not_applicable", text: null, note: "Does not apply to this business." };
  }
  if (metric.valueStatus === "unknown" || metric.valueNumeric === null) {
    return unknown("Applicable, but not disclosed in any source reviewed.");
  }

  const amount = metric.currency
    ? `${metric.currency} ${metric.valueNumeric.toLocaleString("en-US")}`
    : metric.valueNumeric.toLocaleString("en-US");
  const withUnit = metric.valueUnit ? `${amount} ${metric.valueUnit}` : amount;

  const notes = [
    periodOf(metric),
    metric.valueStatus === "estimated" ? "Estimate" : null,
    metric.confidence ? `${metric.confidence} confidence` : null,
  ].filter((note): note is string => note !== null);

  return value(withUnit, notes.length > 0 ? notes.join(" · ") : null);
}

/**
 * Builds the aligned metric rows, one per metric type any company reports.
 *
 * The period warning is computed across the companies that actually have a
 * figure. A company with no figure cannot make the periods disagree - it has no
 * period - so it is excluded from the comparison rather than counted as a
 * mismatch.
 */
function metricRows(subjects: readonly ComparisonSubject[]): ComparisonRow[] {
  const metricTypes = [
    ...new Set(
      subjects.flatMap((subject) => subject.profile.metrics.map((metric) => metric.metricType)),
    ),
  ].sort();

  return metricTypes.map((metricType) => {
    const perSubject = subjects.map((subject) =>
      subject.profile.metrics.find((metric) => metric.metricType === metricType),
    );

    const cells = perSubject.map((metric) =>
      metric === undefined
        ? unknown("This company does not report this measure at all.")
        : formatMetric(metric),
    );

    const periods = perSubject
      .map((metric, index) => (cells[index].kind === "value" && metric ? periodOf(metric) : null))
      .filter((period): period is string => period !== null);

    const distinctPeriods = [...new Set(periods)];
    const comparable = cells.filter((cell) => cell.kind === "value").length;

    let warning: string | null = null;
    if (comparable >= 2 && distinctPeriods.length > 1) {
      warning = `Different measurement periods (${distinctPeriods.join(
        " vs ",
      )}). These figures are not directly comparable.`;
    } else if (comparable >= 2 && periods.length < comparable) {
      warning =
        "At least one figure has no measurement period recorded, so it cannot be confirmed as covering the same window.";
    }

    return { key: `metric:${metricType}`, label: metricType.replace(/_/g, " "), cells, warning };
  });
}

export function buildComparison(subjects: readonly ComparisonSubject[]): ComparisonSection[] {
  const identity: ComparisonRow[] = [
    textRow("legal_entity", "Legal entity", subjects, (s) => s.profile.company.legalEntityName),
    textRow("domain", "Primary domain", subjects, (s) => s.profile.company.primaryDomain),
    textRow("path", "Target path", subjects, (s) => s.profile.path?.replace(/_/g, " ") ?? null),
    textRow("category", "Categories", subjects, (s) =>
      s.profile.company.themeTags.length > 0
        ? s.profile.company.themeTags.map((tag) => tag.replace(/_/g, " ")).join(", ")
        : null,
    ),
    textRow("research_state", "Research state", subjects, (s) =>
      s.profile.company.researchState.replace(/_/g, " "),
    ),
  ];

  const thesis: ComparisonRow[] = [
    textRow("thesis", "Acquisition thesis", subjects, (s) => s.profile.assessment?.strategicFitSummary ?? null),
    textRow("gap", "Gap closed for eToro", subjects, (s) => s.profile.assessment?.gapClosed ?? null),
    textRow("why_now", "Why now", subjects, (s) => s.profile.assessment?.whyNow ?? null),
    // Never dropped to make a comparison tidier. A target with no recorded
    // counter-thesis is a target nobody has argued against yet, which is a
    // weaker position than one that survived the argument.
    textRow("counter", "Strongest counter-thesis", subjects, (s) => s.profile.assessment?.counterThesis ?? null),
    textRow("risks", "Risks", subjects, (s) => s.profile.assessment?.risks ?? null),
  ];

  const evidence: ComparisonRow[] = [
    {
      key: "unknowns",
      label: "Named unknowns",
      cells: subjects.map((subject) =>
        value(String(subject.profile.evidence.unknowns.length), "Recorded research gaps"),
      ),
      warning: null,
    },
    {
      key: "contradictions",
      label: "Contradictions",
      cells: subjects.map((subject) => {
        const count = subject.profile.evidence.contradictions.length;
        return value(
          String(count),
          count > 0 ? "Sources disagree; both sides are kept" : "None recorded",
        );
      }),
      warning: subjects.some((subject) => subject.profile.evidence.contradictions.length > 0)
        ? "At least one company has sources that disagree. Read its evidence tab before relying on the figures above."
        : null,
    },
    {
      key: "sources",
      label: "Distinct sources",
      cells: subjects.map((subject) => value(String(subject.profile.sources.length))),
      warning: null,
    },
  ];

  const fundamentals: ComparisonRow[] = [
    textRow("archetype", "Fundamentals archetype", subjects, (s) =>
      s.profile.fundamentals?.archetype.replace(/_/g, " ") ?? null,
    ),
    textRow("revenue_quality", "Revenue quality", subjects, (s) => s.profile.fundamentals?.revenueQuality ?? null),
    textRow("growth", "Growth", subjects, (s) => s.profile.fundamentals?.growthAssessment ?? null),
    textRow("margin", "Margin", subjects, (s) => s.profile.fundamentals?.marginAssessment ?? null),
    textRow("runway", "Burn and runway", subjects, (s) => s.profile.fundamentals?.burnRunway ?? null),
    textRow("concentration", "Concentration", subjects, (s) => s.profile.fundamentals?.concentration ?? null),
  ];

  return [
    { title: "Identity", rows: identity },
    { title: "Decision thesis", rows: thesis },
    { title: "Fundamentals", rows: fundamentals.filter((row) => anyKnown(row.cells)) },
    { title: "Reported figures", rows: metricRows(subjects) },
    { title: "Evidence", rows: evidence },
  ];
}

/**
 * Every warning on the comparison, for the summary banner.
 *
 * Surfaced at the top as well as inline because the warnings are the reason a
 * reader should slow down, and a reader who scrolls straight to the number they
 * came for would otherwise never meet them.
 */
export function collectComparisonWarnings(sections: readonly ComparisonSection[]): string[] {
  return sections.flatMap((section) =>
    section.rows
      .filter((row) => row.warning !== null)
      .map((row) => `${row.label}: ${row.warning}`),
  );
}
