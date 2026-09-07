import type { TicketPanelLayout } from "@/lib/servers/ticketPanelBuilder";
import {
  createDefaultSorteioActiveLayout,
  createDefaultSorteioEndedLayout,
  normalizeSorteioActiveLayout,
  normalizeSorteioEndedLayout,
} from "@/lib/servers/sorteioPanelBuilder";

export type SorteioSettingsDraft = {
  enabled: boolean;
  logsChannelId: string | null;
  createRoleIds: string[];
  rerollRoleIds: string[];
  defaultWinnerCount: number;
  defaultDurationMinutes: number;
  activeLayout: TicketPanelLayout;
  endedLayout: TicketPanelLayout;
};

export function normalizeSorteioSettingsDraft(
  input: Partial<SorteioSettingsDraft> | null | undefined,
): SorteioSettingsDraft {
  const winnerCount = Number(input?.defaultWinnerCount ?? 1);
  const durationMinutes = Number(input?.defaultDurationMinutes ?? 60);

  return {
    enabled: input?.enabled === true,
    logsChannelId:
      typeof input?.logsChannelId === "string" && input.logsChannelId.trim()
        ? input.logsChannelId.trim()
        : null,
    createRoleIds: Array.isArray(input?.createRoleIds)
      ? input.createRoleIds.filter((id): id is string => typeof id === "string")
      : [],
    rerollRoleIds: Array.isArray(input?.rerollRoleIds)
      ? input.rerollRoleIds.filter((id): id is string => typeof id === "string")
      : [],
    defaultWinnerCount:
      Number.isFinite(winnerCount) && winnerCount >= 1 && winnerCount <= 25
        ? Math.floor(winnerCount)
        : 1,
    defaultDurationMinutes:
      Number.isFinite(durationMinutes) &&
      durationMinutes >= 1 &&
      durationMinutes <= 43200
        ? Math.floor(durationMinutes)
        : 60,
    activeLayout: normalizeSorteioActiveLayout(input?.activeLayout),
    endedLayout: normalizeSorteioEndedLayout(input?.endedLayout),
  };
}

export function createEmptySorteioSettingsDraft(): SorteioSettingsDraft {
  return normalizeSorteioSettingsDraft({
    enabled: false,
    activeLayout: createDefaultSorteioActiveLayout(),
    endedLayout: createDefaultSorteioEndedLayout(),
  });
}

export function areSorteioSettingsDraftsEqual(
  left: SorteioSettingsDraft | null | undefined,
  right: SorteioSettingsDraft | null | undefined,
) {
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
