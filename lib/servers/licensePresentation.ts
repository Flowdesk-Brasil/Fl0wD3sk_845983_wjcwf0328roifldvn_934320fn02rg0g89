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
  const cycleLabel = resolveServerLicenseCycleLabel(server);

  if (server.status === "paid") {
    if (cycleLabel) {
      return variant === "dashboard"
        ? `${cycleLabel} de licenca`
        : `Licenca ativa por ${cycleLabel} - valida ate ${formatServerDateLabel(server.licenseExpiresAt)}`;
    }

    return variant === "dashboard"
      ? `Expira em ${server.daysUntilExpire} dias`
      : `Renovacao ativa expira em ${server.daysUntilExpire} dias`;
  }

  if (server.status === "expired") {
    if (cycleLabel) {
      return variant === "dashboard"
        ? `${cycleLabel} expirado`
        : `Licenca de ${cycleLabel} expirada - ${server.daysUntilOff} dias restantes`;
    }

    return variant === "dashboard"
      ? `Expirado - ${server.daysUntilOff} dias`
      : `Licenca expirada - restam ${server.daysUntilOff} dias`;
  }

  if (server.status === "pending_payment") {
    return variant === "dashboard"
      ? "Pagamento pendente"
      : "Servidor aguardando regularizacao do downgrade";
  }

  return "Bot desligado - retorna imediatamente apos pagamento";
}

export function buildServerMetaLabel(
  server: Pick<
    ManagedServerLike,
    "accessMode" | "canManage" | "licensePaidAt" | "licenseExpiresAt"
  >,
) {
  if (server.accessMode === "owner") {
    return `Licenca principal - renovado em ${formatServerDateLabel(server.licensePaidAt)}`;
  }

  if (server.canManage) {
    return `Gestao por equipe - valido ate ${formatServerDateLabel(server.licenseExpiresAt)}`;
  }

  return `Acesso de visualizacao - valido ate ${formatServerDateLabel(server.licenseExpiresAt)}`;
}
