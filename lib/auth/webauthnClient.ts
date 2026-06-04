type WebAuthnAction = "authenticate" | "register";

function normalizeWebAuthnError(error: unknown) {
  if (error instanceof DOMException) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "",
    message: "",
  };
}

export function getFriendlyWebAuthnError(
  error: unknown,
  action: WebAuthnAction = "authenticate",
) {
  const normalized = normalizeWebAuthnError(error);
  const fingerprint = `${normalized.name} ${normalized.message}`.toLowerCase();

  if (
    normalized.name === "NotAllowedError" ||
    fingerprint.includes("timed out") ||
    fingerprint.includes("not allowed")
  ) {
    return action === "register"
      ? "A criacao da Passkey foi cancelada ou expirou. Tente novamente e confirme a solicitacao no seu dispositivo."
      : "A confirmacao com Passkey foi cancelada ou expirou. Tente novamente e confirme a solicitacao no seu dispositivo.";
  }

  if (
    normalized.name === "AbortError" ||
    fingerprint.includes("aborted") ||
    fingerprint.includes("cancelled") ||
    fingerprint.includes("canceled")
  ) {
    return "A solicitacao de Passkey foi cancelada. Nenhuma alteracao foi realizada.";
  }

  if (
    normalized.name === "InvalidStateError" ||
    fingerprint.includes("already registered") ||
    fingerprint.includes("already exists")
  ) {
    return action === "register"
      ? "Esta Passkey ja esta vinculada a sua conta. Use outro dispositivo ou uma Passkey diferente."
      : "Esta Passkey nao esta disponivel para esta confirmacao. Tente outro metodo.";
  }

  if (
    normalized.name === "NotSupportedError" ||
    fingerprint.includes("not supported")
  ) {
    return "Este navegador ou dispositivo nao oferece suporte a Passkeys. Tente outro dispositivo ou metodo de verificacao.";
  }

  if (
    normalized.name === "NotFoundError" ||
    fingerprint.includes("no credentials") ||
    fingerprint.includes("no passkeys")
  ) {
    return "Nenhuma Passkey compativel foi encontrada neste dispositivo. Escolha outro metodo ou dispositivo.";
  }

  if (
    normalized.name === "NetworkError" ||
    fingerprint.includes("network") ||
    fingerprint.includes("failed to fetch")
  ) {
    return "A conexao foi interrompida durante a verificacao. Confira sua internet e tente novamente.";
  }

  if (
    normalized.name === "SecurityError" ||
    fingerprint.includes("secure context") ||
    fingerprint.includes("relying party")
  ) {
    return "A Passkey nao pode ser usada neste endereco. Abra o painel pelo endereco oficial e tente novamente.";
  }

  if (
    normalized.name === "ConstraintError" ||
    normalized.name === "UnknownError"
  ) {
    return "O dispositivo nao conseguiu concluir a verificacao com Passkey. Desbloqueie o dispositivo e tente novamente.";
  }

  const serverMessage = normalized.message.trim();
  const looksTechnical =
    /https?:\/\/|webauthn|credential|domexception|publickey|relying party|stack|exception/i.test(
      serverMessage,
    );
  if (serverMessage && serverMessage.length <= 180 && !looksTechnical) {
    return serverMessage;
  }

  return action === "register"
    ? "Nao foi possivel criar a Passkey agora. Tente novamente ou use outro dispositivo."
    : "Nao foi possivel validar a Passkey agora. Tente novamente ou escolha outro metodo.";
}
