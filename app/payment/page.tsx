import { AppMaintenanceScreen } from "@/components/common/AppMaintenanceScreen";

export default function PaymentRootPage() {
  return (
    <AppMaintenanceScreen
      badgeLabel="Link invalido"
      title="Este link de pagamento nao e valido"
      description="Nao encontramos um produto, pedido ou codigo seguro nesta URL. Volte ao produto desejado e gere uma nova cobranca pela area correta."
      refreshLabel="Revalidar link"
      backLabel="Voltar ao painel"
      fallbackHref="/dashboard"
    />
  );
}
