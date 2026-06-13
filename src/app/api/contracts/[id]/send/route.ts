import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole, getClientIp, logAudit } from "@/lib/server/supabase-admin";
import { createContractSigningLink, resolveAppOrigin } from "@/lib/server/student-onboarding";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile: operator } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;
    const ip = getClientIp(request);
    const { data: contract, error } = await admin
      .from("contracts")
      .select("id, status, student:students(id, full_name, email), plan:plans(name)")
      .eq("id", id)
      .single();
    if (error || !contract) throw new ApiError("Contrato nao encontrado.", 404);
    if (contract.status === "signed") throw new ApiError("Este contrato ja esta assinado.", 409);

    const student = Array.isArray(contract.student) ? contract.student[0] : contract.student;
    const plan = Array.isArray(contract.plan) ? contract.plan[0] : contract.plan;
    if (!student?.email) throw new ApiError("Cadastre um e-mail valido para o aluno antes de enviar.", 400);

    const link = await createContractSigningLink(admin, id, resolveAppOrigin(request));
    try {
      await sendStudioEmail({
        to: student.email,
        subject: "Corpo & Evolucao | Contrato disponivel para assinatura",
        title: "Seu contrato esta pronto para assinatura",
        intro: `Ola, ${student.full_name}. Revise o contrato do seu plano e confirme a assinatura usando seu CPF.`,
        sections: [
          { label: "Aluno", value: student.full_name },
          { label: "Plano", value: plan?.name || "Plano contratado" },
          { label: "Prazo do link", value: "7 dias" },
        ],
        action: { label: "Revisar e assinar contrato", href: link },
        footer: "Nao compartilhe este link. Ele e individual e expira automaticamente.",
      });
    } catch (mailError) {
      throw mailError;
    }
    await admin.from("contracts").update({ sent_at: new Date().toISOString() }).eq("id", id);

    await logAudit(admin, {
      userId: operator.id,
      action: "UPDATE",
      entity: "contracts",
      entityId: id,
      details: {
        action: "contract_sent_for_signature",
        student_name: student.full_name,
        plan: plan?.name,
        sent_to: student.email,
      },
      ip,
    });

    return Response.json({ ok: true, sentTo: student.email });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
