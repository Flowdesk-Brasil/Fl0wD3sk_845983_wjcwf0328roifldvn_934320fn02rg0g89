import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { requireSensitiveActionProof } from "@/lib/auth/sensitiveAction";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return originGuard;

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  const { id } = await context.params;
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
      "passkey_remove",
      body.securityProof,
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Nao foi possivel confirmar esta acao.",
        },
        { status: 400 },
      ),
    );
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("auth_user_passkeys")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (result.error) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: result.error.message }, { status: 400 }),
    );
  }

  return applyNoStoreHeaders(
    NextResponse.json({ ok: true, message: "Passkey removida." }),
  );
}
