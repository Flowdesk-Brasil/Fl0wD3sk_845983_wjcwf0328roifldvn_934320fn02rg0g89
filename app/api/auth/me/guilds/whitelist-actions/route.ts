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
import {
  inspectCitySchema,
  sanitizeDbError,
  settingsToDbTarget,
  testCityDatabase,
  testWhitelistMapping,
} from "@/lib/servers/whitelistCityDb";
import { normalizeWhitelistMapping } from "@/lib/servers/whitelistMapping";
import {
  enqueueWhitelistAgentJob,
  mappingPayload,
  waitForWhitelistAgentJob,
} from "@/lib/servers/whitelistAgentJobs";

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
        "db_engine, db_host, db_port, db_name, db_user, db_ssl, db_password_cipher, mapping, connection_mode, agent_token_hash, agent_last_seen_at",
      )
      .eq("guild_id", guildId)
      .maybeSingle();

    if (action === "test" || action === "inspect" || action === "validate") {
      const operation =
        action === "inspect"
          ? "INSPECT_SCHEMA"
          : action === "validate"
            ? "TEST_MAPPING"
            : "TEST_CONNECTION";
      if (action === "validate" && !String(body.identifierValue || "").trim()) {
        return applyNoStoreHeaders(
          NextResponse.json({
            ok: false,
            message: "Informe um identificador de teste para localizar o registro sem alterar dados.",
          }),
        );
      }
      const job = await enqueueWhitelistAgentJob({
        guildId,
        operation,
        payload: mappingPayload(body.mapping || existing.data.mapping, String(body.identifierValue || "")),
      });
      const finished = await waitForWhitelistAgentJob(job.id);
      if (finished.status !== "done") {
        return applyNoStoreHeaders(
          NextResponse.json({
            ok: false,
            message:
              finished.error_message ||
              "O launcher nao concluiu a tempo. Instale o Flowdesk Launcher na VPS, entre na conta e deixe-o aberto.",
          }),
        );
      }
      const result = (finished.result || {}) as Record<string, unknown>;
      if (action === "inspect") {
        await supabase
          .from("guild_whitelist_settings")
          .update({
            last_health_at: new Date().toISOString(),
            last_health_ok: true,
            last_health_error: null,
          })
          .eq("guild_id", guildId);
        return applyNoStoreHeaders(
          NextResponse.json({
            ok: true,
            message: "Schema lido pelo Agent na VPS.",
            tables: result.tables || [],
            inferred: result.inferred || null,
          }),
        );
      }
      if (action === "validate") {
        if (result.ok === false) {
          await supabase
            .from("guild_whitelist_settings")
            .update({ mapping_status: "invalid" })
            .eq("guild_id", guildId);
          return applyNoStoreHeaders(
            NextResponse.json({
              ok: false,
              message: String(result.message || "Mapping invalido no banco local."),
            }),
          );
        }
        await supabase
          .from("guild_whitelist_settings")
          .update({
            mapping: normalizeWhitelistMapping(body.mapping || existing.data.mapping),
            mapping_status: "validated",
            last_health_at: new Date().toISOString(),
            last_health_ok: true,
            last_health_error: null,
          })
          .eq("guild_id", guildId);
        return applyNoStoreHeaders(
          NextResponse.json({
            ok: true,
            message: "Mapping validado pelo Agent, sem alterar dados.",
            lookup: result,
          }),
        );
      }
      await supabase
        .from("guild_whitelist_settings")
        .update({
          last_health_at: new Date().toISOString(),
          last_health_ok: true,
          last_health_error: null,
          last_health_latency_ms: Number(result.latencyMs || 0) || null,
        })
        .eq("guild_id", guildId);
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          message: `Agent conectou no banco local (${Number(result.latencyMs || 0)}ms).`,
          latencyMs: result.latencyMs || 0,
        }),
      );
    }

    const target = settingsToDbTarget({
      guildId,
      engine: (String(body.dbEngine || existing.data?.db_engine || "mysql") as
        | "mysql"
        | "mariadb"
        | "postgres"),
      host: String(body.dbHost || existing.data?.db_host || ""),
      port: Number(body.dbPort || existing.data?.db_port || 3306),
      database: String(body.dbName || existing.data?.db_name || ""),
      user: String(body.dbUser || existing.data?.db_user || ""),
      ssl: Boolean(body.dbSsl ?? existing.data?.db_ssl),
      passwordCipher: existing.data?.db_password_cipher || null,
      passwordOverride: String(body.dbPassword || "") || null,
    });

    if (action === "test") {
      const result = await testCityDatabase(target);
      await supabase
        .from("guild_whitelist_settings")
        .update({
          last_health_at: new Date().toISOString(),
          last_health_ok: true,
          last_health_error: null,
          last_health_latency_ms: result.latencyMs,
        })
        .eq("guild_id", guildId);
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          message: `Conexao ok (${result.latencyMs}ms).`,
          latencyMs: result.latencyMs,
        }),
      );
    }

    if (action === "inspect") {
      const inspected = await inspectCitySchema(target);
      await supabase
        .from("guild_whitelist_settings")
        .update({
          schema_fingerprint: inspected.fingerprint,
          last_health_at: new Date().toISOString(),
          last_health_ok: true,
          last_health_error: null,
        })
        .eq("guild_id", guildId);
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          message: "Schema analisado. Confirme o mapping candidato.",
          tables: inspected.tables,
          inferred: inspected.inferred,
        }),
      );
    }

    if (action === "validate") {
      const mapping = normalizeWhitelistMapping(body.mapping || existing.data?.mapping);
      await testCityDatabase(target);
      const identifierValue = String(body.identifierValue || "").trim();
      if (!identifierValue) {
        return applyNoStoreHeaders(
          NextResponse.json({
            ok: false,
            message: "Informe um identificador de teste para localizar o registro sem alterar dados.",
          }),
        );
      }
      const lookup = await testWhitelistMapping(target, mapping, identifierValue);
      if (!lookup.ok) {
        await supabase
          .from("guild_whitelist_settings")
          .update({ mapping_status: "invalid" })
          .eq("guild_id", guildId);
        return applyNoStoreHeaders(NextResponse.json(lookup));
      }
      await supabase
        .from("guild_whitelist_settings")
        .update({
          mapping,
          mapping_status: "validated",
          last_health_at: new Date().toISOString(),
          last_health_ok: true,
          last_health_error: null,
        })
        .eq("guild_id", guildId);
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          message: "Mapping validado. Registro localizado sem alterar dados.",
          lookup,
        }),
      );
    }

    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Acao invalida." }, { status: 400 }),
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
