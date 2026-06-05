import { createMercadoPagoPix } from "@/lib/server/mercado-pago";
import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;
    
    // Fetch Sale
    const { data: sale, error } = await admin
      .from("sales")
      .select("id, total_amount, status")
      .eq("id", id)
      .single();
      
    if (error || !sale) throw new ApiError("Venda PDV não encontrada.", 404);
    if (sale.status === "completed") throw new ApiError("Esta venda já está concluída.", 409);

    let origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (!origin && process.env.VERCEL_URL) origin = `https://${process.env.VERCEL_URL}`;
    if (!origin) origin = new URL(request.url).origin;
    
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      origin = "https://corpoeevolucao.vercel.app";
    }
    
    origin = origin.replace(/\/+$/, "");
    
    const webhookToken = process.env.MERCADO_PAGO_WEBHOOK_TOKEN?.trim();
    const notificationUrl = `${origin}/api/webhooks/mercado-pago${webhookToken ? `?token=${encodeURIComponent(webhookToken)}` : ""}`;
    let provider;
    try {
      provider = await createMercadoPagoPix({
        paymentId: `SALE-${sale.id}`, // Custom prefix to differentiate from subscriptions
        amount: Number(sale.total_amount),
        description: `Venda Caixa Livre PDV - Corpo & Evolução`,
        payerName: "Cliente Balcão PDV",
        payerEmail: "caixa@corpoeevolucao.com.br", // Default fallback email for MP
        payerCpf: "00000000000", // Fallback CPF
        notificationUrl,
      });
    } catch (mpError: any) {
      const errorMsg = mpError instanceof Error ? mpError.message : String(mpError);
      throw new ApiError(`Erro Mercado Pago: ${errorMsg}`, 400);
    }
    
    const transaction = provider.point_of_interaction?.transaction_data;
    
    // We update the sale row to pending/pix, but we return the pix data in the object without trying to save to non-existent DB columns
    const { data: updated, error: updateError } = await admin.from("sales").update({
      status: "pending",
      payment_method: "pix"
    }).eq("id", sale.id).select("*").single();
    
    if (updateError || !updated) throw new ApiError("Erro ao salvar dados do PIX na venda.", 503);
    
    updated.pix_code = transaction?.qr_code || null;
    updated.pix_qr_base64 = transaction?.qr_code_base64 || null;
    
    return Response.json({ sale: updated });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
