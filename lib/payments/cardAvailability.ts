const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export const CARD_PAYMENTS_COMING_SOON_BADGE = "EM BREVE";
export const CARD_PAYMENTS_DISABLED_MESSAGE =
  "Pagamento com cartao estara disponivel em breve. Por enquanto, utilize PIX.";
export const CARD_RECURRING_DISABLED_MESSAGE =
  "Cobranca recorrente com cartao estara disponivel em breve.";

export function areCardPaymentsEnabled() {
  const rawValue =
    process.env.NEXT_PUBLIC_ENABLE_CARD_PAYMENTS ??
    process.env.ENABLE_CARD_PAYMENTS ??
    "0";

  return ENABLED_VALUES.has(rawValue.trim().toLowerCase());
}
