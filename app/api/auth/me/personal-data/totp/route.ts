import { NextRequest, NextResponse } from "next/server";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { requireSensitiveActionProof } from "@/lib/auth/sensitiveAction";
import {
  decryptFlowSecureValue,
  encryptFlowSecureValue,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

function createTotp(secret: OTPAuth.Secret, label: string) {
  return new OTPAuth.TOTP({
    issuer: "Flowdesk",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
}

function isValidTotpCode(secretBase32: string, label: string, code: unknown) {
  const token =
    typeof code === "string" ? code.trim().replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(token)) return false;
  const totp = createTotp(OTPAuth.Secret.fromBase32(secretBase32), label);
  return totp.validate({ token, window: 1 }) !== null;
}

function parseTotpBody(payload: unknown) {
  return parseFlowSecureDto(
    payload,
    {
      action: flowSecureDto.optional(
        flowSecureDto.enum(["start", "verify"] as const),
      ),
      code: flowSecureDto.optional(
        flowSecureDto.string({ maxLength: 6, pattern: /^\d{6}$/ }),
      ),
      securityProof: flowSecureDto.optional(flowSecureDto.unknown()),
    },
    { rejectUnknown: true },
  );
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return originGuard;

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  const label = session.user.email || session.user.username;
  const supabase = getSupabaseAdminClientOrThrow();

  try {
    const body = parseTotpBody(await request.json().catch(() => ({})));
    const action = body.action || "";

    if (action === "start") {
      await requireSensitiveActionProof(
        session.user.id,
        "totp_enable",
        body.securityProof,
      );
      const existing = await supabase
        .from("auth_user_totp")
        .select("enabled")
        .eq("user_id", session.user.id)
        .maybeSingle<{ enabled: boolean }>();
      if (existing.data?.enabled) {
        throw new Error("O aplicativo autenticador ja esta configurado.");
      }
      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = createTotp(secret, label);
      const encrypted = encryptFlowSecureValue(secret.base32, {
        purpose: "auth_totp_secret",
        aad: String(session.user.id),
      });
      if (!encrypted) throw new Error("Nao foi possivel proteger a chave TOTP.");

      const upsert = await supabase.from("auth_user_totp").upsert(
        {
          user_id: session.user.id,
          secret_encrypted: encrypted,
          enabled: false,
          verified_at: null,
          last_used_at: null,
        },
        { onConflict: "user_id" },
      );
      if (upsert.error) throw new Error(upsert.error.message);

      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          secret: secret.base32,
          qrCodeDataUrl: await QRCode.toDataURL(totp.toString(), {
            width: 320,
            margin: 1,
            color: { dark: "#111111", light: "#FFFFFF" },
          }),
          message: "Leia o QR Code e confirme um codigo do aplicativo.",
        }),
      );
    }

    if (action !== "verify") throw new Error("Acao TOTP invalida.");
    const result = await supabase
      .from("auth_user_totp")
      .select("secret_encrypted")
      .eq("user_id", session.user.id)
      .maybeSingle<{ secret_encrypted: string }>();
    if (result.error || !result.data) {
      throw new Error("Inicie a configuracao do autenticador primeiro.");
    }
    const secret = decryptFlowSecureValue(result.data.secret_encrypted, {
      purpose: "auth_totp_secret",
      aad: String(session.user.id),
    });
    if (!secret || !isValidTotpCode(secret, label, body.code)) {
      throw new Error("Codigo do autenticador invalido.");
    }

    const verifiedAt = new Date().toISOString();
    const update = await supabase
      .from("auth_user_totp")
      .update({
        enabled: true,
        verified_at: verifiedAt,
        last_used_at: verifiedAt,
      })
      .eq("user_id", session.user.id);
    if (update.error) throw new Error(update.error.message);

    return applyNoStoreHeaders(
      NextResponse.json({ ok: true, message: "Aplicativo autenticador ativado." }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao configurar TOTP.",
        },
        { status: 400 },
      ),
    );
  }
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

  const supabase = getSupabaseAdminClientOrThrow();
  try {
    const body = parseTotpBody(await request.json().catch(() => ({})));
    await requireSensitiveActionProof(
      session.user.id,
      "totp_disable",
      body.securityProof,
    );
    const result = await supabase
      .from("auth_user_totp")
      .select("secret_encrypted, enabled")
      .eq("user_id", session.user.id)
      .maybeSingle<{ secret_encrypted: string; enabled: boolean }>();
    if (!result.data) {
      return applyNoStoreHeaders(NextResponse.json({ ok: true }));
    }

    const deleted = await supabase
      .from("auth_user_totp")
      .delete()
      .eq("user_id", session.user.id);
    if (deleted.error) throw new Error(deleted.error.message);
    return applyNoStoreHeaders(
      NextResponse.json({ ok: true, message: "Aplicativo autenticador desativado." }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao desativar TOTP.",
        },
        { status: 400 },
      ),
    );
  }
}
