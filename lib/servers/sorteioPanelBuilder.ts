import {
  createTicketPanelComponentId,
  normalizeTicketPanelLayout,
  type TicketPanelButtonComponent,
  type TicketPanelContainerChild,
  type TicketPanelContainerComponent,
  type TicketPanelContentComponent,
  type TicketPanelLayout,
} from "@/lib/servers/ticketPanelBuilder";

export const SORTEIO_LOCKED_ENTER_ID = "sorteio-lock-enter";
export const SORTEIO_LOCKED_GEAR_ID = "sorteio-lock-gear";

export const SORTEIO_HEADER_TOKEN = "{{sorteio_header}}";
export const SORTEIO_TITLE_TOKEN = "{{sorteio_title}}";
export const SORTEIO_DESCRIPTION_TOKEN = "{{sorteio_description}}";
export const SORTEIO_ENDS_AT_TOKEN = "{{sorteio_ends_at}}";
export const SORTEIO_PARTICIPANTS_TOKEN = "{{sorteio_participants}}";
export const SORTEIO_WINNERS_COUNT_TOKEN = "{{sorteio_winners_count}}";
export const SORTEIO_REQUIREMENTS_TOKEN = "{{sorteio_requirements}}";
export const SORTEIO_HOST_TOKEN = "{{sorteio_host}}";
export const SORTEIO_FOOTER_TOKEN = "{{sorteio_footer}}";

export const DEFAULT_SORTEIO_ACCENT = "#F1C40F";
export const DEFAULT_SORTEIO_ENDED_ACCENT = "#95A5A6";

export const SORTEIO_TOKEN_HINTS = [
  SORTEIO_HEADER_TOKEN,
  SORTEIO_TITLE_TOKEN,
  SORTEIO_DESCRIPTION_TOKEN,
  SORTEIO_ENDS_AT_TOKEN,
  SORTEIO_PARTICIPANTS_TOKEN,
  SORTEIO_WINNERS_COUNT_TOKEN,
  SORTEIO_REQUIREMENTS_TOKEN,
  SORTEIO_HOST_TOKEN,
  SORTEIO_FOOTER_TOKEN,
] as const;

export type SorteioLayoutPreviewContext = {
  header?: string;
  title?: string;
  description?: string;
  endsAt?: string;
  participants?: string;
  winnersCount?: string;
  requirements?: string;
  host?: string;
  footer?: string;
};

function trimText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function isSorteioLockedButtonId(id: string) {
  return id === SORTEIO_LOCKED_ENTER_ID || id === SORTEIO_LOCKED_GEAR_ID;
}

export function isSorteioLockedButtonComponent(
  component: TicketPanelButtonComponent,
) {
  return isSorteioLockedButtonId(component.id);
}

function createLockedEnterButton(): TicketPanelButtonComponent {
  return {
    id: SORTEIO_LOCKED_ENTER_ID,
    type: "button",
    label: "Entrar no sorteio",
    style: "success",
    disabled: false,
  };
}

function createLockedGearButton(): TicketPanelButtonComponent {
  return {
    id: SORTEIO_LOCKED_GEAR_ID,
    type: "button",
    label: "⚙️",
    style: "secondary",
    disabled: false,
  };
}

function createContentChild(markdown: string, id?: string): TicketPanelContentComponent {
  return {
    id: id || createTicketPanelComponentId("content"),
    type: "content",
    markdown,
    accessory: null,
  };
}

export function createDefaultSorteioActiveLayout(): TicketPanelLayout {
  const container: TicketPanelContainerComponent = {
    id: createTicketPanelComponentId("container"),
    type: "container",
    accentColor: DEFAULT_SORTEIO_ACCENT,
    children: [
      createContentChild(
        [
          SORTEIO_HEADER_TOKEN,
          "",
          SORTEIO_TITLE_TOKEN,
          "",
          SORTEIO_DESCRIPTION_TOKEN,
          "",
          SORTEIO_ENDS_AT_TOKEN,
          SORTEIO_PARTICIPANTS_TOKEN,
          SORTEIO_WINNERS_COUNT_TOKEN,
          SORTEIO_REQUIREMENTS_TOKEN,
          SORTEIO_HOST_TOKEN,
        ].join("\n"),
      ),
      {
        id: createTicketPanelComponentId("separator"),
        type: "separator",
        spacing: "sm",
      },
      createContentChild(SORTEIO_FOOTER_TOKEN),
    ],
  };

  return [container, createLockedEnterButton(), createLockedGearButton()];
}

