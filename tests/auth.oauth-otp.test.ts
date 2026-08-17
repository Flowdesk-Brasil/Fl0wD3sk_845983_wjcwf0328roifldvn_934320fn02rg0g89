import assert from "node:assert/strict";
import test from "node:test";

async function loadShouldRequireInitialOAuthEmailOtp() {
  process.env.SUPABASE_URL ||= "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
  const oauthOtp = await import("../lib/auth/oauthOtp.ts");
  return oauthOtp.shouldRequireInitialOAuthEmailOtp;
}

test("new OAuth provider login requires email OTP before account persistence", async () => {
  const shouldRequireInitialOAuthEmailOtp =
    await loadShouldRequireInitialOAuthEmailOtp();
  assert.equal(
    shouldRequireInitialOAuthEmailOtp({
      mode: "login",
      existingProviderUserId: null,
    }),
    true,
  );
});

test("already linked OAuth provider and explicit link mode do not start signup OTP", async () => {
  const shouldRequireInitialOAuthEmailOtp =
    await loadShouldRequireInitialOAuthEmailOtp();
  assert.equal(
    shouldRequireInitialOAuthEmailOtp({
      mode: "login",
      existingProviderUserId: 42,
    }),
    false,
  );
  assert.equal(
    shouldRequireInitialOAuthEmailOtp({
      mode: "link",
      existingProviderUserId: null,
    }),
    false,
  );
});
