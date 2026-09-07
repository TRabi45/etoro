import { describe, expect, it } from "vitest";
import { fetchSource } from "@/src/research/sources/fetcher";

describe("safe source fetching", () => {
  it("refuses a private redirect before issuing a request to its target", async () => {
    const requests: string[] = [];
    const fetchImpl: typeof fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requests.push(url);
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/internal" },
      });
    }) as typeof fetch;

    const result = await fetchSource("http://8.8.8.8/start", { fetchImpl });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toMatch(/redirect refused.*private/i);
    expect(requests).toEqual(["http://8.8.8.8/start"]);
  });
});
