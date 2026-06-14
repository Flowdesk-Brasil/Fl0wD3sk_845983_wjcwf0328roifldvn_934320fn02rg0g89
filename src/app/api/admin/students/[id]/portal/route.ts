import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole, getClientIp, logAudit } from "@/lib/server/supabase-admin";
import {
  createPasswordSetupLink,
  ensurePendingContractForStudent,
  ensureStudentPortalAccount,
  resolveAppOrigin,
} from "@/lib/server/student-onboarding";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile: operator } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;
    const ip = getClientIp(request);
    const { data: student, error } = await admin.from("students").select("id, full_name, email, profile_id").eq("id", id).single();
    if (error || !student) throw new ApiError("Aluno nao encontrado.", 404);
    if (!student.email) throw new ApiError("Cadastre o e-mail do aluno antes de liberar o portal.", 400);

    const { profileId, created: portalCreated } = await ensureStudentPortalAccount(admin, student);
    const origin = resolveAppOrigin(request);
    const pendingContract = await ensurePendingContractForStudent(admin, student.id);
    const passwordLink = await createPasswordSetupLink(admin, student.email, origin, `${origin}/portal`);

    await sendStudioEmail({
      to: student.email,
      subject: pendingContract
        ? "Corpo & Evolucao | Acesso ao portal e contrato pendente"
        : "Corpo & Evolucao | Acesso ao portal do aluno",
      title: pendingContract
        ? "Crie sua senha e assine seu contrato"
        : "Seu portal do aluno foi liberado",
      intro: pendingContract
        ? `Ola, ${student.full_name}. Crie sua senha de acesso. No primeiro acesso ao portal do aluno, o contrato pendente sera exibido para assinatura antes da liberacao completa.`
        : `Ola, ${student.full_name}. Seu portal acaba de ser criado. Cadastre sua senha para acessar QR Code, agenda, financeiro e contratos.`,
      action: { label: pendingContract ? "Criar senha e abrir portal" : "Criar minha senha", href: passwordLink },
      sections: [
        { label: "Login", value: student.email },
        { label: "Contrato", value: pendingContract ? "Pendente de assinatura no portal" : "Sem pendencia" },
      ],
      footer: "O link e pessoal. Depois de criar a senha, use seu e-mail para entrar no portal.",
    });

    if (pendingContract) {
      await admin.from("contracts").update({ sent_at: new Date().toISOString() }).eq("id", pendingContract.id);
    }

    await logAudit(admin, {
      userId: operator.id,
      action: "INSERT",
      entity: "portal_access",
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
