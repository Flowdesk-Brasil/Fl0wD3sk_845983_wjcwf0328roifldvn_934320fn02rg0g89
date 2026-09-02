export const DEFAULT_TICKET_PANEL_TITLE = "Abrir atendimento";
export const DEFAULT_TICKET_PANEL_DESCRIPTION =
  "Escolha uma opcao abaixo para falar com a equipe responsavel.";
export const DEFAULT_TICKET_PANEL_BUTTON_LABEL = "Abrir ticket";

export const DEFAULT_CAPTCHA_PANEL_TITLE = "Iniciar captcha";
export const DEFAULT_CAPTCHA_PANEL_DESCRIPTION =
  "Complete a verificacao abaixo para liberar o acesso aos canais.";
export const DEFAULT_CAPTCHA_PANEL_BUTTON_LABEL = "Iniciar captcha";

export const DEFAULT_SUGGESTION_PANEL_TITLE = "Iniciar Sugestao";
export const DEFAULT_SUGGESTION_PANEL_DESCRIPTION =
  "Compartilhe ideias para melhorar o servidor. Clique abaixo para abrir uma sugestao.";
export const DEFAULT_SUGGESTION_PANEL_BUTTON_LABEL = "Abrir Sugestao";

export type TicketPanelComponentType =
  | "content"
  | "container"
  | "image"
  | "file"
  | "separator"
  | "button"
  | "link_button"
  | "select";

export type TicketPanelButtonStyle =
  | "primary"
  | "secondary"
  | "success"
  | "danger";

export type TicketPanelContentAccessoryType =
  | "button"
  | "link_button"
  | "thumbnail"
  | "user_thumbnail";

type TicketPanelComponentBase = {
  id: string;
  type: TicketPanelComponentType;
};

export type TicketPanelThumbnailAccessory = {
  type: "thumbnail";
  imageUrl: string;
  alt: string;
};

export type TicketPanelUserThumbnailAccessory = {
  type: "user_thumbnail";
  alt: string;
};

export type TicketPanelButtonAccessory = {
  type: "button";
  label: string;
  emoji?: string;
  style: TicketPanelButtonStyle;
  disabled: boolean;
};

export type TicketPanelLinkButtonAccessory = {
  type: "link_button";
  label: string;
  emoji?: string;
  url: string;
};

export type TicketPanelContentAccessory =
  | TicketPanelThumbnailAccessory
  | TicketPanelUserThumbnailAccessory
  | TicketPanelButtonAccessory
  | TicketPanelLinkButtonAccessory;

export type TicketPanelContentComponent = TicketPanelComponentBase & {
  type: "content";
  markdown: string;
  accessory: TicketPanelContentAccessory | null;
};

export type TicketPanelImageComponent = TicketPanelComponentBase & {
  type: "image";
  url: string;
  alt: string;
};

export type TicketPanelFileComponent = TicketPanelComponentBase & {
  type: "file";
  name: string;
  sizeLabel: string;
};

export type TicketPanelSeparatorComponent = TicketPanelComponentBase & {
  type: "separator";
  spacing: "sm" | "md" | "lg";
};

export type TicketPanelButtonComponent = TicketPanelComponentBase & {
  type: "button";
  label: string;
  emoji?: string;
  style: TicketPanelButtonStyle;
  disabled: boolean;
};

export type TicketPanelLinkButtonComponent = TicketPanelComponentBase & {
  type: "link_button";
  label: string;
  emoji?: string;
  url: string;
};

export type TicketPanelSelectOption = {
  id: string;
  label: string;
  description: string;
};

export type TicketPanelSelectComponent = TicketPanelComponentBase & {
  type: "select";
  placeholder: string;
  options: TicketPanelSelectOption[];
};

export type TicketPanelContainerChild =
  | TicketPanelContentComponent
  | TicketPanelImageComponent
  | TicketPanelFileComponent
  | TicketPanelSeparatorComponent
  | TicketPanelButtonComponent
  | TicketPanelLinkButtonComponent
  | TicketPanelSelectComponent;

export type TicketPanelContainerComponent = TicketPanelComponentBase & {
  type: "container";
  accentColor: string;
  children: TicketPanelContainerChild[];
};

export type TicketPanelComponent =
  | TicketPanelContentComponent
  | TicketPanelContainerComponent
  | TicketPanelImageComponent
  | TicketPanelFileComponent
  | TicketPanelSeparatorComponent
  | TicketPanelButtonComponent
  | TicketPanelLinkButtonComponent
  | TicketPanelSelectComponent;

export type TicketPanelLayout = TicketPanelComponent[];

export type LegacyTicketPanelFields = {
  panelTitle: string;
  panelDescription: string;
  panelButtonLabel: string;
};

