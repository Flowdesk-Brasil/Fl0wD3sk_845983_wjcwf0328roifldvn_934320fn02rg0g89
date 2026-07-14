export type HostingKind = "site" | "bot" | "minecraft";
export type HostingStep = "kind" | "github" | "repository" | "region" | "plan" | "payment" | "ready";

export type HostingGitHubAccount = {
  id: string;
  login: string;
  name: string;
  avatarUrl: string | null;
  type: "user" | "organization";
};

export type HostingRepository = {
  id: string;
  nodeId?: string | null;
  owner: string;
  name: string;
  fullName?: string;
  description: string;
  language: string;
  updatedAt: string;
  branch: string;
  private: boolean;
  canWrite?: boolean;
  htmlUrl?: string;
};

export type HostingRegion = {
  id: string;
  name: string;
  country: string;
  city: string;
  pingMs: number;
  status: "available" | "soon";
  coordinates: {
    x: number;
    y: number;
  };
};

export type HostingPlan = {
  id: string;
  kind: HostingKind;
  name: string;
  badge: string;
  recommended?: boolean;
  monthlyAmount: number;
  compareMonthlyAmount: number;
  currency: string;
  billingLabel: string;
  cycleBadge: string;
  limitedOffer: string;
  description: string;
  specs: string[];
  paymentPlanCode: "basic" | "pro" | "ultra" | "master";
};

export const HOSTING_STEP_PATH_BY_STEP: Record<HostingStep, string> = {
  kind: "/dashboard/hosting/step-1",
  github: "/dashboard/hosting/step-2",
  repository: "/dashboard/hosting/step-3",
  region: "/dashboard/hosting/step-4",
  plan: "/dashboard/hosting/step-5",
  payment: "/dashboard/hosting/step-6",
  ready: "/dashboard/hosting/step-7",
};

export const HOSTING_STEP_BY_PATH_SEGMENT: Record<string, HostingStep> = {
  "step-1": "kind",
  "step-2": "github",
  "step-3": "repository",
  "step-4": "region",
  "step-5": "plan",
  "step-6": "payment",
  "step-7": "ready",
};

export const DEFAULT_HOSTING_REGION_ID = "us-bos";

export const HOSTING_KIND_OPTIONS: Array<{
  id: HostingKind;
  title: string;
  label: string;
  description: string;
  bullets: string[];
}> = [
  {
    id: "site",
    title: "Site",
    label: "Hospedar site",
    description: "Deploy de sites, landing pages, dashboards e APIs leves puxando direto do GitHub.",
    bullets: ["Build automatico", "Dominios e SSL", "Logs em tempo real"],
  },
  {
    id: "bot",
    title: "Bot",
    label: "Hospedar bot",
    description: "Projetos Node, Python ou workers para Discord, WhatsApp e automacoes em VPS Windows.",
    bullets: ["Processo persistente", "Restart automatico", "Variaveis seguras"],
  },
  {
    id: "minecraft",
    title: "Servidor Minecraft",
    label: "Hospedar Minecraft",
    description: "Servidores Java Edition com versao, loader, mundos, mods e plugins controlados pela Flowdesk.",
    bullets: ["Subdominio gratis", "Backups por mundo", "Console em tempo real"],
  },
];

export const HOSTING_REGIONS: HostingRegion[] = [
  {
    id: DEFAULT_HOSTING_REGION_ID,
    name: "Boston, United States",
    country: "United States",
    city: "Boston",
    pingMs: 42,
    status: "available",
    coordinates: {
      x: 30,
      y: 40,
    },
  },
];

const LEGACY_HOSTING_REGION_ALIASES: Record<string, string> = {
  "br-sp": DEFAULT_HOSTING_REGION_ID,
};

export function resolveHostingRegion(regionId?: string | null) {
  const normalizedId = String(regionId || "").trim();
  const resolvedId = LEGACY_HOSTING_REGION_ALIASES[normalizedId] || normalizedId;
  return (
    HOSTING_REGIONS.find((region) => region.id === resolvedId) ||
    HOSTING_REGIONS.find((region) => region.id === DEFAULT_HOSTING_REGION_ID) ||
    HOSTING_REGIONS[0] ||
    null
  );
}

