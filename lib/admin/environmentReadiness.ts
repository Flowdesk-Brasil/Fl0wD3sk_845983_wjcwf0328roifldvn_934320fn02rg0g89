import "server-only";

export type AdminEnvironmentReadinessRow = {
  id: string;
  displayKey: string;
  label: string;
  description: string;
  configured: boolean;
};

type EnvironmentReadinessDefinition = Omit<
  AdminEnvironmentReadinessRow,
  "configured"
> & {
  envKeys: string[];
};

const ENVIRONMENT_READINESS_DEFINITIONS: EnvironmentReadinessDefinition[] = [
  {
    id: "bootstrap-admin",
    envKeys: ["FLOWDESK_BOOTSTRAP_ADMIN_EMAIL"],
    displayKey: "Bootstrap administrativo",
    label: "Bootstrap do primeiro CEO",
    description:
      "Usado apenas para promover com seguranca o primeiro admin institucional.",
  },
  {
    id: "flowsecure-master",
    envKeys: ["FLOWSECURE_MASTER_KEY", "FLOWSECURE_MASTER_SECRET"],
    displayKey: "Criptografia institucional",
    label: "Criptografia principal",
    description:
      "Base usada pelo FlowSecure para proteger segredos, tokens e test variables.",
  },
  {
    id: "canonical-public-host",
    envKeys: ["NEXT_PUBLIC_SITE_URL"],
    displayKey: "Host canonico publico",
    label: "Host canonico publico",
    description:
      "Mantem coerencia de links, callbacks e roteamento cross-subdomain.",
  },
  {
    id: "status-public-host",
    envKeys: ["NEXT_PUBLIC_STATUS_URL"],
    displayKey: "Host publico de status",
    label: "Host do status",
    description:
      "Consumido pelo ecossistema publico e pelo monitoramento institucional.",
  },
];

function hasConfiguredEnv(envKeys: string[]) {
  return envKeys.some((name) => Boolean(process.env[name]));
}

export function getAdminEnvironmentReadiness() {
  return ENVIRONMENT_READINESS_DEFINITIONS.map(
    ({ envKeys, ...definition }) => ({
      ...definition,
      configured: hasConfiguredEnv(envKeys),
    }),
  );
}

export function isBootstrapAdminConfigured() {
  return hasConfiguredEnv(["FLOWDESK_BOOTSTRAP_ADMIN_EMAIL"]);
}

export function isFlowSecureConfigured() {
  return hasConfiguredEnv(["FLOWSECURE_MASTER_KEY", "FLOWSECURE_MASTER_SECRET"]);
}
