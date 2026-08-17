import { KeyRound, LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import {
  getAdminEnvironmentReadiness,
  isBootstrapAdminConfigured,
  isFlowSecureConfigured,
} from "@/lib/admin/environmentReadiness";
import { requirePermission } from "@/lib/admin/auth";

export default async function AdminSettingsPage() {
  await requirePermission("settings.read");

  const settingsRows = getAdminEnvironmentReadiness();
  const configuredCount = settingsRows.filter((row) => row.configured).length;

  return (
    <section className="min-w-0">
      <AdminPageHeader
        eyebrow="Governanca"
        title="Configuracoes"
        description="Painel de prontidao operacional para variaveis estruturais do admin, FlowSecure e hosts canonicos. Nenhum segredo e exibido, apenas o estado de configuracao."
      />

      <div className="mt-[24px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label="Itens monitorados"
          value={String(settingsRows.length)}
          description="Conjunto minimo de configuracoes sensiveis desta camada."
          icon={<Settings2 className="h-[20px] w-[20px]" strokeWidth={1.9} />}
        />
        <AdminStatCard
          label="Configurados"
          value={String(configuredCount)}
          description="Entradas presentes no ambiente atual."
          icon={<ShieldCheck className="h-[20px] w-[20px]" strokeWidth={1.9} />}
        />
        <AdminStatCard
          label="Fluxo bootstrap"
          value={isBootstrapAdminConfigured() ? "Pronto" : "Pendente"}
          description="Status do mecanismo seguro de promocao inicial."
          icon={<KeyRound className="h-[20px] w-[20px]" strokeWidth={1.9} />}
        />
        <AdminStatCard
          label="FlowSecure"
          value={isFlowSecureConfigured() ? "Pronto" : "Pendente"}
          description="Disponibilidade do segredo principal para criptografia institucional."
          icon={<LockKeyhole className="h-[20px] w-[20px]" strokeWidth={1.9} />}
        />
      </div>

      <div className="mt-[18px]">
        <AdminDataTable
          title="Prontidao de ambiente"
          description="A tabela valida somente a presenca das configuracoes. Valores completos nunca sao exibidos no painel."
          headers={["Variavel", "Papel", "Status"]}
          rows={settingsRows.map((row) => [
            <div key={row.id} className="space-y-[6px]">
              <p className="font-medium text-[#EFEFEF]">{row.displayKey}</p>
              <p className="text-[12px] text-[#6D6D6D]">{row.label}</p>
            </div>,
            <p key={`${row.id}-description`} className="max-w-[420px] text-[13px] leading-[1.6] text-[#CFCFCF]">
              {row.description}
            </p>,
            <AdminStatusBadge
              key={`${row.id}-status`}
              status={row.configured ? "active" : "pending"}
              label={row.configured ? "Configurado" : "Nao configurado"}
            />,
          ])}
        />
      </div>
    </section>
  );
}
