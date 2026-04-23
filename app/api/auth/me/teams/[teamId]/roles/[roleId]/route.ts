import { NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { applyNoStoreHeaders, ensureSameOriginJsonMutationRequest } from "@/lib/security/http";
import {
  assertTeamPermission,
  invalidateTeamAccessCachesForTeam,
} from "@/lib/teams/userTeams";

// PATCH /api/auth/me/teams/[teamId]/roles/[roleId] - Update role
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ teamId: string; roleId: string }> }
) {
  const originGuard = ensureSameOriginJsonMutationRequest(req);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  try {
    const authSession = await getCurrentAuthSessionFromCookie();
    if (!authSession) {
      return applyNoStoreHeaders(NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }));
    }

    const { teamId: teamIdStr, roleId: roleIdStr } = await params;
    const teamId = Number(teamIdStr);
    const roleId = Number(roleIdStr);
    const body = await req.json();
    const { name, permissions } = body;

    const supabase = getSupabaseAdminClientOrThrow();
    await assertTeamPermission(teamId, authSession.user.id, "manage_roles");

    const updateFields: Record<string, unknown> = {};
    if (name !== undefined) updateFields.name = String(name).trim();
    if (permissions !== undefined) updateFields.permissions = Array.isArray(permissions) ? permissions : [];

    const { error } = await supabase
      .from("auth_user_team_roles")
      .update(updateFields)
      .eq("id", roleId)
      .eq("team_id", teamId);

    if (error) throw error;
    await invalidateTeamAccessCachesForTeam(teamId);

    return applyNoStoreHeaders(NextResponse.json({ ok: true }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno.";
    console.error("[PATCH /teams/roles/:roleId]", err);
    return applyNoStoreHeaders(NextResponse.json({ ok: false, message }, { status: 500 }));
  }
}

// DELETE /api/auth/me/teams/[teamId]/roles/[roleId] - Delete role
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ teamId: string; roleId: string }> }
) {
  const originGuard = ensureSameOriginJsonMutationRequest(req);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  try {
    const authSession = await getCurrentAuthSessionFromCookie();
    if (!authSession) {
      return applyNoStoreHeaders(NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }));
    }

    const { teamId: teamIdStr, roleId: roleIdStr } = await params;
    const teamId = Number(teamIdStr);
    const roleId = Number(roleIdStr);

    const supabase = getSupabaseAdminClientOrThrow();
    await assertTeamPermission(teamId, authSession.user.id, "manage_roles");

    const unlinkMembersResult = await supabase
      .from("auth_user_team_members")
      .update({ role_id: null })
      .eq("team_id", teamId)
      .eq("role_id", roleId);

    if (unlinkMembersResult.error) throw unlinkMembersResult.error;

    const { error } = await supabase
      .from("auth_user_team_roles")
      .delete()
      .eq("id", roleId)
      .eq("team_id", teamId);

    if (error) throw error;
    await invalidateTeamAccessCachesForTeam(teamId);

    return applyNoStoreHeaders(NextResponse.json({ ok: true }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno.";
    console.error("[DELETE /teams/roles/:roleId]", err);
    return applyNoStoreHeaders(NextResponse.json({ ok: false, message }, { status: 500 }));
  }
}
