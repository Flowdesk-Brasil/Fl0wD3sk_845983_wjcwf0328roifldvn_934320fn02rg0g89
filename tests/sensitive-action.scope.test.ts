import assert from "node:assert/strict";
import test from "node:test";
import {
  isSensitiveActionProofScopeValid,
  resolveSensitiveActionProofScope,
} from "../lib/auth/sensitiveActionScope";

test("sensitive action proof only validates for the requested provider target", () => {
  const metadata = {
    action: "provider_unlink",
    proof_action: "provider_unlink",
    target: "provider:discord",
    proof_target: "provider:discord",
  };

  assert.equal(
    isSensitiveActionProofScopeValid(metadata, "provider_unlink", "provider:discord"),
    true,
  );
  assert.equal(
    isSensitiveActionProofScopeValid(metadata, "provider_unlink", "provider:google"),
    false,
  );
});

test("sensitive action proof without target cannot authorize a targeted action", () => {
  assert.equal(
    isSensitiveActionProofScopeValid(
      { action: "provider_unlink", proof_action: "provider_unlink" },
      "provider_unlink",
      "provider:discord",
    ),
    false,
  );
});

test("sensitive action proof rejects a different action even with matching target", () => {
  assert.equal(
    isSensitiveActionProofScopeValid(
      {
        action: "provider_unlink",
        proof_action: "provider_unlink",
        target: "provider:discord",
        proof_target: "provider:discord",
      },
      "passkey_remove",
      "provider:discord",
    ),
    false,
  );
});

test("sensitive action proof issuance cannot retarget an existing challenge", () => {
  assert.deepEqual(
    resolveSensitiveActionProofScope(
      { action: "provider_unlink", target: "provider:discord" },
      { action: "provider_unlink", target: "provider:discord" },
    ),
    { action: "provider_unlink", target: "provider:discord" },
  );

  assert.throws(
    () =>
      resolveSensitiveActionProofScope(
        { action: "provider_unlink", target: "provider:discord" },
        { action: "provider_unlink", target: "provider:google" },
      ),
    /nao e valida/i,
  );

  assert.throws(
    () =>
      resolveSensitiveActionProofScope(
        { action: "provider_unlink", target: "provider:discord" },
        { action: "passkey_remove", target: "provider:discord" },
      ),
    /nao e valida/i,
  );
});
