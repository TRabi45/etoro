import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { contentHash, normalizeUrl } from "@/src/research/sources/url";

/**
 * Bounded, guarded retrieval of a single web document.
 *
 * Three limits and one guard, all of them required rather than defensive
 * politeness:
 *
 *   - **Scheme:** http(s) only. `file:`, `ftp:` and `data:` would read the
 *     server's own disk or embed attacker-supplied bytes.
 *   - **Destination:** public addresses only. This is the SSRF guard. A URL is
 *     supplied by a feed, and a feed is not trusted; without this check
 *     `http://169.254.169.254/` would hand cloud instance credentials to the
 *     extractor, and `http://127.0.0.1:54321/` would let a remote feed read the
 *     project's own database API.
 *   - **Time:** a per-request timeout, so one unresponsive host cannot consume
 *     the run's budget.
 *   - **Size:** a byte ceiling enforced while streaming, not after. Checking
 *     `content-length` alone is not enough, because a server may lie about it or
 *     omit it entirely.
 *
 * Nothing here throws for an expected failure. A fetch that cannot happen is a
 * result the pipeline records and continues past.
 */

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Enough for the model to work with; the rest of a long page is furniture. */
export const MAX_EXTRACT_CHARS = 24_000;

export interface FetchedDocument {
  url: string;
  normalizedUrl: string;
  finalUrl: string;
  title: string | null;
  publishedAt: string | null;
  /** Markup stripped, ready for extraction. */
  text: string;
  /**
   * The body as received.
   *
   * Feed discovery needs this: running an RSS document through the HTML
   * stripper destroys the very structure it has to read. Exposing it here keeps
   * feeds behind the same timeout, size ceiling and SSRF guard as everything
   * else, instead of fetching them a second time with bare `fetch`.
   */
  raw: string;
  contentHash: string;
  bytes: number;
}

export type FetchOutcome = { ok: true; document: FetchedDocument } | { ok: false; reason: string };

/**
 * Whether an address is one the fetcher must refuse.
 *
 * Covers loopback, link-local (including the cloud metadata endpoint), the
 * RFC1918 ranges, carrier-grade NAT, and the IPv6 equivalents - plus
 * IPv4-mapped IPv6, which is the usual way this check is bypassed.
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) {
    return true; // Not an address at all: refuse rather than guess.
  }

  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // ::ffff:10.0.0.1 and friends resolve to a v4 address wearing a v6 costume.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) {
    return isPrivateAddress(mapped[1]);
  }
  return false;
}

/**
 * Resolves a hostname and refuses it if any address it answers with is private.
 *
 * Every address is checked, not just the first. A host that resolves to one
 * public and one private address is a redirect-to-internal waiting to happen,
 * and there is no legitimate source that needs it.
 */
async function assertPublicHost(hostname: string): Promise<string | null> {
  if (isIP(hostname) !== 0) {
    return isPrivateAddress(hostname) ? `refused private address ${hostname}` : null;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    return `could not resolve ${hostname}`;
  }

  if (addresses.length === 0) {
    return `no addresses for ${hostname}`;
  }
  const blocked = addresses.find((entry) => isPrivateAddress(entry.address));
  return blocked ? `refused private address ${blocked.address} for ${hostname}` : null;
}

/** Strips markup down to readable prose, and drops what is never content. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function readTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(html);
  if (!match) {
    return null;
  }
  const title = htmlToText(match[1]).trim();
  return title === "" ? null : title;
}

/** The publication date, if the page states one in a machine-readable place. */
function readPublishedAt(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["'](?:pubdate|publish-date|date)["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const iso = match?.[1]?.slice(0, 10);
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return iso;
    }
  }
  return null;
}

/**
 * Reads the body with a hard byte ceiling.
 *
 * Streamed and counted as it arrives, so an endless response is abandoned rather
 * than buffered. The bytes already read are kept: a truncated article is still
 * evidence, and discarding it would turn a large page into a total loss.
 */
