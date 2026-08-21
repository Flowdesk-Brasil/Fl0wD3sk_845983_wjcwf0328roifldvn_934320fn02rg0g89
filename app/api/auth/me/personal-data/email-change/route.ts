import { NextRequest, NextResponse } from "next/server";
import { normalizeAuthEmail } from "@/lib/auth/email";
import {
  createEmailChangeOtpChallenge,
  EmailOtpError,
  resendLoginOtpChallenge,
  verifyLoginOtpChallenge,
} from "@/lib/auth/emailOtp";
import {
  findAuthUserByEmail,
  getCurrentAuthSessionFromCookie,
} from "@/lib/auth/session";
import { requireSensitiveActionProof } from "@/lib/auth/sensitiveAction";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";

type EmailChangeRow = {
  id: string;
  user_id: number;
  current_email: string | null;
  new_email: string;
  current_challenge_id: string | null;
  new_challenge_id: string | null;
  current_verified_at: string | null;
  new_verified_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  expires_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

async function readChange(userId: number, changeId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("auth_account_email_changes")
    .select("id, user_id, current_email, new_email, current_challenge_id, new_challenge_id, current_verified_at, new_verified_at, completed_at, cancelled_at, expires_at")
    .eq("id", changeId)
    .eq("user_id", userId)
    .maybeSingle<EmailChangeRow>();
  if (result.error) throw new Error(result.error.message);
  if (!result.data || result.data.cancelled_at || result.data.completed_at) {
    throw new Error("Esta alteracao de email nao esta mais ativa.");
  }
  if (Date.parse(result.data.expires_at) <= Date.now()) {
    throw new Error("Esta alteracao expirou. Inicie novamente.");
  }
  return result.data;
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

  const supabase = getSupabaseAdminClientOrThrow();

  try {
    const body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        action: flowSecureDto.enum(["start", "resend", "verify"] as const),
        newEmail: flowSecureDto.optional(flowSecureDto.email()),
        changeId: flowSecureDto.optional(
          flowSecureDto.string({
            minLength: 8,
            maxLength: 120,
            rejectThreatPatterns: false,
          }),
        ),
        stage: flowSecureDto.optional(
          flowSecureDto.enum(["current", "new"] as const),
        ),
        code: flowSecureDto.optional(
          flowSecureDto.string({
            maxLength: 16,
            pattern: /^[A-Za-z0-9]+$/,
          }),
        ),
        securityProof: flowSecureDto.optional(flowSecureDto.unknown()),
      },
      { rejectUnknown: true },
    );
    const action = body.action;

    if (action === "start") {
      await requireSensitiveActionProof(
        session.user.id,
        "email_change",
        body.securityProof,
      );
      const newEmail = normalizeAuthEmail(
        body.newEmail || null,
      );
      if (!newEmail) throw new Error("Informe um novo email valido.");
      if (newEmail === session.user.email_normalized) {
        throw new Error("O novo email precisa ser diferente do email atual.");
      }
      const existing = await findAuthUserByEmail(newEmail);
      if (existing && existing.id !== session.user.id) {
        throw new Error("Este email ja esta em uso por outra conta.");
      }

      await supabase
        .from("auth_account_email_changes")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("user_id", session.user.id)
        .is("completed_at", null)
        .is("cancelled_at", null);

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const createResult = await supabase
        .from("auth_account_email_changes")
        .insert({
          user_id: session.user.id,
          current_email: session.user.email,
          new_email: newEmail,
          new_email_normalized: newEmail,
          current_verified_at: session.user.email ? null : new Date().toISOString(),
          expires_at: expiresAt,
        })
        .select("id")
        .single<{ id: string }>();
      if (createResult.error || !createResult.data) {
        throw new Error(createResult.error?.message || "Nao foi possivel iniciar a alteracao.");
      }

      const metadata = { emailChangeId: createResult.data.id };
      const currentChallenge = session.user.email
        ? await createEmailChangeOtpChallenge({
            userId: session.user.id,
            email: session.user.email,
            purpose: "email_change_current",
            ipAddress: extractClientIp(request),
            userAgent: request.headers.get("user-agent"),
            metadata,
          })
        : null;
      const newChallenge = await createEmailChangeOtpChallenge({
        userId: session.user.id,
        email: newEmail,
        purpose: "email_change_new",
        ipAddress: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
        metadata,
      });

      const updateResult = await supabase
        .from("auth_account_email_changes")
        .update({
          current_challenge_id: currentChallenge?.challengeId || null,
          new_challenge_id: newChallenge.challengeId,
        })
        .eq("id", createResult.data.id);
      if (updateResult.error) throw new Error(updateResult.error.message);

      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          changeId: createResult.data.id,
          expiresAt,
          current: currentChallenge
            ? {
                challengeId: currentChallenge.challengeId,
                maskedEmail: currentChallenge.maskedEmail,
              }
            : null,
          next: {
            challengeId: newChallenge.challengeId,
            maskedEmail: newChallenge.maskedEmail,
          },
          message: "Enviamos os codigos de confirmacao.",
        }),
      );
    }

    const changeId = body.changeId || "";
    const stage = body.stage || null;
    if (!changeId || !stage) throw new Error("Confirmacao de email invalida.");
    const change = await readChange(session.user.id, changeId);
    const challengeId =
      stage === "current" ? change.current_challenge_id : change.new_challenge_id;
    if (!challengeId) throw new Error("Codigo desta etapa nao encontrado.");

    if (action === "resend") {
      const result = await resendLoginOtpChallenge(challengeId);
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          maskedEmail: result.maskedEmail,
          resendAvailableAt: result.resendAvailableAt,
          message: "Novo codigo enviado.",
        }),
      );
    }

    if (action !== "verify") throw new Error("Acao invalida.");
    const code = body.code || "";
    const verification = await verifyLoginOtpChallenge({
      challengeId,
      code,
      expectedPurposes: [
        stage === "current" ? "email_change_current" : "email_change_new",
      ],
      beforeConsume: async (challenge) => {
        const metadata = isRecord(challenge.metadata) ? challenge.metadata : {};
        if (metadata.emailChangeId !== change.id) {
          throw new EmailOtpError(
            "Este codigo nao pertence a esta alteracao de email.",
            400,
            "email_change_mismatch",
          );
        }
        if (challenge.userId !== session.user.id) {
          throw new EmailOtpError(
            "Este codigo nao pertence a esta conta.",
            403,
            "email_change_wrong_user",
          );
        }
      },
    });

    const verifiedAt = new Date().toISOString();
    const currentVerified = stage === "current" || Boolean(change.current_verified_at);
    const newVerified = stage === "new" || Boolean(change.new_verified_at);
    const changeUpdate: Record<string, unknown> = {
      [stage === "current" ? "current_verified_at" : "new_verified_at"]: verifiedAt,
    };

    if (currentVerified && newVerified) {
      const conflict = await findAuthUserByEmail(change.new_email);
      if (conflict && conflict.id !== session.user.id) {
        throw new Error("Este email passou a ser usado por outra conta.");
      }
      const userUpdate = await supabase
        .from("auth_users")
        .update({
          email: change.new_email,
          email_normalized: change.new_email,
          email_verified_at: verifiedAt,
        })
        .eq("id", session.user.id);
      if (userUpdate.error) throw new Error(userUpdate.error.message);
      changeUpdate.completed_at = verifiedAt;
    }

    const updateChange = await supabase
      .from("auth_account_email_changes")
      .update(changeUpdate)
      .eq("id", change.id);
    if (updateChange.error) throw new Error(updateChange.error.message);

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        completed: currentVerified && newVerified,
        currentVerified,
        newVerified,
        verifiedEmail: verification.email,
        nextStage: currentVerified && !newVerified ? "new" : null,
        email: currentVerified && newVerified ? change.new_email : session.user.email,
        message:
          currentVerified && newVerified
            ? "Email alterado com sucesso."
            : `Email ${stage === "current" ? "atual" : "novo"} confirmado.`,
      }),
    );
  } catch (error) {
    const status = error instanceof EmailOtpError ? error.statusCode : 400;
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Nao foi possivel alterar o email.",
        },
        { status },
      ),
    );
  }
}
