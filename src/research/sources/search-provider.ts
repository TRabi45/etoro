/**
 * The optional paid search-provider extension point.
 *
 * Section 12 (workstream C) requires the orchestrator not be coupled to one
 * vendor, and requires this milestone to work without a paid provider
 * account. Both are satisfied the same way: the contract a provider would
 * implement is defined here, but no vendor is wired up, and the one function
 * the rest of the system actually calls - `isSearchProviderConfigured` -
 * always answers false until a real key is present. There is no throwing
 * stub standing in for a provider; there is simply nothing registered yet.
 *
 * A disabled provider must produce an explicit capability warning rather than
 * silently reducing coverage - see `buildCompanySourcePlan`, which is the
 * caller responsible for surfacing that.
 */

export interface SearchResult {
  url: string;
  title: string | null;
  snippet: string | null;
}

export interface SearchProviderAdapter {
  readonly name: string;
  search(query: string, options: { limit: number }): Promise<SearchResult[]>;
}

export function isSearchProviderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SEARCH_PROVIDER_API_KEY && env.SEARCH_PROVIDER_API_KEY.trim() !== "");
}