async function readBounded(
  response: Response,
  maxResponseBytes: number,
): Promise<{ text: string; bytes: number }> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    return { text: text.slice(0, maxResponseBytes), bytes: text.length };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      bytes += value.byteLength;
      if (bytes >= maxResponseBytes) {
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk.subarray(0, Math.min(chunk.byteLength, bytes - offset)), offset);
    offset += chunk.byteLength;
    if (offset >= bytes) break;
  }

  return { text: new TextDecoder("utf-8", { fatal: false }).decode(merged), bytes };
}

export interface FetchSourceOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** Injected in tests so a failing host can be simulated without a network. */
  fetchImpl?: typeof fetch;
}

export async function fetchSource(
  rawUrl: string,
  options: FetchSourceOptions = {},
): Promise<FetchOutcome> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const doFetch = options.fetchImpl ?? fetch;

  // Normalisation produces the *storage* key, never the request target.
  //
  // These are different jobs and conflating them broke real fetches: the
  // normaliser strips `www.` and forces https so two spellings of one article
  // deduplicate, but the publisher's server is entitled to care about both.
  // Requesting the rewritten URL had Finextra answering 403 to a host that
  // serves the same page happily under `www`. What is safe to compare is not
  // automatically safe to send.
  let normalizedUrl: string;
  let target: URL;
  try {
    normalizedUrl = normalizeUrl(rawUrl);
    target = new URL(rawUrl.trim());
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : "invalid url" };
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { ok: false, reason: `unsupported scheme ${target.protocol}` };
  }

  const hostProblem = await assertPublicHost(target.hostname);
  if (hostProblem) {
    return { ok: false, reason: hostProblem };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let requestTarget = target;
    let response: Response | null = null;
    const MAX_REDIRECTS = 5;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      response = await doFetch(requestTarget.toString(), {
        signal: controller.signal,
        // Redirects are followed manually. With `follow`, the private target
        // has already received a request by the time response.url can be
        // inspected, which defeats SSRF protection.
        redirect: "manual",
        headers: {
          "user-agent": "eToro-MA-Intelligence-Agent/0.1 (internal research prototype)",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get("location");
      if (!location) {
        return { ok: false, reason: `redirect ${response.status} had no Location header` };
      }
      if (redirects === MAX_REDIRECTS) {
        return { ok: false, reason: `too many redirects (maximum ${MAX_REDIRECTS})` };
      }

      let nextTarget: URL;
      try {
        nextTarget = new URL(location, requestTarget);
      } catch {
        return { ok: false, reason: "redirect Location was not a valid URL" };
      }
      if (nextTarget.protocol !== "http:" && nextTarget.protocol !== "https:") {
        return { ok: false, reason: `redirect used unsupported scheme ${nextTarget.protocol}` };
      }
      const redirectProblem = await assertPublicHost(nextTarget.hostname);
      if (redirectProblem) {
        return { ok: false, reason: `redirect refused: ${redirectProblem}` };
      }
      requestTarget = nextTarget;
    }

    if (!response) {
      return { ok: false, reason: "no response received" };
    }

    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status} from ${requestTarget.hostname}` };
    }

    const finalUrl = requestTarget.toString();

    const contentType = response.headers.get("content-type") ?? "";
    // `text/xml` is as common as `application/xml` for RSS and means the same
    // thing; omitting it rejected a working feed on a technicality.
    if (!/text\/(html|plain|xml)|application\/(xhtml|xml|rss|atom)/i.test(contentType)) {
      return { ok: false, reason: `unsupported content-type "${contentType}"` };
    }

    const { text: raw, bytes } = await readBounded(response, maxResponseBytes);
    const text = htmlToText(raw).slice(0, MAX_EXTRACT_CHARS);

    if (text.length < 200) {
      // Too little to extract from. Saying so is more useful than storing a
      // source whose evidence is a navigation bar.
      return { ok: false, reason: `document had ${text.length} characters of readable text` };
    }

    return {
      ok: true,
      document: {
        url: rawUrl,
        normalizedUrl,
        finalUrl,
        title: readTitle(raw),
        publishedAt: readPublishedAt(raw),
        text,
        raw,
        contentHash: contentHash(text),
        bytes,
      },
    };
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { ok: false, reason: `timed out after ${timeoutMs}ms` };
    }
    return { ok: false, reason: cause instanceof Error ? cause.message : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}
