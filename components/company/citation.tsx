/**
 * Inline citation markers.
 *
 * Renders `[1]`, `[2]` next to a statement, each anchored to its entry in the
 * sources footer. The numbers come from the evidence packet, so a component
 * cannot invent one - if a statement has no citations there is nothing to
 * render, which is exactly the signal a reviewer needs.
 */
export function Citations({ numbers }: { numbers: number[] }) {
  if (numbers.length === 0) {
    return null;
  }

  return (
    <span className="ml-1 whitespace-nowrap align-super text-[0.65rem] font-medium">
      {numbers.map((number) => (
        <a
          key={number}
          href={`#source-${number}`}
          className="ml-0.5 text-blue-700 hover:underline"
          aria-label={`Source ${number}`}
        >
          [{number}]
        </a>
      ))}
    </span>
  );
}

/**
 * Used where a claim kind should stay visible next to the statement it labels.
 * A precise company-reported number is still company-reported, and the reader
 * should be able to see that without opening the source.
 */
export function ClaimKindBadge({ kind }: { kind: string }) {
  const label = kind.replace(/_/g, " ");
  const tone =
    kind === "verified_fact"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : kind === "company_reported"
        ? "border-sky-300 bg-sky-50 text-sky-800"
        : kind === "estimate"
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-slate-300 bg-slate-50 text-slate-600";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${tone}`}>
      {label}
    </span>
  );
}
