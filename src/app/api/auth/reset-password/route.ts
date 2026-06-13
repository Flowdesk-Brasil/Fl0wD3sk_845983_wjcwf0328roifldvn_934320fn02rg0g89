import { createClient } from "@supabase/supabase-js";
import { sendStudioEmail } from "@/lib/server/mail";
import { createPasswordSetupLink, resolveAppOrigin } from "@/lib/server/student-onboarding";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return Response.json({ error: "Supabase nao configurado." }, { status: 503 });

  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return Response.json({ error: "Dados invalidos." }, { status: 400 });
  }
  if (!email.includes("@")) return Response.json({ error: "Informe um e-mail valido." }, { status: 400 });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { data: profile } = await admin.from("profiles").select("full_name").eq("email", email).single();

  try {
    const origin = resolveAppOrigin(request);
    const finalLink = await createPasswordSetupLink(admin, email, origin, `${origin}/portal`);
    await sendStudioEmail({
      to: email,
      subject: "Redefinicao de Senha - Studio Corpo & Evolucao",
      title: "Recuperacao de Acesso",
      intro: `Ola, ${profile?.full_name || "Aluno(a)"}! Recebemos um pedido para redefinir a senha da sua conta no Studio Corpo & Evolucao. Clique no botao abaixo para escolher uma nova senha:`,
      action: { label: "Redefinir minha senha", href: finalLink },
      footer: "Se voce nao solicitou esta alteracao, pode ignorar este e-mail em seguranca.",
    });
  } catch {
    // Do not reveal whether the account exists or whether mail delivery failed.
  }

  return Response.json({ success: true });
}
