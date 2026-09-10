export function normalizeCityDbHost(value: string) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^\[(.*)\]$/, "$1");
}

export function isLoopbackCityDbHost(value: string) {
  const host = normalizeCityDbHost(value).toLowerCase();
  return (
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.startsWith("127.")
  );
}

export function isPrivateCityDbHost(value: string) {
  const host = normalizeCityDbHost(value).toLowerCase();
  if (isLoopbackCityDbHost(host)) return true;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return false;
}

export function looksLikePublicCityDbHost(value: string) {
  const host = normalizeCityDbHost(value);
  if (!host || isLoopbackCityDbHost(host) || isPrivateCityDbHost(host)) return false;
  try {
    assertCityDbHost(host);
    return true;
  } catch {
    return false;
  }
}

export function hasPersistedCityDbHost(value?: string | null) {
  return looksLikePublicCityDbHost(String(value || ""));
}

export function resolvePublicCityDbHost(input: {
  requested?: string | null;
  saved?: string | null;
  publicIp?: string | null;
  allowSavedFallback?: boolean;
}) {
  const allowSaved = input.allowSavedFallback !== false;
  const candidates = allowSaved
    ? [input.requested, input.saved, input.publicIp]
    : [input.requested];
  for (const raw of candidates) {
    const host = normalizeCityDbHost(String(raw || ""));
    if (!looksLikePublicCityDbHost(host)) continue;
    return assertCityDbHost(host);
  }
  throw new Error(
    "Sem IP publico do banco. Informe o IP no painel, ou use o launcher so na primeira configuracao para detectar.",
  );
}

export function assertCityDbHost(value: string) {
  const host = normalizeCityDbHost(value);
  if (!host) {
    throw new Error("Informe o IP ou hostname publico da VPS da cidade.");
  }
  if (isLoopbackCityDbHost(host)) {
    throw new Error(
      "127.0.0.1/localhost nao funciona da nuvem. Informe o IP publico da VPS ou conecte o launcher la para detectar.",
    );
  }
  if (isPrivateCityDbHost(host)) {
    throw new Error(
      "Esse IP e de rede interna. A Flowdesk precisa do IP publico da VPS, o mesmo que o launcher detecta.",
    );
  }
  const lowered = host.toLowerCase();
  if (
    ["root", "admin", "mysql", "mariadb", "postgres", "postgresql", "user", "usuario"].includes(
      lowered,
    )
  ) {
    throw new Error(
      "Esse valor parece um usuario, nao um IP. No campo IP/Host informe o IP da VPS, por exemplo 187.45.12.30.",
    );
  }
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
  const hostname =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(
      host,
    );
  const ipv6 = host.includes(":");
  if (!ipv4 && !hostname && !ipv6) {
    throw new Error(
      "Host invalido. Use o IP da VPS (ex: 187.45.12.30) ou um hostname (ex: db.cidade.com).",
    );
  }
  return host;
}
