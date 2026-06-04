import { NextRequest, NextResponse } from "next/server";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type Base64URLString,
} from "@simplewebauthn/server";
import {
  issueSensitiveActionProof,
  readSensitiveActionChallenge,
} from "@/lib/auth/sensitiveAction";
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
        response: flowSecureDto.unknown(),
      },
      { rejectUnknown: true },
    );
    const challengeId = body.challengeId;
    const credentialResponse = body.response as AuthenticationResponseJSON | undefined;

    const challenge = await readSensitiveActionChallenge(session.user.id, challengeId);
    if (!credentialResponse?.id) throw new Error("Resposta da Passkey invalida.");

    const normalizedCredentialId =
      normalizeWebAuthnCredentialId(credentialResponse.id) || credentialResponse.id;
    const normalizedRawId =
      credentialResponse.rawId && normalizeWebAuthnCredentialId(credentialResponse.rawId);
    const supabase = getSupabaseAdminClientOrThrow();

    let passkey = await supabase
      .from("auth_user_passkeys")
      .select("id, credential_id, public_key, counter, transports")
      .eq("user_id", session.user.id)
      .eq("credential_id", normalizedCredentialId)
      .maybeSingle<{
        id: string;
        credential_id: string;
        public_key: string;
        counter: number;
        transports: string[];
      }>();

    if (!passkey.error && !passkey.data && normalizedRawId) {
      passkey = await supabase
        .from("auth_user_passkeys")
        .select("id, credential_id, public_key, counter, transports")
        .eq("user_id", session.user.id)
        .eq("credential_id", normalizedRawId)
        .maybeSingle<{
          id: string;
          credential_id: string;
          public_key: string;
          counter: number;
          transports: string[];
        }>();
    }

    let fallbackPasskey:
      | {
          id: string;
          credential_id: string;
          public_key: string;
          counter: number;
          transports: string[];
        }
      | null = null;

    if (!passkey.error && !passkey.data) {
      const allPasskeys = await supabase
        .from("auth_user_passkeys")
        .select("id, credential_id, public_key, counter, transports")
        .eq("user_id", session.user.id)
        .limit(20);
      if (!allPasskeys.error && allPasskeys.data) {
        fallbackPasskey = allPasskeys.data.find((candidate) => {
          const candidateId =
            normalizeWebAuthnCredentialId(candidate.credential_id) ||
            candidate.credential_id;
          return (
            candidateId === normalizedCredentialId ||
            (normalizedRawId ? candidateId === normalizedRawId : false)
          );
        }) || null;
      }
    }

    const passkeyData = passkey.data || fallbackPasskey;
    if (passkey.error || !passkeyData) {
      throw new Error("Esta Passkey nao pertence a conta.");
    }

    const verification = await verifyAuthenticationResponse({
      response: credentialResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: request.nextUrl.origin,
      expectedRPID: resolveWebAuthnRpId(request),
      credential: {
        id: passkeyData.credential_id as Base64URLString,
        publicKey: new Uint8Array(Buffer.from(passkeyData.public_key, "base64url")),
        counter: Number(passkeyData.counter || 0),
        transports: passkeyData.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: true,
    });
    if (!verification.verified) throw new Error("Nao foi possivel validar esta Passkey.");

    await supabase
      .from("auth_user_passkeys")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", passkeyData.id);
    const proof = await issueSensitiveActionProof(session.user.id, challengeId);
    return applyNoStoreHeaders(NextResponse.json({ ok: true, proof }));
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
