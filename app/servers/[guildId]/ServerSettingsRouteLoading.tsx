import { ServerSettingsEditorSkeleton } from "@/components/servers/ServerSettingsEditorSkeleton";

type ServerSettingsSection =
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
  | "security_antilink"
  | "security_autorole"
  | "security_logs"
  | "ticket_ai";

type ServerSettingsRouteLoadingProps = {
  settingsSection: ServerSettingsSection;
};

export function ServerSettingsRouteLoading({
  settingsSection,
}: ServerSettingsRouteLoadingProps) {
  return (
    <main className="min-h-screen bg-[#050505] px-[18px] py-[18px] text-white md:px-[28px]">
      <div className="mx-auto w-full max-w-[1480px]">
        <div className="grid min-h-[calc(100vh-36px)] grid-cols-1 gap-[16px] xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="hidden rounded-[28px] border border-[#0E0E0E] bg-[#050505] p-[14px] xl:block">
            <div className="flowdesk-shimmer h-[44px] rounded-[16px] bg-[#111111]" />
            <div className="mt-[18px] space-y-[10px]">
              {Array.from({ length: 9 }, (_, index) => (
                <div
                  key={index}
                  className={`flowdesk-shimmer h-[38px] rounded-[14px] ${index % 3 === 0 ? "w-[82%]" : "w-full"} bg-[#101010]`}
                />
              ))}
            </div>
          </aside>
          <section className="min-w-0 rounded-[28px] border border-[#0E0E0E] bg-[#070707] p-[14px] md:p-[18px]">
            <ServerSettingsEditorSkeleton standalone settingsSection={settingsSection} />
          </section>
        </div>
      </div>
    </main>
  );
}
