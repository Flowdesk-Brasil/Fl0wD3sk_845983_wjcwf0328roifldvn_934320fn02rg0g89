import { createClient } from "@supabase/supabase-js";
import { sendStudioEmail } from "@/lib/server/mail";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return Response.json({ error: "Supabase não configurado." }, { status: 503 });

  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (!email.includes("@")) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  
  // Buscar o nome do usuário para o e-mail
  const { data: profile } = await admin.from("profiles").select("full_name").eq("email", email).single();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: email,
    options: { redirectTo: "https://corpoeevolucao.vercel.app/reset-password" },
  });

  if (!linkError && linkData?.properties?.action_link) {
    let actionLink = linkData.properties.action_link;
    if (actionLink.includes("localhost")) {
      actionLink = actionLink.replace(/http:\/\/localhost:\d+/, "https://corpoeevolucao.vercel.app");
    }

    await sendStudioEmail({
      to: email,
      subject: "Redefinição de Senha - Studio Corpo & Evolução",
      title: "Recuperação de Acesso",
      intro: `Olá, ${profile?.full_name || "Aluno(a)"}! Recebemos um pedido para redefinir a senha da sua conta no Studio Corpo & Evolução. Clique no botão abaixo para escolher uma nova senha:`,
      action: { label: "Redefinir minha senha", href: actionLink },
      footer: "Se você não solicitou esta alteração, pode ignorar este e-mail em segurança.",
    });
  }

  // Do not reveal whether the account exists.
  return Response.json({ success: true });
}
