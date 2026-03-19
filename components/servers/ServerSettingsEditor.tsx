"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ConfigStepMultiSelect } from "@/components/config/ConfigStepMultiSelect";
import { ConfigStepSelect } from "@/components/config/ConfigStepSelect";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { serversScale } from "@/components/servers/serversScale";

type ManagedServerStatus = "paid" | "expired" | "off";
type EditorTab = "settings" | "payments" | "methods";
type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "failed";

type SelectOption = {
  id: string;
  name: string;
};

type PaymentOrder = {
  id: number;
  orderNumber: number;
  guildId: string;
  method: "pix" | "card";
  status: PaymentStatus;
  amount: number;
  currency: string;
  providerStatusDetail: string | null;
  card: {
    brand: string | null;
    firstSix: string | null;
    lastFour: string | null;
    expMonth: number | null;
    expYear: number | null;
  } | null;
  createdAt: string;
};

type SavedMethod = {
  id: string;
  brand: string | null;
  firstSix: string;
  lastFour: string;
  expMonth: number | null;
  expYear: number | null;
  timesUsed: number;
};

type ServerSettingsEditorProps = {
  guildId: string;
  guildName: string;
  status: ManagedServerStatus;
  allServers: Array<{
    guildId: string;
    guildName: string;
    iconUrl: string | null;
  }>;
  onClose: () => void;
  standalone?: boolean;
};

