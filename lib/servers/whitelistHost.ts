export function normalizeCityDbHost(value: string) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^\[(.*)\]$/, "$1");
}

export function assertCityDbHost(value: string) {
  const host = normalizeCityDbHost(value);
  if (!host) {
    throw new Error("Informe o IP ou hostname publico da VPS da cidade.");
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
