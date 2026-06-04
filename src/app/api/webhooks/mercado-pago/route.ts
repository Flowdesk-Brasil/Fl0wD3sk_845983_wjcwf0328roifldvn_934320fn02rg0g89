import { fetchMercadoPagoPayment, verifyMercadoPagoWebhook } from "@/lib/server/mercado-pago";
import { apiErrorResponse, ApiError, getAdminClient } from "@/lib/server/supabase-admin";

function paymentIdFrom(request: Request, body: unknown) {
  const url = new URL(request.url);
  const query = url.searchParams.get("data.id") || url.searchParams.get("id");
  if (query) return query;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const data = record.data as Record<string, unknown> | undefined;
    const id = data?.id ?? record.id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    let body: unknown = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    const providerId = paymentIdFrom(request, body);
    if (!verifyMercadoPagoWebhook(request, providerId)) throw new ApiError("Webhook não autorizado.", 401);
    if (!providerId) return Response.json({ ok: true, ignored: true });

    const provider = await fetchMercadoPagoPayment(providerId);
    const admin = getAdminClient();
    const externalReference = provider.external_reference?.trim();
    const validExternalReference = externalReference && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(externalReference) ? externalReference : null;
    const query = admin.from("payments").select("id, enrollment_id, student_id, total_amount").limit(1);
    const { data: rows } = validExternalReference
      ? await query.or(`id.eq.${validExternalReference},provider_payment_id.eq.${String(provider.id)}`)
      : await query.eq("provider_payment_id", String(provider.id));
    const payment = rows?.[0];
    if (!payment) return Response.json({ ok: true, ignored: true, reason: "payment_not_found" });
    if (provider.transaction_amount !== undefined && Math.abs(Number(payment.total_amount) - Number(provider.transaction_amount)) > 0.01) {
      throw new ApiError("Valor do pagamento não corresponde à cobrança.", 409);
    }

    const status = provider.status === "approved"
      ? "paid"
      : provider.status === "refunded" || provider.status === "charged_back"
        ? "refunded"
        : provider.status === "cancelled" || provider.status === "rejected"
          ? "cancelled"
          : "pending";
    await admin.from("payments").update({
      status,
      method: "pix",
      provider_payment_id: String(provider.id),
      provider_status: provider.status || null,
      paid_at: status === "paid" ? provider.date_approved || new Date().toISOString() : null,
    }).eq("id", payment.id);
    if (status === "paid") {
      await Promise.all([
        admin.from("enrollments").update({ status: "active" }).eq("id", payment.enrollment_id),
        admin.from("students").update({ status: "active" }).eq("id", payment.student_id),
      ]);
    }
    return Response.json({ ok: true, paymentId: payment.id, status });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
