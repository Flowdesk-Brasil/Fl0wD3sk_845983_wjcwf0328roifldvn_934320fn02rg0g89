import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

export async function GET(request: Request) {
  try {
    const { admin, user } = await requireRole(request, ["student"]);
    const { data: student, error } = await admin.from("students").select("*").eq("profile_id", user.id).single();
    if (error || !student) throw new ApiError("Cadastro de aluno não vinculado ao portal.", 404);
    const [{ data: bookings }, { data: payments }, { data: contracts }] = await Promise.all([
      admin.from("class_bookings").select("id, status, session:class_sessions(id, start_at, end_at, status, class_type:class_types(name, color), instructor:profiles(full_name))").eq("student_id", student.id).neq("status", "cancelled").order("created_at", { ascending: false }),
      admin.from("payments").select("id, reference, total_amount, status, due_date, paid_at").eq("student_id", student.id).order("due_date", { ascending: false }).limit(12),
      admin.from("contracts").select("id, status, signed_at, created_at, plan:plans(name)").eq("student_id", student.id).order("created_at", { ascending: false }).limit(12),
    ]);
    return Response.json({ student, bookings: bookings || [], payments: payments || [], contracts: contracts || [] });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
