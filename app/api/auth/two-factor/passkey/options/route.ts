import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  type AuthenticatorTransportFuture,
  type Base64URLString,
} from "@simplewebauthn/server";
import { readPendingTwoFactorLogin } from "@/lib/auth/twoFactor";
import {
  normalizeWebAuthnCredentialId,
  resolveWebAuthnRpId,
} from "@/lib/auth/webauthn";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return originGuard;

  try {
    const body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        challengeId: flowSecureDto.string({
          minLength: 8,
          maxLength: 120,
          rejectThreatPatterns: false,
        }),
      },
      { rejectUnknown: true },
    );
    const challengeId = body.challengeId;

    const pending = await readPendingTwoFactorLogin(challengeId);
    const supabase = getSupabaseAdminClientOrThrow();
    const passkeys = await supabase
      .from("auth_user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", pending.payload.userId)
      .returns<Array<{ credential_id: string; transports: string[] }>>();
    if (passkeys.error || !passkeys.data?.length) {
      throw new Error("Nenhuma Passkey disponivel para esta conta.");
    }

    const allowCredentials = passkeys.data
      .map((passkey) => {
        const normalizedId = normalizeWebAuthnCredentialId(passkey.credential_id);
        if (!normalizedId) return null;
        return {
          id: normalizedId as Base64URLString,
          transports: passkey.transports as AuthenticatorTransportFuture[],
        };
      })
      .filter(
        (credential): credential is {
          id: Base64URLString;
          transports: AuthenticatorTransportFuture[];
        } => Boolean(credential),
      );
    if (!allowCredentials.length) {
      throw new Error("Nenhuma Passkey disponivel para esta conta.");
    }

    const options = await generateAuthenticationOptions({
      rpID: resolveWebAuthnRpId(request),
      timeout: 60_000,
      userVerification: "required",
      allowCredentials,
    });
    const update = await supabase
      .from("auth_security_challenges")
      .update({ challenge: options.challenge })
      .eq("id", pending.row.id)
      .is("consumed_at", null);
    if (update.error) throw new Error(update.error.message);

    return applyNoStoreHeaders(NextResponse.json({ ok: true, options }));
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error ? error.message : "Nao foi possivel iniciar a Passkey.",
        },
        { status: 400 },
      ),
    );
  }
}
