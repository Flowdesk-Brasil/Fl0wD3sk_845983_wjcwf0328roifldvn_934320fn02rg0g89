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
import { normalizeWhitelistMapping } from "@/lib/servers/whitelistMapping";
import { hasPersistedCityDbHost, resolvePublicCityDbHost } from "@/lib/servers/whitelistHost";
import {
  decryptWhitelistSecret,
  encryptWhitelistSecret,
  resolveWhitelistDbPassword,
} from "@/lib/servers/whitelistSecret";
import { resolveCityDbLogin } from "@/lib/servers/cityDbDefaults";
import { invalidateDashboardSettingsCache } from "@/lib/servers/serverDashboardSettingsCache";

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

    const passwordProvided = Object.prototype.hasOwnProperty.call(body, "dbPassword");
    const typedPassword = String(body.dbPassword ?? "");
    const requestedUser = String(body.dbUser || existing.data?.db_user || "").trim();
    let resolvedSecret = { password: "", reencrypt: true };
    try {
      resolvedSecret = resolveWhitelistDbPassword({
        cipher: existing.data?.db_password_cipher,
        guildId,
        override: passwordProvided ? typedPassword : undefined,
        allowEmpty: true,
      });
    } catch {
      resolvedSecret = { password: passwordProvided ? typedPassword : "", reencrypt: true };
    }
    const login = resolveCityDbLogin({
      user: requestedUser,
      password: resolvedSecret.password,
    });
    resolvedSecret = { password: login.password, reencrypt: true };
    const mapping = normalizeWhitelistMapping(body.mapping || existing.data?.mapping);
    const passwordCipher = resolvedSecret.password
      ? encryptWhitelistSecret(resolvedSecret.password, guildId) ||
        resolvedSecret.password
      : null;
    if (
      resolvedSecret.password &&
      decryptWhitelistSecret(passwordCipher, guildId) !== resolvedSecret.password
    ) {
      throw new Error("Nao consegui proteger a senha do MySQL. Tente de novo em alguns segundos.");
    }
    const requestedHost = String(body.dbHost || "");
    const hostCleared =
      Object.prototype.hasOwnProperty.call(body, "dbHost") && !hasPersistedCityDbHost(requestedHost);
    if (hostCleared) {
      await supabase
        .from("guild_whitelist_settings")
        .update({
          db_host: null,
          last_health_ok: false,
          last_health_error: "IP do banco removido. Informe o IP publico para conectar de novo.",
          last_health_at: new Date().toISOString(),
        })
        .eq("guild_id", guildId);
      invalidateDashboardSettingsCache({ guildId });
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            code: "offline",
            title: "IP do banco removido",
            message:
              "A conexao persistida foi desligada. Informe o IP publico da VPS para conectar de novo.",
            hint: "O launcher so ajuda nesta primeira configuracao. Depois a whitelist fica no IP salvo.",
          },
          { status: 400 },
        ),
      );
    }
    const persistDirectOnly = false;
    const target = settingsToDbTarget({
      guildId,
      engine: (String(body.dbEngine || existing.data?.db_engine || "mysql") as
        | "mysql"
        | "mariadb"
        | "postgres"),
      host: resolvePublicCityDbHost({
        requested: requestedHost,
        saved: existing.data?.db_host,
        allowSavedFallback: true,
      }),
      port: Number(body.dbPort || existing.data?.db_port || 3306),
      database: String(body.dbName || existing.data?.db_name || "skips"),
      user: login.user,
      ssl: false,
      passwordCipher: existing.data?.db_password_cipher || null,
      passwordOverride: resolvedSecret.password,
      allowEmptyPassword: !resolvedSecret.password,
    });

    const credentialPatch = {
      connection_mode: "direct",
      db_engine: target.engine === "postgres" ? "postgres" : String(body.dbEngine || existing.data?.db_engine || "mysql"),
      db_host: target.host,
      db_port: target.port,
      db_name: target.database,
      db_user: target.user,
      db_ssl: false,
      db_password_cipher: passwordCipher,
      mapping,
    };
    const saved = await supabase
      .from("guild_whitelist_settings")
      .update(credentialPatch)
      .eq("guild_id", guildId)
      .select("guild_id");
    if (!saved.data?.length) {
      const inserted = await supabase.from("guild_whitelist_settings").insert({
        guild_id: guildId,
        enabled: false,
        mapping_status: "validated",
        configured_by_user_id: sessionData.authSession.user.id,
        ...credentialPatch,
      });
      if (inserted.error) {
        throw new Error(inserted.error.message || "Nao consegui salvar a senha do MySQL.");
      }
    }

    const result = await runCityWhitelistAction({
      guildId,
      action,
      target,
      mapping,
      identifierValue: String(body.identifierValue || ""),
      persistDirectOnly,
    });

    if (!result.ok) {
      const failedPatch: Record<string, unknown> = {
        last_health_at: new Date().toISOString(),
        last_health_ok: false,
        last_health_error: [result.title, result.message, result.hint].filter(Boolean).join(" "),
      };
      if (action === "validate") failedPatch.mapping_status = "invalid";
      await supabase.from("guild_whitelist_settings").update(failedPatch).eq("guild_id", guildId);
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: false,
          code: result.code || "offline",
          title: result.title || "O banco da cidade nao esta online",
          message: result.message,
          hint: result.hint || "Isso nao e um erro da Flowdesk. O MySQL/MariaDB roda na sua VPS.",
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
      mapping,
      mapping_status: "validated",
      last_health_at: new Date().toISOString(),
      last_health_ok: true,
      last_health_error: null,
      last_health_latency_ms: result.latencyMs || null,
    };
    await supabase.from("guild_whitelist_settings").update(healthPatch).eq("guild_id", guildId);
    invalidateDashboardSettingsCache({ guildId });

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
            last_health_error: [sanitized.title, sanitized.message, sanitized.hint]
              .filter(Boolean)
              .join(" "),
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
          code: sanitized.code || "offline",
          title: sanitized.title || "O banco da cidade nao esta online",
          message: sanitized.message || sanitizeErrorMessage(error, "O banco da cidade nao esta online agora."),
          hint: sanitized.hint || "Isso nao e um erro da Flowdesk. O MySQL/MariaDB roda na sua VPS.",
        },
        { status: 400 },
      ),
    );
  }
}
