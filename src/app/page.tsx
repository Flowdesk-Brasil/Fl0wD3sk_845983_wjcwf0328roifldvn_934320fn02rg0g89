"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronRight,
  Database,
  KeyRound,
  Lock,
  Mail,
  Package,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BrandIcon } from "@/components/brand-logo";
import { IconInput } from "@/components/form-controls";
import { ErrorBanner, FieldLabel } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalData } from "@/lib/supabase";

interface AuthStatus {
  mode: "local" | "supabase";
  hasUsers: boolean;
  schemaReady: boolean;
}

type OnboardingSlide = {
  label: string;
  title: string;
  description: string;
  icon: typeof BarChart3;
  metric: string;
  caption: string;
};

const onboardingStorageKey = "corpoevolucao:premium-login-onboarding";

const onboardingSlides: OnboardingSlide[] = [
  {
    label: "Operacao",
    title: "Controle o ERP sem excesso visual.",
    description: "Vendas, estoque, financeiro e pedidos em uma entrada limpa para equipes que precisam agir rapido.",
    icon: BarChart3,
    metric: "98%",
    caption: "rotinas mais claras",
  },
  {
    label: "Financeiro",
    title: "Indicadores importantes aparecem primeiro.",
    description: "Um painel calmo, direto e confiavel para abrir o dia com leitura imediata do negocio.",
    icon: WalletCards,
    metric: "R$ 84k",
    caption: "receita monitorada",
  },
  {
    label: "Acesso",
    title: "Login seguro com aparencia de app nativo.",
    description: "E-mail, provedores corporativos e uma base visual premium sem perder simplicidade no mobile.",
    icon: ShieldCheck,
    metric: "SSO",
    caption: "pronto para empresas",
  },
];

