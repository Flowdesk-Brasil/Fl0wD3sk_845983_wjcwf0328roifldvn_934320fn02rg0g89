import { createMercadoPagoPix } from "@/lib/server/mercado-pago";
import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile } = await requireRole(request, ["admin", "receptionist", "student"]);
    const { id } = await context.params;
    const { data: payment, error } = await admin
      .from("payments")
      .select("id, reference, total_amount, status, student:students(id, full_name, email, cpf, profile_id)")
      .eq("id", id)
      .single();
    if (error || !payment) throw new ApiError("Cobrança não encontrada.", 404);
    if (payment.status === "paid") throw new ApiError("Esta cobrança já está paga.", 409);
    const student = Array.isArray(payment.student) ? payment.student[0] : payment.student;
    
    if (profile.role === "student" && student?.profile_id !== profile.id) {
      throw new ApiError("Acesso negado. Esta cobrança pertence a outro aluno.", 403);
    }
    
    if (!student?.email || student.cpf.replace(/\D/g, "").length !== 11) throw new ApiError("O aluno precisa ter e-mail e CPF válidos para gerar o PIX.");

    let origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (!origin && process.env.VERCEL_URL) origin = `https://${process.env.VERCEL_URL}`;
    if (!origin) origin = new URL(request.url).origin;
    origin = origin.replace(/\/+$/, "");
    
    const webhookToken = process.env.MERCADO_PAGO_WEBHOOK_TOKEN?.trim();
    const notificationUrl = `${origin}/api/webhooks/mercado-pago${webhookToken ? `?token=${encodeURIComponent(webhookToken)}` : ""}`;
    let provider;
    try {
      provider = await createMercadoPagoPix({
        paymentId: payment.id,
        amount: Number(payment.total_amount),
        description: `Mensalidade ${payment.reference} - Corpo & Evolução`,
        payerName: student.full_name,
        payerEmail: student.email,
        payerCpf: student.cpf,
        notificationUrl,
      });
    } catch (mpError: any) {
      const errorMsg = mpError instanceof Error ? mpError.message : String(mpError);
      throw new ApiError(`Erro Mercado Pago: ${errorMsg} (URL Enviada: ${notificationUrl})`, 400);
    }
    const transaction = provider.point_of_interaction?.transaction_data;
    const { data: updated, error: updateError } = await admin.from("payments").update({
      status: "pending",
      method: "pix",
      provider_payment_id: String(provider.id),
      provider_status: provider.status || "pending",
      pix_code: transaction?.qr_code || null,
      pix_qr_base64: transaction?.qr_code_base64 || null,
      pix_ticket_url: transaction?.ticket_url || null,
    }).eq("id", payment.id).select("*").single();
    if (updateError || !updated) throw new ApiError("A migração operacional ainda não foi aplicada. Execute database/migrations/002_studio_operations.sql.", 503);
    return Response.json({ payment: updated });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
