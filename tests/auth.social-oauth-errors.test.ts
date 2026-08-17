import assert from "node:assert/strict";
import test from "node:test";

async function loadSocialCallbackErrors() {
  process.env.SUPABASE_URL ||= "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
  const [google, discord] = await Promise.all([
    import("../lib/auth/googleCallback.ts"),
    import("../lib/auth/discordCallback.ts"),
  ]);
  return {
    resolveGoogleAuthErrorCode: google.resolveGoogleAuthErrorCode,
    resolveGoogleAuditFailureReason: google.resolveGoogleAuditFailureReason,
    resolveDiscordAuthErrorCode: discord.resolveDiscordAuthErrorCode,
    resolveDiscordAuditFailureReason: discord.resolveDiscordAuditFailureReason,
  };
}

test("social OAuth callbacks classify OTP email delivery failures explicitly", async () => {
  const errors = await loadSocialCallbackErrors();

  assert.equal(
    errors.resolveGoogleAuthErrorCode(
      new Error(
        "google_callback_phase:email_otp_prepare: A autenticacao SMTP falhou. Revise AUTH_SMTP_USER e AUTH_SMTP_PASS.",
      ),
    ),
    "auth_email_delivery_failed",
  );
  assert.equal(
    errors.resolveGoogleAuditFailureReason("auth_email_delivery_failed"),
    "email_otp_delivery_failed",
  );

  assert.equal(
    errors.resolveDiscordAuthErrorCode(
      new Error(
        "A autenticacao SMTP falhou. Revise AUTH_SMTP_USER e AUTH_SMTP_PASS.",
      ),
    ),
    "auth_email_delivery_failed",
  );
  assert.equal(
    errors.resolveDiscordAuditFailureReason("auth_email_delivery_failed"),
    "email_otp_delivery_failed",
  );
});