export const MOCK_GITHUB_REPOSITORIES: HostingRepository[] = [
  {
    id: "repo-flowdesk-site",
    owner: "MuriloFlow",
    name: "flowdesk-site",
    description: "Site institucional com Next.js, painel e rotas de API.",
    language: "TypeScript",
    updatedAt: "Atualizado hoje",
    branch: "main",
    private: true,
  },
  {
    id: "repo-discord-bot",
    owner: "MuriloFlow",
    name: "discord-support-bot",
    description: "Bot de suporte para Discord com filas, tickets e automacoes.",
    language: "JavaScript",
    updatedAt: "Atualizado ontem",
    branch: "main",
    private: true,
  },
  {
    id: "repo-whatsapp-agent",
    owner: "MuriloFlow",
    name: "whatsapp-agent",
    description: "Agente WhatsApp para atendimento, webhooks e respostas automaticas.",
    language: "Python",
    updatedAt: "Atualizado ha 3 dias",
    branch: "production",
    private: false,
  },
  {
    id: "repo-assets-cdn",
    owner: "MuriloFlow",
    name: "brand-assets-cdn",
    description: "Bucket de imagens, icones e arquivos estaticos para produtos.",
    language: "Static",
    updatedAt: "Atualizado ha 6 dias",
    branch: "main",
    private: false,
  },
];

