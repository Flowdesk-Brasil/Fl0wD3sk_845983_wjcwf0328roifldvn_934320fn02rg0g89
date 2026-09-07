"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Database, Download, Eye, EyeOff, Hash, MonitorSmartphone, Shield, TriangleAlert, Users } from "lucide-react";
import { ConfigStepMultiSelect } from "@/components/config/ConfigStepMultiSelect";
import { ConfigStepSelect } from "@/components/config/ConfigStepSelect";
import { TicketMessageBuilder } from "@/components/servers/TicketMessageBuilder";
import {
  ModuleCard,
  ModuleFieldsGrid,
  ModulePage,
  ModuleStat,
  optionLabel,
  optionLabels,
} from "@/components/servers/module-ui/ModuleUi";
import {
  isWhitelistModuleActive,
  type WhitelistSettingsDraft,
} from "@/lib/servers/whitelistSettingsModel";
import { looksLikePublicCityDbHost } from "@/lib/servers/whitelistHost";
import { cityDbProvisionSql, resolveCityDbLogin } from "@/lib/servers/cityDbDefaults";
import { previewNicknameFormat } from "@/lib/servers/whitelistNickname";
import {
  IDENTIFIER_KINDS,
  WHITELIST_MAPPING_PRESETS,
  type WhitelistMapping,
} from "@/lib/servers/whitelistMapping";
import { WHITELIST_TOKEN_HINTS } from "@/lib/servers/whitelistPanelBuilder";
import type { TicketPanelLayout } from "@/lib/servers/ticketPanelBuilder";

type ResourceSelectOption = { id: string; name: string };

type WhitelistSettingsSectionProps = {
  mode: "overview" | "database" | "message";
  guildId: string;
  disabled: boolean;
  draft: WhitelistSettingsDraft;
  textChannelOptions: ResourceSelectOption[];
  roleOptions: ResourceSelectOption[];
  controlHeightPx: number;
  onChange: (patch: Partial<WhitelistSettingsDraft>) => void;
  onPanelLayoutChange: (layout: TicketPanelLayout) => void;
  canSendEmbed?: boolean;
  isSendingEmbed?: boolean;
  onSendEmbed?: () => void;
};

const IDENTIFIER_OPTIONS = IDENTIFIER_KINDS.map((kind) => ({
  id: kind,
  name:
    kind === "discord_id"
      ? "Discord ID"
      : kind === "license"
        ? "FiveM license"
        : kind === "license2"
          ? "license2"
          : kind === "steam"
            ? "Steam"
            : kind === "rockstar"
              ? "Rockstar"
              : kind === "character_id"
                ? "ID do personagem"
                : kind === "internal_id"
                  ? "ID interno"
                  : "Identificador personalizado",
}));

const fieldLabelClassName =
  "mb-[8px] block text-[12px] font-medium text-[#5F5F5F]";

function LabeledField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={fieldLabelClassName}>{label}</label>
      {children}
      {hint ? (
        <p className="mt-[8px] text-[12px] leading-[1.5] text-[#6F6F74]">{hint}</p>
      ) : null}
    </div>
  );
}

function maskHost(value: string) {
  return String(value || "").replace(/[0-9A-Za-z]/g, "•");
}

function SpoilerIp({
  value,
  revealed,
  onToggle,
  className = "",
}: {
  value: string;
  revealed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={revealed ? "Ocultar IP" : "Mostrar IP"}
      className={`inline-flex max-w-full items-center rounded-[8px] bg-[#1A1A1A] px-[8px] py-[2px] align-middle font-mono text-[12px] text-[#D1D1D1] transition-colors hover:bg-[#222] ${className}`}
    >
      <span
        className={
          revealed
            ? ""
            : "pointer-events-none select-none blur-[7px] [filter:blur(7px)]"
        }
        aria-hidden={!revealed}
      >
        {revealed ? value : maskHost(value)}
      </span>
    </button>
  );
}

const fieldClassName =
  "h-[48px] w-full rounded-[14px] fd-field border border-[#1C1C1C] bg-[#141414] px-[14px] text-[14px] text-[#D1D1D1] outline-none transition-all placeholder:text-[#6F6F74] focus:border-[#2A2A2E] disabled:cursor-not-allowed disabled:opacity-60";

