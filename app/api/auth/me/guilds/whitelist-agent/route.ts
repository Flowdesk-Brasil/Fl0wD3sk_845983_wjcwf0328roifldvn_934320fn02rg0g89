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
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  createWhitelistAgentPairing,
  hashWhitelistAgentToken,
  resolveWhitelistAgentApiUrl,
  tokensMatch,
} from "@/lib/servers/whitelistAgent";
import { buildWhitelistAgentZip } from "@/lib/servers/whitelistAgentPack";
import { getLauncherStatusForGuild } from "@/lib/launcher/auth";

async function ensureGuildAccess(guildId: string) {
  const sessionData = await resolveSessionAccessToken();
  if (!sessionData?.authSession || !sessionData.accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
    };
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
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Sem permissao." }, { status: 403 }),
    };
  }
  return { ok: true as const, authUserId: sessionData.authSession.user.id };
}

export async function POST(request: Request) {
  const invalid = ensureSameOriginJsonMutationRequest(request);
  if (invalid) return applyNoStoreHeaders(invalid);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const guildId = String(body.guildId || "").trim();
  const action = String(body.action || "pair").trim();
  if (!isGuildId(guildId)) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Guild ID invalido." }, { status: 400 }),
    );
  }
  const access = await ensureGuildAccess(guildId);
  if (!access.ok) return applyNoStoreHeaders(access.response);

  const supabase = getSupabaseAdminClientOrThrow();
  const existing = await supabase
    .from("guild_whitelist_settings")
    .select(
      "agent_public_id, agent_token_hash, agent_last_seen_at, agent_public_ip, last_health_ok, last_health_at",
    )
    .eq("guild_id", guildId)
    .maybeSingle();

  if (action === "status") {
    try {
      const launcher = await getLauncherStatusForGuild(guildId);
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          paired: launcher.paired,
          publicId: existing.data?.agent_public_id || launcher.publicId || null,
          online: launcher.online,
          status: launcher.status,
          lastSeenAt: launcher.lastSeenAt,
          hostname: launcher.hostname,
          lastHealthOk: existing.data?.last_health_ok === true,
          lastHealthAt: existing.data?.last_health_at || null,
        }),
      );
    } catch {
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          paired: false,
          online: false,
          status: "awaiting",
        }),
      );
    }
  }

  const apiUrl = resolveWhitelistAgentApiUrl(request);
  const providedToken = String(body.token || "").trim();

  if (action === "download") {
    const publicId = String(existing.data?.agent_public_id || "");
    const tokenHash = String(existing.data?.agent_token_hash || "");
    if (!publicId || !tokenHash || !providedToken || !tokensMatch(tokenHash, hashWhitelistAgentToken(providedToken))) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: "Gere o pareamento e baixe o launcher na sequencia, com o token recem exibido.",
          },
          { status: 400 },
        ),
      );
    }
    const zip = buildWhitelistAgentZip({
      apiUrl,
      publicId,
      token: providedToken,
    });
    const response = new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="FlowDesk-Whitelist-Agent.zip"',
      },
    });
    return applyNoStoreHeaders(response);
  }

  const pairing = createWhitelistAgentPairing();
  const row = {
    guild_id: guildId,
    connection_mode: "agent",
    agent_public_id: pairing.publicId,
    agent_token_hash: pairing.tokenHash,
    configured_by_user_id: access.authUserId,
  };
  const upsert = await supabase.from("guild_whitelist_settings").upsert(row, {
    onConflict: "guild_id",
  });
  if (upsert.error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            upsert.error.message ||
            "Falha ao parear o Agent. Rode sql/154_guild_whitelist_agent.sql no Supabase.",
        },
        { status: 400 },
      ),
    );
  }

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      message: "Agent pareado. Baixe o launcher e mantenha-o aberto na VPS.",
      publicId: pairing.publicId,
      token: pairing.token,
      apiUrl,
      connectionMode: "agent",
    }),
  );
}