function stripMarkdownDecorators(value: string) {
  return value
    .replace(/^\s{0,3}(?:#{1,6}|-#)\s*/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .trim();
}

function buildMarkdownFromLegacy(legacy?: Partial<LegacyTicketPanelFields>) {
  const title = trimText(legacy?.panelTitle) || DEFAULT_TICKET_PANEL_TITLE;
  const description =
    trimText(legacy?.panelDescription) || DEFAULT_TICKET_PANEL_DESCRIPTION;

  return [`## ${title}`, description].filter(Boolean).join("\n");
}

function trimText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function clampText(value: string, maxLength: number) {
  return value.slice(0, maxLength);
}

function getCandidateString(
  candidate: Record<string, unknown>,
  key: string,
  fallback: string,
  maxLength: number,
) {
  if (typeof candidate[key] === "string") {
    return clampText(candidate[key] as string, maxLength);
  }

  return clampText(fallback, maxLength);
}

function sanitizeAccentColor(value: unknown) {
  const normalized = trimText(value);
  if (!normalized) return "";
  return /^#(?:[0-9a-fA-F]{6})$/.test(normalized) ? normalized : "";
}

function sanitizeButtonStyle(value: unknown): TicketPanelButtonStyle {
  if (
    value === "primary" ||
    value === "secondary" ||
    value === "success" ||
    value === "danger"
  ) {
    return value;
  }

  return "primary";
}

export function sanitizeButtonEmoji(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}

export type ParsedButtonEmoji =
  | {
      kind: "custom";
      id: string;
      name: string;
      animated: boolean;
      raw: string;
    }
  | {
      kind: "unicode";
      name: string;
      raw: string;
    };

export function parseButtonEmojiMarkup(value: unknown): ParsedButtonEmoji | null {
  const normalized = sanitizeButtonEmoji(value);
  if (!normalized) return null;

  const customMatch = normalized.match(/^<(a?):([a-zA-Z0-9_]+):(\d{17,20})>$/);
  if (customMatch) {
    return {
      kind: "custom",
      animated: customMatch[1] === "a",
      name: customMatch[2],
      id: customMatch[3],
      raw: normalized,
    };
  }

  return {
    kind: "unicode",
    name: normalized,
    raw: normalized,
  };
}

export function formatButtonEmojiMarkup(emoji: {
  id: string;
  name: string;
  animated: boolean;
}) {
  return emoji.animated
    ? `<a:${emoji.name}:${emoji.id}>`
    : `<:${emoji.name}:${emoji.id}>`;
}

export function buildDiscordButtonEmojiPayload(
  value: unknown,
): Record<string, unknown> | undefined {
  const parsed = parseButtonEmojiMarkup(value);
  if (!parsed) return undefined;

  if (parsed.kind === "custom") {
    return {
      id: parsed.id,
      name: parsed.name,
      animated: parsed.animated,
    };
  }

  return { name: parsed.name };
}

function sanitizeSeparatorSpacing(
  value: unknown,
): TicketPanelSeparatorComponent["spacing"] {
  if (value === "sm" || value === "md" || value === "lg") {
    return value;
  }
  return "md";
}

export function createTicketPanelComponentId(prefix = "cmp") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

export function getDefaultTicketPanelSelectOptions(): TicketPanelSelectOption[] {
  return [
    {
      id: createTicketPanelComponentId("opt"),
      label: "Suporte geral",
      description: "Fale com a equipe principal.",
    },
    {
      id: createTicketPanelComponentId("opt"),
      label: "Financeiro",
      description: "Questoes de cobranca e pagamento.",
    },
  ];
}

export function createTicketPanelContentAccessoryByType(
  type: TicketPanelContentAccessoryType,
): TicketPanelContentAccessory {
  if (type === "thumbnail") {
    return {
      type,
      imageUrl: "",
      alt: "",
    };
  }

  if (type === "user_thumbnail") {
    return {
      type,
      alt: "",
    };
  }

  if (type === "link_button") {
    return {
      type,
      label: "Abrir link",
      emoji: "",
      url: "https://flowdesk.com.br",
    };
  }

  return {
    type: "button",
    label: "Acao",
    emoji: "",
    style: "primary",
    disabled: false,
  };
}

export function createDefaultTicketPanelLayout(
  legacy?: Partial<LegacyTicketPanelFields>,
): TicketPanelLayout {
  const buttonLabel =
    trimText(legacy?.panelButtonLabel) || DEFAULT_TICKET_PANEL_BUTTON_LABEL;

  return [
    {
      id: createTicketPanelComponentId("container"),
      type: "container",
      accentColor: "",
      children: [
        {
          id: createTicketPanelComponentId("content"),
          type: "content",
          markdown: buildMarkdownFromLegacy(legacy),
          accessory: null,
        },
        {
          id: createTicketPanelComponentId("separator"),
          type: "separator",
          spacing: "md",
        },
        {
          id: createTicketPanelComponentId("button"),
          type: "button",
          label: buttonLabel,
          emoji: "",
          style: "primary",
          disabled: false,
        },
      ],
    },
  ];
}

export function createDefaultCaptchaPanelLayout(
  legacy?: Partial<LegacyTicketPanelFields>,
): TicketPanelLayout {
  return createDefaultTicketPanelLayout({
    panelTitle: trimText(legacy?.panelTitle) || DEFAULT_CAPTCHA_PANEL_TITLE,
    panelDescription:
      trimText(legacy?.panelDescription) || DEFAULT_CAPTCHA_PANEL_DESCRIPTION,
    panelButtonLabel:
      trimText(legacy?.panelButtonLabel) || DEFAULT_CAPTCHA_PANEL_BUTTON_LABEL,
  });
}

function isTicketPanelLegacyContent(
  legacy?: Partial<LegacyTicketPanelFields>,
) {
  const title = trimText(legacy?.panelTitle);
  const description = trimText(legacy?.panelDescription);
  const buttonLabel = trimText(legacy?.panelButtonLabel);

  const titleMatchesTicketDefault = !title || title === DEFAULT_TICKET_PANEL_TITLE;
  const descriptionMatchesTicketDefault =
    !description || description === DEFAULT_TICKET_PANEL_DESCRIPTION;
  const buttonMatchesTicketDefault =
    !buttonLabel || buttonLabel === DEFAULT_TICKET_PANEL_BUTTON_LABEL;

  return (
    titleMatchesTicketDefault &&
    descriptionMatchesTicketDefault &&
    buttonMatchesTicketDefault
  );
}

export function isUnsetCaptchaPanelLayout(
  value: unknown,
  legacyFallback?: Partial<LegacyTicketPanelFields>,
) {
  if (value === null || value === undefined) {
    return true;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return isTicketPanelLegacyContent(legacyFallback);
  }

  if (!isTicketPanelLegacyContent(legacyFallback)) {
    return false;
  }

  const derivedLegacy = deriveLegacyTicketPanelFields(
    normalizeTicketPanelLayout(value),
  );

  return (
    derivedLegacy.panelTitle === DEFAULT_TICKET_PANEL_TITLE &&
    derivedLegacy.panelDescription === DEFAULT_TICKET_PANEL_DESCRIPTION &&
    derivedLegacy.panelButtonLabel === DEFAULT_TICKET_PANEL_BUTTON_LABEL
  );
}

export function normalizeCaptchaPanelLayout(
  value: unknown,
  legacyFallback?: Partial<LegacyTicketPanelFields>,
): TicketPanelLayout {
  const resolvedLegacy = {
    panelTitle: trimText(legacyFallback?.panelTitle) || DEFAULT_CAPTCHA_PANEL_TITLE,
    panelDescription:
      trimText(legacyFallback?.panelDescription) ||
      DEFAULT_CAPTCHA_PANEL_DESCRIPTION,
    panelButtonLabel:
      trimText(legacyFallback?.panelButtonLabel) ||
      DEFAULT_CAPTCHA_PANEL_BUTTON_LABEL,
  };

  if (isUnsetCaptchaPanelLayout(value, legacyFallback)) {
    return createDefaultCaptchaPanelLayout(resolvedLegacy);
  }

  return normalizeTicketPanelLayout(value, resolvedLegacy);
}

export function createDefaultSuggestionPanelLayout(
  legacy?: Partial<LegacyTicketPanelFields>,
): TicketPanelLayout {
  return createDefaultTicketPanelLayout({
    panelTitle: trimText(legacy?.panelTitle) || DEFAULT_SUGGESTION_PANEL_TITLE,
    panelDescription:
      trimText(legacy?.panelDescription) || DEFAULT_SUGGESTION_PANEL_DESCRIPTION,
    panelButtonLabel:
      trimText(legacy?.panelButtonLabel) || DEFAULT_SUGGESTION_PANEL_BUTTON_LABEL,
  });
}

function isSuggestionPanelLegacyContent(legacy?: Partial<LegacyTicketPanelFields>) {
  const title = trimText(legacy?.panelTitle);
  const description = trimText(legacy?.panelDescription);
  const buttonLabel = trimText(legacy?.panelButtonLabel);

  const titleMatchesSuggestionDefault =
    !title || title === DEFAULT_SUGGESTION_PANEL_TITLE;
  const descriptionMatchesSuggestionDefault =
    !description || description === DEFAULT_SUGGESTION_PANEL_DESCRIPTION;
  const buttonMatchesSuggestionDefault =
    !buttonLabel || buttonLabel === DEFAULT_SUGGESTION_PANEL_BUTTON_LABEL;

  return (
    titleMatchesSuggestionDefault &&
    descriptionMatchesSuggestionDefault &&
    buttonMatchesSuggestionDefault
  );
}

export function isUnsetSuggestionPanelLayout(
  value: unknown,
  legacyFallback?: Partial<LegacyTicketPanelFields>,
) {
  if (value === null || value === undefined) {
    return true;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return isSuggestionPanelLegacyContent(legacyFallback);
  }

  const derivedLegacy = deriveLegacyTicketPanelFields(
    normalizeTicketPanelLayout(value),
  );

  return (
    derivedLegacy.panelTitle === DEFAULT_TICKET_PANEL_TITLE &&
    derivedLegacy.panelDescription === DEFAULT_TICKET_PANEL_DESCRIPTION &&
    derivedLegacy.panelButtonLabel === DEFAULT_TICKET_PANEL_BUTTON_LABEL
  );
}

export const DEFAULT_SUGGESTION_PUBLISHED_ACCENT = "#00bcd4";
export const SUGGESTION_PUBLISHED_HEADER_TOKEN = "{{published_header}}";
export const SUGGESTION_PUBLISHED_FOOTER_TOKEN = "{{published_footer}}";
export const SUGGESTION_PUBLISHED_TITLE_TOKEN = "{{suggestion_title}}";
export const SUGGESTION_PUBLISHED_BODY_TOKEN = "{{suggestion_body}}";
export const SUGGESTION_PUBLISHED_AUTHOR_TOKEN = "{{suggestion_author}}";
export const SUGGESTION_PUBLISHED_TITLE_PREVIEW = "### Titulo da sugestao";
export const SUGGESTION_PUBLISHED_BODY_PREVIEW = "> ```descricao```";

export function formatSuggestionPublishedBody(body: string) {
  const safe = trimText(body);
  if (!safe) {
    return SUGGESTION_PUBLISHED_BODY_PREVIEW;
  }

  return `> \`\`\`${safe}\`\`\``;
}

export function createSuggestionMemberSlotMarkdown() {
  return `${SUGGESTION_PUBLISHED_TITLE_TOKEN}\n\n${SUGGESTION_PUBLISHED_BODY_TOKEN}`;
}

export function isSuggestionMemberSlotMarkdown(markdown: string) {
  const trimmed = markdown.trim();
  if (
    !trimmed.includes(SUGGESTION_PUBLISHED_TITLE_TOKEN) ||
    !trimmed.includes(SUGGESTION_PUBLISHED_BODY_TOKEN)
  ) {
    return false;
  }

  if (
    trimmed.includes(SUGGESTION_PUBLISHED_HEADER_TOKEN) ||
    trimmed.includes(SUGGESTION_PUBLISHED_AUTHOR_TOKEN) ||
    trimmed.includes(SUGGESTION_PUBLISHED_FOOTER_TOKEN)
  ) {
    return false;
  }

  return !stripLegacySuggestionPublishedPreviewLines(trimmed)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some(
      (line) =>
        line !== SUGGESTION_PUBLISHED_TITLE_TOKEN &&
        line !== SUGGESTION_PUBLISHED_BODY_TOKEN,
    );
}

function isLegacyCombinedSuggestionContentMarkdown(markdown: string) {
  return (
    markdown.includes(SUGGESTION_PUBLISHED_TITLE_TOKEN) &&
    markdown.includes(SUGGESTION_PUBLISHED_BODY_TOKEN) &&
    !isSuggestionMemberSlotMarkdown(markdown)
  );
}

function stripMemberSlotTokensFromContent(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed !== SUGGESTION_PUBLISHED_TITLE_TOKEN &&
        trimmed !== SUGGESTION_PUBLISHED_BODY_TOKEN
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createSuggestionPublishedContentChild(
  markdown: string,
  id?: string,
): TicketPanelContentComponent {
  return {
    id: id || createTicketPanelComponentId("content"),
    type: "content",
    markdown,
    accessory: null,
  };
}

export function createSuggestionMemberSlotChild(
  id?: string,
): TicketPanelContentComponent {
  return {
    id: id || createTicketPanelComponentId("slot"),
    type: "content",
    markdown: createSuggestionMemberSlotMarkdown(),
    accessory: null,
  };
}

function splitLegacyCombinedSuggestionContent(
  markdown: string,
): TicketPanelContainerChild[] {
  const cleaned = stripLegacySuggestionPublishedPreviewLines(markdown);
  const parsed = parseSuggestionPublishedContentMarkdown(cleaned);
  const children: TicketPanelContainerChild[] = [];
  const prefix = stripLegacySuggestionPublishedPreviewLines(parsed.prefix);

  if (prefix) {
    children.push(createSuggestionPublishedContentChild(prefix));
  }

  children.push(createSuggestionMemberSlotChild());

  const suffix = stripLegacySuggestionPublishedPreviewLines(parsed.suffix);
  if (suffix) {
    children.push(createSuggestionPublishedContentChild(suffix));
  }

  return children;
}

function normalizeSuggestionPublishedContainerChildren(
  children: TicketPanelContainerChild[],
): TicketPanelContainerChild[] {
  let expanded: TicketPanelContainerChild[] = [];

  for (const child of children) {
    if (
      child.type === "content" &&
      isLegacyCombinedSuggestionContentMarkdown(child.markdown)
    ) {
      expanded.push(...splitLegacyCombinedSuggestionContent(child.markdown));
      continue;
    }

    expanded.push(child);
  }

  let slotSeen = false;
  expanded = expanded
    .filter((child) => {
      if (
        child.type === "content" &&
        isSuggestionMemberSlotMarkdown(child.markdown)
      ) {
        if (slotSeen) {
          return false;
        }
        slotSeen = true;
        return true;
      }

      return true;
    })
    .map((child) => {
      if (
        child.type === "content" &&
        isSuggestionMemberSlotMarkdown(child.markdown)
      ) {
        return createSuggestionMemberSlotChild(child.id);
      }

      if (child.type === "content") {
        return {
          ...child,
          markdown: stripMemberSlotTokensFromContent(child.markdown),
        };
      }

      return child;
    });

  if (!slotSeen) {
    const insertAt = expanded.findIndex(
      (child) =>
        child.type === "separator" ||
        (child.type === "content" &&
          child.markdown.includes(SUGGESTION_PUBLISHED_AUTHOR_TOKEN)),
    );
    const index = insertAt >= 0 ? insertAt : expanded.length;
    expanded = [
      ...expanded.slice(0, index),
      createSuggestionMemberSlotChild(),
      ...expanded.slice(index),
    ];
  }

  return expanded;
}

function normalizeSuggestionPublishedLayoutStructure(
  layout: TicketPanelLayout,
): TicketPanelLayout {
  return layout.map((component) => {
    if (component.type === "container") {
      return {
        ...component,
        children: normalizeSuggestionPublishedContainerChildren(
          component.children,
        ),
      };
    }

    return component;
  });
}

export function mergeSuggestionPublishedContentMarkdown(
  prefix: string,
  suffix: string,
) {
  const sections = [
    prefix.trim(),
    SUGGESTION_PUBLISHED_TITLE_TOKEN,
    SUGGESTION_PUBLISHED_BODY_TOKEN,
    suffix.trim(),
  ].filter(Boolean);

  return sections.join("\n\n");
}

export function parseSuggestionPublishedContentMarkdown(markdown: string) {
  const titleIndex = markdown.indexOf(SUGGESTION_PUBLISHED_TITLE_TOKEN);
  const bodyIndex = markdown.indexOf(SUGGESTION_PUBLISHED_BODY_TOKEN);

  if (titleIndex === -1 || bodyIndex === -1 || bodyIndex < titleIndex) {
    return {
      prefix: markdown,
      suffix: "",
      hasSlots: false,
    };
  }

  return {
    prefix: markdown.slice(0, titleIndex).replace(/\s+$/, ""),
    suffix: markdown
      .slice(bodyIndex + SUGGESTION_PUBLISHED_BODY_TOKEN.length)
      .replace(/^\s+/, ""),
    hasSlots: true,
  };
}

function stripLegacySuggestionPublishedPreviewLines(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }

      if (
        trimmed === SUGGESTION_PUBLISHED_TITLE_TOKEN ||
        trimmed === SUGGESTION_PUBLISHED_BODY_TOKEN ||
        trimmed.includes(SUGGESTION_PUBLISHED_AUTHOR_TOKEN) ||
        trimmed.includes(SUGGESTION_PUBLISHED_HEADER_TOKEN) ||
        trimmed.includes(SUGGESTION_PUBLISHED_FOOTER_TOKEN)
      ) {
        return true;
      }

      return (
        trimmed !== SUGGESTION_PUBLISHED_TITLE_PREVIEW &&
        trimmed !== "### Titulo da sugestao" &&
        trimmed !== SUGGESTION_PUBLISHED_BODY_PREVIEW &&
        trimmed !== "> ```descricao```" &&
        trimmed !== "-# Enviada por @autor" &&
        trimmed !== "Enviada por @autor" &&
        trimmed !== "Flowdesk | Sistema de sugestoes" &&
        trimmed !== "-# Flowdesk | Sistema de sugestoes" &&
        !trimmed.startsWith("Descreva aqui o corpo da sugestao")
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSuggestionPublishedContentMarkdown(markdown: string) {
  if (isSuggestionMemberSlotMarkdown(markdown)) {
    return createSuggestionMemberSlotMarkdown();
  }

  return stripMemberSlotTokensFromContent(
    stripLegacySuggestionPublishedPreviewLines(markdown),
  );
}

function ensureSuggestionPublishedSlotsInLayout(
  layout: TicketPanelLayout,
): TicketPanelLayout {
  return normalizeSuggestionPublishedLayoutStructure(
    normalizeTicketPanelLayout(layout),
  );
}

export function resolveSuggestionPublishedPreviewMarkdown(
  markdown: string,
  options?: {
    publishedHeader?: string;
    publishedFooter?: string;
  },
) {
  const header =
    trimText(options?.publishedHeader) || "NOVA SUGESTAO ENVIADA!";
  const footer =
    trimText(options?.publishedFooter) || "Flowdesk | Sistema de sugestoes";

  return markdown
    .replaceAll(SUGGESTION_PUBLISHED_HEADER_TOKEN, header)
    .replaceAll(SUGGESTION_PUBLISHED_FOOTER_TOKEN, footer)
    .replaceAll(
      SUGGESTION_PUBLISHED_TITLE_TOKEN,
      SUGGESTION_PUBLISHED_TITLE_PREVIEW,
    )
    .replaceAll(
      SUGGESTION_PUBLISHED_BODY_TOKEN,
      SUGGESTION_PUBLISHED_BODY_PREVIEW,
    )
    .replaceAll(SUGGESTION_PUBLISHED_AUTHOR_TOKEN, "@autor");
}

export function suggestionPublishedLayoutHasRequiredSlots(
  layout: TicketPanelLayout,
) {
  const normalized = normalizeSuggestionPublishedLayoutStructure(
    normalizeTicketPanelLayout(layout),
  );

  for (const component of normalized) {
    if (component.type !== "container") {
      continue;
    }

    const slotCount = component.children.filter(
      (child) =>
        child.type === "content" &&
        isSuggestionMemberSlotMarkdown(child.markdown),
    ).length;

    if (slotCount === 1) {
      return true;
    }
  }

  return false;
}

export function createDefaultSuggestionPublishedLayout(): TicketPanelLayout {
  return [
    {
      id: createTicketPanelComponentId("container"),
      type: "container",
      accentColor: DEFAULT_SUGGESTION_PUBLISHED_ACCENT,
      children: [
        createSuggestionPublishedContentChild("## 💡 {{published_header}}"),
        createSuggestionMemberSlotChild(),
        createSuggestionPublishedContentChild(
          "-# Enviada por {{suggestion_author}}\n-# {{published_footer}}",
        ),
      ],
    },
  ];
}

export function isUnsetSuggestionPublishedLayout(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }

  return !Array.isArray(value) || value.length === 0;
}

export function normalizeSuggestionPublishedLayout(
  value: unknown,
): TicketPanelLayout {
  if (isUnsetSuggestionPublishedLayout(value)) {
    return createDefaultSuggestionPublishedLayout();
  }

  return ensureSuggestionPublishedSlotsInLayout(
    normalizeTicketPanelLayout(value),
  );
}

export function normalizeSuggestionPanelLayout(
  value: unknown,
  legacyFallback?: Partial<LegacyTicketPanelFields>,
): TicketPanelLayout {
  const resolvedLegacy = {
    panelTitle:
      trimText(legacyFallback?.panelTitle) || DEFAULT_SUGGESTION_PANEL_TITLE,
    panelDescription:
      trimText(legacyFallback?.panelDescription) ||
      DEFAULT_SUGGESTION_PANEL_DESCRIPTION,
    panelButtonLabel:
      trimText(legacyFallback?.panelButtonLabel) ||
      DEFAULT_SUGGESTION_PANEL_BUTTON_LABEL,
  };

  if (isUnsetSuggestionPanelLayout(value, legacyFallback)) {
    return createDefaultSuggestionPanelLayout(resolvedLegacy);
  }

  return normalizeTicketPanelLayout(value, resolvedLegacy);
}

export function createTicketPanelComponentByType(
  type: TicketPanelComponentType,
): TicketPanelComponent {
  switch (type) {
    case "content":
      return {
        id: createTicketPanelComponentId("content"),
        type,
        markdown:
          "## Novo conteudo\nExplique aqui como o usuario deve usar este bloco dentro da mensagem.",
        accessory: null,
      };
    case "container":
      return {
        id: createTicketPanelComponentId("container"),
        type,
        accentColor: "",
        children: [],
      };
    case "image":
      return {
        id: createTicketPanelComponentId("image"),
        type,
        url: "",
        alt: "",
      };
    case "file":
      return {
        id: createTicketPanelComponentId("file"),
        type,
        name: "Guia-flowdesk.pdf",
        sizeLabel: "PDF | 1.2 MB",
      };
    case "separator":
      return {
        id: createTicketPanelComponentId("separator"),
        type,
        spacing: "md",
      };
    case "button":
      return {
        id: createTicketPanelComponentId("button"),
        type,
        label: "Acao principal",
        emoji: "",
        style: "primary",
        disabled: false,
      };
    case "link_button":
      return {
        id: createTicketPanelComponentId("link"),
        type,
        label: "Abrir link",
        emoji: "",
        url: "https://flowdesk.com.br",
      };
    case "select":
      return {
        id: createTicketPanelComponentId("select"),
        type,
        placeholder: "Escolha uma opcao",
        options: getDefaultTicketPanelSelectOptions(),
      };
  }
}

export function createTicketPanelContainerChildByType(
  type: Exclude<TicketPanelComponentType, "container">,
): TicketPanelContainerChild {
  return createTicketPanelComponentByType(type) as TicketPanelContainerChild;
}

function normalizeSelectOptions(value: unknown): TicketPanelSelectOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const options = value
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const candidate = option as Record<string, unknown>;

      return {
        id: trimText(candidate.id) || createTicketPanelComponentId("opt"),
        label: getCandidateString(candidate, "label", "", 80),
        description: getCandidateString(candidate, "description", "", 160),
      } satisfies TicketPanelSelectOption;
    })
    .filter((option): option is TicketPanelSelectOption => option !== null);

  return options;
}

