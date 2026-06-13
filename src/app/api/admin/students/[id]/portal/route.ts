import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole, getClientIp, logAudit } from "@/lib/server/supabase-admin";
import {
  createContractSigningLink,
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
    const contractSigningUrl = pendingContract
      ? await createContractSigningLink(admin, pendingContract.id, origin)
      : null;
    const passwordLink = await createPasswordSetupLink(admin, student.email, origin, contractSigningUrl);

    await sendStudioEmail({
      to: student.email,
      subject: contractSigningUrl
        ? "Corpo & Evolucao | Acesso ao portal e contrato pendente"
        : "Corpo & Evolucao | Acesso ao portal do aluno",
      title: contractSigningUrl
        ? "Crie sua senha e assine seu contrato"
        : "Seu portal do aluno foi liberado",
      intro: contractSigningUrl
        ? `Ola, ${student.full_name}. Crie sua senha de acesso e assine o contrato pendente para liberar o portal do aluno.`
        : `Ola, ${student.full_name}. Seu portal acaba de ser criado. Cadastre sua senha para acessar QR Code, agenda, financeiro e contratos.`,
      action: { label: contractSigningUrl ? "Criar senha e assinar contrato" : "Criar minha senha", href: passwordLink },
      sections: [
        { label: "Login", value: student.email },
        { label: "Contrato", value: contractSigningUrl ? "Pendente de assinatura" : "Sem pendencia" },
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
        contract_sent: Boolean(contractSigningUrl),
      },
      ip,
    });

    return Response.json({
      ok: true,
      email: student.email,
      profileId,
      contractSent: Boolean(contractSigningUrl),
      contractCreated: pendingContract?.created || false,
    });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
