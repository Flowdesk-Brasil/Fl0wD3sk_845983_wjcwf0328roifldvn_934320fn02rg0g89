import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStrictApiCorsHeaders,
  buildStrictApiPreflightResponse,
} from "../lib/security/http.ts";

test("api preflight allows trusted Flowdesk subdomain origins without wildcard", () => {
  const request = new Request("https://www.flwdesk.com/api/auth/email/start", {
    method: "OPTIONS",
    headers: {
      Origin: "https://account.flwdesk.com",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "content-type, x-request-id, x-flowdesk-idempotency-key, x-evil-header",
      "Sec-Fetch-Site": "same-site",
    },
  });

  const response = buildStrictApiPreflightResponse(request, {
    requestId: "test-request",
    noIndex: true,
  });

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://account.flwdesk.com",
  );
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.match(response.headers.get("Access-Control-Allow-Methods") || "", /\bPOST\b/);
  assert.match(
    response.headers.get("Access-Control-Allow-Headers") || "",
    /\bContent-Type\b/,
  );
  assert.doesNotMatch(
    response.headers.get("Access-Control-Allow-Headers") || "",
    /x-evil-header/i,
  );
  assert.match(response.headers.get("Vary") || "", /\bOrigin\b/);
  assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("api preflight blocks untrusted origins without CORS credentials", () => {
  const request = new Request("https://account.flwdesk.com/api/auth/email/start", {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
      "Sec-Fetch-Site": "cross-site",
    },
  });

  const response = buildStrictApiPreflightResponse(request);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
});

test("api responses allow trusted Flowdesk subdomain origins without wildcard", () => {
  const request = new Request("https://www.flwdesk.com/api/auth/me", {
    method: "GET",
    headers: {
      Origin: "https://account.flwdesk.com",
      "Sec-Fetch-Site": "same-site",
    },
  });
  const response = applyStrictApiCorsHeaders(new Response(null), request);

  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://account.flwdesk.com",
  );
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.match(response.headers.get("Vary") || "", /\bOrigin\b/);
  assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("api responses do not allow untrusted origins", () => {
  const request = new Request("https://account.flwdesk.com/api/auth/me", {
    method: "GET",
    headers: {
      Origin: "https://evil.example",
      "Sec-Fetch-Site": "cross-site",
    },
  });
  const response = applyStrictApiCorsHeaders(new Response(null), request);

  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
});

test("api preflight rejects unsupported requested methods", () => {
  const request = new Request("https://account.flwdesk.com/api/auth/email/start", {
    method: "OPTIONS",
    headers: {
      Origin: "https://account.flwdesk.com",
      "Access-Control-Request-Method": "TRACE",
      "Access-Control-Request-Headers": "content-type",
      "Sec-Fetch-Site": "same-origin",
    },
  });

  const response = buildStrictApiPreflightResponse(request);

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.match(response.headers.get("Allow") || "", /\bOPTIONS\b/);
});