function normalizeContentAccessory(
  value: unknown,
): TicketPanelContentAccessory | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;

  if (candidate.type === "thumbnail") {
    return {
      type: "thumbnail",
      imageUrl: getCandidateString(candidate, "imageUrl", "", 1000),
      alt: "",
    };
  }

  if (candidate.type === "user_thumbnail") {
    return {
      type: "user_thumbnail",
      alt: "",
    };
  }

  if (candidate.type === "link_button") {
    return {
      type: "link_button",
      label: getCandidateString(candidate, "label", "Abrir link", 80),
      emoji: sanitizeButtonEmoji(candidate.emoji),
      url: getCandidateString(candidate, "url", "https://flowdesk.com.br", 1000),
    };
  }

  if (candidate.type === "button") {
    return {
      type: "button",
      label: getCandidateString(candidate, "label", "Acao", 80),
      emoji: sanitizeButtonEmoji(candidate.emoji),
      style: sanitizeButtonStyle(candidate.style),
      disabled: Boolean(candidate.disabled),
    };
  }

  return null;
}

function normalizeContentComponent(
  candidate: Record<string, unknown>,
  id: string,
  legacy?: Partial<LegacyTicketPanelFields>,
): TicketPanelContentComponent {
  const markdownFromField = getCandidateString(candidate, "markdown", "", 4000);
  const contentFromField = getCandidateString(candidate, "content", "", 4000);
  const title = getCandidateString(candidate, "title", "", 120);
  const description = getCandidateString(candidate, "description", "", 1200);
  const fallbackMarkdown = buildMarkdownFromLegacy(legacy);

  const markdown =
    markdownFromField ||
    contentFromField ||
    (title || description
      ? [title ? `## ${title}` : "", description].filter(Boolean).join("\n")
      : fallbackMarkdown);

  return {
    id,
    type: "content",
    markdown: clampText(markdown, 4000),
    accessory: normalizeContentAccessory(candidate.accessory),
  };
}

