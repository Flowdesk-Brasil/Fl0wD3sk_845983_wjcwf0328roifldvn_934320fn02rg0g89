import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("OAuth OTP migration allows pending accounts without auth_users row", async () => {
  const migrationsRoot = path.join(process.cwd(), "..", "sql");
  const migrationSql = await fs.readFile(
    path.join(migrationsRoot, "141_auth_oauth_otp_pending_accounts.sql"),
    "utf8",
  );
  const finalSql = await fs.readFile(
    path.join(migrationsRoot, "140_final.sql"),
    "utf8",
  );

  for (const sql of [migrationSql, finalSql]) {
    assert.match(sql, /alter column user_id drop not null/i);
    assert.match(sql, /auth_email_otp_challenges_purpose_check/i);
    assert.match(sql, /'email_registration'/i);
  }

  assert.match(
    finalSql.replace(/\s+/g, " "),
    /create table if not exists public\.auth_email_otp_challenges \( id uuid primary key default gen_random_uuid\(\), user_id bigint references public\.auth_users\(id\) on delete cascade/i,
  );
});
