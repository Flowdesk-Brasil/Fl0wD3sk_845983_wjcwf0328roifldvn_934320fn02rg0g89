"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { DomainSearchSection } from "@/components/domains/DomainSearchSection";

type Mode = "overview" | "acquire" | "transfers";

type Domain = {
  id: string;
  fqdn: string;
  status: string;
  provider: string;
  autoRenew: boolean;
  transferLock: boolean;
  expirationDate?: string | null;
  nameservers?: string[] | null;
  purchasePriceBrl?: number | null;
  renewalPriceBrl?: number | null;
  registrantNeedsSetup?: boolean;
};

type Transfer = {
  id: string;
  fqdn: string;
  direction: "in" | "out";
  status: string;
  initiatedAt: string;
  errorMessage?: string | null;
};

type Quote = {
  id: string;
  fqdn: string;
  totalBrl: number;
  expiresAt: string;
};

type DomainPurchaseContext = {
  type: "domain";
  token: string;
};

type Contact = {
  fullName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  documentType: "cpf" | "cnpj" | "passport" | "none";
  documentNumber: string;
};

const emptyContact: Contact = {
  fullName: "",
  email: "",
  phone: "",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  country: "BR",
  documentType: "cpf",
  documentNumber: "",
};

const dashboardDomainRoutes = {
  register: "/dashboard/domains/acquire",
  ai: "/dashboard/domains/acquire?mode=ai",
};

const panelClass =
  "rounded-[26px] border border-[#161616] bg-[linear-gradient(180deg,#0B0B0B_0%,#070707_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.38)]";
const fieldClass =
  "h-[48px] w-full rounded-[14px] border border-[#202020] bg-[#0D0D0D] px-[14px] text-[14px] font-medium text-[#E8E8E8] outline-none transition-colors placeholder:text-[#5F5F5F] focus:border-[#2F66D0]";
const secondaryButtonClass =
  "inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[13px] border border-[#202020] bg-[#101010] px-[14px] text-[13px] font-semibold text-[#D8D8D8] transition-all hover:border-[#303030] hover:bg-[#151515] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[13px] border border-[rgba(15,98,254,0.55)] bg-[#0F62FE] px-[15px] text-[13px] font-semibold text-white shadow-[0_14px_38px_rgba(15,98,254,0.22)] transition-all hover:bg-[#1D70FF] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

