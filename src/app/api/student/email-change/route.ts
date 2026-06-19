import crypto from "node:crypto";
import { apiErrorResponse, ApiError, getClientIp, logAudit, requireRole } from "@/lib/server/supabase-admin";
import { sendStudioEmail } from "@/lib/server/mail";

const codeTtlMs = 15 * 60 * 1000;
const maxAttempts = 5;

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 6) : "";
}

function createCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function hashCode(requestId: string, code: string) {
  return crypto.createHash("sha256").update(`${requestId}:${code}`).digest("hex");
}

async function sendCodeEmail(to: string, code: string, kind: "current" | "new") {
  await sendStudioEmail({
    to,
    subject: kind === "current" ? "Codigo para alterar seu e-mail" : "Confirme seu novo e-mail",
    title: kind === "current" ? "Confirme que e voce" : "Confirme o novo e-mail",
    intro: kind === "current"
      ? "Use este codigo no portal do aluno para liberar a alteracao de e-mail."
      : "Use este codigo no portal do aluno para concluir a troca do seu e-mail de acesso.",
    sections: [
      { label: "Codigo", value: code },
      { label: "Validade", value: "15 minutos" },
    ],
    footer: "Se voce nao solicitou esta alteracao, ignore este e-mail e avise a recepcao.",
  });
}

async function getStudent(admin: any, profileId: string) {
  const { data: student, error } = await admin
    .from("students")
    .select("id, full_name, email, profile_id")
    .eq("profile_id", profileId)
    .single();
  if (error || !student) throw new ApiError("Cadastro de aluno nao vinculado ao portal.", 404);
  return student as { id: string; full_name: string; email?: string | null; profile_id?: string | null };
}

async function getRequest(admin: any, requestId: string, userId: string) {
  const { data: row, error } = await admin
    .from("student_email_change_requests")
    .select("*")
    .eq("id", requestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) throw new ApiError("Solicitacao nao encontrada. Comece novamente.", 404);
  if (new Date(row.expires_at).getTime() < Date.now() || row.status === "expired") {
    await admin.from("student_email_change_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", requestId);
    throw new ApiError("Codigo expirado. Solicite um novo codigo.", 400);
  }
  if (Number(row.attempts || 0) >= maxAttempts) throw new ApiError("Muitas tentativas. Solicite um novo codigo.", 429);
  return row as any;
}

async function bumpAttempts(admin: any, requestId: string) {
  const { data: row } = await admin.from("student_email_change_requests").select("attempts").eq("id", requestId).maybeSingle();
  await admin
    .from("student_email_change_requests")
    .update({ attempts: Number(row?.attempts || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", requestId);
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile } = await requireRole(request, ["student"]);
    const student = await getStudent(admin, user.id);
    const body = await request.json().catch(() => ({})) as { action?: unknown; requestId?: unknown; code?: unknown; newEmail?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    const now = new Date();

    if (action === "start") {
      const currentEmail = normalizeEmail(profile.email || user.email || student.email);
      if (!currentEmail.includes("@")) throw new ApiError("Seu cadastro atual nao possui e-mail valido.", 400);

      await admin
        .from("student_email_change_requests")
        .update({ status: "expired", updated_at: now.toISOString() })
        .eq("user_id", user.id)
        .in("status", ["awaiting_current", "awaiting_new"]);

      const requestId = crypto.randomUUID();
      const code = createCode();
      const expiresAt = new Date(now.getTime() + codeTtlMs).toISOString();
      const { error } = await admin.from("student_email_change_requests").insert({
        id: requestId,
        user_id: user.id,
        student_id: student.id,
        current_email: currentEmail,
        current_code_hash: hashCode(requestId, code),
        expires_at: expiresAt,
      });
      if (error) throw new ApiError(error.message, 500);

      await sendCodeEmail(currentEmail, code, "current");
      await logAudit(admin, {
        userId: user.id,
        action: "INSERT",
        entity: "student_email_change_requests",
        entityId: requestId,
        details: { phase: "current_email_code_sent", student_id: student.id },
        ip: getClientIp(request),
      });

      return Response.json({ requestId, currentEmail, expiresAt });
    }

    if (action === "verify_current") {
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      const code = normalizeCode(body.code);
      const newEmail = normalizeEmail(body.newEmail);
      if (!requestId || code.length !== 6) throw new ApiError("Informe o codigo recebido no e-mail atual.", 400);
      if (!newEmail.includes("@")) throw new ApiError("Informe um novo e-mail valido.", 400);

      const row = await getRequest(admin, requestId, user.id);
      if (row.status !== "awaiting_current") throw new ApiError("Esta etapa ja foi concluida. Continue com o codigo do novo e-mail.", 400);
      if (hashCode(requestId, code) !== row.current_code_hash) {
        await bumpAttempts(admin, requestId);
        throw new ApiError("Codigo do e-mail atual invalido.", 400);
      }
      if (newEmail === normalizeEmail(row.current_email)) throw new ApiError("O novo e-mail precisa ser diferente do atual.", 400);

      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", newEmail)
        .maybeSingle();
      if (existingProfile?.id && existingProfile.id !== user.id) throw new ApiError("Este e-mail ja esta em uso.", 409);

      const newCode = createCode();
      const expiresAt = new Date(Date.now() + codeTtlMs).toISOString();
      const { error } = await admin
        .from("student_email_change_requests")
        .update({
          new_email: newEmail,
          new_code_hash: hashCode(requestId, newCode),
          current_verified_at: new Date().toISOString(),
          status: "awaiting_new",
          attempts: 0,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (error) throw new ApiError(error.message, 500);

      await sendCodeEmail(newEmail, newCode, "new");
      await logAudit(admin, {
        userId: user.id,
        action: "UPDATE",
        entity: "student_email_change_requests",
        entityId: requestId,
        details: { phase: "new_email_code_sent", student_id: student.id },
        ip: getClientIp(request),
      });

      return Response.json({ requestId, newEmail, expiresAt });
    }

    if (action === "verify_new") {
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      const code = normalizeCode(body.code);
      if (!requestId || code.length !== 6) throw new ApiError("Informe o codigo recebido no novo e-mail.", 400);

      const row = await getRequest(admin, requestId, user.id);
      if (row.status !== "awaiting_new" || !row.new_email || !row.new_code_hash) throw new ApiError("Confirme o e-mail atual antes de concluir.", 400);
      if (hashCode(requestId, code) !== row.new_code_hash) {
        await bumpAttempts(admin, requestId);
        throw new ApiError("Codigo do novo e-mail invalido.", 400);
      }

      const newEmail = normalizeEmail(row.new_email);
      const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
        email: newEmail,
        email_confirm: true,
      } as any);
      if (authError) throw new ApiError(authError.message, 500);

      const [{ error: profileError }, { error: studentError }, { error: requestError }] = await Promise.all([
        admin.from("profiles").update({ email: newEmail }).eq("id", user.id),
        admin.from("students").update({ email: newEmail, updated_at: new Date().toISOString() }).eq("id", student.id),
        admin.from("student_email_change_requests").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", requestId),
      ]);
      if (profileError || studentError || requestError) {
        throw new ApiError(profileError?.message || studentError?.message || requestError?.message || "Nao foi possivel atualizar o e-mail.", 500);
      }

      await logAudit(admin, {
        userId: user.id,
        action: "UPDATE",
        entity: "profiles",
        entityId: user.id,
        details: { field: "email", old_email: row.current_email, new_email: newEmail, student_id: student.id },
        ip: getClientIp(request),
      });

      return Response.json({ email: newEmail });
    }

    throw new ApiError("Acao invalida.", 400);
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