function normalizeNonContainerComponent(
  value: unknown,
  legacy?: Partial<LegacyTicketPanelFields>,
): TicketPanelContainerChild | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const type = candidate.type;
  const id =
    trimText(candidate.id) ||
    createTicketPanelComponentId(typeof type === "string" ? type : "cmp");

  switch (type) {
    case "content":
      return normalizeContentComponent(candidate, id, legacy);
    case "image":
      return {
        id,
        type,
        url: getCandidateString(candidate, "url", "", 1000),
        alt: "",
      };
    case "file":
      return {
        id,
        type,
        name: getCandidateString(candidate, "name", "Arquivo-flowdesk.pdf", 120),
        sizeLabel: getCandidateString(candidate, "sizeLabel", "PDF | 1.2 MB", 60),
      };
    case "separator":
      return {
        id,
        type,
        spacing: sanitizeSeparatorSpacing(candidate.spacing),
      };
    case "button":
      return {
        id,
        type,
        label: getCandidateString(
          candidate,
          "label",
          DEFAULT_TICKET_PANEL_BUTTON_LABEL,
          80,
        ),
        emoji: sanitizeButtonEmoji(candidate.emoji),
        style: sanitizeButtonStyle(candidate.style),
        disabled: Boolean(candidate.disabled),
      };
    case "link_button":
      return {
        id,
        type,
        label: getCandidateString(candidate, "label", "Abrir link", 80),
        emoji: sanitizeButtonEmoji(candidate.emoji),
        url: getCandidateString(candidate, "url", "https://flowdesk.com.br", 1000),
      };
    case "select":
      return {
        id,
        type,
        placeholder: getCandidateString(
          candidate,
          "placeholder",
          "Escolha uma opcao",
          100,
        ),
        options: normalizeSelectOptions(candidate.options),
      };
    default:
      return null;
  }
}