function formatBrl(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return "A consultar";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function formatDate(value?: string | null) {
  if (!value) return "Data pendente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data pendente";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function formatShortDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

async function jsonRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = (await response.json().catch(() => ({}))) as T & { ok?: boolean; message?: string };
  if (!response.ok || payload.ok === false) throw new Error(payload.message || "Nao foi possivel concluir a acao.");
  return payload;
}

function accountInitial(name: string) {
  return (name.trim()[0] || "F").toUpperCase();
}

function statusCopy(status: string) {
  const normalized = status.toLowerCase();
  if (["active", "registered", "completed"].includes(normalized)) return "Ativo";
  if (normalized === "expired") return "Expirado";
  if (normalized.includes("payment")) return "Pagamento";
  if (normalized.includes("transfer")) return "Transferencia";
  if (normalized.includes("pending") || normalized.includes("requested")) return "Pendente";
  if (normalized === "failed") return "Falhou";
  return status.replaceAll("_", " ");
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const active = ["active", "registered", "completed"].includes(normalized);
  const expired = normalized === "expired" || normalized === "redemption";
  const pending = /pending|waiting|requested|payment|transfer/.test(normalized);

  return (
    <span
      className={`inline-flex items-center gap-[7px] rounded-full border px-[10px] py-[6px] text-[12px] font-semibold ${
        active
          ? "border-[rgba(0,190,160,0.34)] bg-[rgba(0,190,160,0.1)] text-[#74E1C8]"
          : expired
            ? "border-[rgba(255,75,135,0.34)] bg-[rgba(255,75,135,0.1)] text-[#FF83AA]"
            : pending
              ? "border-[rgba(245,180,70,0.3)] bg-[rgba(245,180,70,0.09)] text-[#E8C878]"
              : "border-[#242424] bg-[#101010] text-[#9A9A9A]"
      }`}
    >
      {active ? <Check className="h-[13px] w-[13px]" /> : <Clock3 className="h-[13px] w-[13px]" />}
      {statusCopy(status)}
    </span>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative h-[26px] w-[46px] rounded-full transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-[#0F62FE]" : "bg-[#686D80]"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-[3px] h-[20px] w-[20px] rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.28)] transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function LoadingPanel({ label = "Carregando dominios..." }: { label?: string }) {
  return (
    <div className={`${panelClass} flex min-h-[220px] items-center justify-center text-[14px] text-[#8A8A8A]`}>
      <LoaderCircle className="mr-[9px] h-[17px] w-[17px] animate-spin" />
      {label}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[18px] border border-[rgba(255,75,95,0.26)] bg-[rgba(255,75,95,0.08)] px-[14px] py-[12px] text-[13px] text-[#FF9BAA]">
      {message}
    </div>
  );
}

function EmptyDomains() {
  return (
    <section className={`${panelClass} flex min-h-[330px] flex-col items-center justify-center px-[22px] text-center`}>
      <span className="relative inline-flex h-[68px] w-[68px] items-center justify-center rounded-[22px] border border-[#1B1B1B] bg-[#101010] text-[#8FB5FF]">
        <span className="absolute inset-[-7px] rounded-[28px] border border-[#15264A] opacity-60" />
        <Globe2 className="h-[28px] w-[28px]" />
      </span>
      <h2 className="mt-[20px] text-[22px] font-semibold tracking-[-0.04em] text-[#F1F1F1]">Comece com seu primeiro dominio</h2>
      <p className="mt-[9px] max-w-[520px] text-[13px] leading-[1.65] text-[#7B7B7B]">
        Registro, transferencia, renovacao e DNS ficam centralizados na Flowdesk com o mesmo checkout seguro usado em VPS e planos.
      </p>
      <Link href="/dashboard/domains/acquire" className={`${primaryButtonClass} mt-[18px]`}>
        Buscar dominio <ArrowRight className="h-[15px] w-[15px]" />
      </Link>
    </section>
  );
}

function buildMarketingDomain(domains: Domain[]) {
  const source = domains.find((domain) => ["active", "registered"].includes(domain.status)) || domains[0] || null;
  if (!source) {
    return { domain: "sua-marca.xyz", sld: "sua-marca", extension: "xyz" };
  }

  const parts = source.fqdn.split(".").filter(Boolean);
  const sld = parts[0] || source.fqdn;
  const currentExtension = parts.slice(1).join(".");
  const extension = ["xyz", "online", "store", "tech", "site"].find((item) => item !== currentExtension) || "xyz";
  return { domain: `${sld}.${extension}`, sld, extension };
}

function PromoBanner({ domains }: { domains: Domain[] }) {
  const suggestion = buildMarketingDomain(domains);

  return (
    <section className={`${panelClass} relative overflow-hidden px-[18px] py-[18px] sm:px-[26px]`}>
      <span className="pointer-events-none absolute -right-[80px] -top-[120px] h-[240px] w-[240px] rounded-full bg-[rgba(15,98,254,0.16)] blur-[55px]" />
      <div className="relative z-10 flex flex-col gap-[16px] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-[13px]">
          <span className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[15px] border border-[#1D1D1D] bg-[#101010] text-[#DADADA]">
            <LockKeyhole className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#DCDCDC]">Proteja sua identidade na internet</p>
            <div className="mt-[8px] flex flex-wrap items-center gap-[8px]">
              <span className="text-[22px] font-semibold tracking-[-0.05em] text-white">
                {suggestion.sld}<span className="text-[#66A3FF]">.{suggestion.extension}</span>
              </span>
              <span className="text-[13px] text-[#777777]">ou</span>
              <Link href="/dashboard/domains/acquire" className="text-[13px] font-semibold text-[#66A3FF] hover:text-[#8DB7FF]">
                Ver mais opcoes
              </Link>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-[12px] lg:justify-end">
          <span className="rounded-full bg-[rgba(15,98,254,0.16)] px-[12px] py-[7px] text-[12px] font-semibold text-[#8DB7FF]">
            Economize ate 94%
          </span>
          <div>
            <p className="text-[12px] text-[#8A8A8A] line-through">R$98,99</p>
            <p className="text-[26px] font-semibold tracking-[-0.05em] text-white">
              R$5.99<span className="text-[13px] tracking-normal text-[#D8D8D8]">/1o ano</span>
            </p>
          </div>
          <Link href={`/dashboard/domains/acquire?domain=${encodeURIComponent(suggestion.domain)}`} className={primaryButtonClass}>
            Compre agora
          </Link>
        </div>
      </div>
    </section>
  );
}

function ContactFields({ contact, onChange }: { contact: Contact; onChange: (next: Contact) => void }) {
  function field(key: keyof Contact, value: string) {
    onChange({ ...contact, [key]: value });
  }

  return (
    <div className="grid gap-[10px] sm:grid-cols-2">
      <input className={fieldClass} placeholder="Nome completo" value={contact.fullName} onChange={(event) => field("fullName", event.target.value)} />
      <input className={fieldClass} placeholder="E-mail do titular" type="email" value={contact.email} onChange={(event) => field("email", event.target.value)} />
      <input className={fieldClass} placeholder="Telefone com DDD" value={contact.phone} onChange={(event) => field("phone", event.target.value)} />
      <input className={fieldClass} placeholder="Endereco e numero" value={contact.street} onChange={(event) => field("street", event.target.value)} />
      <input className={fieldClass} placeholder="Cidade" value={contact.city} onChange={(event) => field("city", event.target.value)} />
      <div className="grid grid-cols-2 gap-[10px]">
        <input className={fieldClass} placeholder="UF" maxLength={2} value={contact.state} onChange={(event) => field("state", event.target.value.toUpperCase())} />
        <input className={fieldClass} placeholder="CEP" value={contact.postalCode} onChange={(event) => field("postalCode", event.target.value)} />
      </div>
      <select className={fieldClass} value={contact.documentType} onChange={(event) => field("documentType", event.target.value)}>
        <option value="cpf">CPF</option>
        <option value="cnpj">CNPJ</option>
        <option value="passport">Passaporte</option>
        <option value="none">Sem documento</option>
      </select>
      <input className={fieldClass} placeholder="Documento do titular" value={contact.documentNumber} onChange={(event) => field("documentNumber", event.target.value)} />
    </div>
  );
}

function normalizeContact(value: Partial<Contact> | null | undefined): Contact {
  return {
    ...emptyContact,
    ...(value || {}),
    documentNumber: value?.documentNumber || "",
  };
}

function ModalShell({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[5200] isolate flex items-center justify-center overflow-y-auto px-[18px] py-[28px]">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-[rgba(0,0,0,0.78)] backdrop-blur-[8px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-[760px] overflow-hidden rounded-[28px] border border-[#1D1D1D] bg-[#080808] p-[20px] shadow-[0_34px_120px_rgba(0,0,0,0.65)] sm:p-[28px]">
        <span className="pointer-events-none absolute -right-[90px] -top-[120px] h-[250px] w-[250px] rounded-full bg-[rgba(15,98,254,0.16)] blur-[60px]" />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-[18px]">
            <div>
              <h2 className="text-[24px] font-semibold tracking-[-0.04em] text-[#F3F3F3]">{title}</h2>
              <p className="mt-[10px] max-w-[620px] text-[14px] leading-[1.55] text-[#8A8A8A]">{description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[13px] bg-transparent text-[#AFAFAF] transition-colors hover:bg-[#121212] hover:text-white"
            >
              <X className="h-[16px] w-[16px]" />
            </button>
          </div>
          <div className="mt-[22px]">{children}</div>
        </div>
      </div>
    </div>
  );
}

function buildDomainPaymentHref(purchaseContext: DomainPurchaseContext) {
  return `/payment/domain/${encodeURIComponent(purchaseContext.token)}?fresh=1&returnPath=${encodeURIComponent("/dashboard/domains")}`;
}

function RegisterDomainDialog({
  fqdn,
  onClose,
}: {
  fqdn: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setQuote(null);

    void jsonRequest<{ quote: Quote }>("/api/auth/me/domains/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fqdn, operation: "register", period_years: 1 }),
    })
      .then((payload) => {
        if (!cancelled) setQuote(payload.quote);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Falha ao cotar dominio.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fqdn]);

  async function submit() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const checkout = await jsonRequest<{ purchaseContext: DomainPurchaseContext }>("/api/auth/me/domains/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      router.push(buildDomainPaymentHref(checkout.purchaseContext));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao preparar checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Revisar compra do dominio"
      description="O pagamento acontece primeiro na tela segura da Flowdesk. A titularidade cadastral sera finalizada no gerenciamento do dominio depois da aprovacao."
      onClose={onClose}
    >
      <div className="rounded-[18px] border border-[#181818] bg-[#0D0D0D] px-[14px] py-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] text-[#6F8EDB]">Dominio selecionado</p>
            <p className="mt-[5px] text-[20px] font-semibold tracking-[-0.04em] text-white">{fqdn}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[12px] text-[#777777]">Total do primeiro ano</p>
            <p className="mt-[4px] text-[24px] font-semibold tracking-[-0.04em] text-white">
              {busy && !quote ? "Cotando..." : formatBrl(quote?.totalBrl)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-[14px] rounded-[18px] border border-[#18223A] bg-[rgba(15,98,254,0.08)] px-[14px] py-[13px]">
        <p className="text-[13px] font-semibold text-[#8DB7FF]">Registro protegido pela Flowdesk</p>
        <p className="mt-[7px] text-[13px] leading-[1.6] text-[#AFAFAF]">
          Ao aprovar o pagamento, o registrador usa os dados operacionais da Flowdesk para provisionar o dominio sem travar o checkout. Depois, em Meus dominios, voce completa seus dados cadastrais e o painel sincroniza o titular no registrador.
        </p>
      </div>

      {error ? <div className="mt-[12px]"><ErrorPanel message={error} /></div> : null}

      <div className="mt-[18px] flex flex-col-reverse gap-[10px] sm:flex-row sm:justify-end">
        <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button>
        <button type="button" className={primaryButtonClass} disabled={busy || !quote} onClick={() => void submit()}>
          {busy ? <LoaderCircle className="h-[15px] w-[15px] animate-spin" /> : <ShieldCheck className="h-[15px] w-[15px]" />}
          Ir para pagamento
        </button>
      </div>
    </ModalShell>
  );
}

function TransferInDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [fqdn, setFqdn] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const quotePayload = await jsonRequest<{ quote: Quote }>("/api/auth/me/domains/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn: fqdn.trim().toLowerCase(), operation: "transfer", period_years: 1 }),
      });
      const checkout = await jsonRequest<{ purchaseContext: DomainPurchaseContext }>("/api/auth/me/domains/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quotePayload.quote.id, authCode }),
      });
      router.push(buildDomainPaymentHref(checkout.purchaseContext));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao preparar transferencia.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Transferir para Flowdesk"
      description="Traga um dominio registrado em outro provedor usando o Auth Code/EPP. Depois da aprovacao, finalize os dados cadastrais no gerenciamento."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="grid gap-[10px] sm:grid-cols-2">
          <input className={fieldClass} value={fqdn} onChange={(event) => setFqdn(event.target.value)} placeholder="dominio.com" />
          <input className={fieldClass} value={authCode} onChange={(event) => setAuthCode(event.target.value)} placeholder="Auth Code / EPP" />
        </div>
        <div className="mt-[12px] rounded-[18px] border border-[#18223A] bg-[rgba(15,98,254,0.08)] px-[14px] py-[13px] text-[13px] leading-[1.6] text-[#AFAFAF]">
          A transferencia sera iniciada com os dados operacionais da Flowdesk para acelerar a entrada. Assim que o dominio aparecer no painel, atualize os dados do titular para sincronizar o registro no seu nome.
        </div>
        {error ? <div className="mt-[12px]"><ErrorPanel message={error} /></div> : null}
        <div className="mt-[18px] flex flex-col-reverse gap-[10px] sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button>
          <button className={primaryButtonClass} disabled={busy}>
            {busy ? <LoaderCircle className="h-[15px] w-[15px] animate-spin" /> : <ArrowRight className="h-[15px] w-[15px]" />}
            Ir para pagamento
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function RegistrantProfileDialog({
  domain,
  onClose,
  onUpdated,
}: {
  domain: Domain;
  onClose: () => void;
  onUpdated: (domain: Domain) => void;
}) {
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContact(emptyContact);

    void jsonRequest<{ contact: Partial<Contact> | null }>(`/api/auth/me/domains/${domain.id}/contact`)
      .then((payload) => {
        if (!cancelled) setContact(normalizeContact(payload.contact));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Falha ao carregar cadastro.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [domain.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = await jsonRequest<{ domain: Domain }>(`/api/auth/me/domains/${domain.id}/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact }),
      });
      onUpdated(payload.domain);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao atualizar cadastro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Finalizar cadastro do dominio"
      description="Preencha os dados reais do titular para sincronizar a titularidade cadastral no registrador."
      onClose={onClose}
    >
      <div className="rounded-[18px] border border-[#181818] bg-[#0D0D0D] px-[14px] py-[13px]">
        <p className="text-[12px] uppercase tracking-[0.14em] text-[#6F8EDB]">Dominio selecionado</p>
        <p className="mt-[5px] text-[20px] font-semibold tracking-[-0.04em] text-white">{domain.fqdn}</p>
        {domain.registrantNeedsSetup ? (
          <p className="mt-[8px] text-[13px] leading-[1.55] text-[#8A8A8A]">
            Este dominio foi provisionado com os dados operacionais da Flowdesk para liberar o checkout. Ao salvar,
            o painel troca o contato do registrador para os dados abaixo.
          </p>
        ) : (
          <p className="mt-[8px] text-[13px] leading-[1.55] text-[#8A8A8A]">
            Atualize os dados cadastrais quando o titular, documento ou endereco mudarem.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-[14px]">
        {loading ? <LoadingPanel label="Carregando cadastro..." /> : <ContactFields contact={contact} onChange={setContact} />}
        {error ? <div className="mt-[12px]"><ErrorPanel message={error} /></div> : null}
        <div className="mt-[18px] flex flex-col-reverse gap-[10px] sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button>
          <button className={primaryButtonClass} disabled={loading || saving}>
            {saving ? <LoaderCircle className="h-[15px] w-[15px] animate-spin" /> : <ShieldCheck className="h-[15px] w-[15px]" />}
            Salvar titular
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function MoveAccountDialog({
  domains,
  onClose,
  onMoved,
}: {
  domains: Domain[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [domainId, setDomainId] = useState(domains[0]?.id || "");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!domainId) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await jsonRequest(`/api/auth/me/domains/${domainId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAccount: target }),
      });
      setDone(true);
      onMoved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao mover dominio.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Mover dominio para outra conta"
      description="Selecione um dominio da sua conta e informe o e-mail ou usuario da conta Flowdesk de destino."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="grid gap-[10px]">
          <div className="relative">
            <select className={`${fieldClass} appearance-none pr-[42px]`} value={domainId} onChange={(event) => setDomainId(event.target.value)}>
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>{domain.fqdn}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-[14px] top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#7B7B7B]" />
          </div>
          <input className={fieldClass} value={target} onChange={(event) => setTarget(event.target.value)} placeholder="email@conta.com ou usuario" />
        </div>
        {done ? (
          <div className="mt-[12px] rounded-[16px] border border-[rgba(0,190,160,0.28)] bg-[rgba(0,190,160,0.08)] px-[14px] py-[12px] text-[13px] text-[#88E6D2]">
            Dominio movido para a conta Flowdesk informada.
          </div>
        ) : null}
        {error ? <div className="mt-[12px]"><ErrorPanel message={error} /></div> : null}
        <div className="mt-[18px] flex flex-col-reverse gap-[10px] sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button>
          <button className={primaryButtonClass} disabled={busy || !domains.length}>
            {busy ? <LoaderCircle className="h-[15px] w-[15px] animate-spin" /> : <UserRound className="h-[15px] w-[15px]" />}
            Continuar
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function Overview() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [registrantDomain, setRegistrantDomain] = useState<Domain | null>(null);

  const loadDomains = useCallback(async () => {
    try {
      const payload = await jsonRequest<{ domains: Domain[] }>("/api/auth/me/domains");
      setError(null);
      setDomains(payload.domains || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar dominios.");
    }
  }, []);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  const filteredDomains = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!domains) return [];
    if (!normalized) return domains;
    return domains.filter((domain) => domain.fqdn.toLowerCase().includes(normalized));
  }, [domains, query]);

  async function toggleAutoRenew(domain: Domain) {
    setUpdatingId(domain.id);
    const nextValue = !domain.autoRenew;
    setDomains((current) =>
      current?.map((item) => (item.id === domain.id ? { ...item, autoRenew: nextValue } : item)) || current,
    );
    try {
      await jsonRequest(`/api/auth/me/domains/${domain.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_renew", enabled: nextValue }),
      });
    } catch (reason) {
      setDomains((current) =>
        current?.map((item) => (item.id === domain.id ? { ...item, autoRenew: domain.autoRenew } : item)) || current,
      );
      setError(reason instanceof Error ? reason.message : "Falha ao atualizar renovacao.");
    } finally {
      setUpdatingId(null);
    }
  }

  function handleRegistrantUpdated(nextDomain: Domain) {
    setDomains((current) =>
      current?.map((item) => (item.id === nextDomain.id ? { ...item, ...nextDomain } : item)) || current,
    );
  }

  if (error && !domains) return <ErrorPanel message={error} />;
  if (!domains) return <LoadingPanel />;

  return (
    <div className="space-y-[16px]">
      <div className="flex justify-end">
        <Link href="/dashboard/domains/acquire" className={`${primaryButtonClass} h-[44px]`}>
          <Plus className="h-[17px] w-[17px]" />
          Adicionar novo dominio
        </Link>
      </div>

      <PromoBanner domains={domains} />

      {error ? <ErrorPanel message={error} /> : null}

      {!domains.length ? (
        <EmptyDomains />
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-[17px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8A8A8A]" />
            <input
              className="h-[48px] w-full rounded-[17px] border border-[#1A1A1A] bg-[#0B0B0B] pl-[46px] pr-[16px] text-[14px] text-[#E7E7E7] outline-none transition-colors placeholder:text-[#696969] focus:border-[#2D62C9]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar..."
            />
          </div>

          <section className={`${panelClass} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse">
                <thead>
                  <tr className="border-b border-[#191919] text-left text-[12px] font-semibold text-[#9A9A9A]">
                    <th className="w-[58px] px-[18px] py-[16px]">
                      <span className="inline-flex h-[22px] w-[22px] rounded-[6px] border border-[#2A2A2A] bg-[#0F0F0F]" />
                    </th>
                    <th className="px-[12px] py-[16px]">Dominio</th>
                    <th className="px-[12px] py-[16px]">Status</th>
                    <th className="px-[12px] py-[16px]">Data de expiracao</th>
                    <th className="px-[12px] py-[16px]">Renovacao automatica</th>
                    <th className="px-[18px] py-[16px] text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDomains.map((domain) => (
                    <tr key={domain.id} className="group border-b border-[#151515] last:border-0">
                      <td className="px-[18px] py-[18px]">
                        <span className="inline-flex h-[22px] w-[22px] rounded-[6px] border border-[#2A2A2A] bg-[#0F0F0F] transition-colors group-hover:border-[#3A3A3A]" />
                      </td>
                      <td className="px-[12px] py-[18px]">
                        <div className="flex items-center gap-[10px]">
                          <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[12px] border border-[#1D1D1D] bg-[#101010] text-[13px] font-semibold text-[#DADADA]">
                            {accountInitial(domain.fqdn)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-[#F2F2F2]">{domain.fqdn}</p>
                            <p className={`mt-[4px] text-[11px] ${domain.registrantNeedsSetup ? "text-[#8DB7FF]" : "text-[#696969]"}`}>
                              {domain.registrantNeedsSetup ? "Cadastro do titular pendente" : domain.provider || "flowdesk"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-[12px] py-[18px]"><StatusPill status={domain.status} /></td>
                      <td className="px-[12px] py-[18px] text-[14px] font-medium text-[#E1E1E1]">{formatShortDate(domain.expirationDate)}</td>
                      <td className="px-[12px] py-[18px]">
                        <ToggleSwitch checked={domain.autoRenew} disabled={updatingId === domain.id} onClick={() => void toggleAutoRenew(domain)} />
                      </td>
                      <td className="px-[18px] py-[18px]">
                        <div className="flex justify-end gap-[8px]">
                          <Link href={`/dashboard/domains/acquire?domain=${encodeURIComponent(domain.fqdn)}`} className={secondaryButtonClass}>
                            Renovar
                          </Link>
                          <button
                            type="button"
                            className={domain.registrantNeedsSetup ? primaryButtonClass : secondaryButtonClass}
                            onClick={() => setRegistrantDomain(domain)}
                          >
                            {domain.registrantNeedsSetup ? "Finalizar cadastro" : "Dados cadastrais"}
                          </button>
                          <button type="button" className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-[#202020] bg-[#101010] text-[#66A3FF] transition-colors hover:border-[#303030] hover:bg-[#151515]">
                            <MoreVertical className="h-[17px] w-[17px]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-[12px] border-t border-[#151515] px-[18px] py-[15px] text-[13px] text-[#8A8A8A] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-[10px]">
                <span>Tamanho da pagina:</span>
                <span className="inline-flex h-[34px] items-center gap-[8px] rounded-[11px] border border-[#1D1D1D] bg-[#101010] px-[12px] text-[#DCDCDC]">10 <ChevronDown className="h-[14px] w-[14px]" /></span>
                <span>1 para {filteredDomains.length} de {domains.length}</span>
              </div>
              <div className="flex items-center gap-[9px]">
                <ChevronsLeft className="h-[15px] w-[15px] text-[#5F5F5F]" />
                <ChevronLeft className="h-[15px] w-[15px] text-[#5F5F5F]" />
                <span className="text-[#E2E2E2]">Pagina 1 de 1</span>
                <ChevronRight className="h-[15px] w-[15px] text-[#5F5F5F]" />
                <ChevronsRight className="h-[15px] w-[15px] text-[#5F5F5F]" />
              </div>
            </div>
          </section>
        </>
      )}
      {registrantDomain ? (
        <RegistrantProfileDialog
          domain={registrantDomain}
          onClose={() => setRegistrantDomain(null)}
          onUpdated={handleRegistrantUpdated}
        />
      ) : null}
    </div>
  );
}

function Acquire() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "ai" ? "ai" : "register";
  const initialQuery = searchParams.get("domain") || "";
  const error = searchParams.get("error");
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const routeByMode = useMemo(() => dashboardDomainRoutes, []);

  return (
    <div className="space-y-[18px]">
      {error === "checkout_expired" ? (
        <ErrorPanel message="A cotacao expirou. Pesquise o dominio novamente para gerar um checkout seguro." />
      ) : error === "checkout_account" ? (
        <ErrorPanel message="Este checkout pertence a outra conta Flowdesk. Entre com a conta correta para continuar." />
      ) : null}

      <section className="relative isolate min-h-[460px] overflow-visible px-0 py-[4px]">
        <div className="pointer-events-none absolute inset-x-0 top-[92px] -translate-y-1/2 opacity-70">
          <div className="relative left-1/2 aspect-[1542/492] w-[155%] max-w-none -translate-x-1/2 min-[861px]:w-[112%]">
            <Image
              src="/cdn/hero-blocks-1.svg"
              alt=""
              fill
              sizes="(max-width: 860px) 160vw, 1340px"
              className="pointer-events-none select-none object-contain opacity-55"
              draggable={false}
            />
          </div>
        </div>

        <div className="relative z-10 mx-auto flex max-w-[1280px] flex-col items-center text-center">
          <div className="w-full max-w-[1280px]">
            <DomainSearchSection
              initialTab={mode}
              initialQuery={initialQuery}
              routeByMode={routeByMode}
              syncRoute={false}
              onDomainSelect={setSelectedDomain}
            />
          </div>
        </div>
      </section>

      {selectedDomain ? (
        <RegisterDomainDialog fqdn={selectedDomain} onClose={() => setSelectedDomain(null)} />
      ) : null}
    </div>
  );
}

function Transfers() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [transferPayload, domainsPayload] = await Promise.all([
        jsonRequest<{ transfers: Transfer[] }>("/api/auth/me/domains/transfers"),
        jsonRequest<{ domains: Domain[] }>("/api/auth/me/domains"),
      ]);
      setError(null);
      setTransfers(transferPayload.transfers || []);
      setDomains(domainsPayload.domains || []);
    } catch (reason) {
      setTransfers([]);
      setError(reason instanceof Error ? reason.message : "Falha ao carregar transferencias.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  return (
    <div className="space-y-[16px]">
      <section className={`${panelClass} flex min-h-[420px] flex-col items-center justify-center px-[22px] py-[44px] text-center`}>
        <span className="relative inline-flex h-[82px] w-[82px] items-center justify-center rounded-[28px] border border-[#1B1B1B] bg-[#101010] text-[#8DB7FF]">
          <span className="absolute inset-[-10px] rounded-[34px] border border-[#1F2B55] opacity-50" />
          <Globe2 className="h-[34px] w-[34px]" />
          <ArrowRight className="absolute bottom-[18px] right-[17px] h-[20px] w-[20px] text-[#0F62FE]" />
        </span>
        <h3 className="mt-[26px] text-[26px] font-semibold tracking-[-0.05em] text-[#F2F2F2]">
          Comecar com uma nova transferencia de dominio
        </h3>
        <p className="mt-[12px] max-w-[560px] text-[15px] leading-[1.6] text-[#8A8A8A]">
          Transfira um dominio registrado em outro provedor para a Flowdesk ou mova um dominio para outra conta Flowdesk.
        </p>
        <div className="mt-[24px] flex flex-col items-center gap-[12px]">
          <button type="button" className={`${primaryButtonClass} h-[46px] px-[20px]`} onClick={() => setIsTransferDialogOpen(true)}>
            Transferir pra Flowdesk
          </button>
          <button type="button" className="text-[14px] font-semibold text-[#66A3FF] transition-colors hover:text-[#8DB7FF]" onClick={() => setIsMoveDialogOpen(true)}>
            Mover para outra conta
          </button>
        </div>
      </section>

      {error ? <ErrorPanel message={error} /> : null}

      <section className={`${panelClass} p-[18px]`}>
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <div>
            <h3 className="text-[18px] font-semibold tracking-[-0.04em] text-[#F1F1F1]">Historico de transferencias</h3>
            <p className="mt-[6px] text-[12px] text-[#777777]">Status em tempo real das transferencias de entrada.</p>
          </div>
          <button type="button" className={secondaryButtonClass} onClick={() => void loadData()}>
            Atualizar
          </button>
        </div>

        {!transfers ? (
          <div className="mt-[18px]"><LoadingPanel label="Carregando transferencias..." /></div>
        ) : transfers.length ? (
          <div className="mt-[16px] grid gap-[9px]">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="flex flex-col gap-[12px] rounded-[18px] border border-[#181818] bg-[#0D0D0D] px-[14px] py-[13px] sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[15px] font-semibold text-[#F1F1F1]">{transfer.fqdn}</p>
                  <p className="mt-[5px] text-[12px] text-[#707070]">
                    {transfer.direction === "in" ? "Entrada" : "Saida"} - {formatDate(transfer.initiatedAt)}
                  </p>
                </div>
                <StatusPill status={transfer.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-[16px] rounded-[18px] border border-[#181818] bg-[#0D0D0D] px-[14px] py-[18px] text-[13px] text-[#777777]">
            Nenhuma transferencia iniciada.
          </div>
        )}
      </section>

      {isTransferDialogOpen ? <TransferInDialog onClose={() => setIsTransferDialogOpen(false)} /> : null}
      {isMoveDialogOpen ? (
        <MoveAccountDialog
          domains={domains}
          onClose={() => setIsMoveDialogOpen(false)}
          onMoved={() => void loadData()}
        />
      ) : null}
    </div>
  );
}

export function DomainsWorkspace({ mode }: { mode: Mode }) {
  return (
    <div className="mt-[24px]">
      {mode === "overview" ? <Overview /> : mode === "acquire" ? <Acquire /> : <Transfers />}
    </div>
  );
}

export function FlowAiApiWorkspace() {
  const cards = useMemo(
    () => [
      { icon: Sparkles, title: "Chaves de API", text: "Gerenciamento de chaves e escopos da FlowAI." },
      { icon: Clock3, title: "Consumo", text: "Metricas de requisicoes, tokens e limites." },
      { icon: ShieldCheck, title: "Seguranca", text: "Restricoes por origem, rotacao e auditoria." },
    ],
    [],
  );
  return (
    <div className="mt-[24px] grid gap-[12px] md:grid-cols-3">
      {cards.map((card) => (
        <section key={card.title} className={`${panelClass} p-[18px]`}>
          <card.icon className="h-[19px] w-[19px] text-[#8FB5FF]" />
          <h2 className="mt-[14px] text-[16px] font-semibold text-[#EEEEEE]">{card.title}</h2>
          <p className="mt-[7px] text-[12px] leading-[1.6] text-[#6F6F6F]">{card.text}</p>
          <span className="mt-[16px] inline-flex rounded-full border border-[#1B1B1B] bg-[#101010] px-[9px] py-[5px] text-[11px] text-[#777777]">Em preparacao</span>
        </section>
      ))}
    </div>
  );
}
