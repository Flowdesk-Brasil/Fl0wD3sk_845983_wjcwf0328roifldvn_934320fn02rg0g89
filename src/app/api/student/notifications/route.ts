import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

type MarkReadBody = {
  notificationIds?: unknown;
  markAll?: unknown;
};

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))];
}

export async function PATCH(request: Request) {
  try {
    const { admin, user } = await requireRole(request, ["student"]);
    const body = await request.json().catch(() => ({})) as MarkReadBody;

    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (studentError || !student) throw new ApiError("Cadastro de aluno nao vinculado ao portal.", 404);

    const requestedIds = normalizeIds(body.notificationIds);
    const markAll = body.markAll === true;
    if (!markAll && !requestedIds.length) throw new ApiError("Selecione ao menos uma notificacao para marcar como lida.", 400);

    let query = admin
      .from("notifications")
      .select("id")
      .or(`target_type.eq.all,target_id.eq.${student.id}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!markAll) query = query.in("id", requestedIds);

    const { data: allowedNotifications, error: notificationError } = await query;
    if (notificationError) throw new ApiError(`Nao foi possivel validar notificacoes: ${notificationError.message}`, 500);

    const notificationIds = (allowedNotifications || []).map((notification: { id: string }) => notification.id);
    if (!notificationIds.length) return Response.json({ success: true, readIds: [] });

    const now = new Date().toISOString();
    const { error: readError } = await admin
      .from("student_notification_reads")
      .upsert(
        notificationIds.map((notificationId: string) => ({
          student_id: student.id,
          notification_id: notificationId,
          read_at: now,
        })),
        { onConflict: "student_id,notification_id" },
      );

    if (readError) {
      throw new ApiError(`Nao foi possivel marcar como lida. Aplique a migration student_notification_reads. Detalhe: ${readError.message}`, 500);
    }

    return Response.json({ success: true, readIds: notificationIds });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
