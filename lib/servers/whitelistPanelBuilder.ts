import {
  createTicketPanelComponentId,
  normalizeTicketPanelLayout,
  type TicketPanelButtonComponent,
  type TicketPanelContainerComponent,
  type TicketPanelContentComponent,
  type TicketPanelLayout,
} from "@/lib/servers/ticketPanelBuilder";

export const WHITELIST_LOCKED_REQUEST_ID = "whitelist-lock-request";
export const DEFAULT_WHITELIST_ACCENT = "#3D8BFF";

export const WHITELIST_TOKEN_HINTS = [
  "{{guild_name}}",
  "{{identifier_label}}",
] as const;

function createContentChild(markdown: string): TicketPanelContentComponent {
  return {
    id: createTicketPanelComponentId("content"),
    type: "content",
    markdown,
    accessory: null,
  };
}

function createLockedRequestButton(): TicketPanelButtonComponent {
  return {
    id: WHITELIST_LOCKED_REQUEST_ID,
    type: "button",
    label: "Solicitar whitelist",
    style: "primary",
    disabled: false,
  };
}

export function isWhitelistLockedButtonId(id: string) {
  return id === WHITELIST_LOCKED_REQUEST_ID;
}

export function createDefaultWhitelistPanelLayout(): TicketPanelLayout {
  const container: TicketPanelContainerComponent = {
    id: createTicketPanelComponentId("container"),
    type: "container",
    accentColor: DEFAULT_WHITELIST_ACCENT,
    children: [
      createContentChild(
        [
          "## Whitelist da cidade",
          "",
          "Clique no botao abaixo e informe seu **{{identifier_label}}** para entrar na analise.",
          "",
          "-# A equipe confirma o pedido e o sistema sincroniza automaticamente com o banco da cidade.",
        ].join("\n"),
      ),
    ],
  };
  return [container, createLockedRequestButton()];
}

function ensureLockedButton(layout: TicketPanelLayout): TicketPanelLayout {
  const without = layout.filter(
    (component) =>
      !(component.type === "button" && isWhitelistLockedButtonId(component.id)),
  );
  return [...without, createLockedRequestButton()];
}

export function normalizeWhitelistPanelLayout(value: unknown): TicketPanelLayout {
  if (!Array.isArray(value) || value.length === 0) {
    return createDefaultWhitelistPanelLayout();
  }
  return ensureLockedButton(normalizeTicketPanelLayout(value));
}

export function isUnsetWhitelistPanelLayout(value: unknown) {
  return !Array.isArray(value) || value.length === 0;
}

export function whitelistPanelHasRequiredParts(layout: TicketPanelLayout) {
  const hasContent = layout.some((component) => {
    if (component.type === "content") return Boolean(component.markdown?.trim());
    if (component.type === "container") {
      return component.children.some(
        (child) => child.type === "content" && Boolean(child.markdown?.trim()),
      );
    }
    return false;
  });
  const hasButton = layout.some(
    (component) =>
      component.type === "button" && component.id === WHITELIST_LOCKED_REQUEST_ID,
  );
  return hasContent && hasButton;
}

export function applyWhitelistPanelTokens(
  layout: TicketPanelLayout,
  tokens: { guildName?: string; identifierLabel?: string },
): TicketPanelLayout {
  const guildName = String(tokens.guildName || "este servidor");
  const identifierLabel = String(tokens.identifierLabel || "ID / License");

  const walk = (items: TicketPanelLayout): TicketPanelLayout =>
    items.map((component) => {
      if (component.type === "container") {
        return {
          ...component,
          children: walk(component.children as unknown as TicketPanelLayout) as typeof component.children,
        };
      }
      if (component.type === "content") {
        return {
          ...component,
          markdown: String(component.markdown || "")
            .split("{{guild_name}}")
            .join(guildName)
            .split("{{identifier_label}}")
            .join(identifierLabel),
        };
      }
      if (component.type === "button" || component.type === "link_button") {
        return {
          ...component,
          label: String(component.label || "")
            .split("{{guild_name}}")
            .join(guildName)
            .split("{{identifier_label}}")
            .join(identifierLabel),
        };
      }
      return component;
    });

  return walk(layout);
}

export function resolveWhitelistPreviewMarkdown(markdown: string) {
  return String(markdown || "")
    .split("{{guild_name}}")
    .join("Cidade Flow")
    .split("{{identifier_label}}")
    .join("ID / License");
}
