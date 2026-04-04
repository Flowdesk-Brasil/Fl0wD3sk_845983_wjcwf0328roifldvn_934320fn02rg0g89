import {
  createTicketPanelComponentId,
  normalizeTicketPanelLayout,
  type TicketPanelComponent,
  type TicketPanelContainerChild,
  type TicketPanelLayout,
} from "@/lib/servers/ticketPanelBuilder";

export type WelcomeThumbnailMode = "custom" | "avatar";

const DEFAULT_ENTRY_MARKDOWN =
  "## Bem-vindo, {user}!\nAgora voce faz parte do **{server}**.\n-# Convite de {inviter}";
const DEFAULT_EXIT_MARKDOWN =
  "## {user} saiu do servidor\nEsperamos te ver de volta em breve.";

function walkComponent(
  component: TicketPanelComponent,
  visitor: (component: TicketPanelContainerChild) => void,
) {
  if (component.type === "container") {
    component.children.forEach((child) => visitor(child));
    return;
  }

  visitor(component);
}

export function createDefaultWelcomeEntryLayout(): TicketPanelLayout {
  return [
    {
      id: createTicketPanelComponentId("content"),
      type: "content",
      markdown: DEFAULT_ENTRY_MARKDOWN,
      accessory: {
        type: "thumbnail",
        imageUrl: "",
        alt: "",
      },
    },
  ];
}

export function createDefaultWelcomeExitLayout(): TicketPanelLayout {
  return [
    {
      id: createTicketPanelComponentId("content"),
      type: "content",
      markdown: DEFAULT_EXIT_MARKDOWN,
      accessory: null,
    },
  ];
}

export function normalizeWelcomeLayout(
  value: unknown,
  fallback: TicketPanelLayout,
) {
  if (!Array.isArray(value)) return fallback;
  return normalizeTicketPanelLayout(value);
}

export function welcomeLayoutHasContent(layout: TicketPanelLayout) {
  const normalized = normalizeTicketPanelLayout(layout);
  let hasContent = false;

  for (const component of normalized) {
    walkComponent(component, (child) => {
      if (child.type === "content" && child.markdown.trim().length > 0) {
        hasContent = true;
      }
    });

    if (hasContent) return true;
  }

  return hasContent;
}