function normalizeContainerChildren(value: unknown): TicketPanelContainerChild[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((child) => normalizeNonContainerComponent(child))
    .filter((child): child is TicketPanelContainerChild => child !== null);
}

export function normalizeTicketPanelLayout(
  value: unknown,
  legacyFallback?: Partial<LegacyTicketPanelFields>,
): TicketPanelLayout {
  if (!Array.isArray(value)) {
    return createDefaultTicketPanelLayout(legacyFallback);
  }

  if (value.length === 0) {
    return [];
  }

  const normalized = value
    .map((component) => {
      if (!component || typeof component !== "object") return null;
      const candidate = component as Record<string, unknown>;
      const type = candidate.type;
      const id =
        trimText(candidate.id) ||
        createTicketPanelComponentId(
          typeof type === "string" ? type : "cmp",
        );

      if (type === "container") {
        let children = normalizeContainerChildren(candidate.children);

        if (
          children.length === 0 &&
          (trimText(candidate.title) || trimText(candidate.description))
        ) {
          children = [
            normalizeContentComponent(candidate, createTicketPanelComponentId("content")),
          ];
        }

        return {
          id,
          type,
          accentColor: sanitizeAccentColor(candidate.accentColor),
          children,
        } satisfies TicketPanelContainerComponent;
      }

      return normalizeNonContainerComponent(candidate, legacyFallback);
    })
    .filter((component): component is TicketPanelComponent => component !== null);

  return normalized;
}

