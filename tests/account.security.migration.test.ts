import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("account security migrations provision 2FA and sensitive action challenges", async () => {
  const migrationsRoot = path.join(process.cwd(), "..", "sql");
  const identitySql = await fs.readFile(
    path.join(migrationsRoot, "130_account_identity_and_two_factor.sql"),
    "utf8",
  );
  const sensitiveActionsSql = await fs.readFile(
    path.join(migrationsRoot, "131_sensitive_account_actions.sql"),
    "utf8",
  );
  const sessionsSql = await fs.readFile(
    path.join(migrationsRoot, "132_account_sessions_management.sql"),
    "utf8",
  );

  for (const tableName of [
    "auth_user_provider_profiles",
    "auth_account_email_changes",
    "auth_user_totp",
    "auth_user_passkeys",
    "auth_security_challenges",
  ]) {
    assert.match(
      identitySql,
      new RegExp(`create table if not exists public\\.${tableName}`, "i"),
      `expected account migration to create ${tableName}`,
    );
  }

  assert.match(identitySql, /'sensitive_action'/i);
  assert.match(sensitiveActionsSql, /kind = 'sensitive_action'/i);
  assert.match(
    sensitiveActionsSql,
    /where kind = 'sensitive_action' and consumed_at is null/i,
  );
  assert.match(sessionsSql, /add column if not exists last_seen_at timestamptz/i);
  assert.match(sessionsSql, /idx_auth_sessions_user_activity/i);
});
