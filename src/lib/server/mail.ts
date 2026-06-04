import "server-only";

import nodemailer from "nodemailer";

type MailSection = { label: string; value: string | number | null | undefined };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function smtpConfig() {
  const host = process.env.AUTH_SMTP_HOST?.trim() || "";
  const port = Number(process.env.AUTH_SMTP_PORT || "587");
  const secure = process.env.AUTH_SMTP_SECURE?.trim().toLowerCase() === "true";
  const user = process.env.AUTH_SMTP_USER?.trim() || "";
  const pass = process.env.AUTH_SMTP_PASS || "";
  const fromEmail = process.env.AUTH_SMTP_FROM_EMAIL?.trim() || user;
  const envelopeFrom = process.env.AUTH_SMTP_ENVELOPE_FROM?.trim() || fromEmail;
  const replyTo = process.env.AUTH_SMTP_REPLY_TO?.trim() || undefined;
  if (!host || !port || !fromEmail) throw new Error("SMTP não configurado. Revise as variáveis AUTH_SMTP_*.");
  return { host, port, secure, user, pass, fromEmail, envelopeFrom, replyTo };
}

export async function sendStudioEmail(input: {
  to: string;
  subject: string;
  title: string;
  intro: string;
  action?: { label: string; href: string };
  sections?: MailSection[];
  footer?: string;
}) {
  const config = smtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 20_000,
  });
  const sections = (input.sections || []).filter((item) => item.value !== null && item.value !== undefined && String(item.value).trim());
  const sectionsHtml = sections.map((item) => `<tr><td style="padding:12px 16px;border-top:1px solid #e7ebf2"><small style="display:block;color:#657085;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(item.label)}</small><strong style="display:block;margin-top:4px;color:#172033">${escapeHtml(String(item.value))}</strong></td></tr>`).join("");
  const actionHtml = input.action ? `<a href="${escapeHtml(input.action.href)}" style="display:inline-block;margin-top:22px;border-radius:10px;background:#1a73e8;padding:13px 20px;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(input.action.label)}</a>` : "";
  const text = [
    "Corpo & Evolução",
    "",
    input.title,
    input.intro,
    ...sections.map((item) => `${item.label}: ${item.value}`),
    input.action ? `${input.action.label}: ${input.action.href}` : "",
    input.footer || "Mensagem automática do Studio Corpo & Evolução.",
  ].filter(Boolean).join("\n");

  await transporter.sendMail({
    from: `"Corpo & Evolução" <${config.fromEmail}>`,
    to: input.to,
    replyTo: config.replyTo,
    envelope: { from: config.envelopeFrom, to: input.to },
    subject: input.subject,
    text,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><table width="100%" role="presentation"><tr><td align="center" style="padding:32px 16px"><table width="100%" role="presentation" style="max-width:620px"><tr><td style="padding:0 4px 16px;font-weight:800;letter-spacing:.08em;color:#1a73e8">CORPO &amp; EVOLUÇÃO</td></tr><tr><td style="border:1px solid #e3e8f0;border-radius:20px;background:#fff;padding:34px"><h1 style="margin:0;font-size:28px">${escapeHtml(input.title)}</h1><p style="margin:12px 0 0;color:#657085;line-height:1.7">${escapeHtml(input.intro)}</p>${sections.length ? `<table width="100%" role="presentation" style="margin-top:20px;border:1px solid #e7ebf2;border-radius:12px;border-collapse:separate;overflow:hidden">${sectionsHtml}</table>` : ""}${actionHtml}<p style="margin:24px 0 0;color:#8d97aa;font-size:12px;line-height:1.6">${escapeHtml(input.footer || "Mensagem automática do Studio Corpo & Evolução.")}</p></td></tr></table></td></tr></table></body></html>`,
  });
}