const erpCards = [
  { label: "Vendas", value: "R$ 32.480", helper: "+12,4%", icon: ShoppingCart },
  { label: "Estoque", value: "1.284 itens", helper: "32 alertas", icon: Package },
  { label: "Financeiro", value: "R$ 8.920", helper: "a receber", icon: WalletCards },
  { label: "Pedidos", value: "184", helper: "em tempo real", icon: ReceiptText },
];

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(
    useLocalData ? { mode: "local", hasUsers: true, schemaReady: true } : null,
  );
  const [email, setEmail] = useState(useLocalData ? "admin@admin.com" : "");
  const [password, setPassword] = useState(useLocalData ? "admin" : "");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"next" | "prev">("next");

  useEffect(() => {
    if (!useLocalData) {
      fetch("/api/auth/status", { cache: "no-store" })
        .then((response) => response.json() as Promise<AuthStatus>)
        .then((nextStatus) => {
          localStorage.setItem("corpoevolucao_data_mode", nextStatus.schemaReady ? "supabase" : "local");
          setStatus(nextStatus);
        })
        .catch(() => setError("Nao foi possivel verificar a configuracao do servidor."));
    }
  }, []);

  useEffect(() => {
    setShowOnboarding(window.localStorage.getItem(onboardingStorageKey) !== "done");
    setOnboardingChecked(true);
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
      setError(payload.error ?? "Nao foi possivel configurar o primeiro acesso.");
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
      setError(payload.error ?? "Nao foi possivel enviar a recuperacao.");
      return;
    }
    setMessage("Se o e-mail estiver cadastrado, voce recebera as instrucoes de recuperacao.");
    setResetMode(false);
  }

  function finishOnboarding() {
    window.localStorage.setItem(onboardingStorageKey, "done");
    setShowOnboarding(false);
  }

  function goToOnboardingSlide(index: number) {
    if (index === activeSlide) return;
    setSlideDirection(index > activeSlide ? "next" : "prev");
    setActiveSlide(index);
  }

  const firstAccess = status?.mode === "supabase" && !status.hasUsers;
  const pageTitle = firstAccess ? "Criar administrador" : resetMode ? "Recuperar acesso" : "Entrar no ERP";
  const pageText = firstAccess
    ? "Configure o primeiro usuario do ambiente."
    : resetMode
      ? "Enviaremos as instrucoes para o e-mail informado."
      : "";

  if (!onboardingChecked || isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f6f8] px-5 text-[#101114]">
        <div className="grid justify-items-center gap-4 text-center">
          <BrandIcon size={54} className="rounded-[20px] shadow-[0_18px_44px_rgba(16,17,20,.14)]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#7a8491]">Corpo & Evolucao ERP</p>
            <p className="mt-2 text-sm text-[#687281]">Preparando acesso seguro...</p>
          </div>
        </div>
      </main>
    );
  }

  if (showOnboarding) {
    const slide = onboardingSlides[activeSlide];
    const SlideIcon = slide.icon;
    const lastSlide = activeSlide === onboardingSlides.length - 1;

    return (
      <main className="min-h-screen bg-[#f5f6f8] text-[#101114]">
        <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-between px-5 py-5 sm:px-6">
          <header className="flex items-center justify-between">
            <BrandIcon size={42} className="rounded-[18px] shadow-[0_16px_42px_rgba(16,17,20,.12)]" />
            <button
              type="button"
              onClick={finishOnboarding}
              className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#3f4650] shadow-[0_12px_32px_rgba(16,17,20,.06)] backdrop-blur-xl transition hover:bg-white"
            >
              Pular
            </button>
          </header>

          <div className="overflow-hidden py-8">
            <div key={`${activeSlide}-${slideDirection}`} className={`onboarding-slide-panel onboarding-slide-panel--${slideDirection} grid gap-8`}>
              <div className="relative mx-auto grid h-[244px] w-full max-w-[330px] place-items-center">
                <div className="absolute inset-x-8 top-5 h-32 rounded-[40px] border border-white/80 bg-white/55 shadow-[0_30px_90px_rgba(16,17,20,.08)] backdrop-blur-2xl" />
                <div className="absolute bottom-7 left-2 h-24 w-28 rounded-[32px] border border-white/80 bg-white/65 p-4 shadow-[0_24px_70px_rgba(16,17,20,.10)] backdrop-blur-2xl">
                  <Package className="h-5 w-5 text-[#56616f]" />
                  <p className="mt-5 text-xs font-semibold text-[#6b7280]">Estoque</p>
                </div>
                <div className="absolute bottom-0 right-3 h-28 w-32 rounded-[34px] border border-white/80 bg-white/75 p-4 shadow-[0_24px_70px_rgba(16,17,20,.10)] backdrop-blur-2xl">
                  <WalletCards className="h-5 w-5 text-[#56616f]" />
                  <p className="mt-6 text-xs font-semibold text-[#6b7280]">Financeiro</p>
                </div>
                <div className="relative grid h-36 w-36 place-items-center rounded-[44px] border border-white/80 bg-[linear-gradient(160deg,rgba(255,255,255,.95),rgba(235,238,243,.72))] shadow-[0_30px_90px_rgba(16,17,20,.16)] backdrop-blur-2xl">
                  <div className="grid h-20 w-20 place-items-center rounded-[28px] bg-[#101114] text-white shadow-[0_18px_42px_rgba(16,17,20,.22)]">
                    <SlideIcon className="h-9 w-9" />
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7a8491]">{slide.label}</p>
                <h1 className="mx-auto mt-3 max-w-sm text-[2.55rem] font-semibold leading-[0.98] tracking-[-0.055em] text-[#101114]">
                  {slide.title}
                </h1>
                <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-[#5f6875]">{slide.description}</p>
              </div>

              <div className="mx-auto flex w-full max-w-xs items-center justify-between rounded-[28px] border border-white/80 bg-white/68 px-5 py-4 shadow-[0_18px_56px_rgba(16,17,20,.08)] backdrop-blur-2xl">
                <div>
                  <strong className="block text-2xl font-semibold tracking-[-0.04em] text-[#101114]">{slide.metric}</strong>
                  <span className="text-xs font-medium text-[#6b7280]">{slide.caption}</span>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-full bg-[#eef2f4] text-[#1f2933]">
                  <Check className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          <footer className="grid gap-5 pb-2">
            <div className="flex items-center justify-center gap-2">
              {onboardingSlides.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => goToOnboardingSlide(index)}
                  aria-label={`Ir para etapa ${index + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 ${activeSlide === index ? "w-8 bg-[#101114]" : "w-2 bg-[#c9ced6]"}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-[52px_1fr] gap-3">
              <button
                type="button"
                onClick={() => goToOnboardingSlide(activeSlide - 1)}
                disabled={activeSlide === 0}
                aria-label="Voltar"
                className="grid h-14 place-items-center rounded-full border border-black/10 bg-white/70 text-[#101114] shadow-[0_12px_32px_rgba(16,17,20,.06)] backdrop-blur-xl transition duration-200 hover:bg-white active:scale-[0.98] disabled:opacity-40"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (lastSlide) finishOnboarding();
                  else goToOnboardingSlide(activeSlide + 1);
                }}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#101114] px-6 text-sm font-semibold text-white shadow-[0_18px_44px_rgba(16,17,20,.24)] transition duration-200 hover:bg-[#1b1d21] active:scale-[0.985]"
              >
                {lastSlide ? "Comecar" : "Continuar"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f6f8] text-[#101114]">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl lg:grid-cols-[minmax(420px,0.86fr)_1.14fr]">
        <div className="flex min-h-screen items-center justify-center px-5 py-6 sm:px-8 lg:px-12">
          <div className="w-full max-w-[390px]">
            <header className="mb-8 flex flex-col items-center text-center">
              <BrandIcon size={56} className="rounded-[22px] shadow-[0_18px_44px_rgba(16,17,20,.16)]" />
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[#7a8491]">Corpo & Evolucao ERP</p>
              <h1 className="mt-3 text-[2.55rem] font-semibold leading-none tracking-[-0.06em] text-[#101114]">{pageTitle}</h1>
              <p className="mt-3 max-w-[300px] text-sm leading-6 text-[#5f6875]">{pageText}</p>
            </header>

            <div className="relative">
              <div className="pointer-events-none absolute inset-x-10 -top-8 h-24 rounded-full bg-white/70 blur-3xl" />
              <form onSubmit={firstAccess ? handleBootstrap : resetMode ? handleReset : handleLogin} className="relative grid gap-4">
                <ErrorBanner message={error} />
                {message && (
                  <div className="rounded-[22px] border border-[#d8e6dd] bg-white/72 px-4 py-3 text-xs font-medium leading-5 text-[#2f6548] shadow-[0_14px_36px_rgba(16,17,20,.05)] backdrop-blur-xl">
                    {message}
                  </div>
                )}

                {status?.mode === "supabase" && !status.schemaReady && (
                  <div className="flex gap-3 rounded-[22px] border border-[#e8dec8] bg-white/72 p-3 text-xs leading-5 text-[#73572b] shadow-[0_14px_36px_rgba(16,17,20,.05)] backdrop-blur-xl">
                    <Database className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>O banco remoto precisa da migracao. Apos entrar, o painel usa dados locais temporariamente.</span>
                  </div>
                )}

                {firstAccess && (
                  <label>
                    <FieldLabel required>Nome completo</FieldLabel>
                    <IconInput
                      icon={UserRound}
                      required
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Seu nome"
                      autoComplete="name"
                      className="h-[52px] min-h-[60px] rounded-[25px] border-white/80 bg-white/72 px-4 text-[15px] shadow-[0_18px_48px_rgba(16,17,20,.07),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-xl focus:border-[#b9c3cf] focus:bg-white focus:shadow-[0_0_0_5px_rgba(47,77,99,.10),0_18px_48px_rgba(16,17,20,.07)]"
                    />
                  </label>
                )}

                <label>
                  <FieldLabel required>E-mail</FieldLabel>
                  <IconInput
                    icon={Mail}
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@empresa.com"
                    autoComplete="email"
                    className="h-[52px] min-h-[60px] rounded-[25px] border-white/80 bg-white/72 px-4 text-[15px] shadow-[0_18px_48px_rgba(16,17,20,.07),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-xl focus:border-[#b9c3cf] focus:bg-white focus:shadow-[0_0_0_5px_rgba(47,77,99,.10),0_18px_48px_rgba(16,17,20,.07)]"
                  />
                </label>

                {!resetMode && (
                  <label>
                    <FieldLabel required>Senha</FieldLabel>
                    <IconInput
                      icon={Lock}
                      type="password"
                      required
                      minLength={firstAccess ? 8 : undefined}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={firstAccess ? "Minimo de 8 caracteres" : "Sua senha"}
                      autoComplete={firstAccess ? "new-password" : "current-password"}
                      className="h-[52px] min-h-[60px] rounded-[25px] border-white/80 bg-white/72 px-4 text-[15px] shadow-[0_18px_48px_rgba(16,17,20,.07),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-xl focus:border-[#b9c3cf] focus:bg-white focus:shadow-[0_0_0_5px_rgba(47,77,99,.10),0_18px_48px_rgba(16,17,20,.07)]"
                    />
                  </label>
                )}

                <button
                  className="mt-3 inline-flex h-[52px] min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#101114] px-6 py-4 text-[15px] font-semibold leading-none text-white shadow-[0_22px_52px_rgba(16,17,20,.24)] transition duration-200 hover:bg-[#1c1f24] active:scale-[0.985] disabled:opacity-60"
                  disabled={submitting || status === null}
                  type="submit"
                >
                  {submitting ? "Processando..." : firstAccess ? "Criar e entrar" : resetMode ? "Enviar recuperacao" : "Entrar"}
                  {!submitting && <ArrowRight className="h-4 w-4" />}
                </button>

                {!firstAccess && !useLocalData && (
                  <button
                    className="mx-auto text-sm font-semibold text-[#56616f] transition hover:text-[#101114]"
                    type="button"
                    onClick={() => {
                      setResetMode((current) => !current);
                      setError(null);
                      setMessage(null);
                    }}
                  >
                    {resetMode ? "Voltar ao login" : "Esqueci minha senha"}
                  </button>
                )}

                {useLocalData && (
                  <div className="rounded-[22px] border border-white/80 bg-white/60 p-3 text-center text-[11px] leading-5 text-[#687281] shadow-[0_14px_36px_rgba(16,17,20,.04)] backdrop-blur-xl">
                    Ambiente local: <strong className="text-[#101114]">admin@admin.com</strong> / <strong className="text-[#101114]">admin</strong>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>

        <aside className="hidden min-h-screen items-center justify-center p-10 lg:flex">
          <ERPPreview />
        </aside>
      </section>
    </main>
  );
}

function ERPPreview() {
  return (
    <div className="relative w-full max-w-[620px]">
      <div className="absolute -left-8 top-16 h-52 w-52 rounded-full bg-[#e7ebee] blur-3xl" />
      <div className="absolute -right-8 bottom-10 h-64 w-64 rounded-full bg-[#dde8ed] blur-3xl" />

      <section className="relative overflow-hidden rounded-[42px] border border-white/75 bg-white/58 p-7 shadow-[0_40px_120px_rgba(16,17,20,.14)] backdrop-blur-2xl">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[18px] bg-[#101114] text-white">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a8491]">ERP Live</p>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#101114]">Visao executiva</h2>
            </div>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-2 gap-4">
          {erpCards.map(({ label, value, helper, icon: Icon }) => (
            <article key={label} className="rounded-[28px] border border-white/80 bg-white/72 p-5 shadow-[0_18px_48px_rgba(16,17,20,.07)]">
              <div className="flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-[16px] bg-[#f0f3f5] text-[#3f4650]">
                  <Icon className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-[#a0a7b1]" />
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#8a93a0]">{label}</p>
              <strong className="mt-2 block text-2xl font-semibold tracking-[-0.05em] text-[#101114]">{value}</strong>
              <span className="mt-2 block text-xs font-medium text-[#66717e]">{helper}</span>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-[30px] border border-white/80 bg-[#101114] p-5 text-white shadow-[0_26px_70px_rgba(16,17,20,.18)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Indicador principal</p>
              <strong className="mt-2 block text-4xl font-semibold tracking-[-0.06em]">94,8%</strong>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-white">
              <BadgeCheck className="h-7 w-7" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-12 gap-1.5">
            {[30, 42, 36, 55, 48, 68, 58, 74, 66, 82, 76, 90].map((height, index) => (
              <span key={index} className="block rounded-full bg-white/75" style={{ height }} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
