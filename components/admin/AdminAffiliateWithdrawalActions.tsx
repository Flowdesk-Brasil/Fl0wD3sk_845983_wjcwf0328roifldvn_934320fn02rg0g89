"use client";

/**
 * Acoes sobre um saque na fila.
 *
 * Marcar como pago e irreversivel do ponto de vista contabil (o valor ja saiu
 * do saldo na solicitacao), entao pede confirmacao. Rejeitar devolve o valor
 * ao afiliado e exige motivo, porque o motivo aparece para ele.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Action = "processing" | "paid" | "rejected";

export function AdminAffiliateWithdrawalActions({
  withdrawalId,
  status,
}: {
  withdrawalId: string;
  status: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");

  const isOpen = status === "pending" || status === "processing";

  if (!isOpen) {
    return <span className="text-[12px] text-[#5A5A5A]">Finalizado</span>;
  }

  const run = async (action: Action) => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/affiliates/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          withdrawalId,
          action,
          reason: action === "rejected" ? reason : undefined,
          receiptUrl: action === "paid" && receiptUrl ? receiptUrl : undefined,
        }),
      });

      const json = await response.json();

      if (json.ok) {
        setRejecting(false);
        setReason("");
        setReceiptUrl("");
        startTransition(() => router.refresh());
      } else {
        setError(json.message || "Nao foi possivel concluir a acao.");
      }
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || isPending;

  if (rejecting) {
    return (
      <div className="flex min-w-[220px] flex-col gap-[8px]">
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo da recusa"
          className="h-[32px] rounded-[8px] border border-[#1F1F1F] bg-[#0C0C0C] px-[10px] text-[12px] text-[#E5E5E5] outline-none focus:border-[#2D7FF9]"
        />
        <div className="flex gap-[6px]">
          <button
            type="button"
            disabled={disabled || !reason.trim()}
            onClick={() => run("rejected")}
            className="rounded-[8px] border border-[#3A1F1F] bg-[#1A0F0F] px-[10px] py-[5px] text-[12px] text-[#F0A0A0] disabled:opacity-40"
          >
            Confirmar recusa
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setRejecting(false)}
            className="rounded-[8px] border border-[#1F1F1F] bg-[#0C0C0C] px-[10px] py-[5px] text-[12px] text-[#8B8B90]"
          >
            Cancelar
          </button>
        </div>
        {error ? <span className="text-[11px] text-[#F0A0A0]">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-[210px] flex-col gap-[8px]">
      <input
        value={receiptUrl}
        onChange={(event) => setReceiptUrl(event.target.value)}
        placeholder="Link do comprovante (opcional)"
        className="h-[32px] rounded-[8px] border border-[#1F1F1F] bg-[#0C0C0C] px-[10px] text-[12px] text-[#E5E5E5] outline-none focus:border-[#2D7FF9]"
      />
      <div className="flex flex-wrap gap-[6px]">
        {status === "pending" ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => run("processing")}
            className="rounded-[8px] border border-[#1F1F1F] bg-[#0C0C0C] px-[10px] py-[5px] text-[12px] text-[#C4C4C8] disabled:opacity-40"
          >
            Em processamento
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => run("paid")}
          className="rounded-[8px] border border-[#1F3A2A] bg-[#0F1A14] px-[10px] py-[5px] text-[12px] text-[#7FD8A8] disabled:opacity-40"
        >
          Marcar como pago
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setRejecting(true)}
          className="rounded-[8px] border border-[#3A1F1F] bg-[#1A0F0F] px-[10px] py-[5px] text-[12px] text-[#F0A0A0] disabled:opacity-40"
        >
          Recusar
        </button>
      </div>
      {error ? <span className="text-[11px] text-[#F0A0A0]">{error}</span> : null}
    </div>
  );
}
