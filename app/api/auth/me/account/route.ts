import { NextRequest, NextResponse } from "next/server";
import { requireSensitiveActionProof } from "@/lib/auth/sensitiveAction";
import {
  getCurrentAuthSessionFromCookie,
  invalidateAuthSessionCache,
} from "@/lib/auth/session";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export async function DELETE(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return originGuard;

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  try {
    const body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        securityProof: flowSecureDto.optional(flowSecureDto.unknown()),
      },
      { rejectUnknown: true },
    );
    await requireSensitiveActionProof(
      session.user.id,
      "account_delete",
      body.securityProof,
    );

    const userId = session.user.id;
    const nowIso = new Date().toISOString();
    const supabase = getSupabaseAdminClientOrThrow();
    const identityUpdate = {
      discord_user_id: null,
      google_user_id: null,
      microsoft_user_id: null,
      display_name: "Deleted User",
      username: `deleted-${userId}-${Date.now().toString(36)}`,
      avatar: null,
      email: null,
      email_normalized: null,
      email_verified_at: null,
      last_auth_method: null,
      raw_user: {},
    };
    let update = await supabase
      .from("auth_users")
      .update({
        ...identityUpdate,
        profile_avatar_url: null,
        profile_avatar_source: null,
        profile_avatar_updated_at: nowIso,
      })
      .eq("id", userId);
    if (
      update.error &&
      /profile_avatar_(url|source|updated_at)/i.test(update.error.message)
    ) {
      update = await supabase
        .from("auth_users")
        .update(identityUpdate)
        .eq("id", userId);
    }
    if (update.error) throw new Error(update.error.message);

    await Promise.all([
      supabase
        .from("auth_sessions")
        .update({ revoked_at: nowIso })
        .eq("user_id", userId)
        .is("revoked_at", null),
      supabase.from("auth_user_credentials").delete().eq("user_id", userId),
      supabase.from("auth_user_trusted_devices").delete().eq("user_id", userId),
      supabase.from("auth_user_provider_profiles").delete().eq("user_id", userId),
      supabase.from("auth_user_passkeys").delete().eq("user_id", userId),
      supabase.from("auth_user_totp").delete().eq("user_id", userId),
      supabase.from("auth_security_challenges").delete().eq("user_id", userId),
      supabase.from("hosting_github_connections").delete().eq("user_id", userId),
    ]);
    invalidateAuthSessionCache();

    return applyNoStoreHeaders(
      NextResponse.json({ ok: true, message: "Conta excluida com sucesso." }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error ? error.message : "Nao foi possivel excluir a conta.",
        },
        { status: 400 },
      ),
    );
  }
}
