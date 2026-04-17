import { ConfigStepFour } from "@/components/config/ConfigStepFour";
import type { PlanBillingPeriodCode, PlanCode } from "@/lib/plans/catalog";

type AccountPaymentCheckoutProps = {
  displayName: string;
  initialPlanCode: PlanCode;
  initialBillingPeriodCode: PlanBillingPeriodCode;
};

export function AccountPaymentCheckout({
  displayName,
  initialPlanCode,
  initialBillingPeriodCode,
}: AccountPaymentCheckoutProps) {
  return (
    <ConfigStepFour
      displayName={displayName}
      guildId={null}
      initialPlanCode={initialPlanCode}
      initialBillingPeriodCode={initialBillingPeriodCode}
      hasExplicitInitialPlan
    />
  );
}
