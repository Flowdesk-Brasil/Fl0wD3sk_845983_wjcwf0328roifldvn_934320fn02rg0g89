import { NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import { applyNoStoreHeaders, ensureSameOriginJsonMutationRequest } from "@/lib/security/http";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { assertTeamPermission } from "@/lib/teams/userTeams";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  try {
    const authSession = await getCurrentAuthSessionFromCookie();
    if (!authSession) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
      );
    }

    const { teamId: teamIdStr } = await params;
    const teamId = Number(teamIdStr);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "ID invalido." }, { status: 400 }),
      );
    }

    let body: { discordUserId: string };
    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          discordUserId: flowSecureDto.discordSnowflake(),
        },
        {
          rejectUnknown: true,
        },
      );
    } catch (error) {
      if (!(error instanceof FlowSecureDtoError)) {
        throw error;
      }

      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: error.issues[0] || error.message },
          { status: 400 },
        ),
      );
    }

    const discordUserId = body.discordUserId;
    const supabase = getSupabaseAdminClientOrThrow();
    await assertTeamPermission(teamId, authSession.user.id, "manage_members");

    const existingResult = await supabase
      .from("auth_user_team_members")
      .select("id, status")
      .eq("team_id", teamId)
      .eq("invited_discord_user_id", discordUserId)
      .maybeSingle<{ id: number; status: string }>();

    if (existingResult.data && existingResult.data.status !== "declined") {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: "Usuario ja e membro ou possui convite pendente nesta equipe.",
          },
          { status: 409 },
        ),
      );
    }

    const authUserResult = await supabase
      .from("auth_users")
      .select("id")
      .eq("discord_user_id", discordUserId)
      .maybeSingle<{ id: number }>();

    const invitedAuthUserId = authUserResult.data?.id || null;

    if (existingResult.data?.status === "declined") {
      await supabase
        .from("auth_user_team_members")
        .update({
          status: "pending",
          invited_auth_user_id: invitedAuthUserId,
          accepted_at: null,
        })
        .eq("id", existingResult.data.id);
    } else {
      const insertResult = await supabase.from("auth_user_team_members").insert({
        team_id: teamId,
        invited_discord_user_id: discordUserId,
        invited_auth_user_id: invitedAuthUserId,
        invited_by_user_id: authSession.user.id,
        status: "pending",
      });
      if (insertResult.error) throw new Error(insertResult.error.message);
    }

    return applyNoStoreHeaders(NextResponse.json({ ok: true }));
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        { ok: false, message: sanitizeErrorMessage(error, "Erro ao convidar membro.") },
        { status: 500 },
      ),
    );
  }
}
