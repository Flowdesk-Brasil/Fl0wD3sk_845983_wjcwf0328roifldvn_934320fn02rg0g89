import {
  renderHostingPaymentPage,
  type HostingPaymentPageProps,
} from "../../HostingPaymentRenderer";

export default async function HostingPaymentPage(props: HostingPaymentPageProps) {
  return renderHostingPaymentPage({
    ...props,
    surface: "hosting",
  });
}
