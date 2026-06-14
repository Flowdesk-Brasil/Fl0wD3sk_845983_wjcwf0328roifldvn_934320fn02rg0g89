import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";
import { ensureAttendancesForDate } from "@/lib/server/class-attendance";

export async function GET(request: Request) {
  try {
    const { admin } = await requireRole(request, ["admin", "receptionist", "professor"]);
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ApiError("Data invalida.", 400);
    }

    const attendances = await ensureAttendancesForDate(admin, date);
    return Response.json({ attendances });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
