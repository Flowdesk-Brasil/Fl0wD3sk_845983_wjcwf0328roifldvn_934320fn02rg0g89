import { NextRequest, NextResponse } from "next/server";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
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
        challengeId: flowSecureDto.string({
          minLength: 8,
          maxLength: 120,
          rejectThreatPatterns: false,
        }),
        name: flowSecureDto.optional(
          flowSecureDto.string({
            maxLength: 64,
            normalizeWhitespace: true,
          }),
        ),
        response: flowSecureDto.unknown(),
      },
      { rejectUnknown: true },
    );
    const challengeId = body.challengeId;
    if (!body.response) throw new Error("Resposta da Passkey invalida.");

    const supabase = getSupabaseAdminClientOrThrow();
    const challenge = await supabase
      .from("auth_security_challenges")
      .select("id, challenge, expires_at, consumed_at")
      .eq("id", challengeId)
      .eq("user_id", session.user.id)
      .eq("kind", "passkey_registration")
      .maybeSingle<{
        id: string;
        challenge: string;
        expires_at: string;
        consumed_at: string | null;
      }>();
    if (
      challenge.error ||
      !challenge.data ||
      challenge.data.consumed_at ||
      Date.parse(challenge.data.expires_at) <= Date.now()
    ) {
      throw new Error("O desafio da Passkey expirou. Tente novamente.");
    }

    const verification = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: challenge.data.challenge,
      expectedOrigin: request.nextUrl.origin,
      expectedRPID: resolveWebAuthnRpId(request),
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Nao foi possivel validar esta Passkey.");
    }

    const info = verification.registrationInfo;
    const normalizedCredentialId =
      normalizeWebAuthnCredentialId(info.credential.id) || info.credential.id;
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 64)
        : "Passkey";
    const insert = await supabase.from("auth_user_passkeys").upsert(
      {
        user_id: session.user.id,
        credential_id: normalizedCredentialId,
        public_key: Buffer.from(info.credential.publicKey).toString("base64url"),
        counter: info.credential.counter,
        transports: info.credential.transports || [],
        device_type: info.credentialDeviceType,
        backed_up: info.credentialBackedUp,
        name,
      },
      { onConflict: "credential_id" },
    );
    if (insert.error) throw new Error(insert.error.message);

    await supabase
      .from("auth_security_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challenge.data.id);

    return applyNoStoreHeaders(
      NextResponse.json({ ok: true, message: "Passkey adicionada com sucesso." }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error ? error.message : "Nao foi possivel validar a Passkey.",
        },
        { status: 400 },
      ),
    );
  }
}
