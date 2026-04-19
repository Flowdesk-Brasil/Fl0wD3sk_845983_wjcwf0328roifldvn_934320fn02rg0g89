export const CARD_PAYMENTS_COMING_SOON_BADGE = "EM BREVE";
export const CARD_PAYMENTS_DISABLED_MESSAGE =
  "Pagamento com cartao estara disponivel em breve. Por enquanto, utilize PIX.";
export const CARD_RECURRING_DISABLED_MESSAGE =
  "Cobranca recorrente com cartao estara disponivel em breve.";

function normalizeConfiguredValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

export function areHostedCardCheckoutsEnabled() {
  return Boolean(
    normalizeConfiguredValue(process.env.NEXT_PUBLIC_MERCADO_PAGO_CARD_TEST_PUBLIC_KEY) ||
      normalizeConfiguredValue(process.env.NEXT_PUBLIC_MERCADO_PAGO_CARD_PUBLIC_KEY) ||
      normalizeConfiguredValue(
        process.env.NEXT_PUBLIC_MERCADO_PAGO_CARD_PRODUCTION_PUBLIC_KEY,
      ) ||
      normalizeConfiguredValue(process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY),
  );
}

export function areCardPaymentsEnabled() {
  return false;
}
