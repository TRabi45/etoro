import { createHash } from "node:crypto";

/**
 * URL normalisation, which is what makes deduplication work.
 *
 * The same article is reached through many URLs: shared with campaign
 * parameters, linked with a fragment, indexed with and without a trailing slash,
 * served on both http and https. Storing them as distinct sources would mean
 * extracting the same document repeatedly, paying for it each time, and writing
 * the same claims again under different source ids - which would look, in the
 * evidence tree, like independent corroboration.
 *
 * That last consequence is the important one. Deduplication here is not a
 * performance optimisation; it is what stops one article from appearing to be
 * three.
 *
 * The normalisation is deliberately conservative: it removes what is known to be
 * noise and leaves everything else alone. Stripping a query parameter that turns
 * out to select the content would merge two genuinely different pages, which is
 * a worse error than keeping two rows for one article.
 */

/**
 * Query parameters that identify a referrer or campaign rather than content.
 *
 * Prefix matching covers the `utm_*` family without listing every variant.
 */
const TRACKING_PARAM_PREFIXES = ["utm_", "pk_", "mc_", "hsa_", "ns_"];

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "twclid",
  "igshid",
  "ref",
  "ref_src",
  "referrer",
  "source",
  "cmpid",
  "campaign_id",
  "at_medium",
  "at_campaign",
  "spm",
  "sh",
  "__twitter_impression",
  "guccounter",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    TRACKING_PARAMS.has(lower) || TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

export class InvalidSourceUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSourceUrlError";
  }
}

/**
 * Returns the canonical form of a source URL.
 *
 * Throws for anything that is not an absolute http(s) URL, because a value that
 * cannot be normalised must not silently become a deduplication key that matches
 * nothing.
 */
export function normalizeUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new InvalidSourceUrlError(`not an absolute URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidSourceUrlError(`unsupported scheme ${parsed.protocol} in ${rawUrl}`);
  }

  // http and https serve the same article; treating them as two sources would
  // duplicate every page that redirects between them.
  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  // The default port carries no information once the scheme is fixed.
  if (parsed.port === "80" || parsed.port === "443") {
    parsed.port = "";
  }

  // A fragment addresses a position within a document, never a different one.
  parsed.hash = "";

  for (const name of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(name)) {
      parsed.searchParams.delete(name);
    }
  }
  // Ordering is a property of how the link was written, not of what it points to.
  parsed.searchParams.sort();

  // `/article` and `/article/` are the same page; `/` alone is not a trailing
  // slash to strip, it is the whole path.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

/** Normalises without throwing, for callers walking a list of discovered links. */
export function tryNormalizeUrl(rawUrl: string): string | null {
  try {
    return normalizeUrl(rawUrl);
  } catch {
    return null;
  }
}

/**
 * A stable fingerprint of document text.
 *
 * The second half of deduplication: syndicated articles appear on several
 * domains under different URLs, so URL identity alone would let the same content
 * through more than once. Whitespace is collapsed first, because a reformatted
 * page is not new information.
 */
export function contentHash(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(collapsed).digest("hex");
}
