import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApiGatewayRejectionResponse,
  evaluateApiGatewayRequest,
} from "../lib/security/apiGateway";

test("api gateway rejects excessive auth payloads before handlers", async () => {
  const request = new Request("https://account.flwdesk.com/api/auth/email/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(128 * 1024),
      Origin: "https://account.flwdesk.com",
    },
  });

  const evaluation = evaluateApiGatewayRequest(request);

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.ok ? null : evaluation.status, 413);
  assert.equal(evaluation.ok ? null : evaluation.code, "api_payload_too_large");
});

test("api gateway rejects prototype pollution query keys", () => {
  const request = new Request(
    "https://account.flwdesk.com/api/auth/me/account?__proto__[polluted]=1",
  );
  const evaluation = evaluateApiGatewayRequest(request);

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.ok ? null : evaluation.code, "api_query_rejected");
});

test("api gateway rejects metadata SSRF targets in query values", () => {
  const request = new Request(
    "https://account.flwdesk.com/api/domains/check?url=http%3A%2F%2F169.254.169.254%2Flatest",
  );
  const evaluation = evaluateApiGatewayRequest(request);

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.ok ? null : evaluation.code, "api_query_rejected");
});

test("api gateway rejects unsafe content types for JSON mutations", () => {
  const request = new Request("https://account.flwdesk.com/api/auth/email/start", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": "12",
      Origin: "https://account.flwdesk.com",
    },
  });
  const evaluation = evaluateApiGatewayRequest(request);

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.ok ? null : evaluation.status, 415);
  assert.equal(evaluation.ok ? null : evaluation.code, "api_content_type_rejected");
});

test("api gateway allows avatar multipart within limit but rejects oversized upload", () => {
  const allowed = evaluateApiGatewayRequest(
    new Request("https://account.flwdesk.com/api/auth/me/personal-data/avatar", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=flowdesk",
        "Content-Length": String(5 * 1024 * 1024),
        Origin: "https://account.flwdesk.com",
      },
    }),
  );
  const blocked = evaluateApiGatewayRequest(
    new Request("https://account.flwdesk.com/api/auth/me/personal-data/avatar", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=flowdesk",
        "Content-Length": String(7 * 1024 * 1024),
        Origin: "https://account.flwdesk.com",
      },
    }),
  );

  assert.equal(allowed.ok, true);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok ? null : blocked.code, "api_payload_too_large");
});

test("api gateway rejects bodies on safe methods", () => {
  const request = new Request("https://account.flwdesk.com/api/public/landing/runtime", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "2",
    },
  });
  const evaluation = evaluateApiGatewayRequest(request);

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.ok ? null : evaluation.reason, "safe_method_body_rejected");
});

test("api gateway rejection response is generic and carries request id", async () => {
  const request = new Request("https://account.flwdesk.com/api/auth/email/start", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": "12",
      Origin: "https://account.flwdesk.com",
    },
  });
  const evaluation = evaluateApiGatewayRequest(request);
  assert.equal(evaluation.ok, false);

  const response = buildApiGatewayRejectionResponse(request, evaluation, {
    requestId: "req-security-test",
  });
  const payload = await response.json() as {
    ok: boolean;
    message: string;
    requestId: string;
  };

  assert.equal(response.status, 415);
  assert.equal(payload.ok, false);
  assert.equal(payload.message, "Requisicao invalida.");
  assert.equal(payload.requestId, "req-security-test");
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://account.flwdesk.com",
  );
});
