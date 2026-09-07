import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { getEffectiveDashboardPermissions } from "@/lib/teams/userTeams";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { sanitizeDbError, settingsToDbTarget } from "@/lib/servers/whitelistCityDb";
import { runCityWhitelistAction } from "@/lib/servers/cityDatabaseGateway";
import { createVrpUsersMapping } from "@/lib/servers/whitelistMapping";
import { resolvePublicCityDbHost } from "@/lib/servers/whitelistHost";
import {
  encryptWhitelistSecret,
  resolveWhitelistDbPassword,
} from "@/lib/servers/whitelistSecret";

export async function POST(request: Request) {
  const invalid = ensureSameOriginJsonMutationRequest(request);
  if (invalid) return applyNoStoreHeaders(invalid);

  let guildId = "";
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    guildId = String(body.guildId || "").trim();
    const action = String(body.action || "").trim();
    if (!isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Guild ID invalido." }, { status: 400 }),
      );
    }
    if (action !== "test" && action !== "inspect" && action !== "validate") {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Acao invalida." }, { status: 400 }),
      );
    }

    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession || !sessionData.accessToken) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
      );
    }
    const { permissions, isTeamServer } = await getEffectiveDashboardPermissions({
      authUserId: sessionData.authSession.user.id,
      guildId,
    });
    const accessibleGuild = await assertUserAdminInGuildOrNull(
      { authSession: sessionData.authSession, accessToken: sessionData.accessToken },
      guildId,
    );
    const canManage =
      permissions === "full" ||
      (permissions instanceof Set &&
        (permissions.has("server_manage_whitelist_database") ||
          permissions.has("server_manage_whitelist_overview"))) ||
      (!isTeamServer && accessibleGuild);
    if (!canManage) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Sem permissao." }, { status: 403 }),
      );
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const existing = await supabase
      .from("guild_whitelist_settings")
      .select(
        "db_engine, db_host, db_port, db_name, db_user, db_ssl, db_password_cipher, mapping, connection_mode, agent_public_ip",
      )
      .eq("guild_id", guildId)
      .maybeSingle();

    const resolvedSecret = resolveWhitelistDbPassword({
      cipher: existing.data?.db_password_cipher,
      guildId,
      override: String(body.dbPassword || ""),
    });
    const target = settingsToDbTarget({
      guildId,
      engine: (String(body.dbEngine || existing.data?.db_engine || "mysql") as
        | "mysql"
        | "mariadb"
        | "postgres"),
      host: resolvePublicCityDbHost({
        requested: String(body.dbHost || ""),
        saved: existing.data?.db_host,
        publicIp: existing.data?.agent_public_ip,
      }),
      port: Number(body.dbPort || existing.data?.db_port || 3306),
      database: String(body.dbName || existing.data?.db_name || ""),
      user: String(body.dbUser || existing.data?.db_user || ""),
      ssl: false,
      passwordCipher: existing.data?.db_password_cipher || null,
      passwordOverride: resolvedSecret.password,
    });

    const credentialPatch = {
      connection_mode: "direct",
      db_engine: target.engine === "postgres" ? "postgres" : String(body.dbEngine || existing.data?.db_engine || "mysql"),
      db_host: target.host,
      db_port: target.port,
      db_name: target.database,
      db_user: target.user,
      db_ssl: false,
      db_password_cipher: encryptWhitelistSecret(resolvedSecret.password, guildId),
      mapping: createVrpUsersMapping(),
    };
    await supabase.from("guild_whitelist_settings").update(credentialPatch).eq("guild_id", guildId);

    const result = await runCityWhitelistAction({
      guildId,
      action,
      target,
      mapping: createVrpUsersMapping(),
      identifierValue: String(body.identifierValue || ""),
    });

    if (!result.ok) {
      const failedPatch: Record<string, unknown> = {
        last_health_at: new Date().toISOString(),
        last_health_ok: false,
        last_health_error: result.message,
      };
      if (action === "validate") failedPatch.mapping_status = "invalid";
      await supabase.from("guild_whitelist_settings").update(failedPatch).eq("guild_id", guildId);
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: false,
          message: result.message,
          via: result.via,
          host: result.host,
        }),
      );
    }

    const healthPatch: Record<string, unknown> = {
      connection_mode: "direct",
      db_host: target.host,
      db_name: target.database,
      db_user: target.user,
      db_port: target.port,
      mapping: createVrpUsersMapping(),
      mapping_status: "validated",
      last_health_at: new Date().toISOString(),
      last_health_ok: true,
      last_health_error: null,
      last_health_latency_ms: result.latencyMs || null,
    };
    await supabase.from("guild_whitelist_settings").update(healthPatch).eq("guild_id", guildId);

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        message: result.message,
        via: result.via,
        host: result.host,
        latencyMs: result.latencyMs || 0,
        tables: result.tables || [],
        inferred: result.inferred || null,
        lookup: result.lookup || null,
      }),
    );
  } catch (error) {
    const sanitized = sanitizeDbError(error);
    if (isGuildId(guildId)) {
      try {
        const supabase = getSupabaseAdminClientOrThrow();
        await supabase
          .from("guild_whitelist_settings")
          .update({
            last_health_at: new Date().toISOString(),
            last_health_ok: false,
            last_health_error: sanitized.message,
          })
          .eq("guild_id", guildId);
      } catch {
        // Health write is best-effort and must not expose internals.
      }
    }
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitized.message || sanitizeErrorMessage(error, "Falha na acao de whitelist."),
        },
        { status: 400 },
      ),
    );
  }
}
