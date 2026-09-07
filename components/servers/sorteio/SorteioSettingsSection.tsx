"use client";

import { Gift, Hash, Shield, Users } from "lucide-react";
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
import type { SorteioSettingsDraft } from "@/lib/servers/sorteioSettingsModel";
import { SORTEIO_TOKEN_HINTS } from "@/lib/servers/sorteioPanelBuilder";
import type { TicketPanelLayout } from "@/lib/servers/ticketPanelBuilder";

type ResourceSelectOption = {
  id: string;
  name: string;
};

type SorteioSettingsSectionProps = {
  mode: "overview" | "message";
  guildId: string;
  disabled: boolean;
  draft: SorteioSettingsDraft;
  textChannelOptions: ResourceSelectOption[];
  roleOptions: ResourceSelectOption[];
  controlHeightPx: number;
  onChange: (patch: Partial<SorteioSettingsDraft>) => void;
  onActiveLayoutChange: (layout: TicketPanelLayout) => void;
  onEndedLayoutChange: (layout: TicketPanelLayout) => void;
};

export function SorteioSettingsSection({
  mode,
  guildId,
  disabled,
  draft,
  textChannelOptions,
  roleOptions,
  controlHeightPx,
  onChange,
  onActiveLayoutChange,
  onEndedLayoutChange,
}: SorteioSettingsSectionProps) {
  if (mode === "overview") {
    return (
      <ModulePage>
        <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
          <ModuleStat
            label="Status"
            value={draft.enabled ? "Ativo" : "Desligado"}
            hint="Modulo de sorteios"
            icon={Gift}
            delay={0.06}
          />
          <ModuleStat
            label="Logs"
            value={optionLabel(textChannelOptions, draft.logsChannelId)}
            hint="Canal de auditoria"
            icon={Hash}
            delay={0.1}
          />
          <ModuleStat
            label="Criar sorteio"
            value={optionLabels(roleOptions, draft.createRoleIds)}
            hint="Quem pode usar /sorteio"
            icon={Users}
            delay={0.14}
          />
          <ModuleStat
            label="Reroll"
            value={optionLabels(roleOptions, draft.rerollRoleIds)}
            hint="Quem pode sortear de novo"
            icon={Shield}
            delay={0.18}
          />
        </div>

        <ModuleCard
          label="Permissoes"
          title="Acesso e padroes"
          description="Defina quem cria sorteios, quem pode fazer reroll e valores padrao do comando /sorteio."
          delay={0.16}
        >
          <ModuleFieldsGrid>
            <ConfigStepSelect
              label="Canal de logs"
              placeholder="Escolha o canal"
              options={textChannelOptions}
              value={draft.logsChannelId}
              onChange={(value) => onChange({ logsChannelId: value })}
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepMultiSelect
              label="Cargos que criam sorteio"
              placeholder="Vazio = Gerenciar Servidor"
              options={roleOptions}
              values={draft.createRoleIds}
              onChange={(values) => onChange({ createRoleIds: values })}
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
            <ConfigStepMultiSelect
              label="Cargos com reroll"
              placeholder="Vazio = host ou Gerenciar Servidor"
              options={roleOptions}
              values={draft.rerollRoleIds}
              onChange={(values) => onChange({ rerollRoleIds: values })}
              disabled={disabled}
              controlHeightPx={controlHeightPx}
            />
          </ModuleFieldsGrid>

          <div className="mt-[16px] grid grid-cols-1 gap-[16px] xl:grid-cols-2">
            <div>
              <label className="mb-[8px] block text-[12px] font-medium text-[#5F5F5F]">
                Vencedores padrao
              </label>
              <input
                type="number"
                min={1}
                max={25}
                value={draft.defaultWinnerCount}
                onChange={(event) =>
                  onChange({
                    defaultWinnerCount: Math.max(
                      1,
                      Math.min(25, Number(event.currentTarget.value || 1)),
                    ),
                  })
                }
                disabled={disabled}
                className="h-[48px] w-full rounded-[14px] fd-field border border-[#1C1C1C] bg-[#141414] px-[14px] text-[14px] text-[#D1D1D1] outline-none transition-all placeholder:text-[#6F6F74] focus:border-[#2A2A2E] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-[8px] block text-[12px] font-medium text-[#5F5F5F]">
                Duracao padrao (minutos)
              </label>
              <input
                type="number"
                min={1}
                max={43200}
                value={draft.defaultDurationMinutes}
                onChange={(event) =>
                  onChange({
                    defaultDurationMinutes: Math.max(
                      1,
                      Math.min(43200, Number(event.currentTarget.value || 60)),
                    ),
                  })
                }
                disabled={disabled}
                className="h-[48px] w-full rounded-[14px] fd-field border border-[#1C1C1C] bg-[#141414] px-[14px] text-[14px] text-[#D1D1D1] outline-none transition-all placeholder:text-[#6F6F74] focus:border-[#2A2A2E] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>
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
          Personalize titulo, cabecalho, emojis e textos livres. Os campos dinamicos
          sao preenchidos automaticamente quando um sorteio for publicado. Os botoes{" "}
          <strong className="font-medium text-[#B7B7B7]">Entrar no sorteio</strong> e{" "}
          <strong className="font-medium text-[#B7B7B7]">⚙</strong> sao fixos e nao
          podem ser removidos.
        </p>
        <div className="mt-[14px] flex flex-wrap gap-[8px]">
          {SORTEIO_TOKEN_HINTS.map((token) => (
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
        value={draft.activeLayout}
        onChange={onActiveLayoutChange}
        layoutPreset="sorteio_active"
        disabled={disabled}
        hideSendButton
        eyebrow="Sorteios"
        headline="Mensagem do sorteio ativo"
        description="Este template e usado quando alguem publica um sorteio com /sorteio."
      />

      <TicketMessageBuilder
        guildId={guildId}
        value={draft.endedLayout}
        onChange={onEndedLayoutChange}
        layoutPreset="sorteio_ended"
        disabled={disabled}
        hideSendButton
        eyebrow="Sorteios"
        headline="Mensagem do sorteio encerrado"
        description="Embed exibido na mensagem principal quando o tempo acaba."
      />
    </div>
  );
}