function mapAccessoryWithNewIds(
  accessory: TicketPanelContentAccessory | null,
): TicketPanelContentAccessory | null {
  if (!accessory) return null;
  return { ...accessory };
}

function mapContainerChildWithNewIds(
  component: TicketPanelContainerChild,
): TicketPanelContainerChild {
  if (component.type === "content") {
    return {
      ...component,
      id: createTicketPanelComponentId(component.type),
      accessory: mapAccessoryWithNewIds(component.accessory),
    };
  }

  if (component.type === "select") {
    return {
      ...component,
      id: createTicketPanelComponentId(component.type),
      options: component.options.map((option) => ({
        ...option,
        id: createTicketPanelComponentId("opt"),
      })),
    };
  }

  return {
    ...component,
    id: createTicketPanelComponentId(component.type),
  };
}

export function cloneTicketPanelComponentWithNewIds(
  component: TicketPanelComponent,
): TicketPanelComponent {
  if (component.type === "container") {
    return {
      ...component,
      id: createTicketPanelComponentId(component.type),
      children: component.children.map(mapContainerChildWithNewIds),
    };
  }

  return mapContainerChildWithNewIds(component);
}

function walkComponent(
  component: TicketPanelComponent,
  visitor: (component: TicketPanelContainerChild) => void,
) {
  if (component.type === "container") {
    component.children.forEach((child) => {
      visitor(child);
    });
    return;
  }

  visitor(component);
}

