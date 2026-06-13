import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";
import { createPasswordSetupLink, resolveAppOrigin } from "@/lib/server/student-onboarding";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;

    const { data: student, error } = await admin
      .from("students")
      .select("id, full_name, email, profile_id")
      .eq("id", id)
      .single();

    if (error || !student) throw new ApiError("Aluno nao encontrado.", 404);
    if (!student.email) throw new ApiError("O aluno nao possui um e-mail cadastrado.", 400);
    if (!student.profile_id) throw new ApiError("O portal deste aluno ainda nao foi liberado.", 400);

    const resetLink = await createPasswordSetupLink(admin, student.email, resolveAppOrigin(request), `${resolveAppOrigin(request)}/portal`);

    await sendStudioEmail({
      to: student.email,
      subject: "Redefinicao de Senha - Portal do Aluno",
      title: "Redefinicao de Senha",
      intro: `Ola, ${student.full_name}! Recebemos um pedido para redefinir a senha do seu Portal do Aluno no Studio Corpo & Evolucao. Clique no botao abaixo para escolher sua nova senha de acesso:`,
      action: { label: "Redefinir minha senha", href: resetLink },
      footer: "Se voce nao solicitou esta alteracao, pode ignorar este e-mail em seguranca.",
    });

    return Response.json({ email: student.email });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
