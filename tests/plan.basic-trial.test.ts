import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlanPricing } from "../lib/plans/catalog.ts";
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