export function deriveLegacyTicketPanelFields(
  layout: TicketPanelLayout,
): LegacyTicketPanelFields {
  const normalized = normalizeTicketPanelLayout(layout);
  let contentLike: TicketPanelContentComponent | null = null;
  let buttonLike:
    | TicketPanelButtonComponent
    | TicketPanelLinkButtonComponent
    | TicketPanelSelectComponent
    | null = null;

  for (const component of normalized) {
    walkComponent(component, (current) => {
      if (!contentLike && current.type === "content") {
        contentLike = current;
      }

      if (
        !buttonLike &&
        (current.type === "button" ||
          current.type === "link_button" ||
          current.type === "select")
      ) {
        buttonLike = current;
      }
    });
  }

  const resolvedContentLike = contentLike as TicketPanelContentComponent | null;
  const resolvedButtonLike = buttonLike as
    | TicketPanelButtonComponent
    | TicketPanelLinkButtonComponent
    | TicketPanelSelectComponent
    | null;

  const markdownLines = (resolvedContentLike?.markdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const firstMeaningfulLine = markdownLines[0] || "";
  const titleCandidate = stripMarkdownDecorators(firstMeaningfulLine);
  const remainingLines = markdownLines.slice(1);
  const descriptionCandidate = remainingLines
    .map((line) => stripMarkdownDecorators(line))
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    panelTitle: clampText(titleCandidate || DEFAULT_TICKET_PANEL_TITLE, 80),
    panelDescription:
      clampText(
        descriptionCandidate ||
          titleCandidate ||
          DEFAULT_TICKET_PANEL_DESCRIPTION,
        400,
      ),
    panelButtonLabel:
      clampText(
        (resolvedButtonLike && "placeholder" in resolvedButtonLike
          ? resolvedButtonLike.placeholder
          : resolvedButtonLike?.label) || DEFAULT_TICKET_PANEL_BUTTON_LABEL,
        40,
      ),
  };
}

export function countTicketPanelFunctionButtons(layout: TicketPanelLayout) {
  const normalized = normalizeTicketPanelLayout(layout);
  let count = 0;

  for (const component of normalized) {
    walkComponent(component, (current) => {
      if (current.type === "button") {
        count += 1;
      }

      if (
        current.type === "content" &&
        current.accessory?.type === "button"
      ) {
        count += 1;
      }
    });
  }

  return count;
}

export function ticketPanelLayoutHasAtMostOneFunctionButton(
  layout: TicketPanelLayout,
) {
  return countTicketPanelFunctionButtons(layout) <= 1;
}

export function ticketPanelLayoutHasRequiredParts(layout: TicketPanelLayout) {
  const normalized = normalizeTicketPanelLayout(layout);
  let hasContent = false;
  let hasAction = false;

  for (const component of normalized) {
    walkComponent(component, (current) => {
      if (current.type === "content" && current.markdown.trim().length > 0) {
        hasContent = true;
      }

      if (
        current.type === "button" ||
        current.type === "link_button" ||
        current.type === "select"
      ) {
        hasAction = true;
      }
    });

    if (hasContent && hasAction) {
      return true;
    }
  }

  return hasContent && hasAction;
}
