import { redirect } from "next/navigation";

type ServersTicketTimeclockPageProps = {
  params: Promise<{
    guildId: string;
  }>;
};

function normalizeGuildId(value: string | null) {
  if (!value) return null;
  const guildId = value.trim();
  return /^\d{10,25}$/.test(guildId) ? guildId : null;
}

export default async function ServersTicketTimeclockPage({
  params,
}: ServersTicketTimeclockPageProps) {
  const routeParams = await params;
  const safeGuildId = normalizeGuildId(routeParams.guildId);

  if (!safeGuildId) {
    redirect("/servers/");
  }

  redirect(`/servers/${safeGuildId}/timeclock/configuracao/`);
}
