import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlanPricing } from "../lib/plans/catalog.ts";
import {
  isBasicTrialOrderCurrentlyUsable,
  resolveBasicTrialReuseDecision,
} from "../lib/plans/basicTrialRecovery.ts";
import {
  hasActiveConfigPlan,
  hasActivePaidConfigPlan,
} from "../lib/plans/configAccess.ts";
import { shouldBlockConfigServerSelection } from "../lib/plans/configServerSelection.ts";
import { resolvePlanCycleExpirationIso } from "../lib/plans/cycle.ts";

test("Flow Basic is a seven day free trial with immediate entitlements", () => {
  const basic = resolvePlanPricing("basic", "monthly");

  assert.equal(basic.code, "basic");
  assert.equal(basic.isTrial, true);
  assert.equal(basic.totalAmount, 0);
  assert.equal(basic.billingCycleDays, 7);
  assert.equal(basic.billingPeriodLabel, "7 Dias");
  assert.equal(basic.entitlements.maxLicensedServers > 0, true);
  assert.equal(basic.entitlements.maxActiveTickets > 0, true);
});

test("Flow Basic trial expiration is calculated from activation timestamp", () => {
  assert.equal(
    resolvePlanCycleExpirationIso({
      baseTimestamp: "2026-08-17T12:00:00.000Z",
      billingCycleDays: 7,
    }),
    "2026-08-24T12:00:00.000Z",
  );
});

test("Flow Basic trial is accepted by config access guards", () => {
  const planState = {
    plan_code: "basic",
    status: "trial",
  } as const;

  assert.equal(hasActiveConfigPlan(planState), true);
  assert.equal(hasActivePaidConfigPlan(planState), true);
});

test("config server selection only blocks when usage is over plan capacity", () => {
  const userPlanState = {
    status: "trial",
    max_licensed_servers: 1,
  };

  assert.equal(
    shouldBlockConfigServerSelection({
      userPlanState,
      licensedServersCount: 1,
      targetPlanMaxLicensedServers: 1,
    }),
    false,
  );
  assert.equal(
    shouldBlockConfigServerSelection({
      userPlanState,
      licensedServersCount: 2,
      targetPlanMaxLicensedServers: 1,
    }),
    true,
  );
});

test("account-level Flow Basic trial can be attached to the first requested server", () => {
  const order = {
    guild_id: null,
    status: "approved",
    payment_method: "trial",
    plan_code: "basic",
    plan_billing_cycle_days: 7,
    paid_at: "2026-08-17T12:00:00.000Z",
    expires_at: "2026-08-24T12:00:00.000Z",
    created_at: "2026-08-17T12:00:00.000Z",
  };

  assert.equal(
    isBasicTrialOrderCurrentlyUsable(
      order,
      Date.parse("2026-08-18T12:00:00.000Z"),
    ),
    true,
  );
  assert.deepEqual(
    resolveBasicTrialReuseDecision(
      order,
      "123456789012345678",
      Date.parse("2026-08-18T12:00:00.000Z"),
    ),
    {
      kind: "account_trial_attach_guild",
      canReuse: true,
      licenseGuildId: "123456789012345678",
      shouldRecordGuildRepair: true,
    },
  );
});

test("Flow Basic trial cannot be reused for a different server after it is linked", () => {
  const order = {
    guild_id: "111111111111111111",
    status: "approved",
    payment_method: "trial",
    plan_code: "basic",
    plan_billing_cycle_days: 7,
    paid_at: "2026-08-17T12:00:00.000Z",
    expires_at: "2026-08-24T12:00:00.000Z",
    created_at: "2026-08-17T12:00:00.000Z",
  };

  assert.deepEqual(
    resolveBasicTrialReuseDecision(
      order,
      "222222222222222222",
      Date.parse("2026-08-18T12:00:00.000Z"),
    ),
    {
      kind: "different_guild",
      canReuse: false,
      licenseGuildId: null,
      shouldRecordGuildRepair: false,
      existingGuildId: "111111111111111111",
      requestedGuildId: "222222222222222222",
    },
  );
});
