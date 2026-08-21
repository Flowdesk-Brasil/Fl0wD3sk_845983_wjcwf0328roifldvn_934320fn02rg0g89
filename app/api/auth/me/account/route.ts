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

type CleanupOperation = {
  table: string;
  column: string;
  mode?: "delete" | "revoke" | "cancel" | "deactivate" | "deactivatePaymentMethod" | "cancelHosting";
};

function isOptionalCleanupError(message: string) {
  return /schema cache|does not exist|could not find|column .* does not exist|relation .* does not exist/i.test(
    message,
  );
}

async function runOptionalAccountCleanup(
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>,
  userId: number,
  nowIso: string,
) {
  const operations: CleanupOperation[] = [
    { table: "auth_user_api_keys", column: "user_id", mode: "revoke" },
    { table: "auth_account_email_changes", column: "user_id", mode: "cancel" },
    { table: "auth_email_otp_challenges", column: "user_id" },
    { table: "auth_security_challenges", column: "user_id" },
    { table: "auth_session_oauth_tokens", column: "user_id" },
    { table: "auth_user_payment_methods", column: "user_id", mode: "deactivatePaymentMethod" },
    { table: "auth_user_hidden_payment_methods", column: "user_id" },
    { table: "auth_user_payment_method_verifications", column: "user_id" },
    { table: "auth_user_favorite_guilds", column: "user_id" },
    { table: "auth_user_discord_links", column: "user_id" },
    { table: "auth_user_team_members", column: "invited_auth_user_id" },
    { table: "hosting_github_connections", column: "user_id" },
    { table: "hosting_projects", column: "user_id", mode: "cancelHosting" },
    { table: "hosting_vps_flow_chat_messages", column: "user_id" },
    { table: "hosting_vps_flow_ai_daily_usage", column: "user_id" },
    { table: "dev_auth_tokens", column: "auth_user_id", mode: "revoke" },
    { table: "dev_certificates", column: "auth_user_id", mode: "revoke" },
    { table: "dev_ip_requests", column: "auth_user_id", mode: "deactivate" },
    { table: "scheduled_tasks", column: "auth_user_id", mode: "deactivate" },
    { table: "ticket_ai_suggestion_sessions", column: "auth_user_id" },
  ];

  const results = await Promise.allSettled(
    operations.map(async (operation) => {
      const query =
        operation.mode === "revoke"
          ? supabase
              .from(operation.table)
              .update({ revoked_at: nowIso, updated_at: nowIso })
              .eq(operation.column, userId)
          : operation.mode === "cancel"
            ? supabase
                .from(operation.table)
                .update({ cancelled_at: nowIso, updated_at: nowIso })
                .eq(operation.column, userId)
          : operation.mode === "deactivatePaymentMethod"
              ? supabase
                  .from(operation.table)
                  .update({ is_active: false, updated_at: nowIso })
                  .eq(operation.column, userId)
              : operation.mode === "cancelHosting"
                ? supabase
                    .from(operation.table)
                    .update({ status: "cancelled", updated_at: nowIso })
                    .eq(operation.column, userId)
                : operation.mode === "deactivate"
            ? supabase
                .from(operation.table)
                .update({ status: "deleted", is_active: false, updated_at: nowIso })
                .eq(operation.column, userId)
                  : supabase.from(operation.table).delete().eq(operation.column, userId);

      const result = await query;
      if (result.error && !isOptionalCleanupError(result.error.message)) {
        throw new Error(`${operation.table}.${operation.column}: ${result.error.message}`);
      }
    }),
  );

  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));
  if (errors.length) {
    throw new Error(`Falha na limpeza de acessos da conta: ${errors.slice(0, 3).join("; ")}`);
  }
}

async function removeOwnedTeamAccess(
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>,
  userId: number,
) {
  const teamsResult = await supabase
    .from("auth_user_teams")
    .select("id")
    .eq("owner_user_id", userId)
    .returns<Array<{ id: number }>>();
  if (teamsResult.error) {
    if (isOptionalCleanupError(teamsResult.error.message)) return;
    throw new Error(`auth_user_teams.owner_user_id: ${teamsResult.error.message}`);
  }

  const teamIds = (teamsResult.data || [])
    .map((team) => team.id)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!teamIds.length) return;

  const results = await Promise.all([
    supabase.from("auth_user_team_members").delete().in("team_id", teamIds),
    supabase.from("auth_user_team_roles").delete().in("team_id", teamIds),
    supabase.from("auth_user_team_servers").delete().in("team_id", teamIds),
  ]);
  const errors = results
    .map((result) => result.error?.message || null)
    .filter((message): message is string => Boolean(message && !isOptionalCleanupError(message)));
  if (errors.length) {
    throw new Error(`Falha ao remover acessos de equipe: ${errors.slice(0, 3).join("; ")}`);
  }

  const deleteTeams = await supabase.from("auth_user_teams").delete().in("id", teamIds);
  if (deleteTeams.error && !isOptionalCleanupError(deleteTeams.error.message)) {
    throw new Error(`auth_user_teams: ${deleteTeams.error.message}`);
  }
}

async function markAuthUserDeleted(
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>,
  userId: number,
  nowIso: string,
  identityUpdate: Record<string, unknown>,
) {
  const fullUpdate = {
    ...identityUpdate,
    profile_avatar_url: null,
    profile_avatar_source: null,
    profile_avatar_updated_at: nowIso,
    deleted_at: nowIso,
    account_deleted_at: nowIso,
  };
  let update = await supabase.from("auth_users").update(fullUpdate).eq("id", userId);
  if (
    update.error &&
    /(profile_avatar_(url|source|updated_at)|deleted_at|account_deleted_at)/i.test(update.error.message)
  ) {
    update = await supabase
      .from("auth_users")
      .update(identityUpdate)
      .eq("id", userId);
  }
  if (update.error) throw new Error(update.error.message);
}

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
    await markAuthUserDeleted(supabase, userId, nowIso, identityUpdate);

    await Promise.all([
      supabase
        .from("auth_sessions")
        .update({ revoked_at: nowIso })
        .eq("user_id", userId)
        .is("revoked_at", null),
      supabase.from("auth_user_credentials").delete().eq("user_id", userId),
      supabase
        .from("auth_user_trusted_devices")
        .update({ revoked_at: nowIso })
        .eq("user_id", userId)
        .is("revoked_at", null),
      supabase.from("auth_user_provider_profiles").delete().eq("user_id", userId),
      supabase.from("auth_user_passkeys").delete().eq("user_id", userId),
      supabase.from("auth_user_totp").delete().eq("user_id", userId),
      supabase
        .from("hosting_github_connections")
        .update({ encrypted_token: null, token_status: "revoked", updated_at: nowIso })
        .eq("user_id", userId),
      supabase.from("auth_security_events").insert({
        user_id: userId,
        session_id: session.id,
        action: "account_deleted",
        outcome: "succeeded",
        metadata: {
          retainedRecords:
            "payments,fiscal,subscriptions,audit,antifraud,security,support,abuse_investigation",
        },
      }),
    ]);
    await removeOwnedTeamAccess(supabase, userId);
    await runOptionalAccountCleanup(supabase, userId, nowIso);
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
