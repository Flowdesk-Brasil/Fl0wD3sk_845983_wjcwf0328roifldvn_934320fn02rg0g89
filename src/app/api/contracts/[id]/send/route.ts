import crypto from "node:crypto";
import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;
    const { data: contract, error } = await admin
      .from("contracts")
      .select("id, status, student:students(id, full_name, email), plan:plans(name)")
      .eq("id", id)
      .single();
    if (error || !contract) throw new ApiError("Contrato não encontrado.", 404);
    if (contract.status === "signed") throw new ApiError("Este contrato já está assinado.", 409);

    const student = Array.isArray(contract.student) ? contract.student[0] : contract.student;
    const plan = Array.isArray(contract.plan) ? contract.plan[0] : contract.plan;
    if (!student?.email) throw new ApiError("Cadastre um e-mail válido para o aluno antes de enviar.", 400);

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("contract_signing_requests").update({ used_at: new Date().toISOString() }).eq("contract_id", id).is("used_at", null);
    const { data: signingRequest, error: signingError } = await admin
      .from("contract_signing_requests")
      .insert({ contract_id: id, token_hash: hashToken(rawToken), expires_at: expiresAt })
      .select("id")
      .single();
    if (signingError || !signingRequest) throw new ApiError("A migração operacional ainda não foi aplicada. Execute database/migrations/002_studio_operations.sql.", 503);

    let origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (!origin && process.env.VERCEL_URL) origin = `https://${process.env.VERCEL_URL}`;
    if (!origin) origin = new URL(request.url).origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      origin = "https://corpoeevolucao.vercel.app";
    }
    origin = origin.replace(/\/+$/, "");
    const link = `${origin}/assinar/${rawToken}`;
    try {
      await sendStudioEmail({
        to: student.email,
        subject: "Corpo & Evolução | Contrato disponível para assinatura",
        title: "Seu contrato está pronto para assinatura",
        intro: `Olá, ${student.full_name}. Revise o contrato do seu plano e confirme a assinatura usando seu CPF.`,
        sections: [
          { label: "Aluno", value: student.full_name },
          { label: "Plano", value: plan?.name || "Plano contratado" },
          { label: "Prazo do link", value: "7 dias" },
        ],
        action: { label: "Revisar e assinar contrato", href: link },
        footer: "Não compartilhe este link. Ele é individual e expira automaticamente.",
      });
    } catch (mailError) {
      await admin.from("contract_signing_requests").delete().eq("id", signingRequest.id);
      throw mailError;
    }
    await admin.from("contracts").update({ sent_at: new Date().toISOString() }).eq("id", id);
    return Response.json({ ok: true, sentTo: student.email });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
