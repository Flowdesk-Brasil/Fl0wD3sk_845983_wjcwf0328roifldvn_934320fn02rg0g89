function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function applyFlowPointsToAmount(input: {
  amount: number;
  flowPointsBalance: number;
}) {
  const amount = Math.max(0, roundMoney(input.amount));
  const flowPointsBalance = Math.max(0, roundMoney(input.flowPointsBalance));
  const appliedAmount = roundMoney(Math.min(amount, flowPointsBalance));
  const remainingAmount = roundMoney(Math.max(0, amount - appliedAmount));
  const nextBalanceAmount = roundMoney(
    Math.max(0, flowPointsBalance - appliedAmount),
  );

  return {
    appliedAmount,
    remainingAmount,
    nextBalanceAmount,
  };
}
