import assert from "node:assert/strict";
import test from "node:test";
import { getFriendlyWebAuthnError } from "../lib/auth/webauthnClient";

test("traduz timeout e bloqueio do navegador sem expor mensagem tecnica", () => {
  const message = getFriendlyWebAuthnError(
    new DOMException(
      "The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.",
      "NotAllowedError",
    ),
  );

  assert.match(message, /cancelada ou expirou/i);
  assert.doesNotMatch(message, /w3\.org|timed out|not allowed/i);
});

test("diferencia cadastro de passkey ja vinculada", () => {
  const message = getFriendlyWebAuthnError(
    new DOMException("Credential already registered", "InvalidStateError"),
    "register",
  );

  assert.match(message, /ja esta vinculada/i);
});

test("oferece alternativa quando passkeys nao sao suportadas", () => {
  const message = getFriendlyWebAuthnError(
    new DOMException("Not supported", "NotSupportedError"),
  );

  assert.match(message, /outro dispositivo ou metodo/i);
});

test("preserva mensagens amigaveis enviadas pelo servidor", () => {
  const message = getFriendlyWebAuthnError(
    new Error("Esta confirmacao expirou. Inicie novamente."),
  );

  assert.equal(message, "Esta confirmacao expirou. Inicie novamente.");
});