export function WhitelistSettingsSection({
  mode,
  guildId,
  disabled,
  draft,
  textChannelOptions,
  roleOptions,
  controlHeightPx,
  onChange,
  onPanelLayoutChange,
  canSendEmbed = false,
  isSendingEmbed = false,
  onSendEmbed,
}: WhitelistSettingsSectionProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionTone, setActionTone] = useState<"ok" | "error">("ok");
  const [showPassword, setShowPassword] = useState(false);
  const [showHost, setShowHost] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [liveLauncher, setLiveLauncher] = useState<{
    paired: boolean;
    online: boolean;
    hostname: string | null;
    publicIp: string | null;
    appVersion: string | null;
  } | null>(null);
  const launcherPaired = liveLauncher?.paired ?? draft.agentPaired;
  const launcherOnline = liveLauncher?.online ?? draft.agentOnline;
  const detectedPublicIp =
    liveLauncher?.publicIp ||
    (looksLikePublicCityDbHost(String(draft.agentPublicIp || ""))
      ? String(draft.agentPublicIp)
      : "");

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/auth/me/guilds/whitelist-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guildId, action: "status" }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          paired?: boolean;
          online?: boolean;
          hostname?: string | null;
          publicIp?: string | null;
          appVersion?: string | null;
        };
        if (cancelled || !payload.ok) return;
        setLiveLauncher({
          paired: Boolean(payload.paired),
          online: Boolean(payload.online),
          hostname: typeof payload.hostname === "string" ? payload.hostname : null,
          appVersion: typeof payload.appVersion === "string" ? payload.appVersion : null,
          publicIp:
            typeof payload.publicIp === "string" && looksLikePublicCityDbHost(payload.publicIp)
              ? payload.publicIp
              : null,
        });
      } catch {
        /* keep the last known status */
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 7000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [guildId]);

  useEffect(() => {
    if (!detectedPublicIp) return;
    if (looksLikePublicCityDbHost(draft.dbHost)) return;
    onChange({ dbHost: detectedPublicIp, connectionMode: "direct" });
  }, [detectedPublicIp, draft.dbHost, onChange]);

  async function connectDatabase() {
    setBusy("test");
    setActionMessage(null);
    try {
      if (!looksLikePublicCityDbHost(draft.dbHost || detectedPublicIp)) {
        throw new Error(
          "Informe o IP publico da VPS ou deixe o launcher aberto la para a Flowdesk detectar.",
        );
      }
      const login = resolveCityDbLogin({
        user: draft.dbUser,
        password: draft.dbPassword,
      });
      const dbName = draft.dbName.trim();
      if (!login.user || !login.password || !dbName) {
        throw new Error("Preencha o nome do banco, o usuario e a senha do MariaDB.");
      }
      if (/^\*[0-9A-Fa-f]{40}$/.test(login.password.trim())) {
        throw new Error(
          "Esse valor e o hash do HeidiSQL, nao a senha. Informe a senha em texto do usuario do banco.",
        );
      }
      onChange({
        dbUser: login.user,
        dbPassword: login.password,
        hasDbPassword: Boolean(login.password),
        dbName,
      });
      const response = await fetch("/api/auth/me/guilds/whitelist-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          action: "test",
          dbEngine: draft.dbEngine === "postgres" ? "postgres" : "mysql",
          dbHost: looksLikePublicCityDbHost(draft.dbHost) ? draft.dbHost : detectedPublicIp,
          dbPort: draft.dbPort || 3306,
          dbName,
          dbUser: login.user,
          dbSsl: false,
          dbPassword: login.password,
          mapping: draft.mapping,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Nao foi possivel conectar no MySQL.");
      }
      onChange({
        mapping: draft.mapping,
        mappingStatus: "validated",
        dbHost: looksLikePublicCityDbHost(draft.dbHost) ? draft.dbHost : detectedPublicIp,
        connectionMode: "direct",
        dbPassword: login.password,
        hasDbPassword: Boolean(login.password),
      });
      setActionTone("ok");
      const tableHint = draft.mapping.playerTable
        ? `${draft.mapping.playerTable}.${draft.mapping.whitelistColumn || "..."}`
        : "Defina a tabela e a coluna abaixo";
      setActionMessage(payload.message || `Banco conectado. Whitelist: ${tableHint}.`);
    } catch (error) {
      setActionTone("error");
      setActionMessage(error instanceof Error ? error.message : "Falha ao conectar no banco.");
    } finally {
      setBusy(null);
    }
  }

  async function installAgent() {
    setBusy("agent");
    setActionMessage(null);
    try {
      onChange({ connectionMode: "direct" });
      const response = await fetch(
        `/api/launcher/download?guildId=${encodeURIComponent(guildId)}`,
        {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        fileName?: string;
        message?: string;
      };
      if (!response.ok || !payload.ok || !payload.url) {
        throw new Error(
          payload.message ||
            "O instalador ainda nao esta publicado. Depois do merge, o GitHub gera o Setup.",
        );
      }
      const link = document.createElement("a");
      link.href = payload.url;
      link.download = payload.fileName || "FlowdeskLauncher-Setup.exe";
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setActionTone("ok");
      setActionMessage(
        "Download iniciado. Instale o launcher na VPS da cidade, entre com sua conta Flowdesk e mantenha o aplicativo aberto.",
      );
    } catch (error) {
      setActionTone("error");
      setActionMessage(error instanceof Error ? error.message : "Falha ao baixar o instalador.");
    } finally {
      setBusy(null);
    }
  }

  if (mode === "overview") {
    return (
      <ModulePage>
        <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
          <ModuleStat
            label="Status"
            value={isWhitelistModuleActive(draft) ? "Ativo" : "Desligado"}
            hint="Modulo de whitelist"
            icon={Shield}
            delay={0.06}
          />
          <ModuleStat
            label="Painel"
            value={optionLabel(textChannelOptions, draft.panelChannelId)}
            hint="Canal do embed"
            icon={Hash}
            delay={0.1}
          />
          <ModuleStat
            label="Analise"
            value={draft.approvalMode === "automatic" ? "Automatico" : optionLabels(roleOptions, draft.reviewRoleIds)}
            hint={draft.approvalMode === "automatic" ? "Libera ao informar o ID" : "Quem aprova"}
            icon={Users}
            delay={0.14}
          />
          <ModuleStat
            label="Banco"
            value={draft.lastHealthOk ? "Saudavel" : draft.lastHealthAt ? "Instavel" : "Nao testado"}
            hint={
              looksLikePublicCityDbHost(draft.dbHost || detectedPublicIp)
                ? "IP da VPS oculto"
                : launcherOnline
                  ? "IP publico pendente"
                  : "Aguardando VPS"
            }
            icon={Database}
            delay={0.18}
          />
        </div>

        <ModuleCard
          label="Canais e cargos"
          title="Fluxo no Discord"
          description="Defina canais, cargos e como o apelido do membro fica no Discord depois da liberacao."
          delay={0.16}
        >
          <ModuleFieldsGrid>
            <ConfigStepSelect
              label="Modo de aprovacao"
              placeholder="Como liberar"
              options={[
                { id: "manual", name: "Analise da staff" },
                { id: "automatic", name: "Automatico (informa o ID e libera)" },
              ]}
              value={draft.approvalMode}
              onChange={(value) =>
                onChange({
                  approvalMode: value === "automatic" ? "automatic" : "manual",
                })
              }
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepSelect
              label="Canal do painel"
              placeholder="Escolha o canal"
              options={textChannelOptions}
              value={draft.panelChannelId}
              onChange={(value) => onChange({ panelChannelId: value })}
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepSelect
              label={draft.approvalMode === "automatic" ? "Canal de analise (opcional)" : "Canal de analise"}
              placeholder="Escolha o canal"
              options={textChannelOptions}
              value={draft.reviewChannelId}
              onChange={(value) => onChange({ reviewChannelId: value })}
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepSelect
              label="Canal de logs"
              placeholder="Escolha o canal"
              options={textChannelOptions}
              value={draft.logsChannelId}
              onChange={(value) => onChange({ logsChannelId: value })}
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepSelect
              label="Identificador do jogador"
              placeholder="Tipo"
              options={IDENTIFIER_OPTIONS}
              value={draft.identifierKind}
              onChange={(value) =>
                onChange({ identifierKind: value as WhitelistSettingsDraft["identifierKind"] })
              }
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepMultiSelect
              label="Cargos que analisam"
              placeholder={
                draft.approvalMode === "automatic"
                  ? "Nao usado no modo automatico"
                  : "Vazio = Gerenciar Servidor"
              }
              options={roleOptions}
              values={draft.reviewRoleIds}
              onChange={(values) => onChange({ reviewRoleIds: values })}
              disabled={disabled || draft.approvalMode === "automatic"}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepMultiSelect
              label="Cargos ao aprovar"
              placeholder="Opcional"
              options={roleOptions}
              values={draft.approvedRoleIds}
              onChange={(values) => onChange({ approvedRoleIds: values })}
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepMultiSelect
              label="Cargos ao reprovar"
              placeholder="Opcional"
              options={roleOptions}
              values={draft.deniedRoleIds}
              onChange={(values) => onChange({ deniedRoleIds: values })}
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
          </ModuleFieldsGrid>
          <div className="mt-[16px] grid grid-cols-1 gap-[16px] xl:grid-cols-2">
            <div>
              <label className="mb-[8px] block text-[12px] font-medium text-[#5F5F5F]">
                Rotulo do campo
              </label>
              <input
                value={draft.identifierLabel}
                onChange={(event) => onChange({ identifierLabel: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </div>
            <div>
              <label className="mb-[8px] block text-[12px] font-medium text-[#5F5F5F]">
                Placeholder do modal
              </label>
              <input
                value={draft.identifierPlaceholder}
                onChange={(event) =>
                  onChange({ identifierPlaceholder: event.currentTarget.value })
                }
                disabled={disabled}
                className={fieldClassName}
              />
            </div>
            <div className="xl:col-span-2">
              <label className="mb-[8px] block text-[12px] font-medium text-[#5F5F5F]">
                Formato do apelido
              </label>
              <input
                value={draft.nicknameFormat}
                placeholder="{nome} | {ID}"
                onChange={(event) => onChange({ nicknameFormat: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
              <p className="mt-[8px] text-[12px] leading-[1.5] text-[#6F6F74]">
                Use {"{nome}"} para o nome do Discord e {"{ID}"} para o identificador liberado.
                Exemplo: {previewNicknameFormat(draft.nicknameFormat)}
              </p>
            </div>
          </div>
        </ModuleCard>
      </ModulePage>
    );
  }

  if (mode === "database") {
    return (
      <ModulePage>
        <ModuleCard
          label="Passo 1"
          title="Launcher na VPS"
          description="Instale o launcher na VPS da cidade, entre com a conta Flowdesk e mantenha o aplicativo aberto para o painel falar com o banco local."
          delay={0.12}
        >
          <div className="overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.06)] bg-[linear-gradient(180deg,#101010_0%,#0B0B0B_100%)]">
            <div className="flex flex-col gap-[16px] px-[18px] py-[16px] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-[14px]">
                <div className="grid h-[42px] w-[42px] place-items-center rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[#141414] text-[#F4F4F5]">
                  <MonitorSmartphone className="h-[18px] w-[18px]" strokeWidth={1.7} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-[8px]">
                    <p className="text-[14px] font-semibold text-[#F4F4F5]">Flowdesk Launcher</p>
                    <span className="rounded-full bg-[#171717] px-[8px] py-[3px] text-[10px] font-semibold tracking-[0.14em] text-[#8A8A8E] uppercase">
                      VPS
                    </span>
                  </div>
                  <p className="mt-[4px] text-[13px] leading-[1.55] text-[#8A8A8E]">
                    {launcherOnline ? (
                      <>
                        Conectado
                        {liveLauncher?.hostname ? ` · ${liveLauncher.hostname}` : ""}
                        {detectedPublicIp ? (
                          <>
                            {" · "}
                            <SpoilerIp
                              value={detectedPublicIp}
                              revealed={showHost}
                              onToggle={() => setShowHost((value) => !value)}
                            />
                          </>
                        ) : null}
                      </>
                    ) : launcherPaired
                      ? "Launcher vinculado. Abra o aplicativo na VPS da cidade para continuar."
                      : "Baixe o instalador, instale na VPS da cidade e entre com sua conta Flowdesk."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-[10px] sm:justify-end">
                {launcherOnline ? (
                  <span className="inline-flex h-[32px] items-center gap-[6px] rounded-full bg-[rgba(134,239,172,0.08)] px-[10px] text-[12px] font-semibold text-[#86EFAC]">
                    <Check className="h-[13px] w-[13px]" strokeWidth={2.2} />
                    No ar
                  </span>
                ) : launcherPaired ? (
                  <span className="inline-flex h-[32px] items-center gap-[6px] rounded-full bg-[rgba(246,212,138,0.08)] px-[10px] text-[12px] font-semibold text-[#F6D48A]">
                    <TriangleAlert className="h-[13px] w-[13px]" strokeWidth={2} />
                    Abra na VPS
                  </span>
                ) : (
                  <span className="inline-flex h-[32px] items-center rounded-full bg-[#141414] px-[10px] text-[12px] font-semibold text-[#9A9A9E]">
                    Instalar
                  </span>
                )}
                <button
                  type="button"
                  disabled={disabled || Boolean(busy)}
                  onClick={() => void installAgent()}
                  className="inline-flex h-[36px] items-center gap-[8px] rounded-full bg-white px-[14px] text-[13px] font-semibold text-[#111] transition-transform duration-200 hover:-translate-y-px disabled:opacity-50"
                >
                  <Download className="h-[15px] w-[15px]" />
                  {busy === "agent" ? "Baixando..." : "Baixar Setup"}
                </button>
              </div>
            </div>
            {busy === "agent" ? (
              <div className="h-[3px] overflow-hidden bg-[#141414]">
                <div className="h-full w-1/2 animate-pulse bg-white" />
              </div>
            ) : null}
          </div>
        </ModuleCard>

        <ModuleCard
          label="Passo 2"
          title="Dados do banco"
          description="Informe o IP publico da VPS e as credenciais do banco da cidade. Use o mesmo usuario e senha que voce criar no HeidiSQL."
          delay={0.16}
        >
          <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-2">
            <LabeledField
              label="IP publico da VPS"
              hint={
                detectedPublicIp
                  ? "Detectado automaticamente. Clique no olho para ver o IP."
                  : "Use o IP publico da VPS. O launcher preenche este campo quando estiver online."
              }
            >
              <div className="relative">
                <input
                  placeholder="IP da VPS"
                  value={draft.dbHost}
                  autoComplete="off"
                  spellCheck={false}
                  onFocus={() => setShowHost(true)}
                  onChange={(event) => {
                    setShowHost(true);
                    onChange({ dbHost: event.currentTarget.value });
                  }}
                  disabled={disabled}
                  className={`${fieldClassName} pr-[46px] ${
                    showHost || !draft.dbHost
                      ? ""
                      : "select-none caret-transparent blur-[6px] [-webkit-text-security:disc]"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowHost((value) => !value)}
                  className="absolute top-1/2 right-[12px] z-[1] -translate-y-1/2 text-[#8A8A8E] transition-colors hover:text-[#F4F4F5]"
                  aria-label={showHost ? "Ocultar IP" : "Mostrar IP"}
                >
                  {showHost ? (
                    <EyeOff className="h-[16px] w-[16px]" strokeWidth={1.8} />
                  ) : (
                    <Eye className="h-[16px] w-[16px]" strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </LabeledField>
            <LabeledField label="Nome do banco" hint="Nome do banco da cidade no HeidiSQL, por exemplo vrp ou essence.">
              <input
                placeholder="nome_do_banco"
                value={draft.dbName}
                autoComplete="off"
                onChange={(event) => onChange({ dbName: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField
              label="Usuario"
              hint="Usuario do MariaDB criado para a Flowdesk acessar o banco da cidade."
            >
              <input
                placeholder="usuario"
                value={draft.dbUser}
                autoComplete="off"
                onChange={(event) => onChange({ dbUser: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField
              label="Senha"
              hint="Senha em texto do usuario. Nao cole o hash que comeca com * no HeidiSQL."
            >
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="off"
                  placeholder="senha do usuario"
                  value={draft.dbPassword}
                  onChange={(event) =>
                    onChange({
                      dbPassword: event.currentTarget.value,
                      hasDbPassword: Boolean(event.currentTarget.value),
                    })
                  }
                  disabled={disabled}
                  className={`${fieldClassName} pr-[46px]`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute top-1/2 right-[12px] -translate-y-1/2 text-[#8A8A8E] transition-colors hover:text-[#F4F4F5]"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="h-[16px] w-[16px]" strokeWidth={1.8} />
                  ) : (
                    <Eye className="h-[16px] w-[16px]" strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </LabeledField>
            <LabeledField label="Porta" hint="Porta padrao do MariaDB/MySQL: 3306.">
              <input
                type="number"
                placeholder="3306"
                value={draft.dbPort}
                onChange={(event) =>
                  onChange({ dbPort: Number(event.currentTarget.value || 3306) })
                }
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
          </div>
        </ModuleCard>

        <ModuleCard
          label="Passo 2b"
          title="Tabela e coluna"
          description="Escolha a tabela e as colunas da whitelist no banco da cidade. Os atalhos so preenchem um modelo inicial."
          delay={0.17}
        >
          <div className="mb-[14px] flex flex-wrap gap-[8px]">
            {WHITELIST_MAPPING_PRESETS.map((preset) => {
              const active =
                draft.mapping.playerTable === preset.mapping.playerTable &&
                draft.mapping.playerIdColumn === preset.mapping.playerIdColumn &&
                draft.mapping.whitelistColumn === preset.mapping.whitelistColumn;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ mapping: { ...draft.mapping, ...preset.mapping } })}
                  className={`inline-flex h-[32px] items-center rounded-full px-[12px] text-[12px] font-semibold ${
                    active
                      ? "bg-white text-[#111]"
                      : "border border-[#1C1C1C] bg-[#141414] text-[#8A8A8E] hover:text-[#F4F4F5]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-3">
            <LabeledField label="Tabela" hint="Exemplo: vrp_users, users, players.">
              <input
                placeholder="vrp_users"
                value={draft.mapping.playerTable}
                autoComplete="off"
                onChange={(event) =>
                  onChange({
                    mapping: {
                      ...draft.mapping,
                      playerTable: event.currentTarget.value,
                    } satisfies WhitelistMapping,
                  })
                }
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField label="Coluna do ID" hint="A coluna que identifica o jogador. Exemplo: id, citizenid.">
              <input
                placeholder="id"
                value={draft.mapping.playerIdColumn}
                autoComplete="off"
                onChange={(event) =>
                  onChange({
                    mapping: {
                      ...draft.mapping,
                      playerIdColumn: event.currentTarget.value,
                    },
                  })
                }
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField
              label="Coluna da whitelist"
              hint="A coluna que vira 1 quando o player e aprovado."
            >
              <input
                placeholder="whitelisted"
                value={draft.mapping.whitelistColumn}
                autoComplete="off"
                onChange={(event) =>
                  onChange({
                    mapping: {
                      ...draft.mapping,
                      whitelistColumn: event.currentTarget.value,
                    },
                  })
                }
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
          </div>
        </ModuleCard>

        <ModuleCard
          label="Tutorial"
          title="Criar o usuario do banco"
          description="Crie no HeidiSQL um usuario com o mesmo nome, senha e banco preenchidos acima. Execute o SQL como administrador e depois teste a conexao aqui."
          delay={0.18}
        >
          <ol className="mb-[14px] list-decimal space-y-[8px] pl-[18px] text-[13px] leading-[1.55] text-[#8A8A8E]">
            <li>Abra o HeidiSQL com um usuario administrador e selecione o banco informado no campo Nome do banco.</li>
            <li>Abra a aba Consulta e cole o SQL de exemplo. Ele usa o usuario e a senha dos campos acima.</li>
            <li>Execute o comando. O usuario precisa existir em localhost e 127.0.0.1.</li>
            <li>Volte ao painel e clique em Conectar banco com o launcher aberto na VPS.</li>
          </ol>
          <pre className="overflow-x-auto rounded-[14px] border border-[#1C1C1C] bg-[#141414] px-[14px] py-[12px] text-[12px] leading-[1.6] text-[#D1D1D1]">
            {cityDbProvisionSql(
              draft.dbUser || "flowdesk",
              draft.dbPassword || "sua_senha",
              draft.dbName || "nome_do_banco",
            )}
          </pre>
          <div className="mt-[12px] flex flex-wrap items-center gap-[10px]">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(
                    cityDbProvisionSql(
                      draft.dbUser || "flowdesk",
                      draft.dbPassword || "sua_senha",
                      draft.dbName || "nome_do_banco",
                    ),
                  )
                  .then(() => {
                    setSqlCopied(true);
                    window.setTimeout(() => setSqlCopied(false), 2000);
                  });
              }}
              className="inline-flex h-[36px] items-center rounded-full bg-white px-[14px] text-[13px] font-semibold text-[#111]"
            >
              {sqlCopied ? "SQL copiado" : "Copiar SQL"}
            </button>
            <p className="text-[12px] text-[#6F6F74]">
              O exemplo e atualizado automaticamente com os dados preenchidos nos campos.
            </p>
          </div>
        </ModuleCard>

        <ModuleCard
          label="Passo 3"
          title="Conectar"
          description={
            launcherOnline
              ? "O launcher na VPS testa o usuario e o banco informados acima."
              : "Abra o launcher na VPS antes de testar a conexao."
          }
          delay={0.2}
        >
          <div className="flex flex-col gap-[14px] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[14px] font-semibold text-[#F4F4F5]">
                {draft.lastHealthOk
                  ? "Ultima conexao ok"
                  : draft.lastHealthError
                    ? "Ultima conexao falhou"
                    : "Ainda nao testado"}
              </p>
              <p className="mt-[4px] text-[13px] leading-[1.55] text-[#8A8A8E]">
                {draft.mapping.playerTable && draft.mapping.whitelistColumn
                  ? `Whitelist: ${draft.mapping.playerTable}.${draft.mapping.whitelistColumn}`
                  : "Defina a tabela e a coluna da whitelist no passo anterior."}
              </p>
            </div>
            <button
              type="button"
              disabled={disabled || Boolean(busy)}
              onClick={() => void connectDatabase()}
              className="inline-flex h-[44px] items-center justify-center rounded-full bg-white px-[20px] text-[14px] font-semibold text-[#111] transition-transform duration-200 hover:-translate-y-px disabled:opacity-50"
            >
              {busy === "test" ? "Conectando..." : "Conectar banco"}
            </button>
          </div>
          {actionMessage ? (
            <p
              className={`mt-[14px] text-[13px] leading-[1.55] ${
                actionTone === "ok" ? "text-[#7dca97]" : "text-[#d18d8d]"
              }`}
            >
              {actionMessage}
            </p>
          ) : draft.lastHealthError ? (
            <p className="mt-[14px] text-[13px] leading-[1.55] text-[#d18d8d]">
              {draft.lastHealthError}
            </p>
          ) : null}
        </ModuleCard>
      </ModulePage>
    );
  }

  return (
    <div className="space-y-[14px]">
      <div className="rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[16px]">
        <p className="text-[12px] uppercase tracking-[0.18em] text-[#5F5F5F]">
          Tokens disponiveis
        </p>
        <p className="mt-[10px] max-w-[860px] text-[14px] leading-[1.6] text-[#7B7B7B]">
          O botao <strong className="font-medium text-[#B7B7B7]">Solicitar whitelist</strong> e
          fixo. O membro informa o identificador configurado no modal.
        </p>
        <div className="mt-[14px] flex flex-wrap gap-[8px]">
          {WHITELIST_TOKEN_HINTS.map((token) => (
            <span
              key={token}
              className="inline-flex h-[28px] items-center rounded-full border border-[#1C1C1C] bg-[#141414] px-[10px] text-[11px] font-medium text-[#8A8A8A]"
            >
              {token}
            </span>
          ))}
        </div>
      </div>
      <TicketMessageBuilder
        guildId={guildId}
        value={draft.panelLayout}
        onChange={onPanelLayoutChange}
        layoutPreset="whitelist_panel"
        disabled={disabled || isSendingEmbed}
        canSendEmbed={canSendEmbed}
        isSendingEmbed={isSendingEmbed}
        onSendEmbed={onSendEmbed}
        hideSendButton={!onSendEmbed}
        eyebrow="Whitelist"
        headline="Mensagem do painel"
        description="Este embed e publicado no canal do painel. O botao abre o pedido de whitelist."
        sendButtonLabel="Enviar embed de whitelist"
      />
    </div>
  );
}
