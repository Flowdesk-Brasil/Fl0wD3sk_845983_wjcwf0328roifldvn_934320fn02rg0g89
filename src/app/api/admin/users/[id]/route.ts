import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, user } = await requireRole(request, ["admin"]);
    const { id } = await context.params;
    if (!id) throw new ApiError("Usuário inválido.");
    if (id === user.id) throw new ApiError("Você não pode remover o próprio acesso.", 409);

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new ApiError(error.message, 400);
    return Response.json({ ok: true });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
