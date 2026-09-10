export type CityDbFailure = {
  code: string;
  title: string;
  message: string;
  hint: string;
  retryable: boolean;
};

const OWNER_HINT =
  "Isso nao e um erro da Flowdesk. O MySQL/MariaDB roda na sua VPS e precisa estar ligado para a whitelist sincronizar.";

function rawErrorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message} ${error.cause || ""}`;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; errno?: unknown; message?: unknown; sqlMessage?: unknown };
    return [record.code, record.errno, record.message, record.sqlMessage].filter(Boolean).join(" ");
  }
  return "";
}

function errnoOf(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const record = error as { code?: unknown; errno?: unknown };
  return String(record.code || record.errno || "").toUpperCase();
}

export function explainCityDbFailure(error: unknown): CityDbFailure {
  const raw = rawErrorText(error);
  const lowered = raw.toLowerCase();
  const errno = errnoOf(error);

  if (
    lowered.includes("reading 'catch'") ||
    lowered.includes('reading "catch"') ||
    lowered.includes("reading catch")
  ) {
    return {
      code: "offline",
      title: "O banco da cidade nao esta online",
      message: "Nao foi possivel falar com o MySQL/MariaDB da sua VPS agora.",
      hint: `${OWNER_HINT} Ligue o servico do banco, confira a porta 3306 e tente de novo.`,
      retryable: true,
    };
  }

  if (lowered.includes("unknown database") || errno === "ER_BAD_DB_ERROR") {
    return {
      code: "unknown_database",
      title: "Esse banco nao existe na VPS",
      message: "O nome do banco informado nao existe neste MySQL/MariaDB.",
      hint: "Abra o HeidiSQL na VPS e confira o nome exato do banco. Isso nao e uma falha da Flowdesk.",
      retryable: false,
    };
  }

  if (
    lowered.includes("unknown column") ||
    (lowered.includes("doesn't exist") && lowered.includes("column")) ||
    errno === "ER_BAD_FIELD_ERROR"
  ) {
    return {
      code: "unknown_column",
      title: "A coluna da whitelist nao existe",
      message: "A tabela existe, mas a coluna configurada no painel nao foi encontrada no MySQL.",
      hint: "Confira a coluna do ID e a da whitelist. O botao Conectar so testa se o banco liga.",
      retryable: false,
    };
  }

  if (
    lowered.includes("unknown table") ||
    lowered.includes("doesn't exist") ||
    errno === "ER_NO_SUCH_TABLE"
  ) {
    return {
      code: "unknown_table",
      title: "Essa tabela nao existe no banco",
      message: "A tabela da whitelist configurada no painel nao existe neste MySQL.",
      hint: "Confira o nome da tabela no HeidiSQL.",
      retryable: false,
    };
  }

  if (
    lowered.includes("command denied") ||
    errno === "ER_TABLEACCESS_DENIED_ERROR" ||
    errno === "ER_COLUMNACCESS_DENIED_ERROR" ||
    errno === "ER_DBACCESS_DENIED_ERROR"
  ) {
    return {
      code: "missing_grant",
      title: "O usuario do banco nao pode alterar a whitelist",
      message: "O login funciona, mas este usuario nao tem UPDATE na tabela.",
      hint: "No HeidiSQL, conceda SELECT e UPDATE na tabela da whitelist. O usuario tambem precisa existir em % , nao so em localhost.",
      retryable: false,
    };
  }

  if (
    lowered.includes("access denied") ||
    lowered.includes("er_access_denied") ||
    errno === "ER_ACCESS_DENIED_ERROR" ||
    errno === "28000"
  ) {
    return {
      code: "invalid_credentials",
      title: "O banco recusou o usuario",
      message: "Usuario ou senha nao conferem com o MySQL da sua VPS.",
      hint: "Se o HeidiSQL na VPS entra e o painel nao, o usuario so existe em localhost. Rode o SQL do tutorial de novo — ele agora libera o host %.",
      retryable: false,
    };
  }

  if (
    lowered.includes("timeout") ||
    lowered.includes("etimedout") ||
    lowered.includes("timed out") ||
    errno === "ETIMEDOUT"
  ) {
    return {
      code: "timeout",
      title: "O banco da cidade nao respondeu",
      message: "O MySQL/MariaDB da sua VPS nao respondeu a tempo.",
      hint: `${OWNER_HINT} Confira se o servico esta rodando e se a porta nao esta filtrada.`,
      retryable: true,
    };
  }

  if (
    lowered.includes("econnrefused") ||
    lowered.includes("enotfound") ||
    lowered.includes("ehostunreach") ||
    lowered.includes("enotunreach") ||
    lowered.includes("eai_again") ||
    (lowered.includes("porta") && lowered.includes("fechada")) ||
    lowered.includes("nao esta online") ||
    errno === "ECONNREFUSED" ||
    errno === "ENOTFOUND" ||
    errno === "EHOSTUNREACH"
  ) {
    return {
      code: "offline",
      title: "O banco da cidade nao esta online",
      message: "A Flowdesk chegou ate a sua VPS, mas o MySQL/MariaDB nao esta acessivel.",
      hint: "Ligue o banco na VPS, libere a porta 3306 e tente novamente. A plataforma esta funcionando.",
      retryable: true,
    };
  }

  if (lowered.includes("too many connections") || errno === "ER_CON_COUNT_ERROR") {
    return {
      code: "pool_exhausted",
      title: "O banco da cidade esta sobrecarregado",
      message: "O MySQL da sua VPS atingiu o limite de conexoes.",
      hint: "Feche conexoes ociosas no HeidiSQL/phpMyAdmin ou aumente max_connections. Isso nao e a Flowdesk.",
      retryable: true,
    };
  }

  if (
    lowered.includes("caching_sha2") ||
    lowered.includes("auth plugin") ||
    lowered.includes("authentication plugin") ||
    errno === "ER_NOT_SUPPORTED_AUTH_MODE"
  ) {
    return {
      code: "auth_plugin",
      title: "O banco recusou o tipo de autenticacao",
      message: "Este MySQL exige um plugin de senha que o painel nao usa.",
      hint: "No HeidiSQL, altere o usuario para mysql_native_password. A Flowdesk nao controla o plugin do seu MySQL.",
      retryable: false,
    };
  }

  if (lowered.includes("is not allowed to connect") || lowered.includes("host is not allowed")) {
    return {
      code: "ip_not_allowed",
      title: "O MySQL recusou o IP remoto",
      message: "O usuario do banco nao pode conectar deste IP.",
      hint: "Rode de novo o SQL do painel. Ele agora cria o usuario em localhost e em %. Sem o %, o site e o bot nao entram.",
      retryable: false,
    };
  }

  if (lowered.includes("player") && lowered.includes("nao encontrado")) {
    return {
      code: "player_not_found",
      title: "ID nao encontrado no banco da cidade",
      message: "Esse identificador nao existe na tabela configurada.",
      hint: "Confira o ID no HeidiSQL. A Flowdesk so atualiza um registro que ja existe na sua cidade.",
      retryable: false,
    };
  }

  return {
    code: "db_error",
    title: "O banco da cidade recusou a operacao",
    message: "Nao foi possivel sincronizar a whitelist com o MySQL da sua VPS.",
    hint: OWNER_HINT,
    retryable: false,
  };
}

export function cityDbFailureFromText(text: string | null | undefined): CityDbFailure {
  const value = String(text || "").trim();
  if (!value) {
    return {
      code: "offline",
      title: "O banco da cidade ainda nao foi testado",
      message: "Salve as credenciais e clique em Conectar banco.",
      hint: OWNER_HINT,
      retryable: true,
    };
  }
  return explainCityDbFailure(new Error(value));
}
