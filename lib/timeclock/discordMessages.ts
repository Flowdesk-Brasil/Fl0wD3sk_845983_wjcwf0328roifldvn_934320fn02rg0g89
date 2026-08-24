import { formatDuration, formatSignedDuration } from "@/lib/timeclock/core";

export const TIMECLOCK_CUSTOM_IDS = {
  open: "timeclock:open",
  start: "timeclock:start",
  pause: "timeclock:pause",
  finish: "timeclock:finish",
} as const;

const COMPONENT_TYPE = {
  ACTION_ROW: 1,
  BUTTON: 2,
} as const;

const BUTTON_STYLE = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
} as const;

const MESSAGE_FLAG_EPHEMERAL = 64;

type TimeclockActionResult = {
  status: string;
  actions: {
    canStart: boolean;
    canPause: boolean;
    canFinish: boolean;
  };
  session: {
    startedAt: string | null;
    endedAt: string | null;
    totalWorkedSeconds: number;
    totalPausedSeconds: number;
    balanceSeconds: number;
    expectedWorkSeconds: number;
    lateStartSeconds: number;
    earlyLeaveSeconds: number;
    overtimeSeconds: number;
    missingSeconds: number;
  } | null;
  settings: {
    timezone: string;
  };
};

function formatDateTime(value: string | null, timezone: string) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "--";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "WORKING":
      return "Trabalhando";
    case "PAUSED":
      return "Pausado";
    case "FINISHED":
      return "Finalizado";
    case "INCOMPLETE":
      return "Pendente";
    case "ADJUSTED":
      return "Ajustado";
    default:
      return "Aguardando inicio";
  }
}

function buildStatusMarkdown(result: TimeclockActionResult) {
  const session = result.session;
  const timezone = result.settings.timezone;
  return [
    "## Seu ponto",
    `**Status:** ${statusLabel(result.status)}`,
    `**Entrada:** ${formatDateTime(session?.startedAt || null, timezone)}`,
    `**Saida:** ${formatDateTime(session?.endedAt || null, timezone)}`,
    `**Tempo trabalhado:** ${formatDuration(session?.totalWorkedSeconds || 0)}`,
    `**Tempo pausado:** ${formatDuration(session?.totalPausedSeconds || 0)}`,
    `**Carga prevista:** ${formatDuration(session?.expectedWorkSeconds || 0)}`,
    `**Banco de horas hoje:** ${formatSignedDuration(session?.balanceSeconds || 0)}`,
    session?.lateStartSeconds ? `**Atraso:** ${formatDuration(session.lateStartSeconds)}` : "",
    session?.earlyLeaveSeconds ? `**Saida antecipada:** ${formatDuration(session.earlyLeaveSeconds)}` : "",
    session?.overtimeSeconds ? `**Horas extras:** ${formatDuration(session.overtimeSeconds)}` : "",
    session?.missingSeconds ? `**Horas faltantes:** ${formatDuration(session.missingSeconds)}` : "",
  ].filter(Boolean).join("\n");
}

function statusColor(status: string) {
  if (status === "WORKING") return 0x2ecc71;
  if (status === "PAUSED") return 0xffb86b;
  if (status === "FINISHED") return 0x8ab6ff;
  return 0x5865f2;
}

export function buildTimeclockStatusDiscordPayload(
  result: TimeclockActionResult,
  options: { ephemeral?: boolean; notice?: string } = {},
) {
  const components = [
    {
      type: COMPONENT_TYPE.ACTION_ROW,
      components: [
        {
          type: COMPONENT_TYPE.BUTTON,
          custom_id: TIMECLOCK_CUSTOM_IDS.start,
          style: BUTTON_STYLE.SUCCESS,
          label: "Iniciar",
          disabled: !result.actions.canStart,
        },
        {
          type: COMPONENT_TYPE.BUTTON,
          custom_id: TIMECLOCK_CUSTOM_IDS.pause,
          style: BUTTON_STYLE.SECONDARY,
          label: "Pausar",
          disabled: !result.actions.canPause,
        },
        {
          type: COMPONENT_TYPE.BUTTON,
          custom_id: TIMECLOCK_CUSTOM_IDS.finish,
          style: BUTTON_STYLE.DANGER,
          label: "Finalizar",
          disabled: !result.actions.canFinish,
        },
      ],
    },
  ];

  return {
    content: options.notice ? `**${options.notice}**` : undefined,
    embeds: [
      {
        title: "Seu ponto",
        description: buildStatusMarkdown(result).replace(/^## Seu ponto\n?/, ""),
        color: statusColor(result.status),
      },
    ],
    flags: options.ephemeral === false ? 0 : MESSAGE_FLAG_EPHEMERAL,
    components,
    allowed_mentions: { parse: [] as string[] },
  };
}

export function buildTimeclockTextDiscordPayload(content: string) {
  return {
    embeds: [
      {
        description: content,
        color: 0x8ab6ff,
      },
    ],
    flags: MESSAGE_FLAG_EPHEMERAL,
    allowed_mentions: { parse: [] as string[] },
  };
}
