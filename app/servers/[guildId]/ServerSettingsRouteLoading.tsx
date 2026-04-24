import { WorkspaceRouteContentLoading } from "@/components/workspace/WorkspaceRouteLoading";

type ServerSettingsSection =
  | "overview"
  | "message"
  | "entry_exit_overview"
  | "entry_exit_message"
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
    <WorkspaceRouteContentLoading
      variant="server-settings"
      tab="settings"
      settingsSection={settingsSection}
    />
  );
}
