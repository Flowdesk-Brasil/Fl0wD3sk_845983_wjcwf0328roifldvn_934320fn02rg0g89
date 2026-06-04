import { NextRequest, NextResponse } from "next/server";
import { updatePasswordCredential } from "@/lib/auth/emailAuth";
import { requireSensitiveActionProof } from "@/lib/auth/sensitiveAction";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
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
        currentPassword: flowSecureDto.optional(flowSecureDto.unknown()),
        newPassword: flowSecureDto.unknown(),
        confirmPassword: flowSecureDto.unknown(),
        securityProof: flowSecureDto.optional(flowSecureDto.unknown()),
      },
      { rejectUnknown: true },
    );
    if (!session.user.email) {
      throw new Error("Cadastre um email na conta antes de criar uma senha.");
    }
    await requireSensitiveActionProof(
      session.user.id,
      "password_change",
      body.securityProof,
    );
    const result = await updatePasswordCredential({
      userId: session.user.id,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      confirmPassword: body.confirmPassword,
    });

    const nowIso = new Date().toISOString();
    const supabase = getSupabaseAdminClientOrThrow();
    await Promise.all([
      supabase
        .from("auth_sessions")
        .update({ revoked_at: nowIso })
        .eq("user_id", session.user.id)
        .neq("id", session.id)
        .is("revoked_at", null),
      supabase
        .from("auth_user_trusted_devices")
        .update({ revoked_at: nowIso })
        .eq("user_id", session.user.id)
        .is("revoked_at", null),
    ]);

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        created: result.created,
        message: result.created ? "Senha criada com sucesso." : "Senha alterada com sucesso.",
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error ? error.message : "Nao foi possivel atualizar a senha.",
        },
        { status: 400 },
      ),
    );
  }
}
