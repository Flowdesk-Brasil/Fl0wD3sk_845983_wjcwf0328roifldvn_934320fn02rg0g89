import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole, getClientIp, logAudit } from "@/lib/server/supabase-admin";
import {
  createPasswordSetupLink,
  ensurePendingContractForStudent,
  ensureStudentPortalAccount,
  resolveAppOrigin,
} from "@/lib/server/student-onboarding";

/**
 * POST /api/admin/students/[id]/onboard
 *
 * Fluxo unico:
 * 1. cria/vincula conta do portal;
 * 2. garante contrato pendente para a matricula ativa;
 * 3. envia um unico link para criar senha e abrir o portal.
 *
 * No primeiro acesso ao portal, o aluno fica bloqueado na assinatura do
 * contrato pendente antes de ver QR Code, aulas ou financeiro.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile: operator } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;
    const ip = getClientIp(request);

    const { data: student, error } = await admin
      .from("students")
      .select("id, full_name, email, profile_id")
      .eq("id", id)
      .single();
    if (error || !student) throw new ApiError("Aluno nao encontrado.", 404);
    if (!student.email) throw new ApiError("Cadastre o e-mail do aluno antes de iniciar o onboarding.", 400);

    const { profileId, created: portalCreated } = await ensureStudentPortalAccount(admin, student);
    const origin = resolveAppOrigin(request);
    const pendingContract = await ensurePendingContractForStudent(admin, student.id);
    const planName = pendingContract?.planName || "Plano contratado";
    const passwordResetUrl = await createPasswordSetupLink(admin, student.email, origin, `${origin}/portal`);

    const sections = [
      { label: "Aluno", value: student.full_name },
      { label: "Login", value: student.email },
    ];
    if (pendingContract) sections.push({ label: "Plano", value: planName });

    const intro = pendingContract
      ? `Ola, ${student.full_name}! Seu acesso ao Corpo & Evolucao foi liberado. Clique no botao abaixo para criar sua senha. Depois de salvar a senha, voce sera levado ao portal do aluno e o contrato do plano ${planName} ficara pendente de assinatura antes da liberacao completa.`
      : `Ola, ${student.full_name}! Seu portal do aluno foi liberado. Clique no botao abaixo para criar sua senha e acessar seu QR Code, agenda de aulas, financeiro e contratos.`;

    await sendStudioEmail({
      to: student.email,
      subject: pendingContract
        ? "Corpo & Evolucao | Crie sua senha e assine seu contrato"
        : "Corpo & Evolucao | Acesso ao portal do aluno",
      title: pendingContract
        ? "Crie sua senha e assine seu contrato"
        : "Seu portal do aluno foi liberado",
      intro,
      action: { label: pendingContract ? "Criar senha e abrir portal" : "Criar minha senha", href: passwordResetUrl },
      sections,
      footer: "O link e pessoal e expira em 7 dias. Nao compartilhe com terceiros.",
    });

    if (pendingContract) {
      await admin.from("contracts").update({ sent_at: new Date().toISOString() }).eq("id", pendingContract.id);
    }

    await logAudit(admin, {
      userId: operator.id,
      action: "INSERT",
      entity: "onboarding",
      entityId: student.id,
      details: {
        student_name: student.full_name,
        email: student.email,
        portal_created: portalCreated,
        contract_created: pendingContract?.created || false,
        contract_pending: Boolean(pendingContract),
      },
      ip,
    });

    return Response.json({
      ok: true,
      email: student.email,
      profileId,
      contractSent: false,
      contractPending: Boolean(pendingContract),
      contractCreated: pendingContract?.created || false,
    });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
