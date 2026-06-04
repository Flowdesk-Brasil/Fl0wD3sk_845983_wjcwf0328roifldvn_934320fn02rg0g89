import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

const recentLocks = new Map<string, number>();

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const { admin } = await requireRole(request, ["admin", "receptionist", "professor"]);
    const body = await request.json() as { code?: unknown; unit?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim().slice(0, 100) : "Matriz";
    if (!code) throw new ApiError("Informe o código do aluno.");

    let studentQuery = await admin.from("students").select("*").eq("qr_code", code).maybeSingle();
    if (!studentQuery.data && isUuid(code)) studentQuery = await admin.from("students").select("*").eq("id", code).maybeSingle();
    const student = studentQuery.data;
    
    // Buscar matrícula ativa COM dados do plano
    const { data: enrollment } = student ? await admin.from("enrollments")
      .select("*, plan:plans(id, name, weekly_limit, duration_days, price)")
      .eq("student_id", student.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() : { data: null };
    
    const allowed = Boolean(student && student.status === "active" && enrollment);

    if (allowed && student) {
      const windowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recent } = await admin.from("checkins").select("*").eq("student_id", student.id).eq("status", "allowed").gte("checked_at", windowStart).order("checked_at", { ascending: false }).limit(1).maybeSingle();
      const lockUntil = recentLocks.get(student.id) || 0;
      if (recent || lockUntil > Date.now()) {
        const existing = recent || { id: `duplicate-${student.id}`, student_id: student.id, enrollment_id: enrollment?.id, status: "allowed", unit, checked_at: new Date().toISOString() };
        return Response.json({ ...existing, student, enrollment, duplicate: true, reason: "Check-in já confirmado nos últimos 5 minutos. Nenhum novo registro foi criado." });
      }
      recentLocks.set(student.id, Date.now() + 5 * 60 * 1000);
    }

    const reason = !student
      ? "Código não encontrado."
      : student.status !== "active"
        ? "Aluno inativo ou bloqueado."
        : !enrollment
          ? "Aluno sem matrícula ativa."
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
      throw new ApiError("Não foi possível registrar o check-in.", 500);
    }
    return Response.json({ ...checkin, student, enrollment, duplicate: false }, { status: 201 });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
