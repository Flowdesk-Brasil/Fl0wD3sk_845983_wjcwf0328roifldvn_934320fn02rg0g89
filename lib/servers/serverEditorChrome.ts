export type ServerSettingsSection =
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

export type ServerEditorModuleActions = {
  enabled: boolean;
  onToggle: () => void;
  onReset: () => void;
  canReset: boolean;
  disabled: boolean;
};

export type ServerEditorChrome = {
  eyebrow: string;
  title: string;
  description: string;
  moduleActions?: ServerEditorModuleActions | null;
};

type ModuleOverviewSection = Extract<
  ServerSettingsSection,
  | "overview"
  | "ticket_ai"
  | "sales_overview"
  | "entry_exit_overview"
  | "suggestions_overview"
  | "bate_ponto_overview"
  | "captcha_overview"
  | "security_antilink"
  | "security_autorole"
>;

const MODULE_OVERVIEW_COPY: Record<
  ModuleOverviewSection,
  { tag: string; title: string; description: string }
> = {
  overview: {
    tag: "Tickets",
    title: "Central de atendimento",
    description:
      "Configure o painel de abertura, canais de log e permissões da equipe. Salve para publicar no Discord.",
  },
  ticket_ai: {
    tag: "FlowAI",
    title: "Atendimento com inteligência artificial",
    description:
      "Treine regras, tom de voz e políticas de reembolso para o bot responder com contexto da sua operação.",
  },
  sales_overview: {
    tag: "Vendas",
    title: "Loja do servidor",
    description:
      "Defina carrinhos, logs de pagamento e identidade do comprovante. Ative o módulo e salve para aplicar no Discord.",
  },
  entry_exit_overview: {
    tag: "Entrada e saída",
    title: "Recepção automática",
    description:
      "Mensagens públicas de boas-vindas e despedida, com logs privados para auditoria da movimentação.",
  },
  suggestions_overview: {
    tag: "Sugestões",
    title: "Ideias da comunidade",
    description:
      "Painel de envio, canal de publicação e logs para organizar sugestões e votos dos membros.",
  },
  bate_ponto_overview: {
    tag: "Bate-ponto",
    title: "Expediente e banco de horas",
    description:
      "Painel de registro, logs, cargos autorizados e regras de encerramento para a equipe.",
  },
  captcha_overview: {
    tag: "Captcha",
    title: "Verificação na entrada",
    description:
      "Proteja o servidor com desafio visual, cargos liberados após validação e exceções de bypass.",
  },
  security_antilink: {
    tag: "Segurança",
    title: "Proteção AntiLink",
    description:
      "Bloqueie links externos, convites do Discord e URLs ofuscadas assim que a mensagem for enviada.",
  },
  security_autorole: {
    tag: "Segurança",
    title: "Cargos automáticos",
    description:
      "Distribua cargos para novos membros e, se precisar, sincronize quem já está no servidor.",
  },
};

const SALES_SECTION_COPY: Partial<
  Record<ServerSettingsSection, { tag: string; title: string; description: string }>
> = {
  sales_categories: {
    tag: "Vendas",
    title: "Categorias da loja",
    description:
      "Organize vitrines e agrupe produtos por coleções para manter a loja fácil de navegar.",
  },
  sales_category_create: {
    tag: "Vendas",
    title: "Nova categoria",
    description: "Crie uma coleção pronta para o bot e para a vitrine web do servidor.",
  },
  sales_category_edit: {
    tag: "Vendas",
    title: "Editar categoria",
    description: "Ajuste nome, ordem e apresentação sem quebrar a estrutura da loja.",
  },
  sales_products: {
    tag: "Vendas",
    title: "Produtos",
    description: "Cadastre itens com preço, mídia e estoque para vender pelo bot.",
  },
  sales_product_create: {
    tag: "Vendas",
    title: "Novo produto",
    description: "Configure preço, entrega, mídias e publicação do item na loja.",
  },
  sales_product_edit: {
    tag: "Vendas",
    title: "Editar produto",
    description: "Atualize preço, estoque, mídias e descrição sem interromper a loja.",
  },
  sales_stock: {
    tag: "Vendas",
    title: "Estoque",
    description:
      "Gerencie entregas digitais por produto com dados separados para envio automático.",
  },
  sales_stock_edit: {
    tag: "Vendas",
    title: "Editar estoque",
    description: "Atualize itens de entrega vinculados ao produto selecionado.",
  },
  sales_payment_methods: {
    tag: "Vendas",
    title: "Formas de pagamento",
    description: "Escolha como a loja aceita pagamentos e quais métodos ficam visíveis.",
  },
  sales_coupons_gifts: {
    tag: "Vendas",
    title: "Cupons e gift cards",
    description: "Crie descontos e créditos pré-pagos para campanhas e fidelização.",
  },
  sales_coupons_gifts_create: {
    tag: "Vendas",
    title: "Novo cupom ou gift",
    description: "Configure código, valor, validade e regras de uso na loja.",
  },
  sales_coupons_gifts_edit: {
    tag: "Vendas",
    title: "Editar cupom ou gift",
    description: "Ajuste benefício, limite de uso e vigência sem recriar o código.",
  },
};

export function isModuleOverviewSection(
  section: ServerSettingsSection,
): section is ModuleOverviewSection {
  return section in MODULE_OVERVIEW_COPY;
}