export function createDefaultSorteioEndedLayout(): TicketPanelLayout {
  const container: TicketPanelContainerComponent = {
    id: createTicketPanelComponentId("container"),
    type: "container",
    accentColor: DEFAULT_SORTEIO_ENDED_ACCENT,
    children: [
      createContentChild(
        [
          "## 🏁 Sorteio encerrado",
          "",
          SORTEIO_TITLE_TOKEN,
          "",
          "-# 🎯 Consulte a mensagem abaixo para ver o(s) ganhador(es).",
        ].join("\n"),
      ),
    ],
  };

  return [container];
}

function stripLockedButtons(layout: TicketPanelLayout): TicketPanelLayout {
  return layout.filter(
    (component) =>
      !(component.type === "button" && isSorteioLockedButtonComponent(component)),
  );
}

function ensureLockedButtons(layout: TicketPanelLayout): TicketPanelLayout {
  const withoutLocks = stripLockedButtons(layout);
  return [...withoutLocks, createLockedEnterButton(), createLockedGearButton()];
}

export function normalizeSorteioActiveLayout(value: unknown): TicketPanelLayout {
  if (!Array.isArray(value) || value.length === 0) {
    return createDefaultSorteioActiveLayout();
  }

  const normalized = normalizeTicketPanelLayout(value);
  return ensureLockedButtons(normalized);
}

export function normalizeSorteioEndedLayout(value: unknown): TicketPanelLayout {
  if (!Array.isArray(value) || value.length === 0) {
    return createDefaultSorteioEndedLayout();
  }

  return normalizeTicketPanelLayout(value);
}

export function isUnsetSorteioActiveLayout(value: unknown) {
  return !Array.isArray(value) || value.length === 0;
}

export function resolveSorteioPreviewMarkdown(
  markdown: string,
  context?: Partial<SorteioLayoutPreviewContext>,
) {
  const map: Record<string, string> = {
    [SORTEIO_HEADER_TOKEN]: trimText(context?.header) || "## 🎉 Sorteio ativo",
    [SORTEIO_TITLE_TOKEN]: trimText(context?.title) || "### 🎁 Nitro Discord — 1 mes",
    [SORTEIO_DESCRIPTION_TOKEN]:
      trimText(context?.description) ||
      "Participe clicando no botao abaixo. Boa sorte!",
    [SORTEIO_ENDS_AT_TOKEN]:
      trimText(context?.endsAt) || "-# ⏰ Termina: em 1 hora (preview)",
    [SORTEIO_PARTICIPANTS_TOKEN]:
      trimText(context?.participants) || "-# 👥 Participantes: **12**",
    [SORTEIO_WINNERS_COUNT_TOKEN]:
      trimText(context?.winnersCount) || "-# 🏆 Vencedores: **1**",
    [SORTEIO_REQUIREMENTS_TOKEN]:
      trimText(context?.requirements) || "-# ✅ Requisitos: nenhum",
    [SORTEIO_HOST_TOKEN]:
      trimText(context?.host) || "-# 👤 Host: @Admin",
    [SORTEIO_FOOTER_TOKEN]:
      trimText(context?.footer) ||
      "-# 👇 Clique em **Entrar no sorteio** para participar.",
  };

  let output = String(markdown || "");
  for (const [token, replacement] of Object.entries(map)) {
    output = output.split(token).join(replacement);
  }
  return output;
}

export function sorteioActiveLayoutHasRequiredParts(layout: TicketPanelLayout) {
  const hasContent = layout.some((component) => {
    if (component.type === "content") {
      return trimText(component.markdown).length > 0;
    }
    if (component.type === "container") {
      return component.children.some(
        (child) => child.type === "content" && trimText(child.markdown).length > 0,
      );
    }
    return false;
  });

  const hasEnter = layout.some(
    (component) =>
      component.type === "button" && component.id === SORTEIO_LOCKED_ENTER_ID,
  );
  const hasGear = layout.some(
    (component) =>
      component.type === "button" && component.id === SORTEIO_LOCKED_GEAR_ID,
  );

  return hasContent && hasEnter && hasGear;
}

export function countSorteioLockedButtons(layout: TicketPanelLayout) {
  return layout.filter(
    (component) =>
      component.type === "button" && isSorteioLockedButtonComponent(component),
  ).length;
}

export function flattenSorteioContainerChildren(
  children: TicketPanelContainerChild[],
): TicketPanelContainerChild[] {
  return children;
}
