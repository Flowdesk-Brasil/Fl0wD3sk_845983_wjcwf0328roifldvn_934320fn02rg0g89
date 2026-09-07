export const CITY_DB_APP_USER = "";
export const CITY_DB_APP_PASSWORD = "";
export const CITY_DB_DEFAULT_NAME = "";

function sqlLiteral(value: string) {
  return String(value || "").replace(/'/g, "''");
}

function sqlIdent(value: string) {
  return String(value || "").replace(/[`\\]/g, "");
}

export function resolveCityDbLogin(input: {
  user?: string | null;
  password?: string | null;
}) {
  return {
    user: String(input.user || "").trim(),
    password: input.password == null ? "" : String(input.password),
  };
}

export function cityDbProvisionSql(
  user = "flowdesk",
  password = "sua_senha",
  database = "nome_do_banco",
) {
  const login = sqlLiteral(user.trim() || "flowdesk");
  const secret = sqlLiteral(password || "sua_senha");
  const db = sqlIdent(database.trim() || "nome_do_banco");
  return [
    `GRANT ALL PRIVILEGES ON \`${db}\`.* TO '${login}'@'localhost' IDENTIFIED BY '${secret}';`,
    `GRANT ALL PRIVILEGES ON \`${db}\`.* TO '${login}'@'127.0.0.1' IDENTIFIED BY '${secret}';`,
    "FLUSH PRIVILEGES;",
  ].join("\n");
}
