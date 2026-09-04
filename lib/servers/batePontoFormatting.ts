export function resolveDefaultDiscordAvatarUrl(userId: string) {
  try {
    const index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

export function formatBatePontoWorkedDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours >= 1) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes}m`;
}

export function formatBatePontoDetailedDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

export function formatBatePontoHourBank(totalSeconds: number) {
  const safeSeconds = Number(totalSeconds) || 0;
  const sign = safeSeconds < 0 ? "-" : "+";
  const absolute = Math.abs(safeSeconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  return `${sign}${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function formatBatePontoTimestamp(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function resolveBatePontoMemberLabel(
  userId: string,
  displayName?: string | null,
) {
  const trimmed = typeof displayName === "string" ? displayName.trim() : "";
  return trimmed || userId;
}

export function resolveBatePontoActionLabel(action: string) {
  const labels: Record<string, string> = {
    start: "Iniciar",
    pause: "Pausar",
    resume: "Retomar",
    finish: "Finalizar",
  };
  return labels[action] || action;
}

export function resolveBatePontoSessionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Em andamento",
    on_break: "Em pausa",
    finished: "Finalizada",
  };
  return labels[status] || status;
}