const TAB_INDEX: Record<EditorTab, number> = {
  settings: 0,
  payments: 1,
  methods: 2,
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function statusBadge(status: ManagedServerStatus) {
  if (status === "paid") return { label: "Pago", cls: "border-[#6AE25A] bg-[rgba(106,226,90,0.2)] text-[#6AE25A]" };
  if (status === "expired") return { label: "Expirado", cls: "border-[#F2C823] bg-[rgba(242,200,35,0.2)] text-[#F2C823]" };
  return { label: "Desligado", cls: "border-[#DB4646] bg-[rgba(219,70,70,0.2)] text-[#DB4646]" };
}

function orderStatusBadge(status: PaymentStatus) {
  if (status === "approved") return { label: "Pago", cls: "border-[#6AE25A] bg-[rgba(106,226,90,0.2)] text-[#6AE25A]" };
  if (status === "pending") return { label: "Pendente", cls: "border-[#D8D8D8] bg-[rgba(216,216,216,0.12)] text-[#D8D8D8]" };
  if (status === "expired") return { label: "Expirado", cls: "border-[#F2C823] bg-[rgba(242,200,35,0.2)] text-[#F2C823]" };
  if (status === "cancelled") return { label: "Cancelado", cls: "border-[#DB4646] bg-[rgba(219,70,70,0.2)] text-[#DB4646]" };
  if (status === "rejected") return { label: "Rejeitado", cls: "border-[#DB4646] bg-[rgba(219,70,70,0.2)] text-[#DB4646]" };
  return { label: "Falhou", cls: "border-[#DB4646] bg-[rgba(219,70,70,0.2)] text-[#DB4646]" };
}

function cardBrandLabel(brand: string | null) {
  const normalized = (brand || "").toLowerCase();
  if (normalized === "visa") return "Visa";
  if (normalized === "mastercard") return "Mastercard";
  if (normalized === "amex") return "American Express";
  if (normalized === "elo") return "Elo";
  return brand ? brand.toUpperCase() : "Cartao";
}

function cardBrandIcon(brand: string | null) {
  const normalized = (brand || "").toLowerCase();
  if (normalized === "visa") return "/cdn/icons/card_visa.svg";
  if (normalized === "mastercard") return "/cdn/icons/card_mastercard.svg";
  if (normalized === "amex") return "/cdn/icons/card_amex.svg";
  if (normalized === "elo") return "/cdn/icons/card_elo.svg";
  return "/cdn/icons/card_.png";
}

function formatDateTime(value: string | null) {
  if (!value) return "--";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(amount);
}

export function ServerSettingsEditor({
  guildId,
  guildName,
  status,
  allServers,
  onClose,
  standalone = false,
}: ServerSettingsEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("settings");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [textChannelOptions, setTextChannelOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<SelectOption[]>([]);

  const [menuChannelId, setMenuChannelId] = useState<string | null>(null);
  const [ticketsCategoryId, setTicketsCategoryId] = useState<string | null>(null);
  const [logsCreatedChannelId, setLogsCreatedChannelId] = useState<string | null>(null);
  const [logsClosedChannelId, setLogsClosedChannelId] = useState<string | null>(null);

  const [adminRoleId, setAdminRoleId] = useState<string | null>(null);
  const [claimRoleIds, setClaimRoleIds] = useState<string[]>([]);
  const [closeRoleIds, setCloseRoleIds] = useState<string[]>([]);
  const [notifyRoleIds, setNotifyRoleIds] = useState<string[]>([]);

  const [isPaymentsLoading, setIsPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [methods, setMethods] = useState<SavedMethod[]>([]);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"all" | PaymentStatus>("all");
  const [paymentGuildFilter, setPaymentGuildFilter] = useState<string>(guildId);
  const [methodSearch, setMethodSearch] = useState("");
  const [methodStatusFilter, setMethodStatusFilter] = useState<"all" | PaymentStatus>("all");
  const [methodGuildFilter, setMethodGuildFilter] = useState<string>(guildId);

  const locked = status === "expired" || status === "off";
  const headerStatus = statusBadge(status);

  useEffect(() => {
    setActiveTab("settings");
    setPaymentGuildFilter(guildId);
    setPaymentSearch("");
    setPaymentStatusFilter("all");
    setMethodGuildFilter(guildId);
    setMethodSearch("");
    setMethodStatusFilter("all");
  }, [guildId]);

  useEffect(() => {
    let mounted = true;
    async function loadSettings() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [channelsRes, ticketRes, rolesRes, staffRes] = await Promise.all([
          fetch(`/api/auth/me/guilds/channels?guildId=${guildId}`, { cache: "no-store" }),
          fetch(`/api/auth/me/guilds/ticket-settings?guildId=${guildId}`, { cache: "no-store" }),
          fetch(`/api/auth/me/guilds/roles?guildId=${guildId}`, { cache: "no-store" }),
          fetch(`/api/auth/me/guilds/ticket-staff-settings?guildId=${guildId}`, { cache: "no-store" }),
        ]);

        const channels = await channelsRes.json();
        const ticket = await ticketRes.json();
        const roles = await rolesRes.json();
        const staff = await staffRes.json();

        if (!mounted) return;
        if (!channelsRes.ok || !channels.ok || !channels.channels) {
          throw new Error(channels.message || "Falha ao carregar canais.");
        }
        if (!rolesRes.ok || !roles.ok || !roles.roles) {
          throw new Error(roles.message || "Falha ao carregar cargos.");
        }

        const text = channels.channels.text.map((c: { id: string; name: string }) => ({ id: c.id, name: `# ${c.name}` }));
        const cats = channels.channels.categories.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
        const roleList = roles.roles as SelectOption[];
        setTextChannelOptions(text);
        setCategoryOptions(cats);
        setRoleOptions(roleList);

        const textSet = new Set(text.map((item: SelectOption) => item.id));
        const catSet = new Set(cats.map((item: SelectOption) => item.id));
        const roleSet = new Set(roleList.map((item: SelectOption) => item.id));

        const ticketSettings = ticketRes.ok && ticket.ok ? ticket.settings : null;
        const staffSettings = staffRes.ok && staff.ok ? staff.settings : null;

        setMenuChannelId(ticketSettings?.menuChannelId && textSet.has(ticketSettings.menuChannelId) ? ticketSettings.menuChannelId : null);
        setTicketsCategoryId(ticketSettings?.ticketsCategoryId && catSet.has(ticketSettings.ticketsCategoryId) ? ticketSettings.ticketsCategoryId : null);
        setLogsCreatedChannelId(ticketSettings?.logsCreatedChannelId && textSet.has(ticketSettings.logsCreatedChannelId) ? ticketSettings.logsCreatedChannelId : null);
        setLogsClosedChannelId(ticketSettings?.logsClosedChannelId && textSet.has(ticketSettings.logsClosedChannelId) ? ticketSettings.logsClosedChannelId : null);

        setAdminRoleId(staffSettings?.adminRoleId && roleSet.has(staffSettings.adminRoleId) ? staffSettings.adminRoleId : null);
        setClaimRoleIds(Array.isArray(staffSettings?.claimRoleIds) ? staffSettings.claimRoleIds.filter((id: string) => roleSet.has(id)) : []);
        setCloseRoleIds(Array.isArray(staffSettings?.closeRoleIds) ? staffSettings.closeRoleIds.filter((id: string) => roleSet.has(id)) : []);
        setNotifyRoleIds(Array.isArray(staffSettings?.notifyRoleIds) ? staffSettings.notifyRoleIds.filter((id: string) => roleSet.has(id)) : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Erro ao carregar configuracoes.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void loadSettings();
    return () => {
      mounted = false;
    };
  }, [guildId]);

  useEffect(() => {
    let mounted = true;
    async function loadPayments() {
      setIsPaymentsLoading(true);
      setPaymentsError(null);
      try {
        const response = await fetch("/api/auth/me/payments/history", { cache: "no-store" });
        const payload = await response.json();
        if (!mounted) return;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Falha ao carregar pagamentos.");
        }
        setOrders((payload.orders || []) as PaymentOrder[]);
        setMethods((payload.methods || []) as SavedMethod[]);
      } catch (error) {
        if (!mounted) return;
        setPaymentsError(error instanceof Error ? error.message : "Erro ao carregar pagamentos.");
      } finally {
        if (mounted) setIsPaymentsLoading(false);
      }
    }
    void loadPayments();
    return () => {
      mounted = false;
    };
  }, []);

  const serverMap = useMemo(() => {
    const map = new Map<string, { guildName: string; iconUrl: string | null }>();
    for (const server of allServers) {
      map.set(server.guildId, { guildName: server.guildName, iconUrl: server.iconUrl });
    }
    if (!map.has(guildId)) {
      map.set(guildId, { guildName, iconUrl: null });
    }
    return map;
  }, [allServers, guildId, guildName]);

  const serverOptions = useMemo(() => {
    const options = Array.from(serverMap.entries()).map(([id, info]) => ({ id, name: info.guildName }));
    options.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return [{ id: "all", name: "Todos servidores" }, ...options];
  }, [serverMap]);

  const filteredOrders = useMemo(() => {
    const search = normalizeSearch(paymentSearch);
    return orders.filter((order) => {
      if (paymentStatusFilter !== "all" && order.status !== paymentStatusFilter) return false;
      if (paymentGuildFilter !== "all" && order.guildId !== paymentGuildFilter) return false;
      if (!search) return true;
      const guildLabel = serverMap.get(order.guildId)?.guildName || order.guildId;
      const text = normalizeSearch(`${order.orderNumber} ${order.guildId} ${guildLabel} ${order.method} ${order.status}`);
      return text.includes(search);
    });
  }, [orders, paymentGuildFilter, paymentSearch, paymentStatusFilter, serverMap]);

  const cardOrdersByMethod = useMemo(() => {
    const map = new Map<string, PaymentOrder[]>();
    for (const order of orders) {
      if (order.method !== "card" || !order.card?.firstSix || !order.card?.lastFour) continue;
      const methodKey = [
        (order.card.brand || "card").toLowerCase(),
        order.card.firstSix,
        order.card.lastFour,
        order.card.expMonth ?? "",
        order.card.expYear ?? "",
      ].join(":");

      const current = map.get(methodKey) || [];
      current.push(order);
      map.set(methodKey, current);
    }
    return map;
  }, [orders]);

  const filteredMethods = useMemo(() => {
    const search = normalizeSearch(methodSearch);

    return methods.filter((method) => {
      const relatedOrders = cardOrdersByMethod.get(method.id) || [];

      if (methodStatusFilter !== "all") {
        const matchesStatus = relatedOrders.some((order) => order.status === methodStatusFilter);
        if (!matchesStatus) return false;
      }

      if (methodGuildFilter !== "all") {
        const matchesGuild = relatedOrders.some((order) => order.guildId === methodGuildFilter);
        if (!matchesGuild) return false;
      }

      if (!search) return true;

      const brandLabel = cardBrandLabel(method.brand);
      const masked = `${method.firstSix} ${method.lastFour}`;
      const relatedServerNames = relatedOrders
        .map((order) => serverMap.get(order.guildId)?.guildName || order.guildId)
        .join(" ");
      const relatedStatuses = relatedOrders.map((order) => order.status).join(" ");
      const haystack = normalizeSearch(`${brandLabel} ${masked} ${relatedServerNames} ${relatedStatuses}`);
      return haystack.includes(search);
    });
  }, [
    cardOrdersByMethod,
    methodGuildFilter,
    methodSearch,
    methodStatusFilter,
    methods,
    serverMap,
  ]);

  const canSave = Boolean(
    !locked &&
      !isLoading &&
      !isSaving &&
      menuChannelId &&
      ticketsCategoryId &&
      logsCreatedChannelId &&
      logsClosedChannelId &&
      adminRoleId &&
      claimRoleIds.length &&
      closeRoleIds.length &&
      notifyRoleIds.length,
  );

  const handleSave = useCallback(async () => {
    if (!canSave || !adminRoleId) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const [ticketRes, staffRes] = await Promise.all([
        fetch("/api/auth/me/guilds/ticket-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guildId,
            menuChannelId,
            ticketsCategoryId,
            logsCreatedChannelId,
            logsClosedChannelId,
          }),
        }),
        fetch("/api/auth/me/guilds/ticket-staff-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guildId,
            adminRoleId,
            claimRoleIds,
            closeRoleIds,
            notifyRoleIds,
          }),
        }),
      ]);

      const ticket = await ticketRes.json();
      const staff = await staffRes.json();
      if (!ticketRes.ok || !ticket.ok) throw new Error(ticket.message || "Falha ao salvar canais.");
      if (!staffRes.ok || !staff.ok) throw new Error(staff.message || "Falha ao salvar staff.");
      setSuccessMessage("Configuracoes salvas com sucesso.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao salvar configuracoes.");
    } finally {
      setIsSaving(false);
    }
  }, [
    adminRoleId,
    canSave,
    claimRoleIds,
    closeRoleIds,
    guildId,
    logsClosedChannelId,
    logsCreatedChannelId,
    menuChannelId,
    notifyRoleIds,
    ticketsCategoryId,
  ]);

  return (
    <section
      className="flowdesk-fade-up-soft border border-[#2E2E2E] bg-[#0A0A0A]"
      style={{
        marginTop: standalone ? "0px" : `${serversScale.cardsTopSpacing}px`,
        borderRadius: `${serversScale.cardRadius}px`,
        padding: `${Math.max(16, serversScale.cardPadding + 4)}px`,
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] text-[#777777]">Configuracoes do servidor</p>
          <h2 className="truncate text-[18px] font-medium text-[#D8D8D8]">{guildName}</h2>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex h-[22px] items-center justify-center rounded-[3px] border px-3 text-[11px] ${headerStatus.cls}`}>
            {headerStatus.label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-[32px] rounded-[3px] border border-[#2E2E2E] bg-[#111111] px-3 text-[12px] text-[#D8D8D8] transition-colors hover:bg-[#171717]"
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 border-b border-[#242424] pb-3">
        {([
          ["settings", "Configuracoes"],
          ["payments", "Pagamentos"],
          ["methods", "Metodos"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-[3px] border px-3 py-[7px] text-[12px] transition-colors ${
              activeTab === tab
                ? "border-[#D8D8D8] bg-[#D8D8D8] text-black"
                : "border-[#2E2E2E] bg-[#0A0A0A] text-[#D8D8D8] hover:bg-[#121212]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden">
        <div
          className="flex w-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${TAB_INDEX[activeTab] * 100}%)` }}
        >
          <div className="w-full shrink-0">
            {isLoading ? (
              <div className="flex h-[180px] items-center justify-center">
                <ButtonLoader size={28} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-2">
                  <div className="flex flex-col gap-4">
                    <ConfigStepSelect label="Canal do menu principal de tickets" placeholder="Escolha o canal" options={textChannelOptions} value={menuChannelId} onChange={setMenuChannelId} disabled={isSaving || locked} />
                    <ConfigStepSelect label="Categoria onde os tickets serao abertos" placeholder="Escolha uma categoria" options={categoryOptions} value={ticketsCategoryId} onChange={setTicketsCategoryId} disabled={isSaving || locked} />
                    <ConfigStepSelect label="Canal de logs de criacao" placeholder="Escolha o canal de logs" options={textChannelOptions} value={logsCreatedChannelId} onChange={setLogsCreatedChannelId} disabled={isSaving || locked} />
                    <ConfigStepSelect label="Canal de logs de fechamento" placeholder="Escolha o canal de logs" options={textChannelOptions} value={logsClosedChannelId} onChange={setLogsClosedChannelId} disabled={isSaving || locked} />
                  </div>

                  <div className="flex flex-col gap-4">
                    <ConfigStepSelect label="Cargo administrador do ticket" placeholder="Escolha o cargo" options={roleOptions} value={adminRoleId} onChange={setAdminRoleId} disabled={isSaving || locked} />
                    <ConfigStepMultiSelect label="Cargos que podem assumir tickets" placeholder="Escolha os cargos" options={roleOptions} values={claimRoleIds} onChange={setClaimRoleIds} disabled={isSaving || locked} />
                    <ConfigStepMultiSelect label="Cargos que podem fechar tickets" placeholder="Escolha os cargos" options={roleOptions} values={closeRoleIds} onChange={setCloseRoleIds} disabled={isSaving || locked} />
                    <ConfigStepMultiSelect label="Cargos que podem enviar notificacao" placeholder="Escolha os cargos" options={roleOptions} values={notifyRoleIds} onChange={setNotifyRoleIds} disabled={isSaving || locked} />
                  </div>
                </div>

                {locked ? (
                  <p className="mt-2 text-[11px] text-[#C2C2C2]">
                    Plano expirado/desligado. Renove para liberar alteracoes.
                  </p>
                ) : null}

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSave();
                    }}
                    disabled={!canSave}
                    className="flex h-[42px] w-full items-center justify-center rounded-[3px] bg-[#D8D8D8] text-[13px] font-medium text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isSaving ? <ButtonLoader size={22} /> : "Salvar configuracoes"}
                  </button>
                  {errorMessage ? <p className="text-[11px] text-[#C2C2C2]">{errorMessage}</p> : null}
                  {successMessage ? <p className="text-[11px] text-[#9BD694]">{successMessage}</p> : null}
                </div>
              </>
            )}
          </div>

          <div className="w-full shrink-0 pl-0 min-[860px]:pl-[8px]">
            <div className="grid grid-cols-1 gap-3 min-[980px]:grid-cols-[1fr_auto_auto]">
              <input
                type="text"
                value={paymentSearch}
                onChange={(event) => setPaymentSearch(event.currentTarget.value)}
                placeholder="Pesquisar pagamento por ID, servidor ou metodo"
                className="h-[52px] rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 text-[15px] text-[#D8D8D8] placeholder:text-[#3A3A3A] outline-none"
              />
              <select value={paymentGuildFilter} onChange={(event) => setPaymentGuildFilter(event.currentTarget.value)} className="h-[52px] min-w-[238px] rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 text-[15px] text-[#D8D8D8] outline-none">
                {serverOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.currentTarget.value as "all" | PaymentStatus)} className="h-[52px] min-w-[213px] rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 text-[15px] text-[#D8D8D8] outline-none">
                <option value="all">Todos status</option>
                <option value="approved">Pago</option>
                <option value="pending">Pendente</option>
                <option value="expired">Expirado</option>
                <option value="cancelled">Cancelado</option>
                <option value="rejected">Rejeitado</option>
                <option value="failed">Falhou</option>
              </select>
            </div>

            <div className="mt-4 rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A]">
              {isPaymentsLoading ? (
                <div className="flex h-[275px] items-center justify-center">
                  <ButtonLoader size={28} />
                </div>
              ) : paymentsError ? (
                <p className="px-4 py-8 text-center text-[15px] text-[#C2C2C2]">{paymentsError}</p>
              ) : filteredOrders.length ? (
                <div className="max-h-[575px] overflow-y-auto thin-scrollbar">
                  {filteredOrders.map((order) => {
                    const badge = orderStatusBadge(order.status);
                    const methodIcon = order.method === "pix" ? "/cdn/icons/pix_.png" : cardBrandIcon(order.card?.brand || null);
                    const serverName = serverMap.get(order.guildId)?.guildName || order.guildId;
                    return (
                      <div key={order.id} className="flex items-start justify-between gap-3 border-b border-[#1C1C1C] px-4 py-3 last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="relative block h-[38px] w-[38px] shrink-0 overflow-hidden rounded-[3px] bg-[#111111]">
                              <Image src={methodIcon} alt="Metodo" fill sizes="30px" className="object-contain" unoptimized />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[15px] text-[#D8D8D8]">Pagamento #{order.orderNumber}</p>
                              <p className="truncate text-[14px] text-[#777777]">{serverName}</p>
                            </div>
                          </div>
                          {order.providerStatusDetail ? (
                            <p className="mt-2 truncate text-[12px] text-[#686868]">{order.providerStatusDetail}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`inline-flex rounded-[3px] border px-[10px] py-[4px] text-[12px] ${badge.cls}`}>{badge.label}</span>
                          <p className="mt-1 text-[12px] text-[#777777]">{formatDateTime(order.createdAt)}</p>
                          <p className="mt-1 text-[14px] text-[#D8D8D8]">{formatAmount(order.amount, order.currency)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-[15px] text-[#C2C2C2]">Nenhum pagamento encontrado para esse filtro.</p>
              )}
            </div>
          </div>

          <div className="w-full shrink-0 pl-0 min-[860px]:pl-[8px]">
            <div className="grid grid-cols-1 gap-3 min-[980px]:grid-cols-[1fr_auto_auto]">
              <input
                type="text"
                value={methodSearch}
                onChange={(event) => setMethodSearch(event.currentTarget.value)}
                placeholder="Pesquisar metodo por bandeira, final ou servidor"
                className="h-[52px] rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 text-[15px] text-[#D8D8D8] placeholder:text-[#3A3A3A] outline-none"
              />
              <select
                value={methodGuildFilter}
                onChange={(event) => setMethodGuildFilter(event.currentTarget.value)}
                className="h-[52px] min-w-[238px] rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 text-[15px] text-[#D8D8D8] outline-none"
              >
                {serverOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <select
                value={methodStatusFilter}
                onChange={(event) => setMethodStatusFilter(event.currentTarget.value as "all" | PaymentStatus)}
                className="h-[52px] min-w-[213px] rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 text-[15px] text-[#D8D8D8] outline-none"
              >
                <option value="all">Todos status</option>
                <option value="approved">Pago</option>
                <option value="pending">Pendente</option>
                <option value="expired">Expirado</option>
                <option value="cancelled">Cancelado</option>
                <option value="rejected">Rejeitado</option>
                <option value="failed">Falhou</option>
              </select>
            </div>

            <div className="mt-4">
              {isPaymentsLoading ? (
                <div className="flex h-[275px] items-center justify-center rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A]">
                  <ButtonLoader size={28} />
                </div>
              ) : filteredMethods.length ? (
                <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                  {filteredMethods.map((method) => {
                    const brandLabel = cardBrandLabel(method.brand);
                    const masked = `${method.firstSix} ****** ${method.lastFour}`;
                    return (
                      <article key={method.id} className="rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="relative block h-[40px] w-[40px] shrink-0 overflow-hidden rounded-[3px] bg-[#111111]">
                            <Image src={cardBrandIcon(method.brand)} alt={brandLabel} fill sizes="32px" className="object-contain" unoptimized />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[15px] text-[#D8D8D8]">{brandLabel}</p>
                            <p className="truncate text-[14px] text-[#777777]">{masked}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[12px] text-[#777777]">
                          <span>
                            Validade:{" "}
                            {method.expMonth && method.expYear
                              ? `${String(method.expMonth).padStart(2, "0")}/${String(method.expYear).slice(-2)}`
                              : "--/--"}
                          </span>
                          <span>{method.timesUsed} uso(s)</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 py-8 text-center text-[15px] text-[#C2C2C2]">
                  Nenhum metodo encontrado para esse filtro.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
