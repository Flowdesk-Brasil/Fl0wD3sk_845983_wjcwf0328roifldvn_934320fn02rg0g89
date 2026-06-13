import crypto from "node:crypto";
import { sendStudioEmail } from "@/lib/server/mail";
import { apiErrorResponse, ApiError, requireRole, getClientIp, logAudit } from "@/lib/server/supabase-admin";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * POST /api/admin/students/[id]/onboard
 * 
 * Unified onboarding flow:
 * 1. Creates portal account (if needed)
 * 2. Generates password-reset link
 * 3. If student has a pending contract, creates a signing token
 * 4. Sends ONE email with password link that redirects to contract signing
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile: operator } = await requireRole(request, ["admin", "receptionist"]);
    const { id } = await context.params;
    const ip = getClientIp(request);

    // 1. Fetch student
    const { data: student, error } = await admin.from("students").select("id, full_name, email, profile_id").eq("id", id).single();
    if (error || !student) throw new ApiError("Aluno não encontrado.", 404);
    if (!student.email) throw new ApiError("Cadastre o e-mail do aluno antes de iniciar o onboarding.", 400);

    // 2. Create or find portal account
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

    // 3. Generate password-reset link
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

    // 4. Check for pending contract and create signing link
    const { data: pendingContract } = await admin.from("contracts")
      .select("id, plan:plans(name)")
      .eq("student_id", student.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let contractSigningUrl: string | null = null;
    let planName = "Plano contratado";

    if (pendingContract) {
      const plan = Array.isArray(pendingContract.plan) ? pendingContract.plan[0] : pendingContract.plan;
      planName = plan?.name || planName;
      
      // Create signing token
      const rawSigningToken = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from("contract_signing_requests").update({ used_at: new Date().toISOString() }).eq("contract_id", pendingContract.id).is("used_at", null);
      const { data: signingRequest } = await admin.from("contract_signing_requests")
        .insert({ contract_id: pendingContract.id, token_hash: hashToken(rawSigningToken), expires_at: expiresAt })
        .select("id")
        .single();
      if (signingRequest) {
        contractSigningUrl = `${origin}/assinar/${rawSigningToken}`;
      }
    }

    // 5. Build the redirect URL: password reset → then contract signing
    const passwordResetUrl = token
      ? `${origin}/reset-password?token=${token}${contractSigningUrl ? `&next=${encodeURIComponent(contractSigningUrl)}` : ""}`
      : `${origin}/reset-password`;

    // 6. Send unified email
    const sections = [
      { label: "Aluno", value: student.full_name },
      { label: "Login", value: student.email },
    ];
    if (pendingContract) {
      sections.push({ label: "Plano", value: planName });
    }

    const introText = contractSigningUrl
      ? `Olá, ${student.full_name}! Seu acesso ao Corpo & Evolução foi liberado. Clique no botão abaixo para criar sua senha — após definir, você será redirecionado automaticamente para assinar seu contrato do plano ${planName}.`
      : `Olá, ${student.full_name}! Seu portal do aluno foi liberado. Clique no botão abaixo para criar sua senha e acessar seu QR Code, agenda de aulas e contratos.`;

    await sendStudioEmail({
      to: student.email,
      subject: contractSigningUrl
        ? "Corpo & Evolução | Crie sua senha e assine seu contrato"
        : "Corpo & Evolução | Acesso ao portal do aluno",
      title: contractSigningUrl
        ? "Crie sua senha e assine seu contrato"
        : "Seu portal do aluno foi liberado",
      intro: introText,
      action: { label: contractSigningUrl ? "Criar senha e assinar contrato" : "Criar minha senha", href: passwordResetUrl },
      sections,
      footer: "O link é pessoal e expira em 7 dias. Não compartilhe com terceiros.",
    });

    if (pendingContract) {
      await admin.from("contracts").update({ sent_at: new Date().toISOString() }).eq("id", pendingContract.id);
    }

    // 7. Audit log
    await logAudit(admin, {
      userId: operator.id,
      action: "INSERT",
      entity: "onboarding",
      entityId: student.id,
      details: {
        student_name: student.full_name,
        email: student.email,
        portal_created: !student.profile_id,
        contract_sent: !!contractSigningUrl,
      },
      ip,
    });

    return Response.json({
      ok: true,
      email: student.email,
      profileId,
      contractSent: !!contractSigningUrl,
    });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
