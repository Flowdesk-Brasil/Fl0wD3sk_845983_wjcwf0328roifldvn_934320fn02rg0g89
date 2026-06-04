import { sendStudioEmail } from "@/lib/server/mail";
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

    const actionUrl = new URL(actionLink);
    const token = actionUrl.searchParams.get("token") || actionUrl.searchParams.get("token_hash");
    const finalLink = token 
      ? `https://corpoeevolucao.vercel.app/reset-password?token=${token}`
      : `https://corpoeevolucao.vercel.app/reset-password`;

    await sendStudioEmail({
      to: student.email,
      subject: "Redefinição de Senha - Portal do Aluno",
      title: "Redefinição de Senha",
      intro: `Olá, ${student.full_name}! Recebemos um pedido para redefinir a senha do seu Portal do Aluno no Studio Corpo & Evolução. Clique no botão abaixo para escolher sua nova senha de acesso:`,
      action: { label: "Redefinir minha senha", href: finalLink },
      footer: "Se você não solicitou esta alteração, pode ignorar este e-mail em segurança.",
    });

    return Response.json({ email: student.email });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