export const HOSTING_PLANS: Record<HostingKind, HostingPlan[]> = {
  site: [
    {
      id: "site-start",
      kind: "site",
      name: "Site Start",
      badge: "Iniciante",
      monthlyAmount: 9.99,
      compareMonthlyAmount: 19.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Para comecar",
      limitedOffer: "O essencial",
      description: "Ideal para sites simples, blogs ou paginas estaticas.",
      specs: ["256 MB RAM", "500 MB SSD NVMe", "1 Site", "SSL Gratuito", "Backup Diario", "Protecao DDoS"],
      paymentPlanCode: "basic",
    },
    {
      id: "site-basic",
      kind: "site",
      name: "Site Basic",
      badge: "Basico",
      monthlyAmount: 14.99,
      compareMonthlyAmount: 29.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Custo/Beneficio",
      limitedOffer: "Mais recursos",
      description: "Para pequenos projetos e portifolios que precisam de folga.",
      specs: ["384 MB RAM", "750 MB SSD NVMe", "2 Sites", "SSL Gratuito", "Backup Diario", "Protecao DDoS"],
      paymentPlanCode: "basic",
    },
    {
      id: "site-plus",
      kind: "site",
      name: "Site Plus",
      badge: "Plus",
      monthlyAmount: 19.99,
      compareMonthlyAmount: 39.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Intermediario",
      limitedOffer: "Multiplos sites",
      description: "Para projetos pequenos crescendo e precisando de mais performance.",
      specs: ["512 MB RAM", "1 GB SSD NVMe", "3 Sites", "SSL Gratuito", "Backup Diario", "Protecao DDoS"],
      paymentPlanCode: "pro",
    },
    {
      id: "site-pro",
      kind: "site",
      name: "Site Pro",
      badge: "Popular",
      recommended: true,
      monthlyAmount: 29.99,
      compareMonthlyAmount: 59.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Para profissionais",
      limitedOffer: "Performance Pro",
      description: "Excelente para SaaS, lojas virtuais e sistemas Web complexos.",
      specs: ["768 MB RAM", "1.5 GB SSD NVMe", "5 Sites", "SSL Gratuito", "Backup Diario", "Protecao DDoS"],
      paymentPlanCode: "pro",
    },
    {
      id: "site-business",
      kind: "site",
      name: "Site Business",
      badge: "Business",
      monthlyAmount: 39.99,
      compareMonthlyAmount: 79.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Para empresas",
      limitedOffer: "Alta performance",
      description: "Para operacoes e negocios rodando multiplos sites ou aplicacoes.",
      specs: ["1 GB RAM", "2 GB SSD NVMe", "10 Sites", "SSL Gratuito", "Backup Diario", "Protecao DDoS"],
      paymentPlanCode: "ultra",
    },
    {
      id: "site-premium",
      kind: "site",
      name: "Site Premium",
      badge: "Premium",
      monthlyAmount: 49.99,
      compareMonthlyAmount: 99.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Poder maximo",
      limitedOffer: "Sem limites",
      description: "Hospedagem robusta para sistemas criticos de alta disponibilidade.",
      specs: ["1.5 GB RAM", "3 GB SSD NVMe", "Sites Ilimitados", "SSL Gratuito", "Backup Diario", "Protecao DDoS"],
      paymentPlanCode: "master",
    },
  ],
  bot: [
    {
      id: "bot-nano",
      kind: "bot",
      name: "Bot Nano",
      badge: "Iniciante",
      monthlyAmount: 9.99,
      compareMonthlyAmount: 19.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Para comecar",
      limitedOffer: "Micro bot",
      description: "O melhor custo-beneficio para bots iniciantes ou em testes.",
      specs: ["128 MB RAM", "250 MB SSD NVMe", "1 Bot", "Reinicio Automatico", "Logs em Tempo Real", "Protecao DDoS"],
      paymentPlanCode: "basic",
    },
    {
      id: "bot-start",
      kind: "bot",
      name: "Bot Start",
      badge: "Start",
      monthlyAmount: 14.99,
      compareMonthlyAmount: 29.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "O basico solido",
      limitedOffer: "Pequenos servers",
      description: "Perfeito para bots com algumas dezenas de servidores ativos.",
      specs: ["256 MB RAM", "500 MB SSD NVMe", "2 Bots", "Reinicio Automatico", "Logs em Tempo Real", "Protecao DDoS"],
      paymentPlanCode: "basic",
    },
    {
      id: "bot-basic",
      kind: "bot",
      name: "Bot Basic",
      badge: "Plus",
      monthlyAmount: 19.99,
      compareMonthlyAmount: 39.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Crescimento",
      limitedOffer: "Comunidades",
      description: "Para bots moderando comunidades grandes ou fazendo automacoes leves.",
      specs: ["384 MB RAM", "750 MB SSD NVMe", "3 Bots", "Reinicio Automatico", "Logs em Tempo Real", "Protecao DDoS"],
      paymentPlanCode: "pro",
    },
    {
      id: "bot-plus",
      kind: "bot",
      name: "Bot Plus",
      badge: "Popular",
      recommended: true,
      monthlyAmount: 29.99,
      compareMonthlyAmount: 59.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Escala real",
      limitedOffer: "Para sistemas",
      description: "O plano favorito dos desenvolvedores Discord e WhatsApp. Suporta banco de dados.",
      specs: ["512 MB RAM", "1 GB SSD NVMe", "5 Bots", "Reinicio Automatico", "Logs em Tempo Real", "Protecao DDoS"],
      paymentPlanCode: "pro",
    },
    {
      id: "bot-pro",
      kind: "bot",
      name: "Bot Pro",
      badge: "Pro",
      monthlyAmount: 39.99,
      compareMonthlyAmount: 79.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Mais poder",
      limitedOffer: "Processo intenso",
      description: "Quando o seu projeto passa da marca de milhares de acessos, esse e o cara.",
      specs: ["768 MB RAM", "1.5 GB SSD NVMe", "10 Bots", "Reinicio Automatico", "Logs em Tempo Real", "Protecao DDoS"],
      paymentPlanCode: "ultra",
    },
    {
      id: "bot-ultra",
      kind: "bot",
      name: "Bot Ultra",
      badge: "Ultra",
      monthlyAmount: 49.99,
      compareMonthlyAmount: 99.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Hardware maximo",
      limitedOffer: "Operacao Mestra",
      description: "Hospedagem definitiva e profissional para quem precisa criar verdadeiras fazendas de bots.",
      specs: ["1 GB RAM", "2 GB SSD NVMe", "15 Bots", "Reinicio Automatico", "Logs em Tempo Real", "Protecao DDoS"],
      paymentPlanCode: "master",
    },
  ],
  minecraft: [
    {
      id: "minecraft-starter",
      kind: "minecraft",
      name: "Minecraft Starter",
      badge: "Inicial",
      monthlyAmount: 19.99,
      compareMonthlyAmount: 39.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Para comecar",
      limitedOffer: "Comunidades pequenas",
      description: "Para servidor inicial com plugins leves, poucos mundos e controle financeiro simples.",
      specs: [
        "1 GB RAM",
        "5 GB SSD NVMe",
        "Ate 10 jogadores",
        "2 mundos",
        "Ate 15 Mods",
        "Ate 15 Plugins",
      ],
      paymentPlanCode: "basic",
    },
    {
      id: "minecraft-basic",
      kind: "minecraft",
      name: "Minecraft Basic",
      badge: "Basico",
      monthlyAmount: 29.99,
      compareMonthlyAmount: 59.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Mais folga",
      limitedOffer: "Survival leve",
      description: "Para survival pequeno com mais armazenamento, backups e limite maior de jogadores.",
      specs: [
        "2 GB RAM",
        "10 GB SSD NVMe",
        "Ate 20 jogadores",
        "3 mundos",
        "Ate 30 Mods",
        "Ate 30 Plugins",
      ],
      paymentPlanCode: "basic",
    },
    {
      id: "minecraft-plus",
      kind: "minecraft",
      name: "Minecraft Plus",
      badge: "Plus",
      monthlyAmount: 39.99,
      compareMonthlyAmount: 79.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Intermediario",
      limitedOffer: "Mods e plugins",
      description: "Para comunidades em crescimento usando loaders, plugins e varios mundos ativos.",
      specs: [
        "3 GB RAM",
        "15 GB SSD NVMe",
        "Ate 35 jogadores",
        "5 mundos",
        "Ate 50 Mods",
        "Ate 50 Plugins",
      ],
      paymentPlanCode: "pro",
    },
    {
      id: "minecraft-pro",
      kind: "minecraft",
      name: "Minecraft Pro",
      badge: "Popular",
      recommended: true,
      monthlyAmount: 54.99,
      compareMonthlyAmount: 109.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Recomendado",
      limitedOffer: "Servidor serio",
      description: "Plano equilibrado para servidores com modpacks, eventos e uso constante.",
      specs: [
        "4 GB RAM",
        "25 GB SSD NVMe",
        "Ate 60 jogadores",
        "8 mundos",
        "Ate 90 Mods",
        "Ate 90 Plugins",
      ],
      paymentPlanCode: "pro",
    },
    {
      id: "minecraft-ultra",
      kind: "minecraft",
      name: "Minecraft Ultra",
      badge: "Ultra",
      monthlyAmount: 69.99,
      compareMonthlyAmount: 139.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Alta carga",
      limitedOffer: "Redes maiores",
      description: "Para servidores maiores com muitos jogadores, mundos separados e backups frequentes.",
      specs: [
        "6 GB RAM",
        "40 GB SSD NVMe",
        "Ate 100 jogadores",
        "15 mundos",
        "Ate 150 Mods",
        "Ate 150 Plugins",
      ],
      paymentPlanCode: "ultra",
    },
    {
      id: "minecraft-master",
      kind: "minecraft",
      name: "Minecraft Master",
      badge: "Master",
      monthlyAmount: 89.99,
      compareMonthlyAmount: 179.99,
      currency: "BRL",
      billingLabel: "/mes",
      cycleBadge: "Ilimitado",
      limitedOffer: "Maximo controle",
      description: "Plano superior para operacoes Minecraft com limites liberados no painel e na API.",
      specs: [
        "8 GB RAM",
        "60 GB SSD NVMe",
        "Jogadores ilimitados",
        "Mundos ilimitados",
        "Mods ilimitados",
        "Plugins ilimitados",
      ],
      paymentPlanCode: "master",
    },
  ],
};

export function getHostingKindLabel(kind: HostingKind) {
  return HOSTING_KIND_OPTIONS.find((option) => option.id === kind)?.title || "Hospedagem";
}
