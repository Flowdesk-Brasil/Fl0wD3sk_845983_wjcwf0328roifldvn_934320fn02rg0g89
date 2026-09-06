"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus, X } from "lucide-react";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { TEAM_ICON_OPTIONS, TeamAvatar } from "@/components/teams/teamUi";

export type CreateTeamStep = "name" | "servers" | "members";

export type CreateTeamServerOption = {
  guildId: string;
  guildName: string;
  iconUrl?: string | null;
};

type CreateTeamModalProps = {
  open: boolean;
  step: CreateTeamStep;
  teamName: string;
  iconKey: string;
  selectedServerIds: string[];
  memberIds: string[];
  memberDraftIds: string[];
  normalizedInviteDraftDiscordIds: string[];
  availableServers: CreateTeamServerOption[];
  isTeamServersLoading: boolean;
  hasServersInPanel: boolean;
  isCreatingTeam: boolean;
  isNextDisabled: boolean;
  teamActionError: string | null;
  isMemberSubmodalOpen: boolean;
  onClose: () => void;
  onTeamNameChange: (value: string) => void;
  onIconKeyChange: (value: string) => void;
  onToggleServer: (guildId: string) => void;
  onStepBack: () => void;
  onStepNext: () => void;
  onOpenMemberSubmodal: () => void;
  onCloseMemberSubmodal: () => void;
  onMemberDraftChange: (index: number, value: string) => void;
  onAddMemberDraftField: () => void;
  onConfirmMemberDrafts: () => void;
  onRemoveMemberId: (discordId: string) => void;
};

const ease = [0.22, 1, 0.36, 1] as const;

const STEPS: Array<{ id: CreateTeamStep; label: string }> = [
  { id: "name", label: "Identidade" },
  { id: "servers", label: "Servidores" },
  { id: "members", label: "Membros" },
];

