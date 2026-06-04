import { redirect } from "next/navigation";
import {
  DomainsWorkspace,
  FlowAiApiWorkspace,
} from "@/components/dashboard/domains/DomainsWorkspace";
import { resolveDashboardViewFromSlug } from "@/lib/dashboard/navigation";

type DashboardPageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const routeParams = await params;
  const normalizedSlug = Array.isArray(routeParams.slug) ? routeParams.slug : [];
  const normalizedPath = normalizedSlug.map((segment) => segment.trim().toLowerCase()).join("/");

  if (normalizedSlug[0]?.toLowerCase() === "servers") {
    redirect("/servers");
  }

  if (normalizedPath === "billing/subscriptions") {
    redirect("/account/plans");
  }

  if (normalizedPath === "billing/payment-history") {
    redirect("/account/payment_history");
  }

  if (normalizedPath === "billing/payment-methods") {
    redirect("/account/payment_methods");
  }

  const currentView = resolveDashboardViewFromSlug(normalizedSlug);
  if (!currentView) {
    redirect("/dashboard");
  }

  if (currentView.id === "domains_overview") return <DomainsWorkspace mode="overview" />;
  if (currentView.id === "domains_acquire") return <DomainsWorkspace mode="acquire" />;
  if (currentView.id === "domains_transfers") return <DomainsWorkspace mode="transfers" />;
  if (currentView.id === "flowai_api") return <FlowAiApiWorkspace />;

  return <div />;
}
