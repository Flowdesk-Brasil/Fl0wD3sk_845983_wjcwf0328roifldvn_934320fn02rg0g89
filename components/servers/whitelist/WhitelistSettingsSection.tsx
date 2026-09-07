"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Database, Download, Hash, MonitorSmartphone, Shield, TriangleAlert, Users } from "lucide-react";
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
import type { WhitelistSettingsDraft } from "@/lib/servers/whitelistSettingsModel";
import { looksLikePublicCityDbHost } from "@/lib/servers/whitelistHost";
import { createVrpUsersMapping, IDENTIFIER_KINDS } from "@/lib/servers/whitelistMapping";
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
  hint?: string;
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
  const [liveLauncher, setLiveLauncher] = useState<{
    paired: boolean;
    online: boolean;
    hostname: string | null;
    publicIp: string | null;
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
        };
        if (cancelled || !payload.ok) return;
        setLiveLauncher({
          paired: Boolean(payload.paired),
          online: Boolean(payload.online),
          hostname: typeof payload.hostname === "string" ? payload.hostname : null,
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

  useEffect(() => {
    if (draft.mapping.playerTable || draft.mapping.whitelistColumn) return;
    onChange({ mapping: createVrpUsersMapping() });
  }, [draft.mapping.playerTable, draft.mapping.whitelistColumn, onChange]);

  async function connectDatabase() {
    setBusy("test");
    setActionMessage(null);
    try {
      if (!looksLikePublicCityDbHost(draft.dbHost || detectedPublicIp)) {
        throw new Error(
          "Informe o IP publico da VPS ou deixe o launcher aberto la para a Flowdesk detectar.",
        );
      }
      if (!draft.dbName.trim() || !draft.dbUser.trim()) {
        throw new Error("Preencha o nome do banco e o usuario.");
      }
      if (!draft.dbPassword.trim() && !draft.hasDbPassword) {
        throw new Error("Digite a senha do banco para conectar.");
      }
      const response = await fetch("/api/auth/me/guilds/whitelist-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          action: "test",
          dbEngine: draft.dbEngine === "postgres" ? "postgres" : "mysql",
          dbHost: looksLikePublicCityDbHost(draft.dbHost) ? draft.dbHost : detectedPublicIp,
          dbPort: draft.dbPort || 3306,
          dbName: draft.dbName,
          dbUser: draft.dbUser,
          dbSsl: false,
          dbPassword: draft.dbPassword || undefined,
          mapping: createVrpUsersMapping(),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Nao foi possivel conectar no MySQL.");
      }
      onChange({
        mapping: createVrpUsersMapping(),
        mappingStatus: "validated",
        dbHost: looksLikePublicCityDbHost(draft.dbHost) ? draft.dbHost : detectedPublicIp,
        connectionMode: "direct",
      });
      setActionTone("ok");
      setActionMessage(payload.message || "Banco conectado. A whitelist usa vrp_users.whitelisted.");
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
        "Download iniciado. Instale o launcher na VPS, entre na Flowdesk e deixe o app abrir as portas. O banco e configurado daqui.",
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
            value={draft.enabled ? "Ativo" : "Desligado"}
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
                ? draft.dbHost || detectedPublicIp
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
          description="Escolha se a staff analisa cada pedido ou se o ID informado ja libera a whitelist automaticamente."
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
          description="Instale uma vez na VPS da cidade, entre na Flowdesk e deixe o app aberto. Ele publica o IP e libera as portas do MySQL."
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
                    {launcherOnline
                      ? `VPS no ar${liveLauncher?.hostname ? ` · ${liveLauncher.hostname}` : ""}${detectedPublicIp ? ` · ${detectedPublicIp}` : ""}. Pode configurar o banco daqui.`
                      : launcherPaired
                        ? "Launcher vinculado. Abra o app na VPS. Se a conexao falhar, ele abre o script de portas sozinho."
                        : "Baixe o Setup, instale na VPS e faca login. Este servidor vincula sozinho."}
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
          title="Dados do MySQL"
          description="So estes quatro campos. A Flowdesk ja usa vrp_users.whitelisted: NULL vira 1. Sem mapping, sem schema, sem SSL."
          delay={0.16}
        >
          <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-2">
            <LabeledField
              label="IP publico da VPS"
              hint={
                detectedPublicIp
                  ? `Detectado pelo launcher: ${detectedPublicIp}`
                  : "O launcher preenche sozinho. Nao use 127.0.0.1."
              }
            >
              <input
                placeholder={detectedPublicIp || "187.45.12.30"}
                value={draft.dbHost}
                autoComplete="off"
                onChange={(event) => onChange({ dbHost: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField label="Nome do banco" hint="Exemplo: skips">
              <input
                placeholder="skips"
                value={draft.dbName}
                autoComplete="off"
                onChange={(event) => onChange({ dbName: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField label="Usuario" hint="Usuario do MySQL, nao o Discord.">
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
              hint="Digite de novo se o teste pedir. A senha e gravada criptografada."
            >
              <input
                type="password"
                autoComplete="new-password"
                placeholder={
                  draft.hasDbPassword ? "Senha salva. Digite para conectar de novo" : "Senha do MySQL"
                }
                value={draft.dbPassword}
                onChange={(event) => onChange({ dbPassword: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField label="Porta" hint="MySQL padrao: 3306">
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
          label="Passo 3"
          title="Conectar"
          description={
            launcherOnline
              ? "Com o launcher no ar, a Flowdesk tenta o MySQL direto. Se a porta estiver fechada na internet, o SQL roda dentro da VPS."
              : "Abra o launcher na VPS antes de conectar. Sem ele, a porta 3306 costuma estar fechada daqui."
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
                Script vRP: tabela vrp_users, coluna whitelisted.
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