function StepIndicator({ step }: { step: CreateTeamStep }) {
  const activeIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <div className="flex items-center gap-[8px]">
      {STEPS.map((item, index) => {
        const isActive = item.id === step;
        const isComplete = index < activeIndex;
        return (
          <div key={item.id} className="flex min-w-0 flex-1 items-center gap-[8px]">
            <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
              <div className="flex items-center gap-[8px]">
                <span
                  className={`inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    isActive
                      ? "border-[#5B8DEF] bg-[rgba(91,141,239,0.14)] text-[#9BB6FF]"
                      : isComplete
                        ? "border-[#2A2A2E] bg-[#141414] text-[#C4C4C8]"
                        : "border-[#1C1C1C] bg-[#0D0D0D] text-[#6F6F74]"
                  }`}
                >
                  {isComplete ? <Check className="h-[12px] w-[12px]" /> : index + 1}
                </span>
                <span
                  className={`truncate text-[12px] font-medium ${
                    isActive ? "text-[#F2F2F3]" : "text-[#6F6F74]"
                  }`}
                >
                  {item.label}
                </span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-[#1C1C1C]">
                <div
                  className="h-full rounded-full bg-[#5B8DEF] transition-[width] duration-300"
                  style={{
                    width: isComplete ? "100%" : isActive ? "58%" : "0%",
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CreateTeamModal({
  open,
  step,
  teamName,
  iconKey,
  selectedServerIds,
  memberIds,
  memberDraftIds,
  normalizedInviteDraftDiscordIds,
  availableServers,
  isTeamServersLoading,
  hasServersInPanel,
  isCreatingTeam,
  isNextDisabled,
  teamActionError,
  isMemberSubmodalOpen,
  onClose,
  onTeamNameChange,
  onIconKeyChange,
  onToggleServer,
  onStepBack,
  onStepNext,
  onOpenMemberSubmodal,
  onCloseMemberSubmodal,
  onMemberDraftChange,
  onAddMemberDraftField,
  onConfirmMemberDrafts,
  onRemoveMemberId,
}: CreateTeamModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-[5000] isolate overflow-y-auto overscroll-contain lg:left-[278px]">
      <button
        type="button"
        aria-label="Fechar modal de equipe"
        className="absolute inset-0 bg-[rgba(0,0,0,0.68)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-[10] min-h-full px-[20px] py-[28px] md:px-6 lg:px-8 lg:pl-[40px] lg:pr-[42px]">
        <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[720px] items-center justify-center">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Criar equipe"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease }}
            className="relative w-full overflow-hidden rounded-[24px] border border-[#1C1C1C] bg-[#0D0D0D] shadow-[0_34px_100px_rgba(0,0,0,0.55)]"
          >
            <div className="border-b border-[#1C1C1C] px-[22px] py-[20px] sm:px-[26px]">
              <div className="flex items-start justify-between gap-[14px]">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6F6F74]">
                    Criar equipe
                  </p>
                  <h2 className="mt-[8px] text-[24px] font-semibold tracking-[-0.04em] text-[#F2F2F3] sm:text-[28px]">
                    Monte sua equipe
                  </h2>
                  <p className="mt-[8px] max-w-[520px] text-[13px] leading-[1.6] text-[#8B8B90]">
                    Organize servidores, convide staff e controle permissoes com uma estrutura clara.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#9A9A9E] transition-colors hover:bg-[#171717] hover:text-[#F0F0F2]"
                  aria-label="Fechar modal"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
              <div className="mt-[18px]">
                <StepIndicator step={step} />
              </div>
            </div>

            <div className="px-[22px] py-[20px] sm:px-[26px]">
              {step === "name" ? (
                <div className="space-y-[18px]">
                  <div className="flex items-center gap-[14px] rounded-[18px] border border-[#1C1C1C] bg-[#141414] px-[14px] py-[14px]">
                    <TeamAvatar
                      iconKey={iconKey}
                      name={teamName || "Equipe"}
                      className="h-[52px] w-[52px] rounded-[16px]"
                      textClassName="text-[18px] text-[#F3F3F3]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium text-[#F2F2F3]">
                        {teamName.trim() || "Nova equipe"}
                      </p>
                      <p className="mt-[4px] text-[12px] text-[#6F6F74]">
                        Preview da identidade visual
                      </p>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-[8px] block text-[12px] font-medium text-[#8B8B90]">
                      Nome da equipe
                    </span>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(event) => onTeamNameChange(event.currentTarget.value)}
                      placeholder="Ex: Moderacao principal"
                      autoComplete="off"
                      maxLength={64}
                      className="fd-field h-[48px] w-full rounded-[12px] px-[14px] text-[15px]"
                    />
                  </label>

                  <div>
                    <span className="mb-[10px] block text-[12px] font-medium text-[#8B8B90]">
                      Cor da equipe
                    </span>
                    <div className="grid grid-cols-3 gap-[10px] sm:grid-cols-6">
                      {TEAM_ICON_OPTIONS.map((option) => {
                        const isActive = iconKey === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => onIconKeyChange(option.key)}
                            className={`flex flex-col items-center gap-[8px] rounded-[14px] border px-[8px] py-[10px] transition-colors ${
                              isActive
                                ? "border-[#5B8DEF] bg-[rgba(91,141,239,0.08)]"
                                : "border-[#1C1C1C] bg-[#141414] hover:border-[#2A2A2E] hover:bg-[#171717]"
                            }`}
                          >
                            <span
                              className={`inline-flex rounded-full p-[3px] ${
                                isActive ? "ring-2 ring-[#5B8DEF] ring-offset-2 ring-offset-[#0D0D0D]" : ""
                              }`}
                            >
                              <TeamAvatar
                                iconKey={option.key}
                                name={option.label}
                                className="h-[36px] w-[36px] rounded-full"
                                textClassName="text-[13px]"
                              />
                            </span>
                            <span className="text-[11px] font-medium text-[#C4C4C8]">
                              {option.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {step === "servers" ? (
                <div>
                  <div className="mb-[12px] flex items-center justify-between gap-[12px]">
                    <p className="text-[12px] font-medium text-[#8B8B90]">Servidores vinculados</p>
                    <span className="rounded-full border border-[#1C1C1C] bg-[#141414] px-[10px] py-[4px] text-[11px] font-medium text-[#C4C4C8]">
                      {selectedServerIds.length} selecionado(s)
                    </span>
                  </div>
                  {!isTeamServersLoading && !availableServers.length && hasServersInPanel ? (
                    <p className="mb-[10px] text-[12px] leading-[1.5] text-[#8B8B90]">
                      Todos os servidores disponiveis no painel ja estao vinculados a outra equipe.
                    </p>
                  ) : null}
                  <div className="max-h-[360px] space-y-[8px] overflow-y-auto pr-[2px]">
                    {availableServers.length ? (
                      availableServers.map((server) => {
                        const isChecked = selectedServerIds.includes(server.guildId);
                        return (
                          <label
                            key={server.guildId}
                            className={`flex cursor-pointer items-center gap-[12px] rounded-[14px] border px-[14px] py-[12px] transition-colors ${
                              isChecked
                                ? "border-[rgba(91,141,239,0.35)] bg-[rgba(91,141,239,0.08)]"
                                : "border-[#1C1C1C] bg-[#141414] hover:border-[#2A2A2E] hover:bg-[#171717]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => onToggleServer(server.guildId)}
                              className="hidden"
                            />
                            <span
                              className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border ${
                                isChecked
                                  ? "border-[#5B8DEF] bg-[#5B8DEF]"
                                  : "border-[#303036] bg-[#0D0D0D]"
                              }`}
                            >
                              {isChecked ? (
                                <Check className="h-[11px] w-[11px] text-[#0D0D0D]" strokeWidth={3} />
                              ) : null}
                            </span>
                            {server.iconUrl ? (
                              <Image
                                src={server.iconUrl}
                                alt={server.guildName}
                                width={36}
                                height={36}
                                className="h-[36px] w-[36px] rounded-[10px] object-cover"
                              />
                            ) : (
                              <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] border border-[#1C1C1C] bg-[#0D0D0D] text-[11px] font-semibold text-[#8B8B90]">
                                FD
                              </div>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-medium text-[#F2F2F3]">
                                {server.guildName}
                              </span>
                              <span className="mt-[4px] block truncate text-[12px] text-[#6F6F74]">
                                {server.guildId}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-[#1C1C1C] bg-[#141414] px-[14px] py-[16px] text-[13px] leading-[1.55] text-[#8B8B90]">
                        {isTeamServersLoading
                          ? "Carregando servidores disponiveis..."
                          : "Nenhum servidor disponivel no painel para vincular a uma equipe agora."}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {step === "members" ? (
                <div className="space-y-[12px]">
                  <div className="rounded-[16px] border border-[#1C1C1C] bg-[#141414] p-[14px]">
                    <div className="flex flex-col gap-[12px] sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[12px] font-medium text-[#8B8B90]">Convidar membros</p>
                        <p className="mt-[6px] text-[13px] leading-[1.55] text-[#8B8B90]">
                          Adicione IDs do Discord. Eles ficam pendentes ate aceitar no painel.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenMemberSubmodal}
                        className="inline-flex h-[42px] shrink-0 items-center justify-center gap-[8px] rounded-[12px] border border-[#1C1C1C] bg-[#0D0D0D] px-[14px] text-[13px] font-medium text-[#ECECEE] transition-colors hover:bg-[#171717]"
                      >
                        <Plus className="h-[16px] w-[16px]" />
                        Adicionar membro
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-[#1C1C1C] bg-[#141414] p-[14px]">
                    <div className="flex items-center justify-between gap-[10px]">
                      <p className="text-[12px] font-medium text-[#8B8B90]">Membros pendentes</p>
                      <span className="text-[12px] text-[#6F6F74]">{memberIds.length} ID(s)</span>
                    </div>
                    {memberIds.length ? (
                      <div className="mt-[12px] flex flex-wrap gap-[8px]">
                        {memberIds.map((discordId) => (
                          <button
                            key={discordId}
                            type="button"
                            onClick={() => onRemoveMemberId(discordId)}
                            className="inline-flex items-center gap-[8px] rounded-full border border-[#1C1C1C] bg-[#0D0D0D] px-[10px] py-[7px] text-[12px] text-[#C4C4C8] transition-colors hover:border-[#2A2A2E] hover:text-[#F0F0F2]"
                          >
                            <span>{discordId}</span>
                            <X className="h-[12px] w-[12px] text-[#6F6F74]" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-[12px] text-[12px] text-[#6F6F74]">
                        Nenhum membro adicionado ainda.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {teamActionError ? (
                <div className="mt-[14px] rounded-[14px] border border-[#2A1717] bg-[rgba(219,70,70,0.08)] px-[14px] py-[12px] text-[13px] text-[#E8B4B4]">
                  {teamActionError}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-[10px] border-t border-[#1C1C1C] px-[22px] py-[16px] sm:flex-row sm:justify-between sm:px-[26px]">
              <button
                type="button"
                onClick={onStepBack}
                className="inline-flex h-[46px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] px-[18px] text-[14px] font-medium text-[#C4C4C8] transition-colors hover:bg-[#171717] hover:text-[#F0F0F2]"
              >
                {step === "name" ? "Cancelar" : "Voltar"}
              </button>
              <button
                type="button"
                onClick={onStepNext}
                disabled={isNextDisabled}
                className="inline-flex h-[46px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F3] px-[22px] text-[14px] font-semibold text-[#0D0D0D] transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isCreatingTeam ? (
                  <ButtonLoader size={16} colorClassName="text-[#0D0D0D]" />
                ) : null}
                {step === "members" ? "Criar equipe" : "Proximo"}
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {isMemberSubmodalOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Fechar submodal de membros"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[30] bg-[rgba(0,0,0,0.62)]"
              onClick={onCloseMemberSubmodal}
            />
            <div className="absolute inset-0 z-[40] flex items-center justify-center p-[16px]">
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.22, ease }}
                className="w-full max-w-[520px] rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] p-[18px] shadow-[0_28px_80px_rgba(0,0,0,0.5)]"
              >
                <div className="flex items-start justify-between gap-[14px]">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#6F6F74]">
                      Adicionar membros
                    </p>
                    <p className="mt-[8px] text-[14px] leading-[1.55] text-[#8B8B90]">
                      Digite um ou mais IDs do Discord. Use um campo por pessoa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseMemberSubmodal}
                    className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#9A9A9E] transition-colors hover:bg-[#171717] hover:text-[#F0F0F2]"
                    aria-label="Fechar submodal"
                  >
                    <X className="h-[16px] w-[16px]" />
                  </button>
                </div>

                <div className="mt-[16px] space-y-[10px]">
                  {memberDraftIds.map((draft, index) => (
                    <input
                      key={index}
                      type="text"
                      value={draft}
                      onChange={(event) =>
                        onMemberDraftChange(index, event.currentTarget.value)
                      }
                      placeholder={`ID do membro ${index + 1}`}
                      autoComplete="off"
                      className="fd-field h-[46px] w-full rounded-[12px] px-[14px] text-[14px]"
                    />
                  ))}
                </div>

                <div className="mt-[12px] flex flex-wrap gap-[8px]">
                  <button
                    type="button"
                    onClick={onAddMemberDraftField}
                    className="inline-flex h-[40px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] px-[14px] text-[13px] font-medium text-[#C4C4C8] transition-colors hover:bg-[#171717]"
                  >
                    Adicionar mais
                  </button>
                  {normalizedInviteDraftDiscordIds.map((discordId) => (
                    <span
                      key={discordId}
                      className="inline-flex rounded-full border border-[#1C1C1C] bg-[#141414] px-[10px] py-[7px] text-[12px] text-[#BFBFBF]"
                    >
                      {discordId}
                    </span>
                  ))}
                </div>

                <div className="mt-[16px] flex flex-col-reverse gap-[10px] sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={onCloseMemberSubmodal}
                    className="inline-flex h-[44px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] px-[16px] text-[13px] font-medium text-[#C4C4C8] transition-colors hover:bg-[#171717]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmMemberDrafts}
                    className="inline-flex h-[44px] items-center justify-center rounded-[12px] bg-[#F2F2F3] px-[18px] text-[13px] font-semibold text-[#0D0D0D]"
                  >
                    Confirmar IDs
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
