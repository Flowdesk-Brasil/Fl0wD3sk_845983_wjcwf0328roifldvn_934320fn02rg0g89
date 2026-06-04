import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;
    const { data: student, error } = await admin.from("students").select("id, full_name, email, profile_id").eq("id", id).single();
    if (error || !student) throw new ApiError("Aluno não encontrado.", 404);
    if (!student.email) throw new ApiError("Cadastre o e-mail do aluno antes de liberar o portal.");

    let profileId = student.profile_id as string | null;
    if (!profileId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: student.email,
        email_confirm: true,
        user_metadata: { full_name: student.full_name },
      });
      if (created.user) profileId = created.user.id;
      if (createError && !createError.message.toLowerCase().includes("already")) throw createError;
      if (!profileId) {
        const { data: existing } = await admin.from("profiles").select("id").eq("email", student.email).single();
        profileId = existing?.id || null;
      }
      if (!profileId) throw new ApiError("Não foi possível vincular o aluno ao portal.", 500);
      await admin.from("profiles").update({ role: "student", active: true, full_name: student.full_name }).eq("id", profileId);
      await admin.from("students").update({ profile_id: profileId }).eq("id", student.id);
    }

    const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: student.email,
      options: { redirectTo: `${origin}/portal` },
    });
    if (linkError || !linkData.properties?.action_link) throw new ApiError("Não foi possível gerar o link de acesso.", 500);
    await sendStudioEmail({
      to: student.email,
      subject: "Corpo & Evolução | Acesso ao portal do aluno",
      title: "Seu portal do aluno foi liberado",
      intro: `Olá, ${student.full_name}. Use o botão abaixo para acessar seu QR Code, agenda, contratos e pagamentos.`,
      action: { label: "Acessar portal do aluno", href: linkData.properties.action_link },
      sections: [{ label: "Conta", value: student.email }],
      footer: "O link é pessoal. Não compartilhe com terceiros.",
    });
    return Response.json({ ok: true, email: student.email, profileId });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
