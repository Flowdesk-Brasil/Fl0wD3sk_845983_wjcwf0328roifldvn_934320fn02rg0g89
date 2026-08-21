import assert from "node:assert/strict";
import test from "node:test";
import { isFirstPartyPublicReadRequest } from "../lib/security/http";

test("public landing reads allow first-party browser requests", () => {
  const request = new Request("https://www.flwdesk.com/api/landing/loop-logos", {
    headers: {
      referer: "https://www.flwdesk.com/",
      "sec-fetch-site": "same-origin",
    },
  });

  assert.equal(isFirstPartyPublicReadRequest(request), true);
});

test("public landing reads allow trusted Flowdesk subdomains", () => {
  const request = new Request("https://www.flwdesk.com/api/public/landing/runtime", {
    headers: {
      referer: "https://account.flwdesk.com/login",
      "sec-fetch-site": "same-site",
    },
  });

  assert.equal(isFirstPartyPublicReadRequest(request), true);
});

test("public landing reads reject cross-site clone requests", () => {
  const request = new Request("https://www.flwdesk.com/api/landing/server-icons", {
    headers: {
      referer: "https://clone.example/",
      "sec-fetch-site": "cross-site",
    },
  });

  assert.equal(isFirstPartyPublicReadRequest(request), false);
});
