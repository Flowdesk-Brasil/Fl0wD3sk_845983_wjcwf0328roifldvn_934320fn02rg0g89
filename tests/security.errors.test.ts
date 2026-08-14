import assert from "node:assert/strict";
import test from "node:test";
import {
  extractAuditErrorMessage,
  isSensitiveInfrastructureError,
  sanitizePublicErrorMessage,
} from "../lib/security/errors";

test("public auth errors hide SMTP and env details even outside production", () => {
  const error = new Error(
    "A autenticacao SMTP falhou. Revise AUTH_SMTP_USER e AUTH_SMTP_PASS.",
  );

  assert.equal(isSensitiveInfrastructureError(error), true);
  assert.equal(
    sanitizePublicErrorMessage(error, "Nao foi possivel enviar o codigo agora."),
    "Nao foi possivel enviar o codigo agora.",
  );
});

test("audit auth errors redact secrets while preserving useful cause", () => {
  const message = extractAuditErrorMessage(
    new Error(
      "EAUTH password=GOCSPX-super-secret-token AUTH_SMTP_PASS falhou",
    ),
  );

  assert.match(message, /EAUTH/i);
  assert.match(message, /\[redacted-env\]/);
  assert.match(message, /\[redacted-secret\]/);
  assert.doesNotMatch(message, /GOCSPX/i);
  assert.doesNotMatch(message, /AUTH_SMTP_PASS/i);
});

test("public auth errors keep business validation messages", () => {
  assert.equal(
    sanitizePublicErrorMessage(
      new Error("Senha incorreta. Revise e tente novamente."),
      "Nao foi possivel validar a senha agora.",
    ),
    "Senha incorreta. Revise e tente novamente.",
  );
});

test("public auth errors hide database persistence details", () => {
  assert.equal(
    sanitizePublicErrorMessage(
      new Error('duplicate key value violates unique constraint "auth_users_email_key"'),
      "Nao foi possivel concluir o login agora.",
    ),
    "Nao foi possivel concluir o login agora.",
  );
});
