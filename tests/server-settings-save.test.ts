import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const SETTINGS_SAVE_ROUTES = [
  "app/api/auth/me/guilds/antilink-settings/route.ts",
  "app/api/auth/me/guilds/autorole-settings/route.ts",
  "app/api/auth/me/guilds/sales-settings/route.ts",
  "app/api/auth/me/guilds/security-logs-settings/route.ts",
  "app/api/auth/me/guilds/ticket-settings/route.ts",
  "app/api/auth/me/guilds/ticket-staff-settings/route.ts",
  "app/api/auth/me/guilds/welcome-settings/route.ts",
] as const;

function readSource(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

test("server settings saves do not fail when the secure snapshot cache is unavailable", () => {
  const vaultSource = readSource("lib/servers/serverSettingsVault.ts");
  assert.match(vaultSource, /export async function writeServerSettingsVaultSnapshotSafe/);
  assert.match(vaultSource, /secure snapshot write skipped/);

  for (const routePath of SETTINGS_SAVE_ROUTES) {
    const source = readSource(routePath);
    assert.match(
      source,
      /writeServerSettingsVaultSnapshotSafe/,
      `${routePath} must use the non-fatal snapshot writer`,
    );
    assert.doesNotMatch(
      source,
      /await writeServerSettingsVaultSnapshot\(/,
      `${routePath} must not make the snapshot write fatal`,
    );
  }
});

test("sales payment credentials still require the secure vault", () => {
  const source = readSource("app/api/auth/me/guilds/sales-payment-methods/route.ts");
  assert.match(source, /writeServerSettingsVaultSnapshot\(/);
  assert.match(source, /Nao foi possivel salvar as credenciais no cofre seguro/);
});
