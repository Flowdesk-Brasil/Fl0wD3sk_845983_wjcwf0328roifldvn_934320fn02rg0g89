export type DomainTldCatalogPrice = {
  register: number;
  renew: number;
  transfer: number;
  currency: string;
};

const DEFAULT_TLD_CATALOG: Record<string, DomainTldCatalogPrice> = {
  com: { register: 9.86, renew: 10.18, transfer: 10.18, currency: "USD" },
  "com.br": { register: 12.5, renew: 12.5, transfer: 12.5, currency: "USD" },
  net: { register: 11.4, renew: 11.4, transfer: 11.4, currency: "USD" },
  org: { register: 11.59, renew: 11.59, transfer: 11.59, currency: "USD" },
  io: { register: 51.75, renew: 51.75, transfer: 51.75, currency: "USD" },
  ai: { register: 79.98, renew: 79.98, transfer: 79.98, currency: "USD" },
  app: { register: 14.69, renew: 14.69, transfer: 14.69, currency: "USD" },
  dev: { register: 12.62, renew: 12.62, transfer: 12.62, currency: "USD" },
  co: { register: 25.98, renew: 25.98, transfer: 25.98, currency: "USD" },
  me: { register: 15.53, renew: 15.53, transfer: 15.53, currency: "USD" },
  online: { register: 28.66, renew: 20.18, transfer: 20.18, currency: "USD" },
  store: { register: 43.67, renew: 30.78, transfer: 30.78, currency: "USD" },
  tech: { register: 50.92, renew: 50.92, transfer: 50.92, currency: "USD" },
};

function normalizeTld(tld: string) {
  return tld.trim().toLowerCase().replace(/^\./, "");
}

export function getTldCatalogPrice(tld: string): DomainTldCatalogPrice | null {
  return DEFAULT_TLD_CATALOG[normalizeTld(tld)] || null;
}

export function applyTldCatalogFallback<T extends {
  tld: string;
  registrationCost: number;
  renewalCost: number;
  transferCost: number;
  currency?: string;
}>(result: T): T {
  if (result.registrationCost > 0) return result;
  const catalog = getTldCatalogPrice(result.tld);
  if (!catalog) return result;
  return {
    ...result,
    registrationCost: catalog.register,
    renewalCost: result.renewalCost > 0 ? result.renewalCost : catalog.renew,
    transferCost: result.transferCost > 0 ? result.transferCost : catalog.transfer,
    currency: result.currency || catalog.currency,
  };
}
