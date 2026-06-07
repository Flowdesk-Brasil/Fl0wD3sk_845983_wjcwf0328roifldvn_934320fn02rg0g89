import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptFlowSecureValue,
  encryptFlowSecureValue,
} from "../lib/security/flowSecure";

const FLOWSECURE_ENV_KEYS = [
  "FLOWSECURE_MASTER_KEY",
  "FLOWSECURE_MASTER_SECRET",
  "FLOWSECURE_MASTER_KEYS",
  "FLOWSECURE_PREVIOUS_MASTER_KEYS",
  "FLOWSECURE_PREVIOUS_KEYS",
] as const;

function withFlowSecureEnv<T>(
  env: Partial<Record<(typeof FLOWSECURE_ENV_KEYS)[number], string | undefined>>,
  callback: () => T,
) {
  const previous = Object.fromEntries(
    FLOWSECURE_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof FLOWSECURE_ENV_KEYS)[number], string | undefined>;

  for (const key of FLOWSECURE_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      const value = env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  try {
    return callback();
  } finally {
    for (const key of FLOWSECURE_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

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
      assert.match(error.message, /Reabra/i);
      assert.doesNotMatch(
        error.message,
        /Unsupported state|unable to authenticate data/i,
      );
      return true;
    },
  );
});

test("FlowSecure decrypt accepts previous master keys during rotation", () => {
  withFlowSecureEnv(
    {
      FLOWSECURE_MASTER_KEY: "flowsecure-current-test-key-old",
      FLOWSECURE_MASTER_SECRET: undefined,
      FLOWSECURE_MASTER_KEYS: undefined,
      FLOWSECURE_PREVIOUS_MASTER_KEYS: undefined,
      FLOWSECURE_PREVIOUS_KEYS: undefined,
    },
    () => {
      const encrypted = encryptFlowSecureValue("login-payload", {
        purpose: "auth_two_factor_login",
        aad: "123",
      });
      assert.ok(encrypted);

      withFlowSecureEnv(
        {
          FLOWSECURE_MASTER_KEY: "flowsecure-current-test-key-new",
          FLOWSECURE_PREVIOUS_MASTER_KEYS: "flowsecure-current-test-key-old",
        },
        () => {
          assert.equal(
            decryptFlowSecureValue(encrypted, {
              purpose: "auth_two_factor_login",
              aad: "123",
            }),
            "login-payload",
          );
        },
      );
    },
  );
});
