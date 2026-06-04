import assert from "node:assert/strict";
import test from "node:test";
import { applyFlowPointsToAmount } from "../lib/plans/flowPointsMath.ts";

test("FlowPoints never over-discount or create negative balances", () => {
  assert.deepEqual(
    applyFlowPointsToAmount({
      amount: 59.997,
      flowPointsBalance: 20.335,
    }),
    {
      appliedAmount: 20.34,
      remainingAmount: 39.66,
      nextBalanceAmount: 0,
    },
  );

  assert.deepEqual(
    applyFlowPointsToAmount({
      amount: 12.5,
      flowPointsBalance: 50,
    }),
    {
      appliedAmount: 12.5,
      remainingAmount: 0,
      nextBalanceAmount: 37.5,
    },
  );
});

test("FlowPoints normalize invalid and negative inputs safely", () => {
  assert.deepEqual(
    applyFlowPointsToAmount({
      amount: Number.NaN,
      flowPointsBalance: -10,
    }),
    {
      appliedAmount: 0,
      remainingAmount: 0,
      nextBalanceAmount: 0,
    },
  );
});
