import { NextRequest, NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  type AuthenticatorTransportFuture,
  type Base64URLString,
} from "@simplewebauthn/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { requireSensitiveActionProof } from "@/lib/auth/sensitiveAction";
import { resolveWebAuthnRpId } from "@/lib/auth/webauthn";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type PasskeyRow = {
  credential_id: string;
  transports: string[];
};

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
        securityProof: flowSecureDto.optional(flowSecureDto.unknown()),
      },
      { rejectUnknown: true },
    );
    await requireSensitiveActionProof(
      session.user.id,
      "passkey_add",
      body.securityProof,
    );
    const supabase = getSupabaseAdminClientOrThrow();
    const passkeys = await supabase
      .from("auth_user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", session.user.id)
      .returns<PasskeyRow[]>();
    if (passkeys.error) throw new Error(passkeys.error.message);

    const options = await generateRegistrationOptions({
      rpName: "Flowdesk",
      rpID: resolveWebAuthnRpId(request),
      userID: new TextEncoder().encode(String(session.user.id)),
      userName: session.user.email || session.user.username,
      userDisplayName: session.user.display_name,
      attestationType: "none",
      timeout: 60_000,
      excludeCredentials: (passkeys.data || []).map((passkey) => ({
        id: passkey.credential_id as Base64URLString,
        transports: passkey.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    await supabase
      .from("auth_security_challenges")
      .delete()
      .eq("user_id", session.user.id)
      .eq("kind", "passkey_registration")
      .is("consumed_at", null);
    const challenge = await supabase
      .from("auth_security_challenges")
      .insert({
        user_id: session.user.id,
        kind: "passkey_registration",
        challenge: options.challenge,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    if (challenge.error || !challenge.data) {
      throw new Error(challenge.error?.message || "Nao foi possivel criar o desafio.");
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        challengeId: challenge.data.id,
        options,
      }),
    );
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
