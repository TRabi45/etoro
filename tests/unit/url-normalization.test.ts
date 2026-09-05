import { describe, expect, it } from "vitest";
import {
  contentHash,
  InvalidSourceUrlError,
  normalizeUrl,
  tryNormalizeUrl,
} from "@/src/research/sources/url";
import { isPrivateAddress } from "@/src/research/sources/fetcher";

/**
 * Normalisation decides what counts as "the same article", so these tests are
 * really about the evidence tree: two rows for one document would look, to
 * anything reading the citations, like two sources agreeing.
 */
describe("normalizeUrl", () => {
  it("treats a campaign-tagged URL as the same article", () => {
    expect(normalizeUrl("https://example.com/article?utm_source=twitter")).toBe(
      normalizeUrl("https://example.com/article"),
    );
  });

  it("strips the whole utm family, and the click ids that replace it", () => {
    expect(
      normalizeUrl(
        "https://example.com/a?utm_source=x&utm_medium=y&utm_campaign=z&fbclid=1&gclid=2&msclkid=3",
      ),
    ).toBe("https://example.com/a");
  });

  it("keeps query parameters that select content", () => {
    // The dangerous over-reach: stripping this would merge two different pages,
    // which is worse than keeping two rows for one.
    expect(normalizeUrl("https://example.com/search?q=fintech&utm_source=x")).toBe(
      "https://example.com/search?q=fintech",
    );
  });

  it("ignores parameter order", () => {
    expect(normalizeUrl("https://example.com/a?b=2&a=1")).toBe(
      normalizeUrl("https://example.com/a?a=1&b=2"),
    );
  });

  it("drops the fragment, which addresses a position and not a document", () => {
    expect(normalizeUrl("https://example.com/article#section-3")).toBe(
      "https://example.com/article",
    );
  });

  it("unifies scheme, www and default port", () => {
    const canonical = normalizeUrl("https://example.com/article");
    expect(normalizeUrl("http://example.com/article")).toBe(canonical);
    expect(normalizeUrl("https://www.example.com/article")).toBe(canonical);
    expect(normalizeUrl("https://example.com:443/article")).toBe(canonical);
    expect(normalizeUrl("HTTPS://EXAMPLE.COM/article")).toBe(canonical);
  });

  it("treats a trailing slash as the same page, but keeps a bare root", () => {
    expect(normalizeUrl("https://example.com/article/")).toBe("https://example.com/article");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("does not merge different paths or hosts", () => {
    expect(normalizeUrl("https://example.com/a")).not.toBe(normalizeUrl("https://example.com/b"));
    expect(normalizeUrl("https://a.example.com/x")).not.toBe(
      normalizeUrl("https://b.example.com/x"),
    );
  });

  it("refuses anything that is not an absolute http(s) URL", () => {
    expect(() => normalizeUrl("/relative/path")).toThrow(InvalidSourceUrlError);
    expect(() => normalizeUrl("file:///etc/passwd")).toThrow(InvalidSourceUrlError);
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(InvalidSourceUrlError);
    expect(tryNormalizeUrl("not a url")).toBeNull();
  });
});

describe("contentHash", () => {
  it("matches the same article across reformatting", () => {
    expect(contentHash("Revolut  raised\n\n$100m.")).toBe(contentHash("Revolut raised $100m."));
  });

  it("differs for different content", () => {
    expect(contentHash("Revolut raised $100m.")).not.toBe(contentHash("Revolut raised $200m."));
  });
});

/**
 * The SSRF guard. A URL comes from a feed, and a feed is not trusted, so these
 * are the destinations that must never be fetched.
 */
describe("isPrivateAddress", () => {
  it("blocks loopback, link-local and the RFC1918 ranges", () => {
    for (const address of [
      "127.0.0.1",
      "0.0.0.0",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      "::1",
      "fe80::1",
      "fd00::1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("blocks the cloud metadata endpoint", () => {
    // The single most valuable SSRF target: it serves instance credentials.
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
  });

  it("blocks a private address wearing an IPv6 costume", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
  });

  it("refuses anything that is not an address at all", () => {
    expect(isPrivateAddress("not-an-address")).toBe(true);
  });

  it("allows ordinary public addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("172.15.0.1")).toBe(false);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});
