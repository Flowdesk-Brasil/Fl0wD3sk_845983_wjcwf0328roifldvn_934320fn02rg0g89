import { serversScale } from "@/components/servers/serversScale";
import { ModuleSettingsSkeleton, ModuleSkel } from "@/components/servers/module-ui/ModuleUi";

export type ServerSettingsSkeletonTab =
  | "settings"
  | "payments"
  | "methods"
  | "plans";

export type ServerSettingsSkeletonSection =
  | "home"
  | "overview"
  | "message"
  | "sales_overview"
  | "sales_categories"
  | "sales_category_create"
  | "sales_category_edit"
  | "sales_products"
  | "sales_product_create"
  | "sales_product_edit"
  | "sales_stock"
  | "sales_stock_edit"
  | "sales_payment_methods"
  | "sales_coupons_gifts"
  | "sales_coupons_gifts_create"
  | "sales_coupons_gifts_edit"
  | "entry_exit_overview"
  | "entry_exit_message"
  | "captcha_overview"
  | "captcha_message"
  | "suggestions_overview"
  | "suggestions_message"
  | "bate_ponto_overview"
  | "bate_ponto_message"
  | "bate_ponto_ranking"
  | "bate_ponto_history"
  | "security_antilink"
  | "security_autorole"
  | "security_logs"
  | "ticket_ai";

type ServerSettingsEditorSkeletonProps = {
  standalone?: boolean;
  tab?: ServerSettingsSkeletonTab;
  settingsSection?: ServerSettingsSkeletonSection | null;
};

function MessageSkeleton() {
  return (
    <div className="space-y-[18px]" aria-hidden="true">
      <div className="space-y-[10px]">
        <ModuleSkel className="h-[12px] w-[110px] rounded-full" />
        <ModuleSkel className="h-[28px] w-[min(280px,68vw)] max-w-full rounded-full" />
        <ModuleSkel className="h-[12px] w-[min(480px,80vw)] max-w-full rounded-full" />
      </div>
      <ModuleSkel className="h-[220px] w-full rounded-[18px]" />
      <div className="space-y-[10px]">
        <ModuleSkel className="h-[14px] w-[46%] rounded-full" />
        <ModuleSkel className="h-[14px] w-[62%] rounded-full" />
        <ModuleSkel className="h-[14px] w-[38%] rounded-full" />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-[16px]" aria-hidden="true">
      <div className="space-y-[10px]">
        <ModuleSkel className="h-[12px] w-[92px] rounded-full" />
        <ModuleSkel className="h-[26px] w-[min(240px,60vw)] max-w-full rounded-full" />
      </div>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-[12px]">
          <ModuleSkel className="h-[36px] w-[36px] rounded-full" />
          <div className="min-w-0 flex-1 space-y-[8px]">
            <ModuleSkel className="h-[12px] w-[42%] rounded-full" />
            <ModuleSkel className="h-[10px] w-[28%] rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function resolveSkeletonContent(
  tab: ServerSettingsSkeletonTab,
  settingsSection: ServerSettingsSkeletonSection,
) {
  if (tab === "payments" || tab === "methods" || tab === "plans") {
    return <ModuleSettingsSkeleton stats={3} fields={3} />;
  }

  if (
    settingsSection === "message" ||
    settingsSection === "entry_exit_message" ||
    settingsSection === "captcha_message" ||
    settingsSection === "suggestions_message" ||
    settingsSection === "bate_ponto_message"
  ) {
    return <MessageSkeleton />;
  }

  if (
    settingsSection === "sales_categories" ||
    settingsSection === "sales_products" ||
    settingsSection === "sales_stock" ||
    settingsSection === "sales_coupons_gifts" ||
    settingsSection === "bate_ponto_ranking" ||
    settingsSection === "bate_ponto_history" ||
    settingsSection === "security_logs"
  ) {
    return <ListSkeleton />;
  }

  if (settingsSection === "ticket_ai" || settingsSection === "captcha_overview") {
    return <ModuleSettingsSkeleton stats={4} fields={6} />;
  }

  return <ModuleSettingsSkeleton />;
}

export function ServerSettingsEditorSkeleton({
  standalone = false,
  tab = "settings",
  settingsSection = "overview",
}: ServerSettingsEditorSkeletonProps) {
  const resolvedSettingsSection = settingsSection ?? "overview";

  return (
    <section
      className="flowdesk-fade-up-soft"
      style={{
        marginTop: standalone ? "0px" : `${serversScale.cardsTopSpacing}px`,
      }}
      aria-hidden="true"
    >
      {resolveSkeletonContent(tab, resolvedSettingsSection)}
    </section>
  );
}
