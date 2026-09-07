"use client";

import { useState } from "react";
import { Database, Hash, Shield, Users } from "lucide-react";
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

  async function runAction(kind: "test" | "inspect" | "validate") {
    setBusy(kind);
    setActionMessage(null);
    try {
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
            hint={draft.connectionMode === "agent" ? "Agent / Bridge" : "Conexao direta"}
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
          description="Use um usuario dedicado, nunca root. A senha fica criptografada e nunca volta para o frontend."
          delay={0.12}
        >
          <ModuleFieldsGrid>
            <ConfigStepSelect
              label="Modo"
              placeholder="Modo"
              options={[
                { id: "direct", name: "Conexao direta" },
                { id: "agent", name: "Agent / Bridge (VPS)" },
              ]}
              value={draft.connectionMode}
              onChange={(value) =>
                onChange({
                  connectionMode: value === "agent" ? "agent" : "direct",
                })
              }
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
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
          </ModuleFieldsGrid>
          {draft.connectionMode === "agent" ? (
            <p className="mt-[14px] text-[13px] leading-[1.6] text-[#7B7B7B]">
              O Agent recebe apenas comandos autenticados (GET_PLAYER, CHECK_WHITELIST,
              APPROVE_WHITELIST, REMOVE_WHITELIST, TEST_MAPPING) e fala com o banco na VPS da
              cidade, sem expor a porta publicamente.
            </p>
          ) : (
            <div className="mt-[16px] grid grid-cols-1 gap-[16px] xl:grid-cols-2">
              <input
                placeholder="Host"
                value={draft.dbHost}
                onChange={(event) => onChange({ dbHost: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
              <input
                type="number"
                placeholder="Porta"
                value={draft.dbPort}
                onChange={(event) =>
                  onChange({ dbPort: Number(event.currentTarget.value || 3306) })
                }
                disabled={disabled}
                className={fieldClassName}
              />
              <input
                placeholder="Database"
                value={draft.dbName}
                onChange={(event) => onChange({ dbName: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
              <input
                placeholder="Usuario (nao use root)"
                value={draft.dbUser}
                onChange={(event) => onChange({ dbUser: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder={draft.hasDbPassword ? "Senha salva. Informe para trocar" : "Senha"}
                value={draft.dbPassword}
                onChange={(event) => onChange({ dbPassword: event.currentTarget.value })}
                disabled={disabled}
                className={fieldClassName}
              />
              <label className="flex items-center gap-[10px] text-[13px] text-[#8A8A8A]">
                <input
                  type="checkbox"
                  checked={draft.dbSsl}
                  onChange={(event) => onChange({ dbSsl: event.currentTarget.checked })}
                  disabled={disabled}
                />
                Exigir SSL
              </label>
            </div>
          )}
          <div className="mt-[16px] flex flex-wrap gap-[10px]">
            <button
              type="button"
              disabled={disabled || Boolean(busy) || draft.connectionMode === "agent"}
              onClick={() => void runAction("test")}
              className="h-[42px] rounded-[12px] bg-[#1A1A1A] px-[14px] text-[13px] font-medium text-[#D1D1D1] disabled:opacity-50"
            >
              {busy === "test" ? "Testando..." : "Testar conexao"}
            </button>
            <button
              type="button"
              disabled={disabled || Boolean(busy) || draft.connectionMode === "agent"}
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
              disabled={disabled || Boolean(busy) || draft.connectionMode === "agent"}
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
