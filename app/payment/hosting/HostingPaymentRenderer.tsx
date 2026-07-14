import { redirect } from "next/navigation";
import {
  HOSTING_PLANS,
  HOSTING_REGIONS,
  DEFAULT_HOSTING_REGION_ID,
  resolveHostingRegion,
  type HostingKind,
} from "@/lib/hosting/catalog";
import { buildHostingPaymentHref } from "@/lib/payments/unifiedCheckout";

export type HostingPaymentPageProps = {
  params: Promise<{
    kind: string;
    planId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSingleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isHostingKind(value: string): value is HostingKind {
  return value === "site" || value === "bot" || value === "minecraft";
}

/**
 * Legacy hosting/vps payment route.
 * Redirects to the unified /payment/{productSlug}/{billingPeriodSlug} route.
 */
export async function renderHostingPaymentPage({
  params,
  searchParams,
}: HostingPaymentPageProps & { surface?: "hosting" | "vps" }) {
  const routeParams = await params;
  const query = searchParams ? await searchParams : {};
  const kind = isHostingKind(routeParams.kind) ? routeParams.kind : null;
  const plan = kind
    ? HOSTING_PLANS[kind].find((item) => item.id === routeParams.planId)
    : null;
  const regionId =
    resolveHostingRegion(readSingleQueryValue(query.hostingRegion))?.id ||
    HOSTING_REGIONS[0]?.id ||
    DEFAULT_HOSTING_REGION_ID;
  const repository = readSingleQueryValue(query.repository) || null;

  if (!kind || !plan) {
    redirect("/dashboard/hosting");
  }

  // Redirect to the unified payment route
  const unifiedHref = buildHostingPaymentHref({
    kind,
    planId: plan.id,
    regionId: regionId || HOSTING_REGIONS[0]?.id || DEFAULT_HOSTING_REGION_ID,
    repository,
    fresh: true,
  });

  redirect(unifiedHref);
}
