/**
 * Presentation-layer formatting.
 *
 * Pure functions, no React, no data access - so the awkward cases (a null date,
 * a fraction that should read as a percentage, an age in days) are decided once
 * and are directly testable.
 *
 * Two rules run through all of it:
 *
 *   - A date is never rendered bare. Analysts read these next to each other and
 *     "12 Aug" without a year or a zone is ambiguous by March.
 *   - A missing value never becomes a zero or an empty string. Callers get
 *     `null` back and must decide what to say, which is what forces the
 *     `Unknown` / `Not applicable` distinction to stay visible.
 */

/** Everything renders in UTC, labelled, so two analysts never read a different day. */
const DISPLAY_TIME_ZONE = "UTC";

const DAY_MS = 86_400_000;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: DISPLAY_TIME_ZONE,
});

function parse(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `12 Aug 2026`. Null in, null out - the caller says what a gap means. */
export function formatDate(iso: string | null | undefined): string | null {
  const date = parse(iso);
  return date ? dateFormatter.format(date) : null;
}

/** `12 Aug 2026, 08:15 UTC`. The zone is always stated, never implied. */
export function formatDateTime(iso: string | null | undefined): string | null {
  const date = parse(iso);
  return date ? `${dateTimeFormatter.format(date)} ${DISPLAY_TIME_ZONE}` : null;
}

/** Whole days between `iso` and `now`, or null when the date is unusable. */
export function ageInDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  const date = parse(iso);
  return date === null ? null : Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

/**
 * `today`, `yesterday`, `4 days ago`, `3 weeks ago`, `5 months ago`.
 *
 * Deliberately coarse past a month: "127 days ago" invites arithmetic, and the
 * decision the reader is making only needs the order of magnitude. A future
 * date reads as "scheduled", which is what `next_refresh_at` actually is.
 */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string | null {
  const days = ageInDays(iso, now);
  if (days === null) {
    return null;
  }
  if (days < 0) {
    const ahead = Math.abs(days);
    if (ahead === 1) return "tomorrow";
    if (ahead < 7) return `in ${ahead} days`;
    if (ahead < 60) return `in ${Math.round(ahead / 7)} weeks`;
    return `in ${Math.round(ahead / 30)} months`;
  }
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** `75%` from a 0..1 fraction. Null in, null out. */
export function formatPercent(fraction: number | null | undefined): string | null {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) {
    return null;
  }
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Turns a controlled-vocabulary token into prose: `wealth_management` ->
 * `Wealth management`, `tuck_in` -> `Tuck-in`.
 *
 * The exceptions list exists because two tokens have a house spelling that
 * generic capitalisation gets wrong, and an M&A reader notices.
 */
const LABEL_EXCEPTIONS: Record<string, string> = {
  tuck_in: "Tuck-in",
  ai: "AI",
  aua_acquisition: "AUA acquisition",
  emi_payment_institution: "EMI / payment institution",
  casp_vasp: "CASP / VASP",
  fcm_derivatives: "FCM derivatives",
  b2b_saas: "B2B SaaS",
  smb_business: "SMB",
  adviser_ria: "Adviser / RIA",
  kpi_change: "KPI change",
  aml_incident: "AML incident",
  dex: "DEX",
  ip: "IP",
  technology_ip: "Technology / IP",
  product_ip: "Product / IP",
};

export function humanizeToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }
  const exception = LABEL_EXCEPTIONS[token];
  if (exception) {
    return exception;
  }
  const spaced = token.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * An ISO country code or free-text country as written, with `Unknown` left to
 * the caller. Kept as its own function so a future ISO-to-name lookup has one
 * place to land.
 */
export function formatCountry(country: string | null | undefined): string | null {
  if (!country || country.trim() === "") {
    return null;
  }
  return country.trim();
}

/**
 * Small counts as words, larger ones as digits.
 *
 * The brief reads as a colleague speaking, and "3 material changes" in the
 * middle of a sentence reads as a report. Past ten the word form starts
 * costing more than it gives, so the digits come back.
 */
const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

export function countInWords(count: number): string {
  if (!Number.isFinite(count) || count < 0) {
    return String(count);
  }
  return count <= 10 ? NUMBER_WORDS[count] : count.toLocaleString("en-US");
}

/** "1 source" / "2 sources", so callers stop hand-rolling the plural. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? singular + "s");
}
