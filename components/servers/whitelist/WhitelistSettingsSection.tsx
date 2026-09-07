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
import { IDENTIFIER_KINDS } from "@/lib/servers/whitelistMapping";
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
  const [probeIdentifier, setProbeIdentifier] = useState("");
  const [liveLauncher, setLiveLauncher] = useState<{
    paired: boolean;
    online: boolean;
    hostname: string | null;
  } | null>(null);
  const launcherPaired = liveLauncher?.paired ?? draft.agentPaired;
  const launcherOnline = liveLauncher?.online ?? draft.agentOnline;

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
        };
        if (cancelled || !payload.ok) return;
        setLiveLauncher({
          paired: Boolean(payload.paired),
          online: Boolean(payload.online),
          hostname: typeof payload.hostname === "string" ? payload.hostname : null,
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

  async function runAction(kind: "test" | "inspect" | "validate") {
    setBusy(kind);
    setActionMessage(null);
    try {
      if (draft.connectionMode !== "agent") {
        if (!draft.dbName.trim() || !draft.dbUser.trim()) {
          throw new Error("Informe o nome do banco e o usuario da integracao.");
        }
      } else {
        if (!draft.dbName.trim() || !draft.dbUser.trim()) {
          throw new Error("Informe o banco, o usuario e a senha usados na cidade.");
        }
      }
      const response = await fetch("/api/auth/me/guilds/whitelist-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          action: kind,
          dbEngine: draft.dbEngine,
          dbHost: draft.dbHost,
          dbPort: draft.dbPort,
          dbName: draft.dbName,
          dbUser: draft.dbUser,
          dbSsl: draft.dbSsl,
          dbPassword: draft.dbPassword || undefined,
          mapping: draft.mapping,
          identifierValue: probeIdentifier,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Falha na acao de whitelist.");
      }
      if (kind === "inspect" && payload.inferred?.mapping) {
        onChange({
          mapping: payload.inferred.mapping,
          mappingStatus: "draft",
        });
        setActionMessage(
          `Schema lido. Confianca ${payload.inferred.confidence || 0}%. Confirme o mapping e valide.`,
        );
      } else if (kind === "validate") {
        onChange({ mappingStatus: "validated" });
        const located = payload.lookup
          ? ` Registro localizado: ${payload.lookup.playerKey || "-"} (estado ${payload.lookup.state || "-"}).`
          : "";
        setActionMessage(`${payload.message || "Mapping validado."}${located}`);
      } else {
        setActionMessage(payload.message || "Conexao ok.");
      }
      setActionTone("ok");
    } catch (error) {
      onChange({ mappingStatus: kind === "validate" ? "invalid" : draft.mappingStatus });
      setActionTone("error");
      setActionMessage(error instanceof Error ? error.message : "Falha na acao.");
    } finally {
      setBusy(null);
    }
  }

  async function installAgent() {
    setBusy("agent");
    setActionMessage(null);
    try {
      onChange({ connectionMode: "agent" });
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
        "Download iniciado. Instale, entre na Flowdesk e este servidor vincula sozinho.",
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
            hint={launcherOnline ? "Launcher online" : "Aguardando launcher"}
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
          label="Integracao"
          title="Banco da cidade"
          description="Instale o Flowdesk Launcher na VPS, entre com a conta Flowdesk e deixe o app aberto. Aqui voce so informa o banco local e as regras da whitelist. O IP da maquina e detectado automaticamente."
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
                      Auto bind
                    </span>
                  </div>
                  <p className="mt-[4px] text-[13px] leading-[1.55] text-[#8A8A8E]">
                    {launcherOnline
                      ? `Conectado${liveLauncher?.hostname ? ` em ${liveLauncher.hostname}` : ""}. O painel ja enxerga este computador.`
                      : launcherPaired
                        ? "Launcher vinculado. Aguardando o proximo sinal ao vivo."
                        : "Um instalador. Login da Flowdesk. Este servidor vincula sozinho, sem codigo."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-[10px] sm:justify-end">
                {launcherOnline ? (
                  <span className="inline-flex h-[32px] items-center gap-[6px] rounded-full bg-[rgba(134,239,172,0.08)] px-[10px] text-[12px] font-semibold text-[#86EFAC]">
                    <Check className="h-[13px] w-[13px]" strokeWidth={2.2} />
                    Conectado
                  </span>
                ) : launcherPaired ? (
                  <span className="inline-flex h-[32px] items-center gap-[6px] rounded-full bg-[rgba(246,212,138,0.08)] px-[10px] text-[12px] font-semibold text-[#F6D48A]">
                    <TriangleAlert className="h-[13px] w-[13px]" strokeWidth={2} />
                    Aguardando
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
          <div className="mt-[16px] grid grid-cols-1 gap-[16px] xl:grid-cols-2">
            <ConfigStepSelect
              label="Tipo do banco"
              placeholder="Engine"
              options={[
                { id: "mysql", name: "MySQL" },
                { id: "mariadb", name: "MariaDB" },
                { id: "postgres", name: "PostgreSQL" },
              ]}
              value={draft.dbEngine}
              onChange={(value) =>
                onChange({
                  dbEngine:
                    value === "postgres" || value === "mariadb" ? value : "mysql",
                })
              }
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <LabeledField
              label="Porta do banco"
              hint="Padrao MySQL/MariaDB 3306. PostgreSQL costuma ser 5432."
            >
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
            <LabeledField label="Nome do banco" hint="Database da cidade, nao o usuario.">
              <input
                placeholder="vrp / creative / essencialmode"
                value={draft.dbName}
                autoComplete="off"
                onChange={(event) => onChange({ dbName: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField
              label="Usuario da integracao"
              hint="Crie um usuario so para a Flowdesk. Evite root."
            >
              <input
                placeholder="flowdesk_whitelist"
                value={draft.dbUser}
                autoComplete="off"
                onChange={(event) => onChange({ dbUser: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <LabeledField
              label="Senha"
              hint="Fica criptografada no servidor. Nunca aparece de novo no painel."
            >
              <input
                type="password"
                autoComplete="new-password"
                placeholder={
                  draft.hasDbPassword ? "Senha salva. Informe para trocar" : "Senha do usuario"
                }
                value={draft.dbPassword}
                onChange={(event) => onChange({ dbPassword: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
            </LabeledField>
            <label className="flex items-center gap-[10px] self-end pb-[6px] text-[13px] text-[#8A8A8A]">
              <input
                type="checkbox"
                checked={draft.dbSsl}
                onChange={(event) => onChange({ dbSsl: event.currentTarget.checked })}
                disabled={disabled}
              />
              Exigir SSL
            </label>
          </div>
          <div className="mt-[16px] flex flex-wrap gap-[10px]">
            <button
              type="button"
              disabled={disabled || Boolean(busy)}
              onClick={() => void runAction("test")}
              className="h-[42px] rounded-[12px] bg-[#1A1A1A] px-[14px] text-[13px] font-medium text-[#D1D1D1] disabled:opacity-50"
            >
              {busy === "test" ? "Testando..." : "Testar conexao"}
            </button>
            <button
              type="button"
              disabled={disabled || Boolean(busy)}
              onClick={() => void runAction("inspect")}
              className="h-[42px] rounded-[12px] bg-[#1A1A1A] px-[14px] text-[13px] font-medium text-[#D1D1D1] disabled:opacity-50"
            >
              {busy === "inspect" ? "Analisando..." : "Detectar schema"}
            </button>
          </div>
        </ModuleCard>

        <ModuleCard
          label="Mapping"
          title="Tabela e estados"
          description="Nenhuma alteracao destrutiva e feita na deteccao automatica. Confirme e valide antes de usar."
          delay={0.18}
        >
          <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-2">
            {[
              ["playerTable", "Tabela do jogador"],
              ["playerIdColumn", "Coluna do identificador"],
              ["whitelistColumn", "Coluna da whitelist"],
              ["valueOff", "Valor sem whitelist"],
              ["valueOn", "Valor com whitelist"],
              ["joinTable", "Tabela de relacionamento (opcional)"],
              ["joinFromColumn", "Coluna na tabela do jogador"],
              ["joinToColumn", "Coluna na tabela relacionada"],
              ["joinIdentifierColumn", "Coluna do identificador relacionado"],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="mb-[8px] block text-[12px] font-medium text-[#5F5F5F]">
                  {label}
                </label>
                <input
                  value={String(draft.mapping[key as keyof typeof draft.mapping] || "")}
                  onChange={(event) =>
                    onChange({
                      mapping: {
                        ...draft.mapping,
                        [key]: event.currentTarget.value,
                      },
                      mappingStatus: "draft",
                    })
                  }
                  disabled={disabled}
                  className={fieldClassName}
                />
              </div>
            ))}
            <ConfigStepSelect
              label="Tipo do valor"
              placeholder="Tipo"
              options={[
                { id: "integer", name: "Integer" },
                { id: "boolean", name: "Boolean" },
                { id: "string", name: "String / enum" },
                { id: "enum", name: "Enum" },
              ]}
              value={draft.mapping.valueType}
              onChange={(value) =>
                onChange({
                  mapping: {
                    ...draft.mapping,
                    valueType:
                      value === "boolean" || value === "string" || value === "enum"
                        ? value
                        : "integer",
                  },
                  mappingStatus: "draft",
                })
              }
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepSelect
              label="NULL significa"
              placeholder="NULL"
              options={[
                { id: "off", name: "Sem whitelist" },
                { id: "on", name: "Com whitelist" },
                { id: "unknown", name: "Desconhecido" },
              ]}
              value={draft.mapping.nullBehavior}
              onChange={(value) =>
                onChange({
                  mapping: {
                    ...draft.mapping,
                    nullBehavior:
                      value === "on" || value === "unknown" ? value : "off",
                  },
                  mappingStatus: "draft",
                })
              }
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
          </div>
          <div className="mt-[16px]">
            <label className="mb-[8px] block text-[12px] font-medium text-[#5F5F5F]">
              Identificador de teste (somente leitura)
            </label>
            <input
              value={probeIdentifier}
              onChange={(event) => setProbeIdentifier(event.currentTarget.value)}
              disabled={disabled}
              placeholder="ID, license ou Discord ID para localizar o registro sem alterar dados"
              className={fieldClassName}
            />
          </div>
          <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
            <button
              type="button"
              disabled={disabled || Boolean(busy)}
              onClick={() => void runAction("validate")}
              className="h-[42px] rounded-[12px] bg-white px-[14px] text-[13px] font-semibold text-[#282828] disabled:opacity-50"
            >
              {busy === "validate" ? "Validando..." : "Validar mapping"}
            </button>
            <span className="text-[12px] text-[#7B7B7B]">
              Status: {draft.mappingStatus}
            </span>
          </div>
          {actionMessage ? (
            <p
              className={`mt-[12px] text-[13px] ${
                actionTone === "ok" ? "text-[#7dca97]" : "text-[#d18d8d]"
              }`}
            >
              {actionMessage}
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
