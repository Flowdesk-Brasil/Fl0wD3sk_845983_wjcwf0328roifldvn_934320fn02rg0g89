import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

const recentLocks = new Map<string, number>();

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const { admin } = await requireRole(request, ["admin", "receptionist", "professor"]);
    const body = await request.json() as { code?: unknown; unit?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim().slice(0, 100) : "Matriz";
    if (!code) throw new ApiError("Informe o codigo do aluno.");

    let studentQuery = await admin.from("students").select("*").eq("qr_code", code).maybeSingle();
    if (!studentQuery.data && isUuid(code)) studentQuery = await admin.from("students").select("*").eq("id", code).maybeSingle();
    const student = studentQuery.data;

    const { data: enrollment } = student ? await admin.from("enrollments")
      .select("*, plan:plans(id, name, weekly_limit, duration_days, price)")
      .eq("student_id", student.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() : { data: null };

    const { data: payment } = enrollment ? await admin.from("payments")
      .select("*")
      .eq("enrollment_id", enrollment.id)
      .order("due_date", { ascending: false })
      .limit(1)
      .maybeSingle() : { data: null };

    const today = todayDate();
    const enrollmentExpired = Boolean(enrollment?.end_date && enrollment.end_date < today);
    const paymentPending = payment?.status === "pending";
    const paymentOverdue = Boolean(paymentPending && payment?.due_date && payment.due_date < today);

    if (enrollment?.id && enrollmentExpired) {
      await admin.from("enrollments").update({ status: "expired" }).eq("id", enrollment.id);
    }

    if (payment?.id && paymentOverdue) {
      await admin.from("payments").update({ status: "expired" }).eq("id", payment.id);
      payment.status = "expired";
    }

    const allowed = Boolean(
      student &&
      student.status === "active" &&
      enrollment &&
      !enrollmentExpired &&
      payment &&
      payment.status === "paid"
    );

    if (allowed && student) {
      const windowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recent } = await admin.from("checkins")
        .select("*")
        .eq("student_id", student.id)
        .eq("status", "allowed")
        .gte("checked_at", windowStart)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lockUntil = recentLocks.get(student.id) || 0;
      if (recent || lockUntil > Date.now()) {
        const existing = recent || { id: `duplicate-${student.id}`, student_id: student.id, enrollment_id: enrollment?.id, status: "allowed", unit, checked_at: new Date().toISOString() };
        return Response.json({
          ...existing,
          student,
          enrollment,
          payment,
          duplicate: true,
          reason: "Check-in ja confirmado nos ultimos 5 minutos. Nenhum novo registro foi criado.",
        });
      }
      recentLocks.set(student.id, Date.now() + 5 * 60 * 1000);
    }

    const reason = !student
      ? "Codigo nao encontrado."
      : student.status !== "active"
        ? "Aluno inativo ou bloqueado."
        : !enrollment
          ? "Aluno sem matricula ativa."
          : enrollmentExpired
            ? "Matricula expirada. Renove o plano antes de liberar a catraca."
            : !payment
              ? "Nenhum pagamento encontrado para esta matricula. Regularize na recepcao."
              : payment.status === "expired"
                ? "Pagamento expirado ou vencido. Acesso bloqueado ate regularizacao."
                : payment.status === "pending"
                  ? "Pagamento pendente. Receba o pagamento na recepcao antes de liberar a catraca."
                  : payment.status !== "paid"
                    ? "Pagamento nao confirmado. Acesso bloqueado."
                    : null;

    const { data: checkin, error } = await admin.from("checkins").insert({
      student_id: student?.id || null,
      enrollment_id: enrollment?.id || null,
      status: allowed ? "allowed" : "denied",
      reason,
      unit,
    }).select("*").single();
    if (error || !checkin) {
      if (student) recentLocks.delete(student.id);
      throw new ApiError("Nao foi possivel registrar o check-in.", 500);
    }

    return Response.json({ ...checkin, student, enrollment, payment, duplicate: false }, { status: 201 });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
