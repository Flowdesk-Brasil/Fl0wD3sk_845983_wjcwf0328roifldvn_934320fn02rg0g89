import {
  renderHostingPaymentPage,
  type HostingPaymentPageProps,
} from "../../../hosting/HostingPaymentRenderer";

export default async function VpsPaymentPage(props: HostingPaymentPageProps) {
  return renderHostingPaymentPage({
    ...props,
    surface: "vps",
  });
}
