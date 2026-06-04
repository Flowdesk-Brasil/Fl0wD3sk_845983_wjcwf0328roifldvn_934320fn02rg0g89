"use client";

import { useState } from "react";
import { AlertTriangle, UserMinus } from "lucide-react";
import { DangerActionModal } from "@/components/account/DangerActionModal";
import { SensitiveActionModal } from "@/components/account/SensitiveActionModal";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import { buildLoginHref } from "@/lib/auth/paths";

export function DeleteAccountTab() {
  const notifications = useNotifications();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);

  function handleDeleteConfirm() {
    setModalOpen(false);
    setSecurityModalOpen(true);
  }

  async function performDelete(securityProof: string | null) {
    setSecurityModalOpen(false);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/me/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ securityProof }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Falha ao excluir a conta.");
      }

      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forgetTrustedDevice: true }),
      });
      window.location.assign(buildLoginHref());
    } catch (error) {
      notifications.error(
        error instanceof Error ? error.message : "Falha ao excluir a conta.",
        { title: "Exclusao de conta" },
      );
      setLoading(false);
    }
  }

  return (
    <div className="mt-[32px]">
      <div className="rounded-[18px] border border-[#3E1A1A] bg-[rgba(30,10,10,0.4)] p-[24px]">
        <div className="flex items-center gap-[12px] text-[#DB8A8A]">
          <AlertTriangle className="h-[24px] w-[24px]" />
          <h2 className="text-[18px] font-semibold text-[#E9E9E9]">
            Gostaria mesmo de excluir sua conta?
          </h2>
        </div>
        <div className="mt-[12px] max-w-[600px] leading-[1.6] text-[#B0B0B0]">
          <span>Ao excluir sua conta:</span>
          <ul className="ml-[20px] mt-[8px] list-disc space-y-[4px]">
            <li>Voce perdera o acesso aos dados e configuracoes dos paineis.</li>
            <li>Equipes ativas podem perder a posse caso voce seja o administrador primario.</li>
            <li>Credenciais, sessoes e dispositivos confiaveis serao revogados.</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={loading}
          className="mt-[24px] flex min-h-[44px] w-full items-center justify-center gap-[8px] rounded-[12px] bg-[#BB3535] px-[20px] py-[10px] text-center text-[14px] font-medium text-white transition hover:bg-[#8D2525] disabled:opacity-50 sm:w-auto"
        >
          {loading ? <ButtonLoader size={18} /> : <UserMinus className="h-[18px] w-[18px]" />}
          Sim, excluir minha conta permanentemente
        </button>
        <DangerActionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onConfirm={handleDeleteConfirm}
          isProcessing={loading}
          title="Excluir permanentemente"
          description="Esta acao e irreversivel. Voce perdera o acesso a configuracoes, paineis, pagamentos e tickets associados. Credenciais e sessoes da conta serao revogadas."
          confirmText="Sim, excluir minha conta"
        />
        <SensitiveActionModal
          isOpen={securityModalOpen}
          action="account_delete"
          title="Confirmar exclusao da conta"
          description="Confirme sua identidade antes de executar esta acao irreversivel."
          onClose={() => setSecurityModalOpen(false)}
          onVerified={performDelete}
        />
      </div>
    </div>
  );
}
