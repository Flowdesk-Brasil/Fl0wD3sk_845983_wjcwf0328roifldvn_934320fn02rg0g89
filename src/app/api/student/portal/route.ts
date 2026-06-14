import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";
import { todayInBrasilia } from "@/lib/brazil-date";
import { ensureStudentAttendancesForDate } from "@/lib/server/class-attendance";
import { createContractSigningLink, ensurePendingContractForStudent, resolveAppOrigin } from "@/lib/server/student-onboarding";

export async function GET(request: Request) {
  try {
    const { admin, user } = await requireRole(request, ["student"]);
    const { data: student, error } = await admin
      .from("students")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    if (error || !student) throw new ApiError("Cadastro de aluno nao vinculado ao portal.", 404);
    await ensurePendingContractForStudent(admin, student.id);

    const dateStr = todayInBrasilia();
    const [
      attendances,
      { data: payments },
      { data: contracts },
    ] = await Promise.all([
      ensureStudentAttendancesForDate(admin, student.id, dateStr),
      admin
        .from("payments")
        .select("id, reference, total_amount, status, due_date, paid_at, pix_code, pix_qr_base64")
        .eq("student_id", student.id)
        .order("due_date", { ascending: false })
        .limit(12),
      admin
        .from("contracts")
        .select("id, status, signed_at, created_at, plan:plans(name)")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const pendingContract = (contracts || []).find((contract: any) => contract.status === "pending") ?? null;
    const requiredContract = pendingContract
      ? {
          id: pendingContract.id,
          plan: pendingContract.plan ?? null,
          created_at: pendingContract.created_at,
          signingUrl: await createContractSigningLink(admin, pendingContract.id, resolveAppOrigin(request)),
        }
      : null;

    return Response.json({
      student,
      attendances,
      payments: payments || [],
      contracts: contracts || [],
      requiredContract,
    });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
