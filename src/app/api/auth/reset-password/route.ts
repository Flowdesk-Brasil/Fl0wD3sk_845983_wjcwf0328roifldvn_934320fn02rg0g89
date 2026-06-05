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
    const actionUrl = new URL(linkData.properties.action_link);
    const token = actionUrl.searchParams.get("token") || actionUrl.searchParams.get("token_hash");
    
    // Constrói a URL forçando o domínio de produção com o token do Supabase
    // Isso evita completamente o redirecionamento fantasma para localhost do Supabase Auth
    const finalLink = token 
      ? `https://corpoeevolucao.vercel.app/reset-password?token=${token}`
      : `https://corpoeevolucao.vercel.app/reset-password`;

    await sendStudioEmail({
      to: email,
      subject: "Redefinição de Senha - Studio Corpo & Evolução",
      title: "Recuperação de Acesso",
      intro: `Olá, ${profile?.full_name || "Aluno(a)"}! Recebemos um pedido para redefinir a senha da sua conta no Studio Corpo & Evolução. Clique no botão abaixo para escolher uma nova senha:`,
      action: { label: "Redefinir minha senha", href: finalLink },
      footer: "Se você não solicitou esta alteração, pode ignorar este e-mail em segurança.",
    });
  }

  // Do not reveal whether the account exists.
  return Response.json({ success: true });
}
