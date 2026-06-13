import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole, getClientIp, logAudit } from "@/lib/server/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile: operator } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;
    const ip = getClientIp(request);
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

    let origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (!origin && process.env.VERCEL_URL) origin = `https://${process.env.VERCEL_URL}`;
    if (!origin) origin = new URL(request.url).origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) origin = "https://corpoeevolucao.vercel.app";
    origin = origin.replace(/\/+$/, "");

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: student.email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    
    if (linkError || !linkData.properties?.action_link) throw new ApiError("Não foi possível gerar o link de acesso.", 500);
    
    const actionUrl = new URL(linkData.properties.action_link);
    const token = actionUrl.searchParams.get("token") || actionUrl.searchParams.get("token_hash");
    const finalLink = token 
      ? `https://corpoeevolucao.vercel.app/reset-password?token=${token}`
      : `https://corpoeevolucao.vercel.app/reset-password`;

    await sendStudioEmail({
      to: student.email,
      subject: "Corpo & Evolução | Acesso ao portal do aluno",
      title: "Seu portal do aluno foi liberado",
      intro: `Olá, ${student.full_name}. Seu portal acaba de ser criado! Para começar a usar e ver seu QR Code, agenda e contratos, você precisa cadastrar a sua senha.`,
      action: { label: "Criar minha senha", href: finalLink },
      sections: [{ label: "Login", value: student.email }],
      footer: "O link é pessoal. Após criar a senha, você poderá acessar o portal normalmente.",
    });

    // Audit log
    await logAudit(admin, {
      userId: operator.id,
      action: "INSERT",
      entity: "portal_access",
      entityId: student.id,
      details: {
        student_name: student.full_name,
        email: student.email,
        portal_created: !student.profile_id,
      },
      ip,
    });

    return Response.json({ ok: true, email: student.email, profileId });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
