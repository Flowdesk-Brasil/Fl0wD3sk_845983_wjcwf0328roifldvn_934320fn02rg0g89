import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDomainMarkup,
  parseFqdn,
} from "../lib/domains/adapter";
import {
  createDomainCheckoutToken,
  resolveDomainPurchaseContext,
  verifyDomainCheckoutToken,
  type DomainCheckoutTokenPayload,
} from "../lib/domains/checkout";
import { domainProviderOrchestrator } from "../lib/domains/provider";
import { providerFetchJson } from "../lib/domains/providers/http";
import { searchDomains } from "../lib/domains/search";

test("domain pricing converts to BRL and applies exactly 20 percent", () => {
  const result = applyDomainMarkup({
    providerCost: 10,
    exchangeRateToBrl: 5,
  });

  assert.deepEqual(result, {
    subtotalBrl: 50,
    totalBrl: 60,
    markupPercent: 20,
  });
});

test("domain checkout context is signed and rejects tampering", () => {
  process.env.DOMAIN_CHECKOUT_SECRET = "domain-test-secret";
  const payload: DomainCheckoutTokenPayload = {
    version: 1,
    authUserId: 42,
    operation: "register",
    fqdn: "flowdesk.com.br",
    quoteId: "quote-id",
    contactId: "contact-id",
    domainId: "domain-id",
    amount: 72.5,
    currency: "BRL",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  const token = createDomainCheckoutToken(payload);
  assert.deepEqual(verifyDomainCheckoutToken(token), payload);
  assert.equal(verifyDomainCheckoutToken(`${token}x`), null);

  const context = resolveDomainPurchaseContext({ type: "domain", token });
  assert.equal(context?.type, "domain");
  assert.equal(context?.authUserId, 42);
  assert.equal(context?.amount, 72.5);
});

test("fqdn parser normalizes public domain input", () => {
  assert.deepEqual(parseFqdn("https://www.FlowDesk.com.br/path"), {
    sld: "flowdesk",
    tld: "com.br",
    fqdn: "flowdesk.com.br",
  });
});

test("domain providers use only Openprovider and Spaceship", () => {
  assert.deepEqual(
    domainProviderOrchestrator.getProviders().map((provider) => provider.name),
    ["openprovider", "spaceship"],
  );
  assert.equal(domainProviderOrchestrator.getProvider("hover"), null);
});

test("concurrent domain searches share one Spaceship batch request", async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenproviderUsername = process.env.OPENPROVIDER_USERNAME;
  const originalOpenproviderPassword = process.env.OPENPROVIDER_PASSWORD;
  const originalSpaceshipKey = process.env.SPACESHIP_API_KEY;
  const originalSpaceshipSecret = process.env.SPACESHIP_API_SECRET;
  let fetchCount = 0;
  let requestedDomains: string[] = [];

  process.env.OPENPROVIDER_USERNAME = "";
  process.env.OPENPROVIDER_PASSWORD = "";
  process.env.SPACESHIP_API_KEY = "spaceship-test-key";
  process.env.SPACESHIP_API_SECRET = "spaceship-test-secret";
  globalThis.fetch = (async (_input, init) => {
    fetchCount += 1;
    const body = JSON.parse(String(init?.body || "{}")) as { domains?: string[] };
    requestedDomains = body.domains || [];
    return new Response(
      JSON.stringify({
        domains: requestedDomains.map((domain) => ({
          domain,
          result: "available",
          price: 10,
          currency: "BRL",
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const [first, second] = await Promise.all([
      searchDomains("flowdeskbatchdedupe"),
      searchDomains("flowdeskbatchdedupe"),
    ]);
    assert.equal(fetchCount, 1);
    assert.ok(requestedDomains.length > 1);
    assert.ok(requestedDomains.length <= 20);
    assert.equal(first.results.length, requestedDomains.length);
    assert.ok((first.results.find((result) => result.extension === "com")?.price || 0) > 0);
    assert.deepEqual(first, second);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenproviderUsername === undefined) delete process.env.OPENPROVIDER_USERNAME;
    else process.env.OPENPROVIDER_USERNAME = originalOpenproviderUsername;
    if (originalOpenproviderPassword === undefined) delete process.env.OPENPROVIDER_PASSWORD;
    else process.env.OPENPROVIDER_PASSWORD = originalOpenproviderPassword;
    if (originalSpaceshipKey === undefined) delete process.env.SPACESHIP_API_KEY;
    else process.env.SPACESHIP_API_KEY = originalSpaceshipKey;
    if (originalSpaceshipSecret === undefined) delete process.env.SPACESHIP_API_SECRET;
    else process.env.SPACESHIP_API_SECRET = originalSpaceshipSecret;
  }
});

test("safe provider requests recover once after a 429 response", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return new Response(JSON.stringify({ detail: "Request Rate Limit rejected" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "0" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await providerFetchJson<{ ok: boolean }>(
      "spaceship",
      "https://spaceship.test/rate-limit",
      { method: "POST" },
      5_000,
      {
        trafficScope: "rate-limit-test",
        trafficPolicy: {
          maxRequests: 10,
          windowMs: 1_000,
          minIntervalMs: 0,
          maxWaitMs: 5_000,
          maxQueue: 10,
        },
        retryOnRateLimit: true,
        maxRateLimitRetries: 1,
      },
    );
    assert.equal(fetchCount, 2);
    assert.equal(response.data.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
