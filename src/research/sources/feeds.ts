import { fetchSource } from "@/src/research/sources/fetcher";
import { tryNormalizeUrl } from "@/src/research/sources/url";

/**
 * Source discovery from configured feeds.
 *
 * RSS rather than a search API, for this milestone. A feed is a stable,
 * publisher-controlled list that costs nothing, needs no additional secret, and
 * returns items whose relevance is at least topical - which is enough to prove
 * the pipeline while keeping the number of moving parts down. A web-search
 * provider fits behind the same `discoverCandidates` interface when one is
 * added.
 *
 * The feeds themselves are configuration, not code: they are the one thing here
 * an analyst would plausibly want to change without a developer.
 */

export interface FeedDefinition {
  name: string;
  url: string;
}

/**
 * Fintech and financial-technology press feeds.
 *
 * Chosen for topical fit with the acquisition thesis - payments, trading,
 * wealth, crypto infrastructure - rather than for volume. A general technology
 * feed would spend the run's budget extracting from articles about consumer
 * gadgets.
 *
 * Every entry here has been checked end to end: the feed parses *and* its
 * articles are fetchable. That second half is not a given and is easy to miss,
 * because a publisher can serve an open RSS feed while blocking crawlers on the
 * articles it links to.
 *
 * Finextra was in this list and was removed for exactly that reason: its feed
 * returns 200 and its articles returned 403 on every attempt. It cost nothing
 * but warnings, and a run that is permanently `partial_success` for a reason
 * nobody intends to fix teaches whoever reads the dashboard to ignore the
 * status - which defeats the point of having one. Publishers behind Cloudflare
 * (Fintech Futures, Sifted, The Block) and ones whose `/feed` serves HTML rather
 * than RSS (American Banker) fail the same check, as does CoinDesk, which rate
 * limits crawlers with a 429.
 *
 * Two feeds turned out to be too few in practice, not in principle: they publish
 * 15-25 items a day between them, so a second run on the same day found nothing
 * new and reported it honestly - correct behaviour, and an empty result. Banking
 * Dive, Payments Dive and Crowdfund Insider widen the intake across the themes
 * the thesis actually names. A broad technology feed would pass the fetch check
 * just as easily and then spend the budget extracting articles about consumer
 * gadgets, which is a more expensive kind of useless than a feed that fails.
 */
export const DEFAULT_FEEDS: FeedDefinition[] = [
  { name: "TechCrunch Fintech", url: "https://techcrunch.com/category/fintech/feed/" },
  { name: "PYMNTS", url: "https://www.pymnts.com/feed/" },
  { name: "Banking Dive", url: "https://www.bankingdive.com/feeds/news/" },
  { name: "Payments Dive", url: "https://www.paymentsdive.com/feeds/news/" },
  { name: "Crowdfund Insider", url: "https://www.crowdfundinsider.com/feed/" },
];

export interface DiscoveredItem {
  url: string;
  normalizedUrl: string;
  title: string | null;
  feedName: string;
}

/**
 * Decodes the XML entities a feed writes into its URLs.
 *
 * Feeds escape `&` as `&amp;` because they are XML. Using the raw string turns
 * `?a=1&b=2` into a request for a parameter literally named `amp;b`, which the
 * publisher may or may not tolerate - and which quietly changes the URL being
 * deduplicated.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/** Pulls `<link>` targets out of RSS or Atom without a parser dependency. */
function readFeedLinks(xml: string): { url: string; title: string | null }[] {
  const items: { url: string; title: string | null }[] = [];

  // RSS: <item><title>..</title><link>https://..</link></item>
  const rssItems = xml.matchAll(/<item\b[\s\S]*?<\/item>/gi);
  for (const match of rssItems) {
    const block = match[0];
    const link = /<link[^>]*>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/link>/i.exec(block);
    const title = /<title[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/title>/i.exec(block);
    if (link?.[1]) {
      items.push({ url: decodeEntities(link[1].trim()), title: title?.[1]?.trim() || null });
    }
  }

  // Atom: <entry><link href="https://.."/></entry>
  const atomEntries = xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi);
  for (const match of atomEntries) {
    const block = match[0];
    const link = /<link[^>]+href=["']([^"']+)["']/i.exec(block);
    const title = /<title[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/title>/i.exec(block);
    if (link?.[1]) {
      items.push({ url: decodeEntities(link[1].trim()), title: title?.[1]?.trim() || null });
    }
  }

  return items;
}

export interface DiscoveryResult {
  items: DiscoveredItem[];
  warnings: string[];
}

/**
 * Collects candidate URLs from every configured feed.
 *
 * A feed that fails contributes a warning and nothing else. Discovery is the
 * first place the "one failure must not abort the run" rule applies, and it is
 * the easiest place to get it wrong: an unreachable feed is common, and letting
 * it throw would mean one publisher's outage silently cancelled the day's
 * monitoring.
 */
export async function discoverCandidates(
  feeds: FeedDefinition[],
  perFeedLimit: number,
): Promise<DiscoveryResult> {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const perFeed: DiscoveredItem[][] = [];

  for (const feed of feeds) {
    const collected: DiscoveredItem[] = [];
    try {
      const outcome = await fetchSource(feed.url);
      if (!outcome.ok) {
        warnings.push(`Feed "${feed.name}" could not be read: ${outcome.reason}`);
        perFeed.push(collected);
        continue;
      }

      // The body as received: running RSS through the HTML stripper would
      // destroy the structure this parser reads.
      const xml = outcome.document.raw;

      for (const link of readFeedLinks(xml)) {
        if (collected.length >= perFeedLimit) break;
        const normalizedUrl = tryNormalizeUrl(link.url);
        if (!normalizedUrl || seen.has(normalizedUrl)) {
          continue;
        }
        seen.add(normalizedUrl);
        collected.push({
          url: link.url,
          normalizedUrl,
          title: link.title,
          feedName: feed.name,
        });
      }

      if (collected.length === 0) {
        warnings.push(`Feed "${feed.name}" returned no usable links.`);
      }
    } catch (cause) {
      warnings.push(
        `Feed "${feed.name}" failed: ${cause instanceof Error ? cause.message : "unknown error"}`,
      );
    }
    perFeed.push(collected);
  }

  // Interleaved rather than concatenated, so the run reads across publishers
  // instead of down one. Concatenating meant the first feed's items filled the
  // whole budget - and if that publisher blocks crawlers, every run spent
  // itself on articles it could never fetch while the working feeds went
  // untouched.
  const items: DiscoveredItem[] = [];
  const deepest = Math.max(0, ...perFeed.map((list) => list.length));
  for (let index = 0; index < deepest; index += 1) {
    for (const list of perFeed) {
      const item = list[index];
      if (item) {
        items.push(item);
      }
    }
  }

  return { items, warnings };
}
