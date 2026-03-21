import type { Metadata } from "next";
import { DiscordLinkPageClient } from "@/components/discord-link/DiscordLinkPageClient";

export const metadata: Metadata = {
  title: "Vincular conta Discord | Flowdesk",
  description:
    "Vincule sua conta do Discord ao Flowdesk para sincronizar o acesso e liberar automaticamente seu cargo no servidor oficial.",
};

export default function DiscordLinkPage() {
  return <DiscordLinkPageClient />;
}
