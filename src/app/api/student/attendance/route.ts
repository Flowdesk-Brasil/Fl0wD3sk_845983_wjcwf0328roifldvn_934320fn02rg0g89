import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";
import { updateStudentAttendanceStatus } from "@/lib/server/class-attendance";
import type { ClassAttendance } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { admin, user } = await requireRole(request, ["student"]);
    const body = await request.json() as {
      attendanceId?: unknown;
      classScheduleId?: unknown;
      date?: unknown;
      status?: unknown;
    };

    const { data: student, error } = await admin
      .from("students")
      .select("id")
      .eq("profile_id", user.id)
      .single();
    if (error || !student) throw new ApiError("Cadastro de aluno nao vinculado ao portal.", 404);

    const status = typeof body.status === "string" ? body.status : "";
    if (!["confirmed", "cancelled", "attended", "missed", "pending"].includes(status)) {
      throw new ApiError("Status de presenca invalido.", 400);
    }

    const attendance = await updateStudentAttendanceStatus(admin, student.id, {
      attendanceId: typeof body.attendanceId === "string" ? body.attendanceId : null,
      classScheduleId: typeof body.classScheduleId === "string" ? body.classScheduleId : null,
      date: typeof body.date === "string" ? body.date : null,
      status: status as ClassAttendance["status"],
    });

    return Response.json(attendance);
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
