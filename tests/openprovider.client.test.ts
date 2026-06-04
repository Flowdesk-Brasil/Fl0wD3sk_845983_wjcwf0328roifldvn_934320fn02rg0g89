import assert from "node:assert/strict";
import test from "node:test";
import { OpenProviderClient } from "../lib/openprovider/client";

test("Openprovider sends any-IP explicitly and does not retry invalid authentication", async () => {
  const originalFetch = globalThis.fetch;
  const originalUsername = process.env.OPENPROVIDER_USERNAME;
  const originalPassword = process.env.OPENPROVIDER_PASSWORD;
  const originalIp = process.env.OPENPROVIDER_IP;
  let fetchCount = 0;
  let loginPayload: Record<string, unknown> = {};

  process.env.OPENPROVIDER_USERNAME = "flowdesk-api-user";
  process.env.OPENPROVIDER_PASSWORD = "invalid-test-password";
  delete process.env.OPENPROVIDER_IP;
  globalThis.fetch = (async (_input, init) => {
    fetchCount++;
    loginPayload = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        code: 196,
        desc: "Authentication/Authorization Failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const client = new OpenProviderClient();
    await assert.rejects(
      client.authenticate("auth-test"),
      /Use o username do contato\/RCP, nao o endereco de e-mail/,
    );
    assert.equal(fetchCount, 1);
    assert.equal(loginPayload.ip, "0.0.0.0");

    await assert.rejects(client.authenticate("auth-test-cached"), /Nova tentativa automatica/);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUsername === undefined) delete process.env.OPENPROVIDER_USERNAME;
    else process.env.OPENPROVIDER_USERNAME = originalUsername;
    if (originalPassword === undefined) delete process.env.OPENPROVIDER_PASSWORD;
    else process.env.OPENPROVIDER_PASSWORD = originalPassword;
    if (originalIp === undefined) delete process.env.OPENPROVIDER_IP;
    else process.env.OPENPROVIDER_IP = originalIp;
  }
});

test("Openprovider rate limits fall back without internal retries", async () => {
  const originalFetch = globalThis.fetch;
  const originalUsername = process.env.OPENPROVIDER_USERNAME;
  const originalPassword = process.env.OPENPROVIDER_PASSWORD;
  let fetchCount = 0;

  process.env.OPENPROVIDER_USERNAME = "flowdesk-api-user";
  process.env.OPENPROVIDER_PASSWORD = "test-password";
  globalThis.fetch = (async (input) => {
    fetchCount += 1;
    if (String(input).includes("/auth/login")) {
      return new Response(JSON.stringify({ code: 0, data: { token: "test-token" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ code: 429, desc: "Rate limit exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "30" },
    });
  }) as typeof fetch;

  try {
    const client = new OpenProviderClient();
    await assert.rejects(client.post("domains/check", { domains: [] }), /Rate limit exceeded/);
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUsername === undefined) delete process.env.OPENPROVIDER_USERNAME;
    else process.env.OPENPROVIDER_USERNAME = originalUsername;
    if (originalPassword === undefined) delete process.env.OPENPROVIDER_PASSWORD;
    else process.env.OPENPROVIDER_PASSWORD = originalPassword;
  }
});
