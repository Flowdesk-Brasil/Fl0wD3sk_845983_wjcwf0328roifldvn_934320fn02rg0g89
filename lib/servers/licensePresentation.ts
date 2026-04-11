type ManagedServerLike = {
  status: "paid" | "expired" | "off" | "pending_payment";
  licensePaidAt: string;
  licenseExpiresAt: string;
  daysUntilExpire: number;
  daysUntilOff: number;
  accessMode?: "owner" | "viewer";
  canManage?: boolean;
};

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSameUtcClock(start: Date, end: Date) {
  return (
    start.getUTCDate() === end.getUTCDate() &&
    start.getUTCHours() === end.getUTCHours() &&
    start.getUTCMinutes() === end.getUTCMinutes() &&
    start.getUTCSeconds() === end.getUTCSeconds()
  );
}

function resolveCalendarMonthSpan(startMs: number, endMs: number) {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const rawMonthSpan =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());

  if (rawMonthSpan <= 0) return null;
  if (!isSameUtcClock(start, end)) return null;

  return rawMonthSpan;
}

function resolveDaySpan(startMs: number, endMs: number) {
  const diffMs = endMs - startMs;
  if (diffMs <= 0) return null;

  const daySpan = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return daySpan > 0 ? daySpan : null;
}

export function formatServerDateLabel(rawDate: string) {
  const timestamp = parseTimestamp(rawDate);
  if (timestamp === null) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(timestamp);
}

export function resolveServerLicenseCycleLabel(
  server: Pick<ManagedServerLike, "licensePaidAt" | "licenseExpiresAt">,
) {
  const paidAtMs = parseTimestamp(server.licensePaidAt);
  const expiresAtMs = parseTimestamp(server.licenseExpiresAt);
  if (paidAtMs === null || expiresAtMs === null || expiresAtMs <= paidAtMs) {
    return null;
  }

  const monthSpan = resolveCalendarMonthSpan(paidAtMs, expiresAtMs);
  if (monthSpan !== null) {
    if (monthSpan % 12 === 0) {
      const yearSpan = monthSpan / 12;
      return yearSpan === 1 ? "1 ano" : `${yearSpan} anos`;
    }

    return monthSpan === 1 ? "1 mes" : `${monthSpan} meses`;
  }

  const daySpan = resolveDaySpan(paidAtMs, expiresAtMs);
  if (daySpan !== null) {
    return daySpan === 1 ? "1 dia" : `${daySpan} dias`;
  }

  return null;
}

export function buildServerStatusDescription(
  server: ManagedServerLike,
  variant: "workspace" | "dashboard" = "workspace",
) {
  if (server.status === "paid") {
    return variant === "dashboard"
      ? "Conta em dia"
      : "Assinatura da conta em dia para este servidor";
  }

  if (server.status === "expired") {
    return variant === "dashboard"
      ? "Conta expirada"
      : "Pagamento da conta expirado - regularize para manter os servidores online";
  }

  if (server.status === "pending_payment") {
    return variant === "dashboard"
      ? "Conta pendente"
      : "Mudanca de plano aguardando regularizacao da conta";
  }

  return variant === "dashboard"
    ? "Bot desligado"
    : "Bot desligado - retorna imediatamente apos pagamento ou troca de plano";
}

export function buildServerMetaLabel(
  server: Pick<
    ManagedServerLike,
    "status" | "accessMode" | "canManage"
  >,
) {
  const accessContext =
    server.accessMode === "owner"
      ? "Conta titular"
      : server.canManage
        ? "Gestao em equipe"
        : "Somente visualizacao";

  if (server.status === "off") {
    return "Bot desligado - retorna imediatamente apos pagamento ou troca de plano";
  }

  if (server.status === "expired") {
    return `${accessContext} - cobranca da conta expirada`;
  }

  if (server.status === "pending_payment") {
    return `${accessContext} - regularizacao da conta pendente`;
  }

  return `${accessContext} - cobranca validada pela conta`;
}
