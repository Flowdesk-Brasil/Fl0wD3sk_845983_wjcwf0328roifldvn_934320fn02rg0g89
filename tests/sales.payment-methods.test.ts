import assert from "node:assert/strict";
import test from "node:test";
import {
  getSalesMercadoPagoEnvironmentMismatchMessage,
  inferSalesMercadoPagoAccessTokenEnvironment,
  resolveSalesMercadoPagoEnvironment,
} from "../lib/sales/paymentMethods.ts";
import { resolveSalesMercadoPagoPixPayerEmail } from "../lib/sales/mercadoPago.ts";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

test("sales Mercado Pago environment follows the access token prefix", () => {
  assert.equal(inferSalesMercadoPagoAccessTokenEnvironment("TEST-123"), "test");
  assert.equal(
    inferSalesMercadoPagoAccessTokenEnvironment("APP_USR-123"),
    "production",
  );

  assert.equal(
    resolveSalesMercadoPagoEnvironment({
      accessToken: "TEST-123",
      selectedEnvironment: "production",
    }),
    "test",
  );
  assert.equal(
    resolveSalesMercadoPagoEnvironment({
      accessToken: "APP_USR-123",
      selectedEnvironment: "test",
    }),
    "production",
  );
  assert.equal(
    resolveSalesMercadoPagoEnvironment({
      accessToken: "custom-token",
      selectedEnvironment: "test",
    }),
    "test",
  );
});

test("resolved Mercado Pago environment does not raise a false mismatch", () => {
  const environment = resolveSalesMercadoPagoEnvironment({
    accessToken: "TEST-123",
    selectedEnvironment: "production",
  });

  assert.equal(
    getSalesMercadoPagoEnvironmentMismatchMessage({
      accessToken: "TEST-123",
      environment,
    }),
    null,
  );
});

test("sales Mercado Pago test mode can use a dedicated sandbox payer email", () => {
  const previousSalesPayerEmail = process.env.MERCADO_PAGO_SALES_TEST_PAYER_EMAIL;
  const previousPixPayerEmail = process.env.MERCADO_PAGO_PIX_TEST_PAYER_EMAIL;
  const previousFallbackPayerEmail = process.env.MERCADO_PAGO_TEST_PAYER_EMAIL;

  process.env.MERCADO_PAGO_SALES_TEST_PAYER_EMAIL = "buyer-test@example.com";
  delete process.env.MERCADO_PAGO_PIX_TEST_PAYER_EMAIL;
  delete process.env.MERCADO_PAGO_TEST_PAYER_EMAIL;

  try {
    assert.equal(
      resolveSalesMercadoPagoPixPayerEmail("customer@example.com", "test"),
      "buyer-test@example.com",
    );
    assert.equal(
      resolveSalesMercadoPagoPixPayerEmail("customer@example.com", "production"),
      "customer@example.com",
    );
  } finally {
    restoreEnv(
      "MERCADO_PAGO_SALES_TEST_PAYER_EMAIL",
      previousSalesPayerEmail,
    );
    restoreEnv("MERCADO_PAGO_PIX_TEST_PAYER_EMAIL", previousPixPayerEmail);
    restoreEnv("MERCADO_PAGO_TEST_PAYER_EMAIL", previousFallbackPayerEmail);
  }
});
