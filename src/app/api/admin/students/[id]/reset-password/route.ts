import { sendMail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;

    const { data: student, error } = await admin
      .from("students")
      .select("id, full_name, email, profile_id")
      .eq("id", id)
      .single();

    if (error || !student) throw new ApiError("Aluno não encontrado.", 404);
    if (!student.email) throw new ApiError("O aluno não possui um e-mail cadastrado.", 400);
    if (!student.profile_id) throw new ApiError("O portal deste aluno ainda não foi liberado.", 400);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: student.email,
      options: { redirectTo: "https://corpoeevolucao.vercel.app/reset-password" },
    });

    if (linkError) {
      throw new ApiError(`Erro ao gerar link de recuperação: ${linkError.message}`, 400);
    }

    let actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      throw new ApiError("O serviço de autenticação não retornou um link válido.", 500);
    }

    // Force the link to be production if it was generated with localhost
    if (actionLink.includes("localhost")) {
      actionLink = actionLink.replace(/http:\/\/localhost:\d+/, "https://corpoeevolucao.vercel.app");
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e3e8f0; border-radius: 16px; overflow: hidden;">
        <div style="background-color: #1a73e8; padding: 32px 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Redefinição de Senha</h1>
        </div>
        <div style="padding: 32px 24px; background-color: white;">
          <p style="margin-top: 0; color: #172033; font-size: 16px;">Olá, <strong>${student.full_name}</strong>!</p>
          <p style="color: #657085; line-height: 1.6;">Recebemos um pedido para redefinir a senha do seu Portal do Aluno no Studio Corpo & Evolução.</p>
          <p style="color: #657085; line-height: 1.6;">Clique no botão abaixo para escolher sua nova senha de acesso:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${actionLink}" style="display: inline-block; background-color: #1a73e8; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">Redefinir minha senha</a>
          </div>
          <p style="color: #8d97aa; font-size: 13px; line-height: 1.5; margin-bottom: 0;">Se você não solicitou esta alteração, pode ignorar este e-mail em segurança.</p>
        </div>
      </div>
    `;

    await sendMail(student.email, "Redefinição de Senha - Portal do Aluno", html);

    return Response.json({ email: student.email });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