export function resolveServerEditorSectionCopy(section: ServerSettingsSection) {
  if (isModuleOverviewSection(section)) {
    return MODULE_OVERVIEW_COPY[section];
  }
  return SALES_SECTION_COPY[section] ?? null;
}

export function buildServerEditorChrome(input: {
  section: ServerSettingsSection;
  moduleActions?: ServerEditorModuleActions | null;
  ticketAiDescription?: string;
}): ServerEditorChrome | null {
  const copy = resolveServerEditorSectionCopy(input.section);
  if (!copy) return null;

  return {
    eyebrow: `Configurando servidor · ${copy.tag}`,
    title: copy.title,
    description:
      input.section === "ticket_ai" && input.ticketAiDescription
        ? input.ticketAiDescription
        : copy.description,
    moduleActions: input.moduleActions ?? null,
  };
}

export type ModuleActivationKey =
  | "sales"
  | "ticket"
  | "flowai"
  | "welcome"
  | "captcha"
  | "suggestions"
  | "bate_ponto"
  | "antilink"
  | "autorole"
  | "security_logs";

export const MODULE_ACTIVATION_BAR_COPY: Record<
  ModuleActivationKey,
  { title: string; description: string; buttonLabel: string }
> = {
  sales: {
    title: "Modulo de vendas desativado",
    description: "Ative para configurar carrinhos, logs de pagamento e a identidade da loja.",
    buttonLabel: "Ativar modulo",
  },
  ticket: {
    title: "Modulo de tickets desativado",
    description: "Ative para publicar o painel, abrir atendimentos e registrar logs no Discord.",
    buttonLabel: "Ativar modulo",
  },
  flowai: {
    title: "FlowAI desativado",
    description: "Ative para configurar identidade, tom de voz e regras de atendimento automatico.",
    buttonLabel: "Ativar modulo",
  },
  welcome: {
    title: "Entrada e saida desativadas",
    description: "Ative para enviar boas-vindas, despedidas e logs de movimentacao no servidor.",
    buttonLabel: "Ativar modulo",
  },
  captcha: {
    title: "Captcha desativado",
    description: "Ative para proteger a entrada do servidor com verificacao visual e cargos liberados.",
    buttonLabel: "Ativar modulo",
  },
  suggestions: {
    title: "Modulo de sugestoes desativado",
    description: "Ative para publicar o painel de ideias, votos e logs da comunidade.",
    buttonLabel: "Ativar modulo",
  },
  bate_ponto: {
    title: "Bate-ponto desativado",
    description: "Ative para registrar expediente, logs e banco de horas da equipe.",
    buttonLabel: "Ativar modulo",
  },
  antilink: {
    title: "AntiLink desativado",
    description: "Ative para bloquear links externos, convites e URLs ofuscadas automaticamente.",
    buttonLabel: "Ativar modulo",
  },
  autorole: {
    title: "AutoRole desativado",
    description: "Ative para distribuir cargos automaticamente quando novos membros entrarem.",
    buttonLabel: "Ativar modulo",
  },
  security_logs: {
    title: "Logs de seguranca desativados",
    description: "Ative para registrar eventos de moderacao e auditoria nos canais configurados.",
    buttonLabel: "Ativar modulo",
  },
};

export function resolveModuleActivationKey(input: {
  section: ServerSettingsSection;
  salesEnabled: boolean;
  ticketEnabled: boolean;
  aiEnabled: boolean;
  welcomeEnabled: boolean;
  captchaEnabled: boolean;
  suggestionsEnabled: boolean;
  batePontoEnabled: boolean;
  antiLinkEnabled: boolean;
  autoRoleEnabled: boolean;
  securityLogsEnabled: boolean;
}): ModuleActivationKey | null {
  if (
    (input.section === "sales_overview" ||
      input.section.startsWith("sales_")) &&
    !input.salesEnabled
  ) {
    return "sales";
  }
  if (input.section === "ticket_ai" && !input.aiEnabled) {
    return "flowai";
  }
  if (
    (input.section === "overview" || input.section === "message") &&
    !input.ticketEnabled
  ) {
    return "ticket";
  }
  if (
    (input.section === "entry_exit_overview" || input.section === "entry_exit_message") &&
    !input.welcomeEnabled
  ) {
    return "welcome";
  }
  if (
    (input.section === "captcha_overview" || input.section === "captcha_message") &&
    !input.captchaEnabled
  ) {
    return "captcha";
  }
  if (
    (input.section === "suggestions_overview" || input.section === "suggestions_message") &&
    !input.suggestionsEnabled
  ) {
    return "suggestions";
  }
  if (
    (input.section === "bate_ponto_overview" ||
      input.section === "bate_ponto_message" ||
      input.section === "bate_ponto_ranking" ||
      input.section === "bate_ponto_history") &&
    !input.batePontoEnabled
  ) {
    return "bate_ponto";
  }
  if (input.section === "security_antilink" && !input.antiLinkEnabled) {
    return "antilink";
  }
  if (input.section === "security_autorole" && !input.autoRoleEnabled) {
    return "autorole";
  }
  if (input.section === "security_logs" && !input.securityLogsEnabled) {
    return "security_logs";
  }
  return null;
}
