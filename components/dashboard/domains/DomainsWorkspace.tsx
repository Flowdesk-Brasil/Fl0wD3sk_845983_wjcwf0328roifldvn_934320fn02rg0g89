"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  Clipboard,
  Clock3,
  Globe2,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Mode = "overview" | "acquire" | "transfers";

type DomainResult = {
  domain: string;
  extension: string;
  isAvailable: boolean;
  price: number;
  currency: string;
  isPremium: boolean;
  reason: string;
};

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

type PixOrder = {
  orderNumber: number;
  status: string;
  amount: number;
  qrCodeText: string | null;
  qrCodeDataUri: string | null;
  expiresAt: string | null;
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

const panelClass = "rounded-[20px] border border-[#141414] bg-[#090909] p-[18px] sm:p-[22px]";
const inputClass =
  "h-[44px] w-full rounded-[12px] border border-[#1A1A1A] bg-[#0D0D0D] px-[14px] text-[14px] text-[#E7E7E7] outline-none transition-colors placeholder:text-[#555555] focus:border-[#333333]";
const buttonClass =
  "inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] border border-[#1A1A1A] bg-[#111111] px-[15px] text-[13px] font-medium text-[#D8D8D8] transition-colors hover:border-[#282828] hover:bg-[#151515] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] border border-[rgba(0,98,255,0.45)] bg-[#0062FF] px-[15px] text-[13px] font-semibold text-white transition-colors hover:bg-[#146FFF] disabled:cursor-not-allowed disabled:opacity-50";

function formatBrl(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return "A consultar";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function formatDate(value?: string | null) {
  if (!value) return "Data pendente";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

async function jsonRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = (await response.json().catch(() => ({}))) as T & { ok?: boolean; message?: string };
  if (!response.ok || payload.ok === false) throw new Error(payload.message || "Nao foi possivel concluir a acao.");
  return payload;
}

function LoadingPanel() {
  return (
    <div className={`${panelClass} flex min-h-[180px] items-center justify-center text-[#777777]`}>
      <LoaderCircle className="mr-[9px] h-[17px] w-[17px] animate-spin" />
      Carregando sistema de dominios...
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return <div className={`${panelClass} border-[rgba(220,38,38,0.25)] text-[13px] text-[#E58C8C]`}>{message}</div>;
}

function StatusPill({ status }: { status: string }) {
  const active = ["active", "completed", "registered"].includes(status);
  const pending = /pending|waiting|submitted|requested/.test(status);
  return (
    <span
      className={`inline-flex rounded-full border px-[9px] py-[5px] text-[11px] font-medium ${
        active
          ? "border-[rgba(22,163,74,0.28)] bg-[rgba(22,163,74,0.09)] text-[#82D39A]"
          : pending
            ? "border-[rgba(234,179,8,0.25)] bg-[rgba(234,179,8,0.08)] text-[#D9BE70]"
            : "border-[#1B1B1B] bg-[#101010] text-[#858585]"
      }`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function WorkspaceTabs({ mode }: { mode: Mode }) {
  const tabs: Array<{ mode: Mode; label: string; href: string }> = [
    { mode: "overview", label: "Meus dominios", href: "/dashboard/domains" },
    { mode: "acquire", label: "Adquirir", href: "/dashboard/domains/acquire" },
    { mode: "transfers", label: "Transferencias", href: "/dashboard/domains/transfers" },
  ];
  return (
    <nav className="mb-[16px] flex flex-wrap gap-[8px]">
      {tabs.map((tab) => (
        <Link
          key={tab.mode}
          href={tab.href}
          className={`${buttonClass} ${mode === tab.mode ? "!border-[#2459B8] !bg-[#0C2144] !text-[#A8C8FF]" : ""}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function ContactFields({ contact, onChange }: { contact: Contact; onChange: (next: Contact) => void }) {
  function field(key: keyof Contact, value: string) {
    onChange({ ...contact, [key]: value });
  }
  return (
    <div className="grid gap-[10px] sm:grid-cols-2">
      <input className={inputClass} placeholder="Nome completo" value={contact.fullName} onChange={(event) => field("fullName", event.target.value)} />
      <input className={inputClass} placeholder="E-mail do titular" type="email" value={contact.email} onChange={(event) => field("email", event.target.value)} />
      <input className={inputClass} placeholder="Telefone com DDD" value={contact.phone} onChange={(event) => field("phone", event.target.value)} />
      <input className={inputClass} placeholder="Endereco e numero" value={contact.street} onChange={(event) => field("street", event.target.value)} />
      <input className={inputClass} placeholder="Cidade" value={contact.city} onChange={(event) => field("city", event.target.value)} />
      <div className="grid grid-cols-2 gap-[10px]">
        <input className={inputClass} placeholder="UF" maxLength={2} value={contact.state} onChange={(event) => field("state", event.target.value.toUpperCase())} />
        <input className={inputClass} placeholder="CEP" value={contact.postalCode} onChange={(event) => field("postalCode", event.target.value)} />
      </div>
      <select className={inputClass} value={contact.documentType} onChange={(event) => field("documentType", event.target.value)}>
        <option value="cpf">CPF</option>
        <option value="cnpj">CNPJ</option>
        <option value="passport">Passaporte</option>
        <option value="none">Sem documento</option>
      </select>
      <input className={inputClass} placeholder="Documento do titular" value={contact.documentNumber} onChange={(event) => field("documentNumber", event.target.value)} />
    </div>
  );
}

function PixPanel({ order }: { order: PixOrder }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className={`${panelClass} border-[rgba(0,98,255,0.3)]`}>
      <div className="flex items-start justify-between gap-[14px]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#5F88D5]">Pagamento PIX</p>
          <h3 className="mt-[7px] text-[18px] font-semibold text-[#EEEEEE]">Pedido #{order.orderNumber}</h3>
          <p className="mt-[7px] text-[13px] text-[#777777]">
            A ativacao acontece automaticamente depois da aprovacao.
          </p>
        </div>
        <StatusPill status={order.status} />
      </div>
      <div className="mt-[18px] grid gap-[18px] md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex min-h-[180px] items-center justify-center rounded-[16px] border border-[#181818] bg-white p-[10px]">
          {order.qrCodeDataUri ? (
            <Image src={order.qrCodeDataUri} alt="QR Code PIX" width={160} height={160} unoptimized />
          ) : (
            <LoaderCircle className="h-[24px] w-[24px] animate-spin text-black" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[28px] font-semibold tracking-[-0.04em] text-white">{formatBrl(order.amount)}</p>
          <p className="mt-[7px] text-[12px] text-[#6F6F6F]">Vencimento: {formatDate(order.expiresAt)}</p>
          <button
            type="button"
            className={`${buttonClass} mt-[18px] w-full`}
            disabled={!order.qrCodeText}
            onClick={async () => {
              if (!order.qrCodeText) return;
              await navigator.clipboard.writeText(order.qrCodeText);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? <Check className="h-[15px] w-[15px]" /> : <Clipboard className="h-[15px] w-[15px]" />}
            {copied ? "Codigo copiado" : "Copiar PIX copia e cola"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Overview() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    jsonRequest<{ domains: Domain[] }>("/api/auth/me/domains")
      .then((payload) => setDomains(payload.domains || []))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao carregar dominios."));
  }, []);
  if (error) return <ErrorPanel message={error} />;
  if (!domains) return <LoadingPanel />;
  if (!domains.length) {
    return (
      <section className={`${panelClass} flex min-h-[280px] flex-col items-center justify-center text-center`}>
        <span className="inline-flex h-[54px] w-[54px] items-center justify-center rounded-[16px] border border-[#1A1A1A] bg-[#0E0E0E] text-[#8FB5FF]">
          <Globe2 className="h-[24px] w-[24px]" />
        </span>
        <h2 className="mt-[18px] text-[21px] font-semibold tracking-[-0.04em] text-[#EEEEEE]">Compre um dominio agora</h2>
        <p className="mt-[9px] max-w-[500px] text-[13px] leading-[1.65] text-[#737373]">
          Registro, renovacao, transferencia e DNS ficam centralizados aqui, sem expor os provedores.
        </p>
        <Link href="/dashboard/domains/acquire" className={`${primaryButtonClass} mt-[18px]`}>
          Buscar dominio <ArrowRight className="h-[15px] w-[15px]" />
        </Link>
      </section>
    );
  }
  return (
    <div className="grid gap-[12px]">
      {domains.map((domain) => (
        <article key={domain.id} className={panelClass}>
          <div className="flex flex-col gap-[14px] sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-[9px]">
                <h2 className="truncate text-[19px] font-semibold tracking-[-0.04em] text-[#EEEEEE]">{domain.fqdn}</h2>
                <StatusPill status={domain.status} />
              </div>
              <p className="mt-[8px] text-[12px] text-[#6F6F6F]">
                Renovacao {domain.autoRenew ? "automatica" : "manual"} · expira em {formatDate(domain.expirationDate)}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[14px] font-medium text-[#D8D8D8]">{formatBrl(domain.purchasePriceBrl)}</p>
              <p className="mt-[4px] text-[11px] text-[#5F5F5F]">DNS gerenciado pela Flowdesk</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function Acquire() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("domain") || "");
  const [results, setResults] = useState<DomainResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<DomainResult | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pixOrder, setPixOrder] = useState<PixOrder | null>(null);

  async function searchDomains(event?: FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setSelected(null);
    setQuote(null);
    try {
      const response = await fetch("/api/domains/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: query.trim() }),
      });
      if (!response.ok || !response.body) throw new Error("Busca de dominios indisponivel.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let nextResults: DomainResult[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as { isError?: boolean; message?: string; results?: DomainResult[] };
          if (chunk.isError) throw new Error(chunk.message || "Busca indisponivel.");
          nextResults = chunk.results || nextResults;
          setResults(nextResults);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao pesquisar dominios.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (query) void searchDomains();
    // Busca automatica somente na entrada via /domains.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectDomain(result: DomainResult) {
    setSelected(result);
    setQuote(null);
    setPixOrder(null);
    setBusy(true);
    setError(null);
    try {
      const payload = await jsonRequest<{ quote: Quote }>("/api/auth/me/domains/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn: result.domain, operation: "register", period_years: 1 }),
      });
      setQuote(payload.quote);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao cotar dominio.");
    } finally {
      setBusy(false);
    }
  }

  async function createPix() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const checkout = await jsonRequest<{ purchaseContext: unknown }>("/api/auth/me/domains/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id, contact }),
      });
      const payment = await jsonRequest<{ order: PixOrder }>("/api/auth/me/payments/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseContext: checkout.purchaseContext,
          payerName: contact.fullName,
          payerDocument: contact.documentNumber,
          expectedTotalAmount: quote.totalBrl,
          forceNew: true,
        }),
      });
      setPixOrder(payment.order);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao gerar pagamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-[14px]">
      <section className={panelClass}>
        <div className="flex items-center gap-[10px]">
          <span className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-[#1A1A1A] bg-[#101010] text-[#8FB5FF]"><Search className="h-[17px] w-[17px]" /></span>
          <div>
            <h2 className="text-[17px] font-semibold text-[#EEEEEE]">Encontre seu novo dominio</h2>
            <p className="mt-[3px] text-[12px] text-[#666666]">Preco final em BRL, ja com a margem de 20%.</p>
          </div>
        </div>
        <form className="mt-[16px] flex gap-[9px]" onSubmit={searchDomains}>
          <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="suaempresa.com.br" />
          <button className={primaryButtonClass} disabled={searching}>
            {searching ? <LoaderCircle className="h-[15px] w-[15px] animate-spin" /> : <Search className="h-[15px] w-[15px]" />}
            <span className="hidden sm:inline">Pesquisar</span>
          </button>
        </form>
      </section>

      {error ? <ErrorPanel message={error} /> : null}

      {results.length ? (
        <section className={panelClass}>
          <div className="grid gap-[9px]">
            {results.map((result) => (
              <button
                type="button"
                key={result.domain}
                disabled={!result.isAvailable || busy}
                onClick={() => void selectDomain(result)}
                className={`flex items-center justify-between gap-[14px] rounded-[14px] border px-[14px] py-[13px] text-left transition-colors ${
                  selected?.domain === result.domain
                    ? "border-[#2459B8] bg-[#0C1A31]"
                    : "border-[#171717] bg-[#0C0C0C] hover:border-[#252525]"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <span>
                  <span className="block text-[15px] font-medium text-[#E8E8E8]">{result.domain}</span>
                  <span className="mt-[4px] block text-[11px] text-[#666666]">
                    {result.isAvailable ? "Disponivel para registro" : result.reason || "Indisponivel"}
                  </span>
                </span>
                <span className="shrink-0 text-[14px] font-semibold text-[#D8D8D8]">{formatBrl(result.price)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {quote && selected ? (
        <section className={panelClass}>
          <div className="flex flex-wrap items-start justify-between gap-[12px] border-b border-[#151515] pb-[16px]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#5F88D5]">Finalizar registro</p>
              <h3 className="mt-[7px] text-[19px] font-semibold text-[#EEEEEE]">{selected.domain}</h3>
            </div>
            <p className="text-[22px] font-semibold tracking-[-0.04em] text-white">{formatBrl(quote.totalBrl)}</p>
          </div>
          <div className="mt-[16px]">
            <ContactFields contact={contact} onChange={setContact} />
            <button type="button" className={`${primaryButtonClass} mt-[14px] w-full`} disabled={busy} onClick={() => void createPix()}>
              {busy ? <LoaderCircle className="h-[15px] w-[15px] animate-spin" /> : <ShieldCheck className="h-[15px] w-[15px]" />}
              Gerar PIX e reservar dominio
            </button>
          </div>
        </section>
      ) : null}

      {pixOrder ? <PixPanel order={pixOrder} /> : null}
    </div>
  );
}

function Transfers() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [fqdn, setFqdn] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pixOrder, setPixOrder] = useState<PixOrder | null>(null);
  const [outboundCode, setOutboundCode] = useState<{ fqdn: string; code: string } | null>(null);

  async function loadTransfers() {
    try {
      const payload = await jsonRequest<{ transfers: Transfer[] }>("/api/auth/me/domains/transfers");
      setTransfers(payload.transfers || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar transferencias.");
    }
  }

  useEffect(() => {
    void loadTransfers();
    jsonRequest<{ domains: Domain[] }>("/api/auth/me/domains")
      .then((payload) => setDomains(payload.domains || []))
      .catch(() => setDomains([]));
  }, []);

  async function createOutboundCode(domain: Domain) {
    setBusy(true);
    setError(null);
    try {
      if (domain.transferLock) {
        await jsonRequest(`/api/auth/me/domains/${domain.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "transfer_lock", locked: false }),
        });
      }
      const payload = await jsonRequest<{ authCode: string }>(`/api/auth/me/domains/${domain.id}/auth-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      setOutboundCode({ fqdn: domain.fqdn, code: payload.authCode });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao gerar Auth Code.");
    } finally {
      setBusy(false);
    }
  }

  async function startTransfer(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const quotePayload = await jsonRequest<{ quote: Quote }>("/api/auth/me/domains/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqdn, operation: "transfer", period_years: 1 }),
      });
      const checkout = await jsonRequest<{ purchaseContext: unknown }>("/api/auth/me/domains/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quotePayload.quote.id, authCode, contact }),
      });
      const payment = await jsonRequest<{ order: PixOrder }>("/api/auth/me/payments/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseContext: checkout.purchaseContext,
          payerName: contact.fullName,
          payerDocument: contact.documentNumber,
          expectedTotalAmount: quotePayload.quote.totalBrl,
          forceNew: true,
        }),
      });
      setPixOrder(payment.order);
      await loadTransfers();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao iniciar transferencia.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-[14px]">
      <section className={panelClass}>
        <div className="flex items-start gap-[11px]">
          <span className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] border border-[#1A1A1A] bg-[#101010] text-[#8FB5FF]"><ArrowRight className="h-[17px] w-[17px]" /></span>
          <div>
            <h2 className="text-[17px] font-semibold text-[#EEEEEE]">Trazer dominio para a Flowdesk</h2>
            <p className="mt-[5px] text-[12px] leading-[1.6] text-[#6F6F6F]">
              Desbloqueie o dominio no painel atual e informe o Auth Code/EPP. A transferencia usa fallback automatico e, depois de concluida, o DNS passa para a Cloudflare.
            </p>
          </div>
        </div>
        <form className="mt-[18px] space-y-[10px]" onSubmit={startTransfer}>
          <div className="grid gap-[10px] sm:grid-cols-2">
            <input className={inputClass} value={fqdn} onChange={(event) => setFqdn(event.target.value)} placeholder="dominio.com" />
            <input className={inputClass} value={authCode} onChange={(event) => setAuthCode(event.target.value)} placeholder="Auth Code / EPP" />
          </div>
          <ContactFields contact={contact} onChange={setContact} />
          <button className={`${primaryButtonClass} w-full`} disabled={busy}>
            {busy ? <LoaderCircle className="h-[15px] w-[15px] animate-spin" /> : <ArrowRight className="h-[15px] w-[15px]" />}
            Cotar transferencia e gerar PIX
          </button>
        </form>
      </section>
      {error ? <ErrorPanel message={error} /> : null}
      {pixOrder ? <PixPanel order={pixOrder} /> : null}
      <section className={panelClass}>
        <h2 className="text-[16px] font-semibold text-[#EEEEEE]">Transferir para outro painel</h2>
        <p className="mt-[7px] text-[12px] leading-[1.6] text-[#6F6F6F]">
          A Flowdesk remove o bloqueio de transferencia e gera o Auth Code para o registrador de destino.
        </p>
        {outboundCode ? (
          <div className="mt-[14px] rounded-[14px] border border-[rgba(0,98,255,0.32)] bg-[#0C1A31] p-[14px]">
            <p className="text-[12px] text-[#7FA8F3]">{outboundCode.fqdn}</p>
            <div className="mt-[8px] flex items-center gap-[8px]">
              <code className="min-w-0 flex-1 truncate rounded-[10px] bg-[#080D16] px-[12px] py-[10px] text-[13px] text-[#E8E8E8]">{outboundCode.code}</code>
              <button type="button" className={buttonClass} onClick={() => navigator.clipboard.writeText(outboundCode.code)}>
                <Clipboard className="h-[14px] w-[14px]" /> Copiar
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-[14px] grid gap-[8px]">
          {domains.filter((domain) => domain.status === "active").map((domain) => (
            <div key={domain.id} className="flex flex-wrap items-center justify-between gap-[12px] rounded-[14px] border border-[#171717] bg-[#0C0C0C] px-[14px] py-[13px]">
              <div>
                <p className="text-[14px] font-medium text-[#E3E3E3]">{domain.fqdn}</p>
                <p className="mt-[4px] text-[11px] text-[#666666]">{domain.transferLock ? "Bloqueio ativo" : "Pronto para transferir"}</p>
              </div>
              <button type="button" className={buttonClass} disabled={busy} onClick={() => void createOutboundCode(domain)}>
                Gerar Auth Code
              </button>
            </div>
          ))}
          {!domains.some((domain) => domain.status === "active") ? (
            <p className="text-[13px] text-[#666666]">Nenhum dominio ativo disponivel para transferencia de saida.</p>
          ) : null}
        </div>
      </section>
      <section className={panelClass}>
        <h2 className="text-[16px] font-semibold text-[#EEEEEE]">Transferencias recentes</h2>
        {!transfers ? (
          <div className="mt-[18px] flex items-center text-[13px] text-[#777777]"><LoaderCircle className="mr-[8px] h-[15px] w-[15px] animate-spin" />Carregando...</div>
        ) : transfers.length ? (
          <div className="mt-[14px] grid gap-[8px]">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-[12px] rounded-[14px] border border-[#171717] bg-[#0C0C0C] px-[14px] py-[13px]">
                <div>
                  <p className="text-[14px] font-medium text-[#E3E3E3]">{transfer.fqdn}</p>
                  <p className="mt-[4px] text-[11px] text-[#666666]">{transfer.direction === "in" ? "Entrada" : "Saida"} · {formatDate(transfer.initiatedAt)}</p>
                </div>
                <StatusPill status={transfer.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-[12px] text-[13px] text-[#6F6F6F]">Nenhuma transferencia iniciada.</p>
        )}
      </section>
    </div>
  );
}

export function DomainsWorkspace({ mode }: { mode: Mode }) {
  return (
    <div className="mt-[24px]">
      <WorkspaceTabs mode={mode} />
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
        <section key={card.title} className={panelClass}>
          <card.icon className="h-[19px] w-[19px] text-[#8FB5FF]" />
          <h2 className="mt-[14px] text-[16px] font-semibold text-[#EEEEEE]">{card.title}</h2>
          <p className="mt-[7px] text-[12px] leading-[1.6] text-[#6F6F6F]">{card.text}</p>
          <span className="mt-[16px] inline-flex rounded-full border border-[#1B1B1B] bg-[#101010] px-[9px] py-[5px] text-[11px] text-[#777777]">Em preparacao</span>
        </section>
      ))}
    </div>
  );
}
