"use client";

import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  Dumbbell,
  Lock,
  Mail,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { IconInput } from "@/components/form-controls";
import { ErrorBanner, FieldLabel } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalData } from "@/lib/supabase";

interface AuthStatus {
  mode: "local" | "supabase";
  hasUsers: boolean;
  schemaReady: boolean;
}

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(useLocalData ? { mode: "local", hasUsers: true, schemaReady: true } : null);
  const [email, setEmail] = useState(useLocalData ? "admin@admin.com" : "");
  const [password, setPassword] = useState(useLocalData ? "admin" : "");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    if (!useLocalData) {
      fetch("/api/auth/status", { cache: "no-store" })
        .then((response) => response.json() as Promise<AuthStatus>)
        .then((nextStatus) => {
          localStorage.setItem("corpoevolucao_data_mode", nextStatus.schemaReady ? "supabase" : "local");
          setStatus(nextStatus);
        })
        .catch(() => setError("Não foi possível verificar a configuração do servidor."));
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user) router.replace(user.app_role === "student" ? "/portal" : "/dashboard");
  }, [isLoading, router, user]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  async function handleBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Não foi possível configurar o primeiro acesso.");
      setSubmitting(false);
      return;
    }
    setStatus((current) => current ? { ...current, hasUsers: true } : current);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.error) setError(result.error);
    else router.replace("/dashboard");
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSubmitting(false);
    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      setError(payload.error ?? "Não foi possível enviar a recuperação.");
      return;
    }
    setMessage("Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.");
    setResetMode(false);
  }

  const firstAccess = status?.mode === "supabase" && !status.hasUsers;

  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[1.06fr_.94fr]">
      <section className="relative hidden overflow-hidden bg-[#0f1b2d] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#1a73e8_0,transparent_28%),radial-gradient(circle_at_75%_75%,#20c997_0,transparent_26%)]" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Dumbbell className="h-5 w-5" /></div>
          <div><strong className="block text-sm">Corpo & Evolução</strong><span className="text-xs text-white/55">Gestão inteligente para studios</span></div>
        </div>

        <div className="relative max-w-xl">
          <span className="mb-5 inline-flex rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100 ring-1 ring-white/10">Operação simples. Decisões melhores.</span>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-.055em]">Seu studio organizado em uma visão clara.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/60">Controle alunos, matrículas, financeiro e acessos com uma experiência rápida e confiável.</p>
          <div className="mt-9 grid gap-3">
            {[
              { icon: BarChart3, label: "Indicadores confiáveis em tempo real" },
              { icon: ShieldCheck, label: "Autenticação e permissões por função" },
              { icon: CheckCircle2, label: "Fluxos integrados do cadastro ao pagamento" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl bg-white/[.07] px-4 py-3 ring-1 ring-white/10">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-400/10 text-blue-300"><Icon className="h-4 w-4" /></span>
                <span className="text-xs leading-5 text-white/70">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/35">© 2026 Corpo & Evolução</p>
      </section>

      <section className="flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden bg-[#f7f9fc] p-5 sm:p-10">
        <div className="min-w-0 w-[calc(100vw-2.5rem)] max-w-md sm:w-full">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white"><Dumbbell className="h-5 w-5" /></div>
            <strong className="text-sm text-[#172033]">Corpo & Evolução</strong>
          </div>

          <p className="eyebrow">{firstAccess ? "Configuração inicial" : resetMode ? "Recuperação de acesso" : "Acesso seguro"}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-[#172033]">
            {firstAccess ? "Crie o administrador" : resetMode ? "Recupere sua senha" : "Bem-vindo de volta"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#657085]">
            {firstAccess ? "O Supabase está conectado e ainda não possui usuários." : resetMode ? "Enviaremos instruções para o e-mail informado." : "Entre para continuar gerenciando o studio."}
          </p>

          <form onSubmit={firstAccess ? handleBootstrap : resetMode ? handleReset : handleLogin} className="mt-7 grid min-w-0 gap-5 rounded-[20px] border border-[#e3e8f0] bg-white p-6 shadow-[0_12px_40px_rgba(30,42,62,.07)] sm:p-8">
            <ErrorBanner message={error} />
            {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-medium leading-5 text-green-700">{message}</div>}
            {status?.mode === "supabase" && !status.schemaReady && (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                <Database className="mt-0.5 h-4 w-4 shrink-0" />
                <span>O banco remoto precisa da migração. Após entrar, o painel usará dados locais temporariamente.</span>
              </div>
            )}
            {firstAccess && (
              <label>
                <FieldLabel required>Nome completo</FieldLabel>
                <IconInput icon={UserRound} required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Seu nome" autoComplete="name" />
              </label>
            )}
            <label>
              <FieldLabel required>E-mail</FieldLabel>
              <IconInput icon={Mail} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@studio.com" autoComplete="email" />
            </label>
            {!resetMode && (
              <label>
                <FieldLabel required>Senha</FieldLabel>
                <IconInput icon={Lock} type="password" required minLength={firstAccess ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={firstAccess ? "Mínimo de 8 caracteres" : "Sua senha"} autoComplete={firstAccess ? "new-password" : "current-password"} />
              </label>
            )}
            <button className="btn btn-primary mt-1 w-full" disabled={submitting || status === null} type="submit">
              {submitting ? "Processando..." : firstAccess ? "Criar administrador e entrar" : resetMode ? "Enviar recuperação" : "Entrar no painel"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
            {!firstAccess && !useLocalData && (
              <button className="text-xs font-semibold text-blue-600 hover:text-blue-800" type="button" onClick={() => { setResetMode((current) => !current); setError(null); setMessage(null); }}>
                {resetMode ? "Voltar para o login" : "Esqueci minha senha"}
              </button>
            )}
            {useLocalData && (
              <div className="flex items-start gap-3 rounded-xl bg-[#f3f6fb] p-3 text-[11px] leading-5 text-[#657085]">
                <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>Ambiente local: <strong>admin@admin.com</strong> / <strong>admin</strong></span>
              </div>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
