import { SignatureForm } from "./signature-form";

export default async function ContractSignaturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignatureForm token={token} />;
}
