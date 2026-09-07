export type DomainCheckState = "available" | "taken" | "unknown";

export interface DomainSearchResult {
  domain: string;
  extension: string;
  status: string;
  checkState: DomainCheckState;
  isAvailable: boolean;
  price: number;
  currency: string;
  isPremium: boolean;
  reason: string;
  whois: string;
}

export interface DomainSearchResponse {
  query: string;
  baseName: string;
  exactDomain: string | null;
  searchedTlds: string[];
  results: DomainSearchResult[];
}
