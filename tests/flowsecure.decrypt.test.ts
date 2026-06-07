import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptFlowSecureValue,
  encryptFlowSecureValue,
} from "../lib/security/flowSecure";

test("FlowSecure decrypt hides raw AES-GCM errors from auth flows", () => {
  const encrypted = encryptFlowSecureValue("login-payload", {
    purpose: "auth_two_factor_login",
    aad: "123",
  });
  assert.ok(encrypted);

  assert.throws(
    () =>
      decryptFlowSecureValue(encrypted, {
        purpose: "auth_two_factor_login",
        aad: "different-user-context",
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Reabra esta etapa/i);
      assert.doesNotMatch(
        error.message,
        /Unsupported state|unable to authenticate data/i,
      );
      return true;
    },
  );
});
