"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Cog,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  GitBranch,
  Globe2,
  HardDrive,
  History,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Link2,
  Lock,
  Loader2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Server,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Users,
  UserRound,
  Wifi,
  X,
  ZoomIn,
  ZoomOut,
  Rocket,
} from "lucide-react";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import { SensitiveActionModal } from "@/components/account/SensitiveActionModal";
import { useLiveAccountProfile } from "@/hooks/useLiveAccountProfile";
import { buildDiscordAuthStartHref, buildLoginHref } from "@/lib/auth/paths";
import type {
  VpsFirewallMode,
  VpsMemberRole,
  VpsProjectSettings,
  VpsRuntimeHealth,
} from "@/lib/hosting/vpsSettings";

const LazyVpsMetricsChart = dynamic(
  () => import("@/components/hosting/VpsMetricsChart").then((mod) => mod.VpsMetricsChart),
  {
    ssr: false,
    loading: () => (
      <div className="flowdesk-shimmer h-full w-full rounded-[14px] bg-[#101010]" />
    ),
  },
);

type RuntimeStatus = "online" | "offline" | "starting" | "restarting" | "deploying" | "crashed" | "suspended" | "unknown";
type TabId = "overview" | "metrics" | "console" | "files" | "library" | "installed" | "minecraft" | "domains" | "deploys" | "env" | "settings";
type NotifyTone = "success" | "error" | "info";
type EnvName = "development" | "preview" | "production";

type VpsMetric = {
  id?: number;
  cpu_percent?: number;
  ram_percent?: number;
  disk_percent?: number;
  network_rx_kbps?: number;
  network_tx_kbps?: number;
  process_count?: number;
  uptime_seconds?: number;
  temperature_c?: number | null;
  app_cpu_percent?: number | null;
  app_ram_mb?: number | null;
  sampled_at?: string;
};

type VpsLog = {
  id?: number;
  level?: "debug" | "info" | "warn" | "error" | "success";
  source?: string;
  message?: string;
  metadata?: Record<string, unknown> | null;
  emitted_at?: string;
};

type MinecraftAddon = {
  name: string;
  folder: "mods" | "plugins";
  type: "mod" | "plugin";
  path: string;
  size: number;
  updatedAt: string;
};

type MinecraftLibraryHit = {
  project_id: string;
  slug?: string;
  title: string;
  author?: string;
  description?: string;
  icon_url?: string | null;
  downloads?: number;
  follows?: number;
  date_modified?: string;
  categories?: string[];
  display_categories?: string[];
  versions?: string[];
  project_type?: string;
};

type MinecraftLibraryVersion = {
  id: string;
  name?: string;
  version_number?: string;
  date_published?: string;
  changelog?: string;
  loaders?: string[];
  game_versions?: string[];
  files?: Array<{ url?: string; filename?: string; size?: number; primary?: boolean }>;
};

type MinecraftLibraryDetail = {
  project?: {
    id?: string;
    slug?: string;
    title?: string;
    description?: string;
    body?: string;
    icon_url?: string | null;
    downloads?: number;
    followers?: number;
    categories?: string[];
    gallery?: Array<string | { url?: string; raw_url?: string; title?: string; description?: string; created?: string }>;
    featured_gallery?: string | { url?: string; raw_url?: string; title?: string; description?: string; created?: string } | null;
    license?: { id?: string; name?: string };
    client_side?: string;
    server_side?: string;
    source_url?: string;
    issues_url?: string;
    wiki_url?: string;
    discord_url?: string;
  };
  versions?: MinecraftLibraryVersion[];
  latestVersion?: MinecraftLibraryVersion | null;
};

type VpsDeployment = {
  id: number;
  environment: string;
  status: string;
  branch: string;
  commit_sha?: string | null;
  commit_author?: string | null;
  commit_message?: string | null;
  created_at?: string;
  deployed_at?: string | null;
  duration_ms?: number | null;
  logs?: unknown;
  metadata?: Record<string, unknown> | null;
};

type VpsEnvVar = {
  id: number;
  environment: EnvName;
  key: string;
  value_preview?: string | null;
  visible_value?: string | null;
  note?: string | null;
  sensitive?: boolean | null;
  version?: number;
  updated_at?: string;
};

type EnvDraftRow = {
  id: string;
  key: string;
  value: string;
  note: string;
  sensitive: boolean;
  showValue: boolean;
};

type TextSecurityStyle = CSSProperties & {
  WebkitTextSecurity?: "none" | "disc";
};

type VpsFileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  language?: string | null;
  children?: VpsFileNode[];
};

type FileContextMenuState =
  | {
    kind: "node";
    x: number;
    y: number;
    node: VpsFileNode;
  }
  | {
    kind: "preview";
    x: number;
    y: number;
    node: VpsFileNode;
  }
  | {
    kind: "empty";
    x: number;
    y: number;
    parentPath: string;
  }
  | null;

type FileContextMenuInput =
  | { kind: "node"; node: VpsFileNode }
  | { kind: "preview"; node: VpsFileNode }
  | { kind: "empty"; parentPath: string };

type FileInlineDraft = {
  parentPath: string;
  type: "file" | "directory";
  value: string;
} | null;

type DomainDrawerMode = "add" | "edit";

type LoadedVpsFile = {
  name?: string | null;
  path?: string | null;
  sha?: string | null;
  encoding?: string | null;
  content?: string;
  contentBase64?: string | null;
  size?: number | null;
  downloadUrl?: string | null;
  htmlUrl?: string | null;
};

type FlowChatMessage = {
  id: string | number;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  model?: string | null;
};

type FlowChatAttachment = {
  id: string;
  name: string;
  type: string;
};

type FlowChatSession = {
  id: number;
  title: string;
  model?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type FlowChatQuota = {
  used: number;
  limit: number;
  requestCount: number;
  requestLimit: number;
  remaining: number;
  resetAt: string;
  blockedUntil: string | null;
  blocked: boolean;
};

export type VpsWorkspaceSnapshot = {
  account: {
    authUserId: number;
    discordUserId: string | null;
    displayName: string;
    username: string;
    avatarUrl: string | null;
  };
  project: {
    vpsCode: string;
    status: string;
    runtimeStatus: RuntimeStatus;
    runtimeLastSeenAt?: string | null;
    kind: "site" | "bot" | "minecraft";
    kindLabel: string;
    planName: string;
    planPrice: string;
    planSpecs: string[];
    regionLabel: string;
    runtimeHealth?: VpsRuntimeHealth;
    runtime: string;
    repository: {
      fullName: string;
      name: string;
      branch: string;
      language?: string | null;
      private?: boolean | null;
      description?: string | null;
      htmlUrl: string;
      connected?: boolean;
    };
    paymentLabel: string;
    paymentAmount: string;
    paidAtLabel: string;
    githubConnected?: boolean;
    minecraft?: {
      serverName: string;
      version: string;
      serverType: string;
      primaryDomain: string;
      fixedDomain?: string | null;
      worlds: string[];
      limits: Record<string, unknown>;
    } | null;
  };
  metrics: VpsMetric[];
  logs: VpsLog[];
  deployments: VpsDeployment[];
  envVars: VpsEnvVar[];
  actions: Array<Record<string, unknown>>;
  fileTree: VpsFileNode[];
  settings: VpsProjectSettings;
};

type VpsWorkspaceProps = {
  initialSnapshot: VpsWorkspaceSnapshot;
};

type SavedPanelAccount = VpsWorkspaceSnapshot["account"] & {
  lastSeenAt: number;
};

const ENV_OPTIONS = [
  { value: "production", label: "Production" },
  { value: "preview", label: "Preview" },
  { value: "development", label: "Development" },
] as const;

const LOG_OPTIONS = [
  { value: "all", label: "Todos os logs" },
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
  { value: "success", label: "Success" },
] as const;

const CONSOLE_STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "2xx", label: "2xx" },
  { value: "3xx", label: "3xx" },
  { value: "4xx", label: "4xx" },
  { value: "5xx", label: "5xx" },
  { value: "other", label: "Outros" },
] as const;

const vpsSidebarShellClass =
  "relative overflow-hidden border border-[#0E0E0E] bg-[#050505] shadow-[0_24px_80px_rgba(0,0,0,0.42)]";
const SAVED_PANEL_ACCOUNTS_KEY = "flowdesk_saved_panel_accounts_v1";
const OFFICIAL_DISCORD_INVITE_URL = "https://discord.gg/flowdesk";
const FILE_EDITOR_LINE_HEIGHT = 22.1;
const FILE_EDITOR_OVERSCAN_LINES = 48;
const METRICS_WINDOW_HOURS = 24;

function accountInitial(name: string, username: string) {
  const base = name || username || "F";
  return base.trim().charAt(0).toUpperCase() || "F";
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function SidebarSearchShortcutIcon() {
  return (
    <span className="inline-flex h-[28px] min-w-[28px] items-center justify-center rounded-[9px] border border-[#1A1A1A] bg-[#101010] px-[8px] text-[12px] font-medium text-[#A7A7A7]">
      F
    </span>
  );
}

function resolveSavedAccountKey(account: {
  authUserId: number;
  discordUserId: string | null;
}) {
  return account.discordUserId || `auth:${account.authUserId}`;
}

function normalizeSavedPanelAccounts(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Partial<SavedPanelAccount>;
      if (
        typeof record.authUserId !== "number" ||
        typeof record.displayName !== "string" ||
        typeof record.username !== "string" ||
        typeof record.lastSeenAt !== "number"
      ) {
        return null;
      }

      return {
        authUserId: record.authUserId,
        discordUserId: typeof record.discordUserId === "string" ? record.discordUserId : null,
        displayName: record.displayName,
        username: record.username,
        avatarUrl: typeof record.avatarUrl === "string" ? record.avatarUrl : null,
        lastSeenAt: record.lastSeenAt,
      } satisfies SavedPanelAccount;
    })
    .filter((value): value is SavedPanelAccount => value !== null)
    .slice(0, 3);
}

function mergeSavedPanelAccounts(
  currentAccount: SavedPanelAccount,
  previousAccounts: SavedPanelAccount[],
) {
  const currentAccountKey = resolveSavedAccountKey(currentAccount);
  return [
    currentAccount,
    ...previousAccounts.filter((account) => resolveSavedAccountKey(account) !== currentAccountKey),
  ]
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, 3);
}

function AccountAvatar({
  avatarUrl,
  displayName,
  username,
  className = "h-[36px] w-[36px]",
}: {
  avatarUrl: string | null;
  displayName: string;
  username: string;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Remote auth avatars are already sized and may not be configured in next/image domains.
      <img
        src={avatarUrl}
        alt=""
        className={`${className} rounded-full border border-[#1C1C1C] bg-[#111111] object-cover`}
      />
    );
  }

  return (
    <span className={`${className} inline-flex items-center justify-center rounded-full border border-[#1C1C1C] bg-[#111111] text-[13px] font-semibold text-[#DADADA]`}>
      {accountInitial(displayName, username)}
    </span>
  );
}

function languageFromFilePath(path: string) {
  const baseName = path.split("/").pop()?.toLowerCase() || "";
  const extension = baseName.includes(".") ? baseName.split(".").pop()?.toLowerCase() || "" : baseName;
  const exactLanguages: Record<string, string> = {
    dockerfile: "docker",
    makefile: "makefile",
    "package.json": "node",
    "package-lock.json": "node",
    "pnpm-lock.yaml": "node",
    "yarn.lock": "node",
    "bun.lockb": "node",
    "tsconfig.json": "typescript",
    "jsconfig.json": "javascript",
    "next.config.js": "javascript",
    "next.config.mjs": "javascript",
    "next.config.ts": "typescript",
    "vite.config.js": "javascript",
    "vite.config.ts": "typescript",
    "tailwind.config.js": "javascript",
    "tailwind.config.ts": "typescript",
  };
  if (exactLanguages[baseName]) return exactLanguages[baseName];

  const languages: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    mts: "typescript",
    cts: "typescript",
    tsx: "typescript",
    json: "json",
    jsonc: "json",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "css",
    html: "html",
    htm: "html",
    md: "markdown",
    mdx: "markdown",
    yml: "yaml",
    yaml: "yaml",
    py: "python",
    pyw: "python",
    rb: "ruby",
    php: "php",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    swift: "swift",
    go: "go",
    rs: "rust",
    c: "c",
    h: "c",
    cc: "cpp",
    cpp: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    dart: "dart",
    lua: "lua",
    r: "r",
    scala: "scala",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "powershell",
    bat: "batch",
    cmd: "batch",
    cbl: "cobol",
    cob: "cobol",
    cpy: "cobol",
    sql: "sql",
    prisma: "prisma",
    graphql: "graphql",
    gql: "graphql",
    env: "dotenv",
    xml: "xml",
    svg: "svg",
    toml: "toml",
    ini: "ini",
    lock: "lockfile",
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    webp: "image",
    ico: "image",
    avif: "image",
    woff: "font",
    woff2: "font",
    ttf: "font",
    otf: "font",
    zip: "archive",
    jar: "archive",
    rar: "archive",
    "7z": "archive",
    gz: "archive",
  };
  return languages[extension] || null;
}

function BracesIcon({ className = "" }: { className?: string }) {
  return <span className={`font-mono text-[13px] font-bold leading-none ${className}`}>{"{}"}</span>;
}

function FileTextIcon({ className = "" }: { className?: string }) {
  return <span className={`font-mono text-[12px] font-bold leading-none ${className}`}>MD</span>;
}

function LanguageBadgeIcon({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-[3px] font-mono text-[8px] font-black leading-none ${className}`}>
      {label}
    </span>
  );
}

function makeLanguageBadge(label: string) {
  return function GeneratedLanguageBadge({ className = "" }: { className?: string }) {
    return <LanguageBadgeIcon label={label} className={className} />;
  };
}

function fileIconStyle(node: VpsFileNode) {
  if (node.type === "directory") {
    return { Icon: Folder, className: "text-[#9BC2FF]" };
  }

  const language = (node.language || languageFromFilePath(node.path) || "").toLowerCase();
  const baseName = node.path.split("/").pop()?.toLowerCase() || "";
  const extension = baseName.includes(".") ? baseName.split(".").pop()?.toLowerCase() || "" : baseName;
  const badgeIcons: Record<string, { label: string; className: string }> = {
    javascript: { label: "JS", className: "text-[#F5D76E]" },
    typescript: { label: "TS", className: "text-[#62B3FF]" },
    node: { label: "N", className: "text-[#9BE7AC]" },
    python: { label: "PY", className: "text-[#8AB6FF]" },
    ruby: { label: "RB", className: "text-[#FF8EAA]" },
    php: { label: "PHP", className: "text-[#B997FF]" },
    java: { label: "JAVA", className: "text-[#FFB86B]" },
    kotlin: { label: "KT", className: "text-[#C792EA]" },
    swift: { label: "SW", className: "text-[#FF9B73]" },
    go: { label: "GO", className: "text-[#7DD3FC]" },
    rust: { label: "RS", className: "text-[#FFB86B]" },
    c: { label: "C", className: "text-[#A8D1FF]" },
    cpp: { label: "C++", className: "text-[#8AB6FF]" },
    csharp: { label: "C#", className: "text-[#B997FF]" },
    dart: { label: "D", className: "text-[#69C6FF]" },
    lua: { label: "LUA", className: "text-[#9BC2FF]" },
    r: { label: "R", className: "text-[#8AB6FF]" },
    scala: { label: "SC", className: "text-[#FF8E8E]" },
    shell: { label: "SH", className: "text-[#9BE7AC]" },
    powershell: { label: "PS", className: "text-[#62B3FF]" },
    batch: { label: "BAT", className: "text-[#CFCFCF]" },
    cobol: { label: "COB", className: "text-[#D7BA7D]" },
    docker: { label: "DK", className: "text-[#69C6FF]" },
    makefile: { label: "MK", className: "text-[#CFCFCF]" },
    prisma: { label: "PR", className: "text-[#9BC2FF]" },
    graphql: { label: "GQL", className: "text-[#FF8EAA]" },
    svg: { label: "SVG", className: "text-[#FFB86B]" },
    toml: { label: "TOML", className: "text-[#D7BA7D]" },
    ini: { label: "INI", className: "text-[#CFCFCF]" },
    lockfile: { label: "LOCK", className: "text-[#A0A0A0]" },
    image: { label: "IMG", className: "text-[#9BE7AC]" },
    font: { label: "FONT", className: "text-[#DADADA]" },
    archive: { label: "ZIP", className: "text-[#D7BA7D]" },
  };
  if (badgeIcons[language]) {
    const badge = badgeIcons[language];
    return { Icon: makeLanguageBadge(badge.label), className: badge.className };
  }
  if (language === "json") return { Icon: BracesIcon, className: "text-[#F2C66D]" };
  if (language === "css" || language === "scss") return { Icon: Globe2, className: "text-[#8AB6FF]" };
  if (language === "html" || language === "xml") return { Icon: Globe2, className: "text-[#FF9B73]" };
  if (language === "sql") return { Icon: Database, className: "text-[#B997FF]" };
  if (language === "dotenv" || extension === "env") return { Icon: KeyRound, className: "text-[#9BE7AC]" };
  if (language === "markdown" || extension === "md") return { Icon: FileTextIcon, className: "text-[#DADADA]" };
  if (language === "yaml" || extension === "yml" || extension === "yaml") return { Icon: Layers, className: "text-[#A8D1FF]" };
  return { Icon: File, className: "text-[#8E8E8E]" };
}

function resolveHighlightLanguage(file: VpsFileNode | null) {
  if (!file) return "text";
  return (file.language || languageFromFilePath(file.path) || "text").toLowerCase();
}

function fileExtensionFromPath(path: string) {
  const baseName = path.split("/").pop()?.toLowerCase() || "";
  return baseName.includes(".") ? baseName.split(".").pop()?.toLowerCase() || "" : "";
}

const RASTER_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "bmp",
  "apng",
]);

function isSvgFile(file: VpsFileNode | null) {
  if (!file || file.type !== "file") return false;
  return resolveHighlightLanguage(file) === "svg" || fileExtensionFromPath(file.path) === "svg";
}

function isRasterImageFile(file: VpsFileNode | null) {
  if (!file || file.type !== "file") return false;
  const language = resolveHighlightLanguage(file);
  return language === "image" || RASTER_IMAGE_EXTENSIONS.has(fileExtensionFromPath(file.path));
}

function isPreviewableImageFile(file: VpsFileNode | null) {
  return isSvgFile(file) || isRasterImageFile(file);
}

function isJarFile(file: VpsFileNode | null) {
  return Boolean(file && file.type === "file" && fileExtensionFromPath(file.path) === "jar");
}

function buildVpsFileRawPath(vpsCode: string, path: string) {
  return `/api/auth/me/hosting/vps/${encodeURIComponent(vpsCode)}/files?path=${encodeURIComponent(path)}&raw=1`;
}

function buildSvgDataUrl(content: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
}

function clampImageZoom(value: number) {
  return Math.min(4, Math.max(0.25, Number(value.toFixed(2))));
}

const CODE_KEYWORDS: Record<string, Set<string>> = {
  javascript: new Set(["const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case", "break", "continue", "import", "from", "export", "default", "async", "await", "try", "catch", "finally", "throw", "new", "class", "extends", "typeof", "instanceof", "true", "false", "null", "undefined"]),
  typescript: new Set(["const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case", "break", "continue", "import", "from", "export", "default", "async", "await", "try", "catch", "finally", "throw", "new", "class", "extends", "typeof", "instanceof", "true", "false", "null", "undefined", "type", "interface", "enum", "implements", "private", "public", "protected", "readonly", "as", "keyof"]),
  python: new Set(["def", "return", "if", "elif", "else", "for", "while", "in", "import", "from", "as", "class", "try", "except", "finally", "raise", "with", "lambda", "True", "False", "None", "async", "await"]),
  sql: new Set(["select", "from", "where", "join", "left", "right", "inner", "outer", "insert", "into", "update", "delete", "create", "alter", "drop", "table", "index", "view", "function", "trigger", "begin", "commit", "rollback", "values", "set", "and", "or", "not", "null", "primary", "key", "foreign", "references", "constraint", "check", "default"]),
};

function highlightGenericCode(line: string, language: string) {
  const keywords = CODE_KEYWORDS[language] || CODE_KEYWORDS.javascript;
  const parts = line.match(/(\/\/.*|--.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|[{}()[\].,;:+*/%<>=!?&|-]|\s+|.)/g) || [line];
  return parts.map((part, index) => {
    let className = "text-[#DADADA]";
    if (/^(\/\/|--|#)/.test(part)) className = "text-[#6A9955]";
    else if (/^["'`]/.test(part)) className = "text-[#CE9178]";
    else if (/^\d/.test(part)) className = "text-[#B5CEA8]";
    else if (keywords.has(part) || keywords.has(part.toLowerCase())) className = "text-[#569CD6]";
    else if (/^[{}()[\]]+$/.test(part)) className = "text-[#FFD700]";
    return <span key={index} className={className}>{part}</span>;
  });
}

function highlightJson(line: string) {
  const parts = line.match(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|true|false|null|-?\b\d+(?:\.\d+)?\b|[{}[\],:]|\s+|.)/g) || [line];
  return parts.map((part, index) => {
    let className = "text-[#DADADA]";
    if (/^".*"\s*:$/.test(part)) className = "text-[#9CDCFE]";
    else if (/^"/.test(part)) className = "text-[#CE9178]";
    else if (/^(true|false|null)$/.test(part)) className = "text-[#569CD6]";
    else if (/^-?\d/.test(part)) className = "text-[#B5CEA8]";
    else if (/^[{}[\]]+$/.test(part)) className = "text-[#FFD700]";
    return <span key={index} className={className}>{part}</span>;
  });
}

function highlightMarkup(line: string) {
  const parts = line.match(/(<!--.*?-->|<\/?[A-Za-z][^>\s/]*|\/?>|[A-Za-z_:][-A-Za-z0-9_:.]*(?==)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\s+|.)/g) || [line];
  return parts.map((part, index) => {
    let className = "text-[#DADADA]";
    if (part.startsWith("<!--")) className = "text-[#6A9955]";
    else if (/^<\/?/.test(part) || part === ">" || part === "/>") className = "text-[#569CD6]";
    else if (/^[A-Za-z_:][-A-Za-z0-9_:.]*(?==)/.test(part)) className = "text-[#9CDCFE]";
    else if (/^["']/.test(part)) className = "text-[#CE9178]";
    return <span key={index} className={className}>{part}</span>;
  });
}

function highlightCss(line: string) {
  const parts = line.match(/(\/\*.*?\*\/|#[0-9a-fA-F]{3,8}\b|--[-A-Za-z0-9_]+|[-A-Za-z_][-\w]*(?=\s*:)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b|[{}():;,]|\s+|.)/g) || [line];
  return parts.map((part, index) => {
    let className = "text-[#DADADA]";
    if (part.startsWith("/*")) className = "text-[#6A9955]";
    else if (/^#[0-9a-fA-F]/.test(part)) className = "text-[#B5CEA8]";
    else if (/^--/.test(part) || /^[-A-Za-z_][-\w]*(?=\s*:)/.test(part)) className = "text-[#9CDCFE]";
    else if (/^["']/.test(part)) className = "text-[#CE9178]";
    else if (/^\d/.test(part)) className = "text-[#B5CEA8]";
    return <span key={index} className={className}>{part}</span>;
  });
}

function highlightEnv(line: string) {
  const match = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
  if (!match) return highlightGenericCode(line, "javascript");
  return [
    <span key="prefix" className="text-[#569CD6]">{match[1]}</span>,
    <span key="key" className="text-[#9CDCFE]">{match[2]}</span>,
    <span key="eq" className="text-[#D4D4D4]">{match[3]}</span>,
    <span key="value" className="text-[#CE9178]">{match[4]}</span>,
  ];
}

function renderHighlightedLine(line: string, language: string) {
  if (language === "json") return highlightJson(line);
  if (language === "html" || language === "xml") return highlightMarkup(line);
  if (language === "css" || language === "scss") return highlightCss(line);
  if (language === "dotenv") return highlightEnv(line);
  if (language === "markdown") return <span className={line.startsWith("#") ? "text-[#569CD6]" : "text-[#DADADA]"}>{line}</span>;
  return highlightGenericCode(line, language);
}

function joinFilePath(parentPath: string, name: string) {
  const cleanParent = parentPath.replace(/^\/+|\/+$/g, "");
  const cleanName = name.replace(/^\/+|\/+$/g, "");
  return cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
}

function parentFilePath(path: string) {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function fileNameFromPath(path: string) {
  return path.split("/").filter(Boolean).pop() || path;
}

function sortFileTree(nodes: VpsFileNode[]) {
  return [...nodes].sort((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function updateFileTree(
  nodes: VpsFileNode[],
  updater: (nodes: VpsFileNode[]) => VpsFileNode[],
) {
  return sortFileTree(updater(nodes));
}

function addNodeToTree(nodes: VpsFileNode[], parentPath: string, node: VpsFileNode): VpsFileNode[] {
  if (!parentPath) {
    if (nodes.some((item) => item.path === node.path)) return nodes;
    return sortFileTree([...nodes, node]);
  }

  return nodes.map((item) => {
    if (item.path === parentPath && item.type === "directory") {
      const children = item.children || [];
      if (children.some((child) => child.path === node.path)) return item;
      return { ...item, children: sortFileTree([...children, node]) };
    }
    if (item.children?.length) return { ...item, children: addNodeToTree(item.children, parentPath, node) };
    return item;
  });
}

function removeNodeFromTree(nodes: VpsFileNode[], path: string): VpsFileNode[] {
  return nodes
    .filter((item) => item.path !== path)
    .map((item) => item.children?.length ? { ...item, children: removeNodeFromTree(item.children, path) } : item);
}

function findNodeInTree(nodes: VpsFileNode[], path: string): VpsFileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children?.length) {
      const found = findNodeInTree(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function rebaseNodePath(node: VpsFileNode, targetPath: string): VpsFileNode {
  const oldPath = node.path;
  const rebaseChild = (child: VpsFileNode): VpsFileNode => {
    const nextPath = child.path === oldPath ? targetPath : child.path.replace(`${oldPath}/`, `${targetPath}/`);
    return {
      ...child,
      path: nextPath,
      children: child.children?.map(rebaseChild),
    };
  };
  return rebaseChild({ ...node, name: fileNameFromPath(targetPath), path: targetPath });
}

function renameNodeInTree(nodes: VpsFileNode[], path: string, targetPath: string): VpsFileNode[] {
  const node = findNodeInTree(nodes, path);
  if (!node) return nodes;
  const parentPath = parentFilePath(targetPath);
  const withoutNode = removeNodeFromTree(nodes, path);
  return addNodeToTree(withoutNode, parentPath, rebaseNodePath(node, targetPath));
}

function moveNodeInTree(nodes: VpsFileNode[], path: string, targetParentPath: string): VpsFileNode[] {
  const node = findNodeInTree(nodes, path);
  if (!node) return nodes;
  const targetPath = joinFilePath(targetParentPath, node.name);
  if (targetPath === path || targetPath.startsWith(`${path}/`)) return nodes;
  return renameNodeInTree(nodes, path, targetPath);
}

function flattenFileTreePaths(nodes: VpsFileNode[]) {
  const output: string[] = [];
  const visit = (node: VpsFileNode) => {
    output.push(node.path);
    (node.children || []).forEach(visit);
  };
  nodes.forEach(visit);
  return output;
}

const TAB_ROUTE_SEGMENTS: Record<TabId, string> = {
  overview: "overview",
  metrics: "metrics",
  console: "console",
  files: "files",
  library: "library",
  installed: "installed",
  minecraft: "minecraft",
  domains: "domains",
  deploys: "deployments",
  env: "environment-variables",
  settings: "settings",
};

const TAB_FROM_ROUTE_SEGMENT: Record<string, TabId> = {
  overview: "overview",
  metrics: "metrics",
  metricas: "metrics",
  console: "console",
  files: "files",
  arquivos: "files",
  library: "library",
  biblioteca: "library",
  installed: "installed",
  instalados: "installed",
  minecraft: "minecraft",
  domains: "domains",
  dominios: "domains",
  deployments: "deploys",
  deploys: "deploys",
  "environment-variables": "env",
  env: "env",
  variables: "env",
  settings: "settings",
  config: "settings",
};
const GITHUB_HANDOFF_STORAGE_KEY = "flowdesk_hosting_github_handoff_v1";

function resolveTabFromPathname(pathname: string | null): TabId {
  const segment = pathname?.split("/").filter(Boolean).at(-1)?.toLowerCase() || "";
  return TAB_FROM_ROUTE_SEGMENT[segment] || "overview";
}

function buildVpsTabPath(vpsCode: string, tabId: TabId) {
  return `/vps/${vpsCode}/${TAB_ROUTE_SEGMENTS[tabId]}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Pendente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pendente";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatRelative(value?: string | null) {
  if (!value) return "Updated just now";
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `Updated ${Math.max(1, seconds)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

function formatFileSize(bytes?: number | null) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function formatCount(value?: number | null) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("pt-BR", { notation: number >= 10000 ? "compact" : "standard" }).format(number);
}

function renderTextBlocks(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return ["Sem conteudo publicado."];
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block) => block.replace(/[#*_>`-]+/g, "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

function libraryGalleryItems(project?: MinecraftLibraryDetail["project"]) {
  const raw = [
    project?.featured_gallery,
    ...(project?.gallery || []),
  ].filter(Boolean);
  const seen = new Set<string>();
  return raw.flatMap((item) => {
    const gallery = typeof item === "string" ? { url: item, title: "Gallery" } : item || {};
    const url = gallery.raw_url || gallery.url || "";
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{
      url,
      title: gallery.title || "Gallery",
      description: gallery.description || "",
      created: gallery.created || "",
    }];
  });
}

function libraryProjectLinks(project?: MinecraftLibraryDetail["project"]) {
  return [
    ["Modrinth", project?.slug ? `https://modrinth.com/project/${project.slug}` : ""],
    ["Codigo fonte", project?.source_url || ""],
    ["Wiki", project?.wiki_url || ""],
    ["Issues", project?.issues_url || ""],
    ["Discord", project?.discord_url || ""],
  ].filter(([, href]) => href);
}

function minecraftDomainLabel(hostname?: string | null) {
  const host = String(hostname || "").trim().toLowerCase();
  const suffix = ".mine.flwdesk.com";
  return host.endsWith(suffix) ? host.slice(0, -suffix.length) : host;
}

function minecraftDomainInputValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.mine\.flwdesk\.com$/, "");
}

function formatUptime(seconds?: number) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function statusClasses(status: RuntimeStatus) {
  if (status === "online") return "border-[rgba(52,168,83,0.35)] bg-[rgba(52,168,83,0.12)] text-[#9BE7AC]";
  if (status === "starting" || status === "restarting" || status === "deploying") return "border-[rgba(15,98,254,0.35)] bg-[rgba(15,98,254,0.12)] text-[#9BC2FF]";
  if (status === "crashed") return "border-[rgba(255,82,82,0.35)] bg-[rgba(255,82,82,0.12)] text-[#FF9B9B]";
  if (status === "suspended") return "border-[rgba(255,190,80,0.35)] bg-[rgba(255,190,80,0.12)] text-[#FFD28A]";
  return "border-[#242424] bg-[#101010] text-[#9B9B9B]";
}

function statusLabel(status: RuntimeStatus) {
  const labels: Record<RuntimeStatus, string> = {
    online: "Online",
    offline: "Offline",
    starting: "Iniciando",
    restarting: "Reiniciando",
    deploying: "Deployando",
    crashed: "Crash/Error",
    suspended: "Suspensa",
    unknown: "Desconhecido",
  };
  return labels[status] || "Desconhecido";
}

function deploymentEnvironmentLabel(environment: string) {
  const normalized = environment.toLowerCase();
  if (normalized === "production") return "Production";
  if (normalized === "preview") return "Preview";
  if (normalized === "development") return "Development";
  return environment || "Environment";
}

function deploymentShortSha(value?: string | null) {
  return value ? value.slice(0, 7) : "pending";
}

function deploymentMetadataString(deploy: VpsDeployment, key: string) {
  const value = deploy.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deploymentAuthorInitials(value?: string | null) {
  const source = value?.trim() || "FD";
  return source
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase())
    .join("") || "FD";
}

function deploymentDurationLabel(deploy: VpsDeployment) {
  if (typeof deploy.duration_ms === "number" && Number.isFinite(deploy.duration_ms)) {
    const seconds = Math.max(1, Math.round(deploy.duration_ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  const started = deploy.created_at ? Date.parse(deploy.created_at) : Number.NaN;
  const finished = deploy.deployed_at ? Date.parse(deploy.deployed_at) : Number.NaN;
  if (Number.isFinite(started) && Number.isFinite(finished) && finished >= started) {
    const seconds = Math.max(1, Math.round((finished - started) / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return "1m 20s";
}

function deploymentStatusFamily(status: string) {
  const normalized = status.toLowerCase();
  if (["production", "preview", "ready"].includes(normalized)) return "ready";
  if (["failed", "cancelled"].includes(normalized)) return "failed";
  if (["pending", "queued", "building", "preparing", "deploying"].includes(normalized)) return "building";
  return "other";
}

function deploymentPrimaryBadge(deploy: VpsDeployment) {
  const family = deploymentStatusFamily(deploy.status);
  if (family === "failed") return { label: "Failed", className: "border-[rgba(255,82,82,0.32)] bg-[rgba(255,82,82,0.1)] text-[#FF9B9B]" };
  if (family === "building") return { label: "Pending", className: "border-[rgba(15,98,254,0.32)] bg-[rgba(15,98,254,0.1)] text-[#9BC2FF]" };
  return { label: "Ready", className: "border-[rgba(52,168,83,0.32)] bg-[rgba(52,168,83,0.1)] text-[#9BE7AC]" };
}

function deploymentEnvironmentBadges(deploy: VpsDeployment, productionBranch: string, isActiveProduction: boolean) {
  const pullRequestUrl = deploymentMetadataString(deploy, "pullRequestUrl");
  const isProduction = deploy.environment === "production" && deploy.branch === productionBranch && !pullRequestUrl;
  const badges = [
    {
      label: isProduction ? "Production" : deploy.environment === "development" ? "Development" : "Preview",
      className: isProduction
        ? isActiveProduction
          ? "border-[rgba(15,98,254,0.36)] bg-[#0F62FE] text-white"
          : "border-[#2A2A2A] bg-[#060606] text-[#808080]"
        : "border-[#2A2A2A] bg-[#060606] text-[#DADADA]",
    },
  ];

  if (pullRequestUrl || deploy.environment === "preview" || deploy.branch !== productionBranch) {
    badges.push({
      label: "Sandbox",
      className: "border-[rgba(255,190,80,0.36)] bg-[rgba(255,190,80,0.1)] text-[#FFD28A]",
    });
  }

  if (deploymentStatusFamily(deploy.status) === "building") {
    badges.push({
      label: "Pending",
      className: "border-[rgba(155,194,255,0.34)] bg-[rgba(155,194,255,0.1)] text-[#9BC2FF]",
    });
  }

  return badges;
}

function metricValue(metric: VpsMetric | null, key: keyof VpsMetric) {
  const value = metric?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatMetricTime(value?: string | null, options?: { seconds?: boolean }) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(options?.seconds ? { second: "2-digit" as const } : {}),
  }).format(date);
}

function formatMetricNumber(value: number, suffix: string) {
  const digits = suffix === "" ? 0 : value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)}${suffix}`;
}

function formatMetricsWindowLabel(metrics: VpsMetric[]) {
  const now = Date.now();
  const start = new Date(now - (METRICS_WINDOW_HOURS - 1) * 60 * 60 * 1000);
  return `${formatMetricTime(start.toISOString())} - ${formatMetricTime(new Date(now).toISOString())}`;
}

function metricAverage(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function metricTrend(values: number[]) {
  if (values.length < 2) return 0;
  const first = values[0] || 0;
  const last = values[values.length - 1] || 0;
  return last - first;
}

function healthStatusLabel(health?: VpsRuntimeHealth) {
  if (!health) return "Catalogo";
  if (health.agentConnected) return "Agente online";
  if (health.checkedAt) return "Ultimo status salvo";
  return "Catalogo";
}

function createDraftRow(overrides: Partial<EnvDraftRow> = {}): EnvDraftRow {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    key: "",
    value: "",
    note: "",
    sensitive: true,
    showValue: false,
    ...overrides,
  };
}

function createClientId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildFlowChatFallback(input: {
  fileTreeLoaded: boolean;
}) {
  return [
    "Estou com acesso ao contexto do projeto para orientar voce com seguranca.",
    input.fileTreeLoaded
      ? "Cite o nome ou caminho do arquivo no chat e eu tento localizar pelo Explorer/GitHub para sugerir trechos copiaveis."
      : "A lista de arquivos ainda nao carregou; cite o caminho do arquivo para eu orientar melhor.",
    "A IA principal nao respondeu agora, entao mantive uma resposta local e segura.",
  ].join("\n\n");
}

function createInitialFlowQuota(): FlowChatQuota {
  return {
    used: 0,
    limit: 20_000,
    requestCount: 0,
    requestLimit: 35,
    remaining: 20_000,
    resetAt: "",
    blockedUntil: null,
    blocked: false,
  };
}

function normalizeFlowQuota(input: Partial<FlowChatQuota> | null | undefined): FlowChatQuota {
  const limit = Math.max(1, Number(input?.limit || 20_000));
  const used = Math.max(0, Math.min(limit, Number(input?.used || 0)));
  const requestLimit = Math.max(1, Number(input?.requestLimit || 35));
  const requestCount = Math.max(0, Number(input?.requestCount || 0));
  const blockedUntil = typeof input?.blockedUntil === "string" ? input.blockedUntil : null;
  return {
    used,
    limit,
    requestCount,
    requestLimit,
    remaining: Math.max(0, limit - used),
    resetAt: typeof input?.resetAt === "string" ? input.resetAt : "",
    blockedUntil,
    blocked: Boolean(input?.blocked || blockedUntil || used >= limit || requestCount >= requestLimit),
  };
}

function secureTextStyle(visible: boolean): TextSecurityStyle {
  return {
    WebkitTextSecurity: visible ? "none" : "disc",
  };
}

function parseDotEnv(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) return null;
      let value = match[2] || "";
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return createDraftRow({ key: match[1], value });
    })
    .filter((item): item is EnvDraftRow => Boolean(item));
}

function logFingerprint(log: VpsLog, fallbackIndex = 0) {
  // Ignoramos log.id porque a API do daemon gera pseudo-ids (índices), e a lista desliza.
  const coreStr = `${log.level || ""}:${log.source || ""}:${log.message || ""}`;
  let hash = 0;
  for (let i = 0; i < coreStr.length; i++) hash = Math.imul(31, hash) + coreStr.charCodeAt(i) | 0;

  // Para evitar que a exata mesma mensagem repetida de verdade e válida seja comida se já passou de 1 ocorrência
  // Nós adicionamos o emit_at ou fallbackIndex apenas se a mensagem for curtinha
  if (coreStr.length < 5) {
    return `log:${hash}:${log.emitted_at || fallbackIndex}`;
  }

  return `log:${hash}`;
}

function mergeUniqueLogs(current: VpsLog[], incoming: VpsLog[]) {
  if (!incoming.length) return current;
  const seen = new Set(current.map((log, index) => logFingerprint(log, index)));
  const next = [...current];
  incoming.forEach((log, index) => {
    const fingerprint = logFingerprint(log, index);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    next.push(log);
  });
  return next.slice(-600);
}

function clampContextMenuPosition(x: number, y: number, width = 196, height = 190) {
  if (typeof window === "undefined") return { x, y };
  const margin = 10;
  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  };
}

function metadataString(metadata: Record<string, unknown> | null | undefined, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function metadataNumber(metadata: Record<string, unknown> | null | undefined, keys: string[], fallback?: number) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function resolveConsoleMethod(log: VpsLog) {
  const method = metadataString(log.metadata, ["method", "httpMethod", "request_method"]).toUpperCase();
  if (method) return method;
  const match = (log.message || "").match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i);
  return (match?.[1] || "LOG").toUpperCase();
}

function resolveConsolePath(log: VpsLog) {
  const path = metadataString(log.metadata, ["path", "route", "url", "requestPath", "request_path", "endpoint"]);
  if (path) return path;
  const match = (log.message || "").match(/(?:^|\s)(\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+)/);
  if (match?.[1]) return match[1];
  return log.source ? `/${log.source.replace(/^\/+/, "")}` : "/runtime";
}

function resolveConsoleStatus(log: VpsLog) {
  const source = String(log.source || log.metadata?.source || "").toLowerCase();
  const message = String(log.message || "");
  if (source === "minecraft") {
    const lowerMessage = message.toLowerCase();
    const isFatalMinecraftLine =
      /\[(?:fatal|error)\]/i.test(message) ||
      lowerMessage.includes("exception in thread") ||
      lowerMessage.includes("crash report") ||
      lowerMessage.includes("server crashed") ||
      lowerMessage.includes("failed to start") ||
      lowerMessage.includes("falha ao iniciar") ||
      lowerMessage.includes("start falhou") ||
      lowerMessage.includes("restart falhou") ||
      /servidor encerrado com codigo\s+[1-9]/i.test(message);
    return isFatalMinecraftLine ? 500 : 200;
  }
  const status = metadataNumber(log.metadata, ["status", "statusCode", "status_code", "code", "httpStatus"]);
  if (status) return Math.round(status);
  if (log.level === "error") return 500;
  if (log.level === "warn") return 429;
  if (log.level === "success") return 200;
  if (log.level === "debug") return 204;
  return 200;
}

function statusFamily(status: number) {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "other";
}

function statusClassName(status: number) {
  const family = statusFamily(status);
  if (family === "2xx") return "text-[#64D987]";
  if (family === "3xx") return "text-[#9BC2FF]";
  if (family === "4xx") return "text-[#FFD28A]";
  if (family === "5xx") return "text-[#FF8E8E]";
  return "text-[#A0A0A0]";
}

function formatConsoleClock(value?: string) {
  if (!value) return "--:--:--.--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--.--";
  const pad = (input: number, size = 2) => String(input).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(Math.floor(date.getMilliseconds() / 10))}`;
}

function buildConsoleEntry(log: VpsLog, index: number, fallbackHost: string) {
  const status = resolveConsoleStatus(log);
  const path = resolveConsolePath(log);
  const method = resolveConsoleMethod(log);
  const durationMs = metadataNumber(log.metadata, ["durationMs", "duration_ms", "duration", "elapsedMs", "elapsed_ms"]);
  const requestId = metadataString(log.metadata, ["requestId", "request_id", "traceId", "trace_id", "id"], log.id ? String(log.id) : logFingerprint(log, index));
  const host = metadataString(log.metadata, ["host", "hostname", "domain"], fallbackHost);
  const location = metadataString(log.metadata, ["location", "region", "edge", "datacenter"], "Sao Paulo, BR");
  const userAgent = metadataString(log.metadata, ["userAgent", "user_agent", "agent"], "runtime");
  const externalApis = metadataNumber(log.metadata, ["externalApis", "external_apis", "outgoingRequests", "outgoing_requests"], 0) || 0;

  return {
    key: `${logFingerprint(log, index)}-${index}`,
    log,
    status,
    family: statusFamily(status),
    method,
    path,
    host,
    requestId,
    location,
    userAgent,
    externalApis,
    durationMs,
    message: log.message || "Evento recebido sem mensagem.",
    level: log.level || "info",
    source: log.source || "runtime",
    time: log.emitted_at,
  };
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`flowdesk-shimmer rounded-[12px] bg-[#151515] ${className}`} />;
}

function TabMainSkeleton({ tab }: { tab: TabId }) {
  if (tab === "metrics") {
    return (
      <section className="grid gap-[14px] lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <article key={index} className="rounded-[22px] border border-[#171717] bg-[#080808] p-[16px]">
            <div className="flex items-center justify-between">
              <div className="space-y-[10px]">
                <SkeletonBar className="h-[11px] w-[72px] rounded-full bg-[#111111]" />
                <SkeletonBar className="h-[28px] w-[104px]" />
              </div>
              <SkeletonBar className="h-[38px] w-[38px] rounded-[14px]" />
            </div>
            <SkeletonBar className="mt-[18px] h-[42px] w-full" />
            <SkeletonBar className="mt-[10px] h-[10px] w-[126px] rounded-full bg-[#111111]" />
          </article>
        ))}
      </section>
    );
  }

  if (tab === "files") {
    return (
      <section className="grid h-[calc(100vh-64px)] min-h-0 grid-cols-[300px_minmax(0,1fr)] bg-[#050505] max-md:grid-cols-1">
        <aside className="min-h-0 border-r border-[#171717] bg-[#080808] p-[10px]">
          <SkeletonBar className="h-[38px] w-full rounded-[10px]" />
          <div className="mt-[14px] space-y-[8px]">
            {Array.from({ length: 12 }, (_, index) => (
              <SkeletonBar key={index} className={`h-[26px] rounded-[9px] ${index % 3 === 0 ? "ml-0 w-[82%]" : "ml-[18px] w-[70%]"}`} />
            ))}
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col bg-[#050505]">
          <div className="h-[48px] border-b border-[#171717] bg-[#080808] p-[12px]">
            <SkeletonBar className="h-[22px] w-[min(360px,60%)] rounded-full" />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)]">
            <div className="border-r border-[#111111] bg-[#070707] p-[12px]">
              <SkeletonBar className="h-full w-full rounded-[8px] bg-[#101010]" />
            </div>
            <div className="space-y-[10px] p-[12px]">
              {Array.from({ length: 16 }, (_, index) => (
                <SkeletonBar key={index} className={`h-[14px] rounded-full ${index % 4 === 0 ? "w-[42%]" : index % 2 === 0 ? "w-[76%]" : "w-[58%]"}`} />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (tab === "deploys") {
    return (
      <section className="rounded-[24px] border border-[#171717] bg-[#080808] p-[16px]">
        <SkeletonBar className="h-[26px] w-[170px]" />
        <SkeletonBar className="mt-[10px] h-[12px] w-[min(420px,80%)] rounded-full bg-[#111111]" />
        <div className="mt-[18px] space-y-[10px]">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="rounded-[18px] border border-[#151515] bg-[#0B0B0B] p-[14px]">
              <div className="flex items-center justify-between gap-[14px]">
                <div className="min-w-0 flex-1 space-y-[10px]">
                  <SkeletonBar className="h-[24px] w-[184px] rounded-full" />
                  <SkeletonBar className="h-[14px] w-[70%] rounded-full" />
                  <SkeletonBar className="h-[11px] w-[48%] rounded-full bg-[#111111]" />
                </div>
                <SkeletonBar className="h-[34px] w-[96px] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (tab === "env") {
    return (
      <section className="rounded-[24px] border border-[#171717] bg-[#080808] p-[16px]">
        <div className="flex items-center justify-between gap-[14px]">
          <div className="space-y-[10px]">
            <SkeletonBar className="h-[26px] w-[230px]" />
            <SkeletonBar className="h-[12px] w-[min(460px,70vw)] rounded-full bg-[#111111]" />
          </div>
          <SkeletonBar className="h-[42px] w-[150px] rounded-[12px]" />
        </div>
        <div className="mt-[16px] grid gap-[8px] xl:grid-cols-[minmax(220px,1fr)_250px_250px_230px]">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBar key={index} className="h-[42px] rounded-[14px]" />
          ))}
        </div>
        <div className="mt-[18px] space-y-[8px]">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBar key={index} className="h-[86px] rounded-[16px]" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-[14px]">
      <div className="grid gap-[14px] md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBar key={index} className="h-[118px] rounded-[20px]" />
        ))}
      </div>
      <div className="grid gap-[14px] lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonBar key={index} className="h-[82px] rounded-[18px]" />
        ))}
      </div>
    </section>
  );
}

function CustomSelect({
  value,
  options,
  onChange,
  className = "",
  icon,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className={`relative ${open ? "z-[180]" : "z-0"} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 130)}
        className="flex h-[42px] w-full items-center justify-between gap-[10px] rounded-[12px] border border-[#202020] bg-[#080808] px-[12px] text-left text-[13px] font-semibold text-[#E8E8E8] outline-none transition-colors hover:border-[#303030]"
      >
        <span className="flex min-w-0 items-center gap-[9px]">
          {icon ? <span className="text-[#8E8E8E]">{icon}</span> : null}
          <span className="truncate">{selected?.label || "Selecionar"}</span>
        </span>
        <ChevronDown className={`h-[15px] w-[15px] text-[#8E8E8E] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[48px] z-[180] overflow-hidden rounded-[14px] border border-[#242424] bg-[#090909] p-[5px] shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex h-[36px] w-full items-center justify-between rounded-[10px] px-[10px] text-left text-[13px] font-semibold transition-colors ${option.value === value ? "bg-[#171717] text-white" : "text-[#BDBDBD] hover:bg-[#111111] hover:text-white"
                }`}
            >
              {option.label}
              {option.value === value ? <Check className="h-[14px] w-[14px] text-[#0F62FE]" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FlowChatMessageContent({
  content,
  onCopy,
}: {
  content: string;
  onCopy: (value: string) => void;
}) {
  const parts: Array<{ type: "text"; value: string } | { type: "code"; value: string; language: string }> = [];
  const regex = /```([A-Za-z0-9_+#.-]*)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "code",
      language: (match[1] || "text").trim().toLowerCase() || "text",
      value: match[2] || "",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  if (!parts.length) parts.push({ type: "text", value: content });

  return (
    <div className="space-y-[10px]">
      {parts.map((part, index) => {
        if (part.type === "text") {
          return part.value.trim() ? (
            <FlowMarkdownText key={`text-${index}`} text={part.value.trim()} />
          ) : null;
        }

        const codeLines = part.value.replace(/\s+$/g, "").split(/\r\n|\r|\n/);
        const language = part.language || "text";
        return (
          <div key={`code-${index}`} className="overflow-hidden rounded-[14px] border border-[#242424] bg-[#050505]">
            <div className="flex h-[34px] items-center justify-between border-b border-[#171717] bg-[#0B0B0B] px-[10px]">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A7A7A]">
                {language}
              </span>
              <button
                type="button"
                onClick={() => onCopy(part.value)}
                className="inline-flex h-[24px] items-center gap-[6px] rounded-[7px] border border-[#242424] bg-[#111111] px-[8px] text-[11px] font-semibold text-[#DADADA] hover:bg-[#171717] hover:text-white"
              >
                <Copy className="h-[12px] w-[12px]" />
                Copiar
              </button>
            </div>
            <div className="max-h-[320px] overflow-auto p-[10px] [scrollbar-color:#2A2A2A_#050505] [scrollbar-width:thin]">
              <pre className="m-0 min-w-max font-mono text-[12px] leading-[20px]">
                {codeLines.map((line, lineIndex) => (
                  <div key={`${lineIndex}-${line}`} className="grid grid-cols-[34px_minmax(0,1fr)] gap-[10px]">
                    <span className="select-none text-right text-[#444444]">{lineIndex + 1}</span>
                    <span className="whitespace-pre text-[#DADADA]">
                      {line ? renderHighlightedLine(line, language) : " "}
                    </span>
                  </div>
                ))}
              </pre>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlowMarkdownText({ text }: { text: string }) {
  const lines = text.split(/\r\n|\r|\n/);
  return (
    <div className="space-y-[6px]">
      {lines.map((line, index) => {
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          const className = level === 1
            ? "mt-[4px] text-[15px] font-bold leading-[1.35] text-white"
            : level === 2
              ? "mt-[4px] text-[14px] font-bold leading-[1.35] text-[#F1F1F1]"
              : "mt-[3px] text-[13px] font-bold leading-[1.35] text-[#E8E8E8]";
          return (
            <p key={`${index}-${line}`} className={className}>
              <FlowInlineMarkdown text={heading[2].trim()} />
            </p>
          );
        }

        if (!line.trim()) return <div key={`${index}-empty`} className="h-[4px]" />;

        return (
          <p key={`${index}-${line}`} className="whitespace-pre-wrap">
            <FlowInlineMarkdown text={line} />
          </p>
        );
      })}
    </div>
  );
}

function FlowInlineMarkdown({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {tokens.map((token, index) => {
        if (token.startsWith("**") && token.endsWith("**")) {
          return <strong key={`${index}-${token}`} className="font-semibold text-white">{token.slice(2, -2)}</strong>;
        }
        if (token.startsWith("`") && token.endsWith("`")) {
          return <code key={`${index}-${token}`} className="rounded-[5px] border border-[#242424] bg-[#080808] px-[5px] py-[1px] font-mono text-[12px] text-[#E8E8E8]">{token.slice(1, -1)}</code>;
        }
        return <span key={`${index}-${token}`}>{token}</span>;
      })}
    </>
  );
}

export function VpsWorkspace({ initialSnapshot }: VpsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const notifications = useNotifications();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const routeTab = useMemo(() => resolveTabFromPathname(pathname), [pathname]);
  const [tab, setTab] = useState<TabId>(routeTab);
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [logsPaused, setLogsPaused] = useState(false);
  const [logQuery, setLogQuery] = useState("");
  const [logLevel, setLogLevel] = useState("all");
  const [consoleStatusFilter, setConsoleStatusFilter] = useState("all");
  const [selectedConsoleKey, setSelectedConsoleKey] = useState<string | null>(null);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [logsClearing, setLogsClearing] = useState(false);
  const [sidebarSearchText, setSidebarSearchText] = useState("");
  const [selectedFile, setSelectedFile] = useState<VpsFileNode | null>(null);
  const [loadedFile, setLoadedFile] = useState<LoadedVpsFile | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileDirty, setFileDirty] = useState(false);
  const [filePreviewMode, setFilePreviewMode] = useState<"preview" | "code">("code");
  const [imageZoom, setImageZoom] = useState(1);
  const [filesBusy, setFilesBusy] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const [fileEditorViewport, setFileEditorViewport] = useState({ scrollTop: 0, scrollLeft: 0, height: 720 });
  const [explorerWidth, setExplorerWidth] = useState(300);
  const [flowChatOpen, setFlowChatOpen] = useState(false);
  const [flowChatWidth, setFlowChatWidth] = useState(380);
  const [flowChatInput, setFlowChatInput] = useState("");
  const [flowChatBusy, setFlowChatBusy] = useState(false);
  const [flowChatHistoryOpen, setFlowChatHistoryOpen] = useState(false);
  const [flowChatSessions, setFlowChatSessions] = useState<FlowChatSession[]>([]);
  const [flowChatSessionId, setFlowChatSessionId] = useState<number | null>(null);
  const [flowChatQuota, setFlowChatQuota] = useState<FlowChatQuota>(() => createInitialFlowQuota());
  const [flowChatAttachments, setFlowChatAttachments] = useState<FlowChatAttachment[]>([]);
  const [flowChatMessages, setFlowChatMessages] = useState<FlowChatMessage[]>([
    {
      id: "flow-welcome",
      role: "assistant",
      content: "Estou pronto para revisar o projeto, explicar arquivos e gerar trechos de codigo copiaveis. Cite o nome/caminho do arquivo ou descreva o que voce quer montar.",
      createdAt: "",
      model: "Flow",
    },
  ]);
  const [expandedFilePaths, setExpandedFilePaths] = useState<Set<string>>(() => new Set());
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenuState>(null);
  const [fileInlineDraft, setFileInlineDraft] = useState<FileInlineDraft>(null);
  const [renamingFilePath, setRenamingFilePath] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const [draggedFilePath, setDraggedFilePath] = useState<string | null>(null);
  const [envSearch, setEnvSearch] = useState("");
  const [envFilter, setEnvFilter] = useState("all");
  const [envSort, setEnvSort] = useState("updated");
  const [envMenuId, setEnvMenuId] = useState<number | null>(null);
  const [deploymentBranchFilter, setDeploymentBranchFilter] = useState("all");
  const [deploymentAuthorFilter, setDeploymentAuthorFilter] = useState("all");
  const [deploymentEnvironmentFilter, setDeploymentEnvironmentFilter] = useState("all");
  const [deploymentStatusFilter, setDeploymentStatusFilter] = useState("all");
  const [deploymentDateFilter, setDeploymentDateFilter] = useState("all");
  const [deploymentMenuId, setDeploymentMenuId] = useState<number | null>(null);
  const [visibleEnvValues, setVisibleEnvValues] = useState<Record<number, boolean>>({});
  const [envDrawerOpen, setEnvDrawerOpen] = useState(false);
  const [envDrawerMode, setEnvDrawerMode] = useState<"create" | "edit">("create");
  const [envSaving, setEnvSaving] = useState(false);
  const [settingsSection, setSettingsSection] = useState("general");
  const [settingsSaving, setSettingsSaving] = useState<string | null>(null);
  const [minecraftWorlds, setMinecraftWorlds] = useState<string[]>(initialSnapshot.project.minecraft?.worlds || []);
  const [minecraftWorldName, setMinecraftWorldName] = useState("");
  const [minecraftBusy, setMinecraftBusy] = useState(false);
  const [minecraftMods, setMinecraftMods] = useState<MinecraftAddon[]>([]);
  const [minecraftPlugins, setMinecraftPlugins] = useState<MinecraftAddon[]>([]);
  const [minecraftAddonsBusy, setMinecraftAddonsBusy] = useState<"mods" | "plugins" | null>(null);
  const [minecraftLibraryQuery, setMinecraftLibraryQuery] = useState("");
  const [minecraftLibraryHits, setMinecraftLibraryHits] = useState<MinecraftLibraryHit[]>([]);
  const [minecraftLibraryBusy, setMinecraftLibraryBusy] = useState(false);
  const [minecraftLibraryDetail, setMinecraftLibraryDetail] = useState<MinecraftLibraryDetail | null>(null);
  const [minecraftLibraryDetailTab, setMinecraftLibraryDetailTab] = useState<"description" | "gallery" | "changelog" | "versions">("description");
  const [minecraftLibraryInstalling, setMinecraftLibraryInstalling] = useState<string | null>(null);
  const [minecraftCommand, setMinecraftCommand] = useState("");
  const [settingsHostName, setSettingsHostName] = useState(initialSnapshot.settings.hostName);
  const [settingsDomainInput, setSettingsDomainInput] = useState("");
  const [domainSearch, setDomainSearch] = useState("");
  const [domainDrawerOpen, setDomainDrawerOpen] = useState(false);
  const [domainDrawerMode, setDomainDrawerMode] = useState<DomainDrawerMode>("add");
  const [editingDomainHostname, setEditingDomainHostname] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [domainDestination, setDomainDestination] = useState<"production" | "redirect">("production");
  const [domainRedirectTo, setDomainRedirectTo] = useState("");
  const [domainRedirectStatus, setDomainRedirectStatus] = useState("307");
  const [settingsMemberEmail, setSettingsMemberEmail] = useState("");
  const [settingsMemberRole, setSettingsMemberRole] = useState<VpsMemberRole>("viewer");
  const [settingsIpInput, setSettingsIpInput] = useState("");
  const [settingsIpMode, setSettingsIpMode] = useState<VpsFirewallMode>("allow");
  const [settingsRepoQuery, setSettingsRepoQuery] = useState("");
  const [settingsRepos, setSettingsRepos] = useState<Array<{
    id: string;
    owner: string;
    name: string;
    fullName?: string;
    branch: string;
    description?: string | null;
    language?: string | null;
    htmlUrl?: string;
    private?: boolean;
  }>>([]);
  const [settingsReposLoading, setSettingsReposLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [githubReconnectOpen, setGithubReconnectOpen] = useState(!initialSnapshot.project.githubConnected);
  const [githubReconnectBusy, setGithubReconnectBusy] = useState(false);
  const [githubReconnectSsoUrl, setGithubReconnectSsoUrl] = useState<string | null>(null);
  const [githubReconnectInstallUrl, setGithubReconnectInstallUrl] = useState<string | null>(null);
  const [githubReconnectMessage, setGithubReconnectMessage] = useState(
    initialSnapshot.project.githubConnected
      ? ""
      : "Reconecte o GitHub para manter arquivos, deploys e variaveis sincronizados com seguranca.",
  );
  const [envEnvironment, setEnvEnvironment] = useState<EnvName>("production");
  const [envRows, setEnvRows] = useState<EnvDraftRow[]>([createDraftRow()]);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedPanelAccount[]>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const flowChatScrollRef = useRef<HTMLDivElement | null>(null);
  const fileEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const highlightedCodeRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const flowChatImageInputRef = useRef<HTMLInputElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const fileContextMenuRef = useRef<HTMLDivElement | null>(null);
  const autoSyncedFilesRef = useRef(false);
  const autoSyncedDeploymentsRef = useRef(false);
  const autoSyncedLogsRef = useRef(false);
  const initializedExplorerRef = useRef(false);
  const logsClearedAtRef = useRef<number | null>(null);
  const currentAccount = useLiveAccountProfile(snapshot.account);
  const latestMetric = snapshot.metrics[snapshot.metrics.length - 1] || null;
  const shouldShowTabSkeleton = Boolean(pendingTab && pendingTab === tab);
  const isMinecraftProject = snapshot.project.kind === "minecraft";
  const minecraftServerType = snapshot.project.minecraft?.serverType?.toLowerCase() || "vanilla";
  const minecraftAddonKind = ["paper", "purpur", "spigot", "bukkit", "folia"].includes(minecraftServerType)
    ? "plugins"
    : ["fabric", "quilt", "forge", "neoforge"].includes(minecraftServerType)
      ? "mods"
      : "vanilla";
  const supportsMinecraftAddons = isMinecraftProject && minecraftAddonKind !== "vanilla";
  const minecraftMaxPlayers = Number(snapshot.project.minecraft?.limits?.maxPlayers || 20);
  const centeredMainTabs = tab === "overview" || tab === "metrics" || tab === "library" || tab === "installed" || tab === "minecraft" || tab === "domains" || tab === "env" || tab === "settings";
  const flowQuotaPercent = Math.min(100, Math.max(0, (flowChatQuota.used / Math.max(1, flowChatQuota.limit)) * 100));
  const flowQuotaResetLabel = flowChatQuota.blockedUntil || flowChatQuota.resetAt
    ? formatDate(flowChatQuota.blockedUntil || flowChatQuota.resetAt)
    : "proxima janela diaria";
  const fileLines = useMemo(() => (fileContent ? fileContent.split(/\r\n|\r|\n/) : [""]), [fileContent]);
  const lineCount = Math.max(32, fileLines.length);
  const highlightedLanguage = useMemo(() => resolveHighlightLanguage(selectedFile), [selectedFile]);
  const selectedFileIsSvg = useMemo(() => isSvgFile(selectedFile), [selectedFile]);
  const selectedFileIsRasterImage = useMemo(() => isRasterImageFile(selectedFile), [selectedFile]);
  const selectedFileIsJar = useMemo(() => isJarFile(selectedFile), [selectedFile]);
  const selectedFileIsPreviewableImage = selectedFileIsSvg || selectedFileIsRasterImage;
  const showingImagePreview = selectedFileIsPreviewableImage && filePreviewMode === "preview";
  const selectedFileRawPath = selectedFile
    ? buildVpsFileRawPath(snapshot.project.vpsCode, selectedFile.path)
    : "";
  const selectedImagePreviewSrc = selectedFileIsSvg && fileDirty && fileContent.trim()
    ? buildSvgDataUrl(fileContent)
    : selectedFileRawPath;
  const loadedFileSizeLabel = typeof loadedFile?.size === "number" && Number.isFinite(loadedFile.size)
    ? `${Math.max(1, Math.round(loadedFile.size / 1024))} KB`
    : null;
  const visibleLineStart = Math.max(
    0,
    Math.floor(fileEditorViewport.scrollTop / FILE_EDITOR_LINE_HEIGHT) - FILE_EDITOR_OVERSCAN_LINES,
  );
  const visibleLineEnd = Math.min(
    lineCount,
    Math.ceil((fileEditorViewport.scrollTop + fileEditorViewport.height) / FILE_EDITOR_LINE_HEIGHT) + FILE_EDITOR_OVERSCAN_LINES,
  );
  const visibleLines = fileLines.slice(visibleLineStart, visibleLineEnd);
  const editorVirtualHeight = lineCount * FILE_EDITOR_LINE_HEIGHT;

  useEffect(() => {
    try {
      const previous = normalizeSavedPanelAccounts(
        JSON.parse(window.localStorage.getItem(SAVED_PANEL_ACCOUNTS_KEY) || "[]"),
      );
      const currentSnapshot: SavedPanelAccount = {
        ...currentAccount,
        lastSeenAt: Date.now(),
      };
      const nextAccounts = mergeSavedPanelAccounts(currentSnapshot, previous);
      setSavedAccounts(nextAccounts);
      window.localStorage.setItem(SAVED_PANEL_ACCOUNTS_KEY, JSON.stringify(nextAccounts));
    } catch {
      const fallback = [{ ...currentAccount, lastSeenAt: Date.now() }];
      setSavedAccounts(fallback);
    }
  }, [currentAccount]);

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) return;
      setIsProfileMenuOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isProfileMenuOpen]);

  useEffect(() => {
    if (!fileContextMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (fileContextMenuRef.current?.contains(event.target as Node)) return;
      setFileContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFileContextMenu(null);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fileContextMenu]);

  const notify = useCallback((tone: NotifyTone, message: string, title = "VPS") => {
    if (tone === "success") notifications.success(message, { title });
    else if (tone === "error") notifications.error(message, { title });
    else notifications.show(message, { title, tone: "default" });
  }, [notifications]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign(buildLoginHref("/dashboard/hosting"));
    }
  }, [isLoggingOut]);

  const handleSwitchSavedAccount = useCallback((account: SavedPanelAccount) => {
    if (resolveSavedAccountKey(account) === resolveSavedAccountKey(currentAccount)) {
      setIsProfileMenuOpen(false);
      return;
    }
    if (!account.discordUserId) {
      window.location.assign(buildLoginHref("/dashboard/hosting"));
      return;
    }
    try {
      window.localStorage.setItem(
        "flowdesk_pending_account_switch_v1",
        JSON.stringify({
          discordUserId: account.discordUserId,
          requestedAt: Date.now(),
        }),
      );
    } catch {
      // noop
    }
    window.location.assign(buildDiscordAuthStartHref("/dashboard/hosting"));
  }, [currentAccount]);

  const navigateToTab = useCallback((nextTab: TabId) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    setPendingTab(nextTab);
    router.push(buildVpsTabPath(snapshot.project.vpsCode, nextTab), {
      scroll: false,
    });
  }, [router, snapshot.project.vpsCode, tab]);

  useEffect(() => {
    if (!isMinecraftProject) return;
    if (tab !== "env" && tab !== "deploys" && tab !== "minecraft" && (supportsMinecraftAddons || (tab !== "library" && tab !== "installed"))) return;
    const nextTab = tab === "library" || tab === "installed" ? "overview" : "files";
    setTab(nextTab);
    setPendingTab(nextTab);
    router.replace(buildVpsTabPath(snapshot.project.vpsCode, nextTab), {
      scroll: false,
    });
  }, [isMinecraftProject, router, snapshot.project.vpsCode, supportsMinecraftAddons, tab]);

  useEffect(() => {
    setSettingsHostName(snapshot.settings.hostName);
  }, [snapshot.settings.hostName]);

  const startExplorerResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = explorerWidth;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(460, Math.max(220, startWidth + moveEvent.clientX - startX));
      setExplorerWidth(Math.round(nextWidth));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [explorerWidth]);

  const startFlowChatResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = flowChatWidth;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(560, Math.max(320, startWidth - (moveEvent.clientX - startX)));
      setFlowChatWidth(Math.round(nextWidth));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [flowChatWidth]);

  useEffect(() => {
    setTab((current) => (current === routeTab ? current : routeTab));
    const timeoutId = window.setTimeout(() => {
      setPendingTab(null);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [routeTab]);

  useEffect(() => {
    const events = new EventSource(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/stream`);
    events.addEventListener("snapshot", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        project?: {
          runtime_status?: RuntimeStatus;
          runtime_last_seen_at?: string | null;
          status?: string;
          runtimeHealth?: VpsRuntimeHealth;
        };
        metric?: VpsMetric | null;
        metricsHistory?: VpsMetric[];
        logs?: VpsLog[];
        actions?: Array<Record<string, unknown>>;
      };
      const incomingLogs = (payload.logs || []).filter((log) => {
        if (!logsClearedAtRef.current) return true;
        const emittedAt = Date.parse(log.emitted_at || "");
        return Number.isFinite(emittedAt) && emittedAt >= logsClearedAtRef.current;
      });
      setSnapshot((current) => ({
        ...current,
        project: {
          ...current.project,
          runtimeStatus: payload.project?.runtime_status || current.project.runtimeStatus,
          runtimeLastSeenAt: payload.project?.runtime_last_seen_at || current.project.runtimeLastSeenAt,
          status: payload.project?.status || current.project.status,
          runtimeHealth: payload.project?.runtimeHealth || current.project.runtimeHealth,
        },
        metrics: payload.metricsHistory?.length && current.metrics.length === 0 ? [...payload.metricsHistory, ...(payload.metric ? [payload.metric] : [])].slice(-48) : (payload.metric ? [...current.metrics, payload.metric].slice(-48) : current.metrics),
        logs: logsPaused ? current.logs : mergeUniqueLogs(current.logs, incomingLogs),
        actions: payload.actions || current.actions,
      }));
    });
    events.addEventListener("error", () => {
      notify("error", "Conexao em tempo real instavel. Tentando reconectar.");
    });
    return () => events.close();
  }, [logsPaused, notify, snapshot.project.vpsCode]);

  useEffect(() => {
    if (!flowChatOpen) return;
    window.requestAnimationFrame(() => {
      flowChatScrollRef.current?.scrollTo({
        top: flowChatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [flowChatMessages.length, flowChatBusy, flowChatOpen]);

  useEffect(() => {
    const textarea = fileEditorTextareaRef.current;
    if (!textarea) return;
    const updateEditorSize = () => {
      setFileEditorViewport((current) => ({
        ...current,
        height: textarea.clientHeight || current.height,
      }));
    };
    updateEditorSize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateEditorSize) : null;
    observer?.observe(textarea);
    window.addEventListener("resize", updateEditorSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateEditorSize);
    };
  }, [tab, flowChatOpen]);

  const filteredLogs = useMemo(
    () =>
      snapshot.logs.filter((log) => {
        const matchesLevel = logLevel === "all" || log.level === logLevel;
        const text = `${log.source || ""} ${log.message || ""} ${JSON.stringify(log.metadata || {})}`.toLowerCase();
        return matchesLevel && (!logQuery || text.includes(logQuery.toLowerCase()));
      }),
    [logLevel, logQuery, snapshot.logs],
  );

  const consoleEntries = useMemo(
    () => filteredLogs.slice(-1000).map((log, index) => buildConsoleEntry(log, index, "fdesk.flwdesk.com")),
    [filteredLogs],
  );

  const visibleConsoleEntries = useMemo(
    () => {
      const filtered = consoleEntries.filter((entry) =>
        consoleStatusFilter === "all" ? true : entry.family === consoleStatusFilter,
      );
      return isMinecraftProject ? filtered : filtered.reverse();
    },
    [consoleEntries, consoleStatusFilter, isMinecraftProject],
  );

  useEffect(() => {
    if (!isMinecraftProject || logsPaused) return;
    window.requestAnimationFrame(() => {
      if (!consoleRef.current) return;
      consoleRef.current.scrollTo({
        top: consoleRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [isMinecraftProject, logsPaused, visibleConsoleEntries.length]);

  const consoleStats = useMemo(() => {
    const stats = { all: consoleEntries.length, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, other: 0 };
    consoleEntries.forEach((entry) => {
      stats[entry.family as keyof typeof stats] += 1;
    });
    return stats;
  }, [consoleEntries]);

  const selectedConsoleEntry = useMemo(
    () =>
      selectedConsoleKey
        ? visibleConsoleEntries.find((entry) => entry.key === selectedConsoleKey) || null
        : null,
    [selectedConsoleKey, visibleConsoleEntries],
  );

  const selectedConsoleIndex = useMemo(
    () => visibleConsoleEntries.findIndex((entry) => entry.key === selectedConsoleEntry?.key),
    [selectedConsoleEntry?.key, visibleConsoleEntries],
  );
  const latestDeployment = snapshot.deployments[0] || null;
  const metricSummary = {
    cpu: metricValue(latestMetric, "cpu_percent"),
    ram: metricValue(latestMetric, "ram_percent"),
    disk: metricValue(latestMetric, "disk_percent"),
    rx: metricValue(latestMetric, "network_rx_kbps"),
    tx: metricValue(latestMetric, "network_tx_kbps"),
    processes: metricValue(latestMetric, "process_count"),
    uptime: metricValue(latestMetric, "uptime_seconds"),
    appRam: metricValue(latestMetric, "app_ram_mb"),
    appCpu: metricValue(latestMetric, "app_cpu_percent"),
  };
  const runtimeHealth = snapshot.project.runtimeHealth;
  const primaryDomain = snapshot.settings.domains.find((domain) => domain.primary) || snapshot.settings.domains[0] || null;
  const readyDeploymentCount = snapshot.deployments.filter((deploy) => deploymentStatusFamily(deploy.status) === "ready").length;
  const failedDeploymentCount = snapshot.deployments.filter((deploy) => deploymentStatusFamily(deploy.status) === "failed").length;
  const errorConsoleCount = consoleStats["5xx"] + consoleStats["4xx"];
  const metricsWindowLabel = formatMetricsWindowLabel(snapshot.metrics);

  const deploymentBranchOptions = useMemo(() => {
    const branches = Array.from(new Set(snapshot.deployments.map((deploy) => deploy.branch).filter(Boolean))).sort();
    return [{ value: "all", label: "All Branches..." }, ...branches.map((branch) => ({ value: branch, label: branch }))];
  }, [snapshot.deployments]);
  const deploymentAuthorOptions = useMemo(() => {
    const authors = Array.from(new Set(snapshot.deployments.map((deploy) => deploy.commit_author || "Unknown").filter(Boolean))).sort();
    return [{ value: "all", label: "All Authors..." }, ...authors.map((author) => ({ value: author, label: author }))];
  }, [snapshot.deployments]);
  const deploymentEnvironmentOptions = useMemo(() => {
    const environments = Array.from(new Set(snapshot.deployments.map((deploy) => deploy.environment).filter(Boolean))).sort();
    return [
      { value: "all", label: "All Environments" },
      ...environments.map((environment) => ({ value: environment, label: deploymentEnvironmentLabel(environment) })),
    ];
  }, [snapshot.deployments]);
  const deploymentStatusOptions = useMemo(() => {
    const statuses = Array.from(new Set(snapshot.deployments.map((deploy) => deploymentStatusFamily(deploy.status)))).sort();
    const readyCount = snapshot.deployments.filter((deploy) => deploymentStatusFamily(deploy.status) === "ready").length;
    return [
      { value: "all", label: `Status ${readyCount}/${snapshot.deployments.length || 0}` },
      ...statuses.map((status) => ({
        value: status,
        label: status === "ready" ? "Ready" : status === "failed" ? "Failed" : status === "building" ? "Building" : "Other",
      })),
    ];
  }, [snapshot.deployments]);
  const filteredDeployments = useMemo(() => {
    const now = Date.now();
    const dateWindowMs = deploymentDateFilter === "24h"
      ? 24 * 60 * 60 * 1000
      : deploymentDateFilter === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : deploymentDateFilter === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : null;
    return snapshot.deployments.filter((deploy) => {
      if (deploymentBranchFilter !== "all" && deploy.branch !== deploymentBranchFilter) return false;
      if (deploymentAuthorFilter !== "all" && (deploy.commit_author || "Unknown") !== deploymentAuthorFilter) return false;
      if (deploymentEnvironmentFilter !== "all" && deploy.environment !== deploymentEnvironmentFilter) return false;
      if (deploymentStatusFilter !== "all" && deploymentStatusFamily(deploy.status) !== deploymentStatusFilter) return false;
      if (dateWindowMs) {
        const value = Date.parse(deploy.deployed_at || deploy.created_at || "");
        if (!Number.isFinite(value) || now - value > dateWindowMs) return false;
      }
      return true;
    });
  }, [
    deploymentAuthorFilter,
    deploymentBranchFilter,
    deploymentDateFilter,
    deploymentEnvironmentFilter,
    deploymentStatusFilter,
    snapshot.deployments,
  ]);

  const filteredEnvVars = useMemo(() => {
    const query = envSearch.trim().toLowerCase();
    const list = snapshot.envVars.filter((item) => {
      const matchesEnv = envFilter === "all" || item.environment === envFilter;
      const matchesQuery = !query || `${item.key} ${item.environment} ${item.note || ""}`.toLowerCase().includes(query);
      return matchesEnv && matchesQuery;
    });
    return [...list].sort((a, b) => {
      if (envSort === "name") return a.key.localeCompare(b.key);
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    });
  }, [envFilter, envSearch, envSort, snapshot.envVars]);

  async function refreshConsoleLogs(options?: { silent?: boolean } | ReactMouseEvent) {
    if (logsRefreshing) return;
    const silent = Boolean(options && "silent" in options && options.silent);
    setLogsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (logQuery.trim()) params.set("q", logQuery.trim());
      if (logLevel !== "all") params.set("level", logLevel);
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/logs?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; logs?: VpsLog[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao consegui atualizar os logs.");
      setSnapshot((current) => ({ ...current, logs: payload.logs || [] }));
      if (!silent) notify("success", "Console atualizado.");
    } catch (error) {
      if (!silent) notify("error", error instanceof Error ? error.message : "Falha ao atualizar logs.");
    } finally {
      setLogsRefreshing(false);
    }
  }

  function exportConsoleLogs() {
    const payload = visibleConsoleEntries.map((entry) => ({
      time: entry.time,
      level: entry.level,
      status: entry.status,
      method: entry.method,
      host: entry.host,
      path: entry.path,
      message: entry.message,
      metadata: entry.log.metadata || {},
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${snapshot.project.vpsCode}-console-logs.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function clearConsoleLogs() {
    if (logsClearing) return;
    setLogsClearing(true);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/logs`, {
        method: "DELETE",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao consegui limpar os logs.");
      logsClearedAtRef.current = Date.now();
      setSelectedConsoleKey(null);
      setSnapshot((current) => ({ ...current, logs: [] }));
      notify("success", "Logs removidos permanentemente.", "Console");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao limpar console.", "Console");
    } finally {
      setLogsClearing(false);
    }
  }

  async function runAction(action: "start" | "stop" | "restart" | "sync" | "deploy" | "kill" | "reset-world" | "command", extraBody: Record<string, unknown> = {}) {
    if (busyAction) return;
    setBusyAction(action);
    const optimisticStatus =
      action === "start" ? "starting"
        : action === "restart" ? "restarting"
          : action === "stop" || action === "kill" || action === "reset-world" ? "offline"
            : null;
    setSnapshot((current) => ({
      ...current,
      project: {
        ...current.project,
        runtimeStatus: optimisticStatus || current.project.runtimeStatus,
      },
    }));
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extraBody }),
      });
      const payload = await response.json() as { ok?: boolean; message?: string; status?: RuntimeStatus; runtimeHealth?: VpsRuntimeHealth };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Falha na acao.");
      if (payload.status) {
        setSnapshot((current) => ({
          ...current,
          project: {
            ...current.project,
            runtimeStatus: payload.status || current.project.runtimeStatus,
            runtimeHealth: payload.runtimeHealth ? {
              agentConnected: true,
              regionLabel: payload.runtimeHealth.regionLabel || current.project.runtimeHealth?.regionLabel || current.project.regionLabel,
              latencyMs: payload.runtimeHealth.latencyMs ?? current.project.runtimeHealth?.latencyMs ?? null,
              checkedAt: payload.runtimeHealth.checkedAt || new Date().toISOString(),
              source: "agent",
              publicIp: payload.runtimeHealth.publicIp || current.project.runtimeHealth?.publicIp || null,
              host: payload.runtimeHealth.host || current.project.runtimeHealth?.host || null,
            } : current.project.runtimeHealth,
          },
        }));
      }
      notify("success", `Acao ${action} enviada para a VPS.`);
      if (isMinecraftProject && ["start", "restart", "stop", "kill", "reset-world", "command"].includes(action)) {
        [1200, 4500, 9000, 18000, 32000].forEach((delay) => {
          window.setTimeout(() => {
            void refreshMinecraftWorlds();
            void refreshConsoleLogs({ silent: true });
          }, delay);
        });
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha operacional.");
    } finally {
      setBusyAction(null);
    }
  }

  const syncDeployments = useCallback(async (options?: { silent?: boolean }) => {
    if (busyAction) return;
    setBusyAction("sync");
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/deploys?sync=1`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        message?: string;
        deployments?: VpsDeployment[];
        sync?: {
          ok?: boolean;
          message?: string;
          synced?: number;
        } | null;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Nao consegui sincronizar deployments.");
      }
      setSnapshot((current) => ({ ...current, deployments: payload.deployments || [] }));
      if (!options?.silent) {
        if (payload.sync?.ok === false) {
          notify("error", payload.sync.message || "Deployments locais carregados, mas o GitHub nao sincronizou.");
        } else {
          notify("success", payload.sync?.synced
            ? `${payload.sync.synced} commit(s) sincronizados.`
            : "Deployments sincronizados.");
        }
      }
    } catch (error) {
      if (!options?.silent) {
        notify("error", error instanceof Error ? error.message : "Falha ao sincronizar deployments.");
      }
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, notify, snapshot.project.vpsCode]);

  const syncFiles = useCallback(async (options?: { silent?: boolean }) => {
    if (filesBusy) return;
    setFilesBusy(true);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/files?sync=1`);
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        tree?: VpsFileNode[];
        message?: string;
        reconnectRequired?: boolean;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel sincronizar arquivos.");
      if (payload.reconnectRequired) {
        setGithubReconnectOpen(true);
        setGithubReconnectSsoUrl(null);
        setGithubReconnectInstallUrl(null);
        setGithubReconnectMessage(payload.message || "Reconecte o GitHub para espelhar arquivos.");
      }
      setSnapshot((current) => ({ ...current, fileTree: payload.tree || [] }));
      if (!options?.silent) {
        notify("success", "Arquivos sincronizados com o repositorio.");
      }
    } catch (error) {
      if (!options?.silent) {
        notify("error", error instanceof Error ? error.message : "Falha ao espelhar o GitHub.");
      }
    } finally {
      setFilesBusy(false);
    }
  }, [filesBusy, notify, snapshot.project.vpsCode]);

  async function saveProjectSettings(action: string, body: Record<string, unknown> = {}) {
    if (settingsSaving) return null;
    setSettingsSaving(action);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action, ...body }),
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        message?: string;
        settings?: VpsProjectSettings;
        project?: {
          repository?: Partial<VpsWorkspaceSnapshot["project"]["repository"]>;
        };
      };
      if (!response.ok || !payload.ok || !payload.settings) {
        throw new Error(payload.message || "Nao foi possivel salvar settings.");
      }
      setSnapshot((current) => {
        const nextSettings = payload.settings || current.settings;
        const nextPrimaryDomain = nextSettings.domains.find((domain) => domain.primary)?.hostname
          || nextSettings.domains[0]?.hostname
          || "";
        return {
          ...current,
          settings: nextSettings,
          project: {
            ...current.project,
            repository: {
              ...current.project.repository,
              ...(payload.project?.repository || {}),
            },
            minecraft: current.project.minecraft
              ? {
                  ...current.project.minecraft,
                  primaryDomain: nextPrimaryDomain,
                  fixedDomain: current.project.minecraft.fixedDomain || nextPrimaryDomain || undefined,
                }
              : current.project.minecraft,
          },
        };
      });
      notify("success", payload.message || "Settings salvas.", "Settings");
      return payload.settings;
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao salvar settings.", "Settings");
      return null;
    } finally {
      setSettingsSaving(null);
    }
  }

  async function refreshMinecraftWorlds() {
    if (snapshot.project.kind !== "minecraft" || minecraftBusy) return;
    setMinecraftBusy(true);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/minecraft/worlds`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        minecraft?: {
          status?: RuntimeStatus;
          worlds?: string[];
          limits?: Record<string, unknown>;
          domains?: { primary?: string; fixed?: string };
        };
        message?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel carregar mundos.");
      const worlds = payload.minecraft?.worlds || [];
      setMinecraftWorlds(worlds);
      setSnapshot((current) => {
        const settingsPrimaryDomain = current.settings.domains.find((domain) => domain.primary)?.hostname
          || current.settings.domains[0]?.hostname
          || "";
        return {
          ...current,
          project: {
            ...current.project,
            runtimeStatus: payload.minecraft?.status || current.project.runtimeStatus,
            minecraft: current.project.minecraft
              ? {
                  ...current.project.minecraft,
                  worlds,
                  limits: payload.minecraft?.limits || current.project.minecraft.limits,
                  primaryDomain: settingsPrimaryDomain || payload.minecraft?.domains?.primary || current.project.minecraft.primaryDomain,
                  fixedDomain: payload.minecraft?.domains?.fixed || current.project.minecraft.fixedDomain || settingsPrimaryDomain || undefined,
                }
              : current.project.minecraft,
          },
        };
      });
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao carregar Minecraft.", "Minecraft");
    } finally {
      setMinecraftBusy(false);
    }
  }

  async function createMinecraftWorld() {
    const name = minecraftWorldName.trim();
    if (!name || minecraftBusy) return;
    setMinecraftBusy(true);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/minecraft/worlds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        minecraft?: { worlds?: string[] };
        message?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel criar mundo.");
      setMinecraftWorlds(payload.minecraft?.worlds || []);
      setMinecraftWorldName("");
      notify("success", "Mundo Minecraft criado.", "Minecraft");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao criar mundo.", "Minecraft");
    } finally {
      setMinecraftBusy(false);
    }
  }

  async function refreshMinecraftAddons(type: "mods" | "plugins", options?: { silent?: boolean }) {
    if (snapshot.project.kind !== "minecraft" || minecraftAddonsBusy) return;
    setMinecraftAddonsBusy(type);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/minecraft/addons?type=${type}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        addons?: MinecraftAddon[];
        message?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel carregar addons.");
      if (type === "mods") setMinecraftMods(payload.addons || []);
      else setMinecraftPlugins(payload.addons || []);
      if (!options?.silent) {
        notify("success", type === "mods" ? "Mods atualizados." : "Plugins atualizados.", "Minecraft");
      }
    } catch (error) {
      if (!options?.silent) {
        notify("error", error instanceof Error ? error.message : "Falha ao carregar addons.", "Minecraft");
      }
    } finally {
      setMinecraftAddonsBusy(null);
    }
  }

  async function searchMinecraftLibrary(options?: { query?: string; silent?: boolean }) {
    if (!supportsMinecraftAddons || minecraftLibraryBusy) return;
    const query = options?.query ?? minecraftLibraryQuery;
    setMinecraftLibraryBusy(true);
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        limit: "20",
        index: query.trim() ? "relevance" : "downloads",
      });
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/minecraft/library?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        hits?: MinecraftLibraryHit[];
        message?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel carregar a biblioteca.");
      setMinecraftLibraryHits(payload.hits || []);
      setMinecraftLibraryDetail(null);
      if (!options?.silent) notify("success", "Biblioteca atualizada.", "Minecraft");
    } catch (error) {
      if (!options?.silent) notify("error", error instanceof Error ? error.message : "Falha na biblioteca.", "Minecraft");
    } finally {
      setMinecraftLibraryBusy(false);
    }
  }

  async function openMinecraftLibraryDetail(projectId: string) {
    if (!supportsMinecraftAddons || minecraftLibraryBusy) return;
    setMinecraftLibraryBusy(true);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/minecraft/library?projectId=${encodeURIComponent(projectId)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as MinecraftLibraryDetail & { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel abrir o projeto.");
      setMinecraftLibraryDetail(payload);
      setMinecraftLibraryDetailTab("description");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao abrir projeto.", "Minecraft");
    } finally {
      setMinecraftLibraryBusy(false);
    }
  }

  async function installMinecraftLibraryVersion(version?: MinecraftLibraryVersion | null) {
    const selected = version || minecraftLibraryDetail?.latestVersion;
    const file = selected?.files?.find((item) => item.primary && item.url && item.filename)
      || selected?.files?.find((item) => item.url && item.filename);
    if (!selected?.id || !file?.url || !file.filename || minecraftLibraryInstalling) return;
    setMinecraftLibraryInstalling(selected.id);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/minecraft/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "install",
          url: file.url,
          filename: file.filename,
          project: minecraftLibraryDetail?.project || {},
          version: selected,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; addons?: MinecraftAddon[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel instalar.");
      if (minecraftAddonKind === "mods") setMinecraftMods(payload.addons || []);
      if (minecraftAddonKind === "plugins") setMinecraftPlugins(payload.addons || []);
      notify("success", "Arquivo instalado. Reinicie o servidor para carregar.", "Minecraft");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao instalar.", "Minecraft");
    } finally {
      setMinecraftLibraryInstalling(null);
    }
  }

  async function deleteMinecraftInstalled(addon: MinecraftAddon) {
    if (minecraftLibraryInstalling) return;
    setMinecraftLibraryInstalling(addon.path);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/minecraft/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", name: addon.name, folder: addon.folder, type: addon.folder }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; addons?: MinecraftAddon[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel remover.");
      if (addon.folder === "mods") setMinecraftMods(payload.addons || []);
      else setMinecraftPlugins(payload.addons || []);
      notify("success", "Addon removido.", "Minecraft");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao remover addon.", "Minecraft");
    } finally {
      setMinecraftLibraryInstalling(null);
    }
  }

  async function sendMinecraftConsoleCommand() {
    const command = minecraftCommand.trim();
    if (!command) return;
    await runAction("command", { command });
    setMinecraftCommand("");
    void refreshConsoleLogs();
  }

  function openAddDomainDrawer() {
    setDomainDrawerMode("add");
    setEditingDomainHostname(null);
    setDomainInput("");
    setDomainDestination("production");
    setDomainRedirectTo("");
    setDomainRedirectStatus("307");
    setDomainDrawerOpen(true);
  }

  function openEditDomainDrawer(domain: VpsProjectSettings["domains"][number]) {
    setDomainDrawerMode("edit");
    setEditingDomainHostname(domain.hostname);
    setDomainInput(isMinecraftProject ? minecraftDomainLabel(domain.hostname) : domain.hostname);
    setDomainDestination(domain.redirectTo ? "redirect" : "production");
    setDomainRedirectTo(domain.redirectTo || "");
    setDomainRedirectStatus(String(domain.redirectStatus || 307));
    setDomainDrawerOpen(true);
  }

  async function submitDomainDrawer() {
    const hostname = isMinecraftProject
      ? minecraftDomainInputValue(domainInput)
      : domainInput.trim().toLowerCase();
    if (!hostname) return;
    if (domainDestination === "redirect" && !domainRedirectTo.trim()) {
      notify("error", "Informe o dominio de destino do redirect.", "Domains");
      return;
    }

    const saved = await saveProjectSettings(domainDrawerMode === "edit" ? "update_domain" : "add_domain", {
      id: editingDomainHostname,
      hostname,
      redirectTo: domainDestination === "redirect" ? domainRedirectTo.trim().toLowerCase() : null,
      redirectStatus: domainDestination === "redirect" ? Number(domainRedirectStatus) : null,
    });
    if (!saved) return;
    setDomainDrawerOpen(false);
    setDomainInput("");
    setEditingDomainHostname(null);
  }

  const filteredDomains = useMemo(() => {
    const query = domainSearch.trim().toLowerCase();
    if (!query) return snapshot.settings.domains;
    return snapshot.settings.domains.filter((domain) =>
      `${domain.hostname} ${domain.status} ${domain.source}`.toLowerCase().includes(query),
    );
  }, [domainSearch, snapshot.settings.domains]);

  async function loadAvailableRepositories() {
    if (settingsReposLoading) return;
    setSettingsReposLoading(true);
    try {
      const params = new URLSearchParams();
      if (settingsRepoQuery.trim()) params.set("q", settingsRepoQuery.trim());
      const response = await fetch(`/api/auth/me/hosting/github/repositories?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        message?: string;
        repositories?: typeof settingsRepos;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel carregar repositorios.");
      setSettingsRepos(payload.repositories || []);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao carregar repositorios.", "GitHub");
    } finally {
      setSettingsReposLoading(false);
    }
  }

  async function deleteProjectWithProof(securityProof: string | null) {
    setSettingsSaving("delete_project");
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/settings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ securityProof }),
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        message?: string;
        redirectUrl?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel deletar a VPS.");
      notify("success", payload.message || "Projeto removido.", "Settings");
      window.location.assign(payload.redirectUrl || "/dashboard/hosting");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao deletar a VPS.", "Settings");
    } finally {
      setSettingsSaving(null);
      setDeleteModalOpen(false);
    }
  }

  const completeGithubReconnect = useCallback(async (handoffToken?: string | null) => {
    const response = await fetch("/api/auth/me/hosting/github/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoffToken }),
    });
    const payload = await response.json().catch(() => ({})) as {
      connected?: boolean;
      message?: string;
    };
    if (!response.ok || !payload.connected) {
      throw new Error(payload.message || "Nao foi possivel concluir o GitHub.");
    }
    setSnapshot((current) => ({
      ...current,
      project: { ...current.project, githubConnected: true },
    }));
    setGithubReconnectOpen(false);
    setGithubReconnectSsoUrl(null);
    setGithubReconnectInstallUrl(null);
    setGithubReconnectMessage("");
    notify("success", "GitHub reconectado com seguranca.");
    if (tab === "files") {
      void syncFiles({ silent: true });
    }
  }, [notify, syncFiles, tab]);

  const refreshGithubReconnectStatus = useCallback(async () => {
    const response = await fetch("/api/auth/me/hosting/github/status", {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as {
      connected?: boolean;
      message?: string;
    };
    if (!response.ok || !payload.connected) {
      throw new Error(payload.message || "GitHub ainda nao conectado.");
    }
    setSnapshot((current) => ({
      ...current,
      project: { ...current.project, githubConnected: true },
    }));
    setGithubReconnectOpen(false);
    setGithubReconnectSsoUrl(null);
    setGithubReconnectInstallUrl(null);
    setGithubReconnectMessage("");
    notify("success", "GitHub validado.");
    if (tab === "files") {
      void syncFiles({ silent: true });
    }
  }, [notify, syncFiles, tab]);

  const openGithubReconnectPopup = useCallback(() => {
    if (githubReconnectBusy) return;
    const installTarget = githubReconnectInstallUrl && snapshot.project.githubConnected
      ? githubReconnectInstallUrl
      : null;
    setGithubReconnectBusy(true);
    setGithubReconnectSsoUrl(null);
    if (!installTarget) setGithubReconnectInstallUrl(null);
    setGithubReconnectMessage(
      installTarget
        ? "Abrindo instalacao do GitHub App em uma janela segura..."
        : "Abrindo GitHub em uma janela segura...",
    );
    try {
      window.localStorage.removeItem(GITHUB_HANDOFF_STORAGE_KEY);
    } catch { }

    const popup = window.open(
      installTarget || "/api/auth/github/hosting/start",
      "flowdesk-hosting-github",
      "width=980,height=760,menubar=no,toolbar=no,location=no,status=no",
    );

    if (!popup) {
      setGithubReconnectBusy(false);
      setGithubReconnectMessage(
        installTarget
          ? "Permita popups para instalar o GitHub App."
          : "Permita popups para conectar o GitHub.",
      );
      return;
    }

    if (installTarget) {
      const intervalId = window.setInterval(() => {
        if (!popup.closed) return;
        window.clearInterval(intervalId);
        setGithubReconnectBusy(false);
        setGithubReconnectOpen(false);
        setGithubReconnectInstallUrl(null);
        setGithubReconnectMessage("");
        notify("success", "GitHub App atualizado. Tente salvar novamente.");
        if (tab === "files") void syncFiles({ silent: true });
      }, 500);
      return;
    }

    let completed = false;
    const finish = () => {
      completed = true;
      setGithubReconnectBusy(false);
      window.removeEventListener("message", handleMessage);
      window.clearInterval(intervalId);
    };
    const finishWithStatus = async (handoffToken?: string | null) => {
      try {
        if (handoffToken) await completeGithubReconnect(handoffToken);
        else await refreshGithubReconnectStatus();
        finish();
      } catch (error) {
        setGithubReconnectMessage(error instanceof Error ? error.message : "Falha ao validar GitHub.");
        finish();
      }
    };
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; ok?: boolean; message?: string; handoffToken?: string };
      if (data?.source !== "flowdesk-hosting-github") return;
      if (!data.ok) {
        setGithubReconnectMessage(data.message || "GitHub recusou a autorizacao.");
        finish();
        return;
      }
      void finishWithStatus(data.handoffToken || null);
    };
    const intervalId = window.setInterval(() => {
      if (!popup.closed || completed) return;
      const raw = window.localStorage.getItem(GITHUB_HANDOFF_STORAGE_KEY);
      if (raw) {
        window.localStorage.removeItem(GITHUB_HANDOFF_STORAGE_KEY);
        try {
          const parsed = JSON.parse(raw) as { handoffToken?: string; storedAt?: number };
          if (!parsed.storedAt || Date.now() - parsed.storedAt < 120_000) {
            void finishWithStatus(parsed.handoffToken || null);
            return;
          }
        } catch {
          // fall through to status check
        }
      }
      void finishWithStatus(null);
    }, 500);

    window.addEventListener("message", handleMessage);
  }, [
    completeGithubReconnect,
    githubReconnectBusy,
    githubReconnectInstallUrl,
    notify,
    refreshGithubReconnectStatus,
    snapshot.project.githubConnected,
    syncFiles,
    tab,
  ]);

  useEffect(() => {
    if (tab === "files" && !snapshot.fileTree.length && !autoSyncedFilesRef.current) {
      autoSyncedFilesRef.current = true;
      void syncFiles({ silent: true });
    }
  }, [snapshot.fileTree.length, syncFiles, tab]);

  useEffect(() => {
    if (tab === "deploys" && !autoSyncedDeploymentsRef.current) {
      autoSyncedDeploymentsRef.current = true;
      void syncDeployments({ silent: true });
    }
  }, [syncDeployments, tab]);

  useEffect(() => {
    if (!isMinecraftProject) return;
    if (tab === "installed" && supportsMinecraftAddons) void refreshMinecraftAddons(minecraftAddonKind as "mods" | "plugins", { silent: true });
    if (tab === "library" && supportsMinecraftAddons && !minecraftLibraryHits.length) void searchMinecraftLibrary({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load addon lists only when opening each tab.
  }, [isMinecraftProject, tab]);

  useEffect(() => {
    if (tab === "overview" && !autoSyncedLogsRef.current) {
      autoSyncedLogsRef.current = true;
      void refreshConsoleLogs();
    }
  }, [tab]); // Cannot add refreshConsoleLogs here or it might loop if not careful, wait, it's defined inside component and changes. Actually let's just use empty dependency or ignore.

  useEffect(() => {
    if (tab !== "settings" || settingsRepos.length || settingsReposLoading) return;
    void loadAvailableRepositories();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when the settings tab opens.
  }, [tab]);

  useEffect(() => {
    if (initializedExplorerRef.current || !snapshot.fileTree.length) return;
    initializedExplorerRef.current = true;
    setExpandedFilePaths(new Set(snapshot.fileTree.filter((node) => node.type === "directory").map((node) => node.path)));
  }, [snapshot.fileTree]);

  useEffect(() => {
    if (tab !== "files") return;

    const syncQuietly = () => {
      void syncFiles({ silent: true });
    };
    const intervalId = window.setInterval(syncQuietly, 20000);

    window.addEventListener("focus", syncQuietly);
    window.addEventListener("pageshow", syncQuietly);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncQuietly);
      window.removeEventListener("pageshow", syncQuietly);
    };
  }, [syncFiles, tab]);

  async function loadFile(node: VpsFileNode) {
    if (node.type !== "file") return;
    setSelectedFile(node);
    setLoadedFile(null);
    setFileDirty(false);
    setFilePreviewMode(isPreviewableImageFile(node) || isJarFile(node) ? "preview" : "code");
    setImageZoom(1);
    setFileEditorViewport((current) => ({ ...current, scrollTop: 0, scrollLeft: 0 }));
    if (fileEditorTextareaRef.current) {
      fileEditorTextareaRef.current.scrollTop = 0;
      fileEditorTextareaRef.current.scrollLeft = 0;
    }
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = 0;
    if (highlightedCodeRef.current) {
      highlightedCodeRef.current.scrollTop = 0;
      highlightedCodeRef.current.scrollLeft = 0;
    }
    if (isJarFile(node)) {
      setLoadedFile({ path: node.path, name: node.name, content: "", encoding: "binary", size: null });
      setFileContent("");
      return;
    }
    const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/files?path=${encodeURIComponent(node.path)}`);
    const payload = await response.json().catch(() => ({})) as { file?: LoadedVpsFile; message?: string };
    if (!response.ok) {
      notify("error", payload.message || "Nao consegui abrir o arquivo.", "Arquivos");
      setFileContent("");
      return;
    }
    const file = payload.file || null;
    setLoadedFile(file ? { ...file, path: file.path || node.path, name: file.name || node.name } : null);
    setFileContent(typeof file?.content === "string" ? file.content : "");
  }

  async function saveFile() {
    if (!selectedFile || !fileDirty) return;
    setFilesBusy(true);
    const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedFile.path, content: fileContent }),
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      message?: string;
      source?: string;
      commit?: { commitSha?: string | null; commitUrl?: string | null } | null;
      reconnectRequired?: boolean;
      ssoUrl?: string | null;
      installAppUrl?: string | null;
    };
    setFilesBusy(false);
    if (!response.ok || !payload.ok) {
      if (payload.reconnectRequired) {
        setGithubReconnectOpen(true);
        setGithubReconnectSsoUrl(payload.ssoUrl || null);
        setGithubReconnectInstallUrl(payload.installAppUrl || null);
        setGithubReconnectMessage(payload.message || "Autorize o GitHub novamente para salvar alteracoes neste repositorio.");
      }
      if (!payload.reconnectRequired) notify("error", payload.message || "Falha ao salvar arquivo.");
      return;
    }
    setFileDirty(false);
    notify(
      "success",
      payload.message || (payload.source === "github" ? "Arquivo commitado no GitHub." : "Arquivo salvo com seguranca."),
    );
    void syncDeployments({ silent: true });
  }

  async function loadFlowChatHistory(chatId?: number | null) {
    try {
      const params = new URLSearchParams();
      if (chatId) params.set("chatId", String(chatId));
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/flow-chat?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        chats?: FlowChatSession[];
        messages?: Array<{
          id: number;
          role: "user" | "assistant";
          content: string;
          model?: string | null;
          created_at?: string | null;
        }>;
        quota?: Partial<FlowChatQuota>;
      };
      if (!response.ok || !payload.ok) return;
      setFlowChatSessions(payload.chats || []);
      if (payload.quota) setFlowChatQuota(normalizeFlowQuota(payload.quota));
      if (chatId) {
        setFlowChatSessionId(chatId);
        setFlowChatMessages((payload.messages || []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at || "",
          model: null,
        })));
      }
    } catch {
      // History is optional while the SQL migration is being applied.
    }
  }

  function startNewFlowChat() {
    setFlowChatSessionId(null);
    setFlowChatMessages([
      {
        id: "flow-welcome",
        role: "assistant",
        content: "Estou pronto para revisar o projeto, explicar arquivos e gerar trechos de codigo copiaveis. Cite o nome/caminho do arquivo ou descreva o que voce quer montar.",
        createdAt: "",
        model: "Flow",
      },
    ]);
    setFlowChatHistoryOpen(false);
  }

  function setFileTree(nextTree: VpsFileNode[]) {
    setSnapshot((current) => ({ ...current, fileTree: nextTree }));
  }

  async function runFileOperation(input: {
    action: "create-file" | "create-folder" | "rename" | "delete" | "move";
    path?: string;
    targetPath?: string;
    type?: "file" | "directory";
  }) {
    setFilesBusy(true);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; tree?: VpsFileNode[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel alterar arquivos.");
      if (payload.tree) setFileTree(payload.tree);
      return true;
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Falha ao alterar arquivo.", "Arquivos");
      return false;
    } finally {
      setFilesBusy(false);
    }
  }

  function startCreateFile(parentPath = "", type: "file" | "directory" = "file") {
    setFileContextMenu(null);
    setRenamingFilePath(null);
    setFileInlineDraft({ parentPath, type, value: "" });
    if (parentPath) setExpandedFilePaths((current) => new Set([...current, parentPath]));
  }

  async function commitInlineCreate() {
    if (!fileInlineDraft) return;
    const draft = fileInlineDraft;
    const name = draft.value.trim();
    setFileInlineDraft(null);
    if (!name) return;
    const path = joinFilePath(draft.parentPath, name);
    const node: VpsFileNode = {
      name,
      path,
      type: draft.type,
      language: draft.type === "file" ? languageFromFilePath(path) : null,
      children: draft.type === "directory" ? [] : undefined,
    };
    setSnapshot((current) => ({
      ...current,
      fileTree: updateFileTree(current.fileTree, (nodes) => addNodeToTree(nodes, draft.parentPath, node)),
    }));
    if (draft.type === "file") {
      setSelectedFile(node);
      setLoadedFile(null);
      setFileContent("");
      setFileDirty(false);
      setFilePreviewMode(isPreviewableImageFile(node) ? "preview" : "code");
      setImageZoom(1);
    }
    const ok = await runFileOperation({ action: draft.type === "file" ? "create-file" : "create-folder", path, type: draft.type });
    if (ok) notify("success", `${draft.type === "file" ? "Arquivo" : "Pasta"} criado.`, "Arquivos");
  }

  function startRenameFile(node: VpsFileNode) {
    setFileContextMenu(null);
    setFileInlineDraft(null);
    setRenamingFilePath(node.path);
    setRenamingValue(node.name);
  }

  async function commitRenameFile(node: VpsFileNode) {
    const name = renamingValue.trim();
    setRenamingFilePath(null);
    if (!name || name === node.name) return;
    const targetPath = joinFilePath(parentFilePath(node.path), name);
    const nextSelectedFile = { ...node, name, path: targetPath, language: node.type === "file" ? languageFromFilePath(targetPath) : null };
    const ok = await runFileOperation({ action: "rename", path: node.path, targetPath, type: node.type });
    if (!ok) return;
    if (selectedFile?.path === node.path) {
      setSelectedFile(nextSelectedFile);
      setLoadedFile((current) => current ? { ...current, name, path: targetPath } : current);
      setFilePreviewMode(isPreviewableImageFile(nextSelectedFile) ? "preview" : "code");
    }
    notify("success", "Renomeado com sucesso.", "Arquivos");
  }

  async function deleteFileNode(node: VpsFileNode) {
    setFileContextMenu(null);
    const ok = await runFileOperation({ action: "delete", path: node.path, type: node.type });
    if (!ok) return;
    if (selectedFile?.path === node.path || selectedFile?.path.startsWith(`${node.path}/`)) {
      setSelectedFile(null);
      setLoadedFile(null);
      setFileContent("");
      setFileDirty(false);
      setFilePreviewMode("code");
      setImageZoom(1);
    }
    notify("success", `${node.type === "directory" ? "Pasta" : "Arquivo"} removido.`, "Arquivos");
  }

  async function moveFileNode(path: string, targetParentPath: string) {
    const node = findNodeInTree(snapshot.fileTree, path);
    if (!node || node.path === targetParentPath || targetParentPath.startsWith(`${node.path}/`)) return;
    const targetPath = joinFilePath(targetParentPath, node.name);
    const ok = await runFileOperation({ action: "move", path, targetPath, type: node.type });
    if (!ok) return;
    if (selectedFile?.path === path) {
      setSelectedFile({ ...node, path: targetPath });
      setLoadedFile((current) => current ? { ...current, path: targetPath } : current);
      setFilePreviewMode(isPreviewableImageFile({ ...node, path: targetPath }) ? "preview" : "code");
    }
    notify("success", "Movido com sucesso.", "Arquivos");
  }

  function copyFileNode(node: VpsFileNode) {
    setFileContextMenu(null);
    navigator.clipboard?.writeText(node.path).then(
      () => notify("success", "Caminho copiado.", "Arquivos"),
      () => notify("error", "Nao consegui copiar.", "Arquivos"),
    );
  }

  function imageLinkForNode(node: VpsFileNode) {
    const rawPath = buildVpsFileRawPath(snapshot.project.vpsCode, node.path);
    if (typeof window === "undefined") return rawPath;
    return new URL(rawPath, window.location.origin).toString();
  }

  function copyImageLink(node: VpsFileNode) {
    setFileContextMenu(null);
    navigator.clipboard?.writeText(imageLinkForNode(node)).then(
      () => notify("success", "Link da imagem copiado.", "Arquivos"),
      () => notify("error", "Nao consegui copiar o link.", "Arquivos"),
    );
  }

  function copySelectedSvgCode() {
    setFileContextMenu(null);
    navigator.clipboard?.writeText(fileContent).then(
      () => notify("success", "Codigo SVG copiado.", "Arquivos"),
      () => notify("error", "Nao consegui copiar o SVG.", "Arquivos"),
    );
  }

  function copyExplorerPath(path = "") {
    setFileContextMenu(null);
    const value = path || "/";
    navigator.clipboard?.writeText(value).then(
      () => notify("success", "Caminho copiado.", "Arquivos"),
      () => notify("error", "Nao consegui copiar.", "Arquivos"),
    );
  }

  function openFileContextMenu(
    event: ReactMouseEvent,
    menu: FileContextMenuInput,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const position = clampContextMenuPosition(event.clientX, event.clientY);
    setFileContextMenu({ ...menu, ...position });
  }

  function addFlowChatImages(files: FileList | null) {
    if (!files?.length) return;
    const nextFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 4)
      .map((file) => ({
        id: createClientId("flow-image"),
        name: file.name,
        type: file.type,
      }));
    if (!nextFiles.length) {
      notify("error", "Selecione uma imagem valida.", "Flow");
      return;
    }
    setFlowChatAttachments((current) => [...current, ...nextFiles].slice(-6));
    if (flowChatImageInputRef.current) flowChatImageInputRef.current.value = "";
  }

  async function sendFlowChatMessage() {
    const message = flowChatInput.trim() || (flowChatAttachments.length ? "Analise as imagens anexadas com o contexto do projeto." : "");
    if (!message || flowChatBusy || flowChatQuota.blocked) return;

    const userMessage: FlowChatMessage = {
      id: createClientId("flow-user"),
      role: "user",
      content: flowChatAttachments.length
        ? `${message}\n\nImagens anexadas: ${flowChatAttachments.map((item) => item.name).join(", ")}`
        : message,
      createdAt: new Date().toISOString(),
    };
    setFlowChatMessages((current) => [...current, userMessage]);
    setFlowChatInput("");
    const attachments = flowChatAttachments;
    setFlowChatAttachments([]);
    setFlowChatBusy(true);

    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/flow-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          chatId: flowChatSessionId,
          fileTreePaths: flattenFileTreePaths(snapshot.fileTree).slice(0, 2000),
          repository: snapshot.project.repository.fullName,
          branch: snapshot.project.repository.branch,
          runtime: snapshot.project.runtime,
          attachments: attachments.map((item) => ({ name: item.name, type: item.type })),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        message?: string;
        model?: string;
        chatId?: number | null;
        quota?: Partial<FlowChatQuota>;
      };
      if (payload.quota) setFlowChatQuota(normalizeFlowQuota(payload.quota));
      const content = response.ok && payload.ok && payload.message
        ? payload.message
        : response.status === 429
          ? payload.message || "Voce atingiu o limite diario do Flow. Tente novamente quando a janela renovar."
          : buildFlowChatFallback({ fileTreeLoaded: snapshot.fileTree.length > 0 });
      const assistantMessage: FlowChatMessage = {
        id: createClientId("flow-assistant"),
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
        model: null,
      };
      setFlowChatMessages((current) => [...current, assistantMessage]);
      if (payload.chatId) {
        setFlowChatSessionId(payload.chatId);
        void loadFlowChatHistory();
      }
    } catch {
      setFlowChatMessages((current) => [...current, {
        id: createClientId("flow-fallback"),
        role: "assistant",
        content: buildFlowChatFallback({ fileTreeLoaded: snapshot.fileTree.length > 0 }),
        createdAt: new Date().toISOString(),
        model: null,
      }]);
    } finally {
      setFlowChatBusy(false);
    }
  }

  function openCreateEnvDrawer() {
    setEnvDrawerMode("create");
    setEnvEnvironment("production");
    setEnvRows([createDraftRow()]);
    setEnvDrawerOpen(true);
  }

  function openEditEnvDrawer(item: VpsEnvVar) {
    setEnvMenuId(null);
    setEnvDrawerMode("edit");
    setEnvEnvironment(item.environment);
    setEnvRows([
      createDraftRow({
        key: item.key,
        value: item.sensitive ? "" : item.visible_value || item.value_preview || "",
        note: item.note || "",
        sensitive: item.sensitive !== false,
      }),
    ]);
    setEnvDrawerOpen(true);
  }

  async function saveEnvRows() {
    if (envSaving) return;
    const validRows = envRows
      .map((row) => ({ ...row, key: row.key.trim() }))
      .filter((row) => row.key && row.value);
    if (!validRows.length) {
      notify("error", "Informe chave e valor da variavel.", "Variaveis");
      return;
    }

    const duplicatedKey = validRows.find((row, index) =>
      validRows.findIndex((other) => other.key.toLowerCase() === row.key.toLowerCase()) !== index,
    );
    if (duplicatedKey) {
      notify("error", `Chave duplicada neste envio: ${duplicatedKey.key}.`, "Variaveis");
      return;
    }

    for (const row of validRows) {
      if (!/^[A-Z_][A-Z0-9_]{0,80}$/i.test(row.key)) {
        notify("error", `Chave invalida: ${row.key}.`, "Variaveis");
        return;
      }
    }

    setEnvSaving(true);
    try {
      const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/env`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: envEnvironment,
          variables: validRows.map((row) => ({
            key: row.key,
            value: row.value,
            note: row.note,
            sensitive: row.sensitive,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        message?: string;
        envVar?: VpsEnvVar;
        envVars?: VpsEnvVar[];
      };
      const saved = payload.envVars?.length ? payload.envVars : payload.envVar ? [payload.envVar] : [];
      if (!response.ok || !payload.ok || !saved.length) {
        notify("error", payload.message || "Falha ao salvar variavel.", "Variaveis");
        return;
      }

      setSnapshot((current) => {
        const next = current.envVars.filter((item) =>
          !saved.some((savedItem) => savedItem.id === item.id || (savedItem.key === item.key && savedItem.environment === item.environment)),
        );
        return { ...current, envVars: [...saved, ...next] };
      });
      setEnvDrawerOpen(false);
      notify("success", saved.length > 1 ? "Variaveis salvas e aplicadas." : "Variavel salva e aplicada.", "Variaveis");
    } finally {
      setEnvSaving(false);
    }
  }

  async function deleteEnvVar(item: VpsEnvVar) {
    setEnvMenuId(null);
    const response = await fetch(`/api/auth/me/hosting/vps/${snapshot.project.vpsCode}/env`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, environment: item.environment, key: item.key }),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
    if (!response.ok || !payload.ok) {
      notify("error", payload.message || "Falha ao remover variavel.", "Variaveis");
      return;
    }
    setSnapshot((current) => ({ ...current, envVars: current.envVars.filter((env) => env.id !== item.id) }));
    notify("success", "Variavel removida.", "Variaveis");
  }

  async function copyEnvValue(item: VpsEnvVar) {
    const value = item.sensitive ? item.key : item.visible_value || item.value_preview || "";
    await navigator.clipboard.writeText(value);
    setEnvMenuId(null);
    notify("success", item.sensitive ? "Chave copiada. Valor sensivel permanece protegido." : "Valor copiado.", "Variaveis");
  }

  function importEnvFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseDotEnv(String(reader.result || ""));
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!rows.length) {
        notify("error", "Nao encontrei variaveis validas neste arquivo.", "Variaveis");
        return;
      }
      setEnvRows((current) => {
        const cleanCurrent = current.length === 1 && !current[0].key && !current[0].value ? [] : current;
        return [...cleanCurrent, ...rows];
      });
      notify("success", `${rows.length} variaveis importadas para revisao.`, "Variaveis");
    };
    reader.readAsText(file);
  }

  async function pasteEnvFromClipboard() {
    try {
      const text = await navigator.clipboard?.readText();
      const rows = parseDotEnv(text || "");
      if (!rows.length) {
        notify("error", "Clipboard nao contem variaveis .env validas.", "Variaveis");
        return;
      }
      setEnvRows((current) => [...current.filter((item) => item.key.trim() || item.value.trim()), ...rows]);
      notify("success", `${rows.length} variaveis coladas para revisao.`, "Variaveis");
    } catch {
      notify("error", "Nao consegui ler o clipboard.", "Variaveis");
    }
  }

  function updateEnvKey(rowId: string, value: string) {
    if (value.includes("=") && (value.includes("\n") || value.includes("\\n"))) {
      const rows = parseDotEnv(value.replace(/\\n/g, "\n"));
      if (rows.length) {
        setEnvRows((current) => current.flatMap((item) => item.id === rowId ? rows : [item]));
        notify("success", `${rows.length} variaveis importadas para revisao.`, "Variaveis");
        return;
      }
    }
    setEnvRows((current) => current.map((item) => item.id === rowId ? { ...item, key: value } : item));
  }

  const tabs: Array<{ id: TabId; label: string; icon: ReactNode }> = [
    { id: "overview", label: "Overview", icon: <Activity className="h-[15px] w-[15px]" /> },
    { id: "metrics", label: "Metricas", icon: <Cpu className="h-[15px] w-[15px]" /> },
    { id: "console", label: "Console", icon: <Terminal className="h-[15px] w-[15px]" /> },
    { id: "files", label: "Arquivos", icon: <Folder className="h-[15px] w-[15px]" /> },
    ...(supportsMinecraftAddons
      ? [
        { id: "library" as const, label: "Biblioteca", icon: <Puzzle className="h-[15px] w-[15px]" /> },
        { id: "installed" as const, label: "Instalados", icon: <Package className="h-[15px] w-[15px]" /> },
      ]
      : []),
    { id: "domains", label: "Domains", icon: <Globe2 className="h-[15px] w-[15px]" /> },
    ...(isMinecraftProject
      ? []
      : [
        { id: "deploys" as const, label: "Deploys", icon: <GitBranch className="h-[15px] w-[15px]" /> },
        { id: "env" as const, label: "Env", icon: <KeyRound className="h-[15px] w-[15px]" /> },
      ]),
    { id: "settings", label: "Configurações", icon: <Cog className="h-[15px] w-[15px]" /> },
  ];

  const normalizedSidebarSearch = normalizeSearchText(sidebarSearchText);
  const filteredSidebarTabs = tabs.filter((item) =>
    !normalizedSidebarSearch ||
    normalizeSearchText(`${item.label} ${item.id}`).includes(normalizedSidebarSearch),
  );
  const actionItems: Array<{ id: "start" | "restart" | "stop" | "sync"; label: string; icon: typeof Play }> = [
    { id: "start", label: isMinecraftProject ? "Iniciar servidor" : "Iniciar VPS", icon: Play },
    { id: "restart", label: isMinecraftProject ? "Reiniciar servidor" : "Reiniciar VPS", icon: RotateCcw },
    { id: "stop", label: isMinecraftProject ? "Parar servidor" : "Parar VPS", icon: Power },
    { id: "sync", label: "Verificar status", icon: RefreshCw },
  ];
  const filteredActionItems = actionItems.filter((item) =>
    !normalizedSidebarSearch ||
    normalizeSearchText(`${item.label} ${item.id}`).includes(normalizedSidebarSearch),
  );
  const showSidebarEmptyState = Boolean(normalizedSidebarSearch && !filteredSidebarTabs.length && !filteredActionItems.length && !normalizeSearchText("Dashboard voltar hospedagem").includes(normalizedSidebarSearch));
  const minecraftAddonTabType = supportsMinecraftAddons ? minecraftAddonKind as "mods" | "plugins" : null;
  const minecraftAddonList = minecraftAddonTabType === "mods" ? minecraftMods : minecraftAddonTabType === "plugins" ? minecraftPlugins : [];
  const minecraftAddonLimit = minecraftAddonTabType === "mods"
    ? snapshot.project.minecraft?.limits?.maxMods
    : minecraftAddonTabType === "plugins"
      ? snapshot.project.minecraft?.limits?.maxPlugins
      : null;

  const filteredTree = useMemo(() => {
    if (!fileQuery.trim()) return snapshot.fileTree;
    const query = fileQuery.trim().toLowerCase();
    const filterNode = (node: VpsFileNode): VpsFileNode | null => {
      const children = (node.children || []).map(filterNode).filter((item): item is VpsFileNode => Boolean(item));
      if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query) || children.length) {
        return { ...node, children };
      }
      return null;
    };
    return snapshot.fileTree.map(filterNode).filter((item): item is VpsFileNode => Boolean(item));
  }, [fileQuery, snapshot.fileTree]);

  if (snapshot.project.status === "provisioning" || snapshot.project.status === "pending_provision" || snapshot.project.status === "pending_payment") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] p-6 font-sans">
        <div className="w-full max-w-[500px] rounded-[24px] border border-[#171717] bg-[#0A0A0A] p-[38px] text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <span className="mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-[20px] border border-[#202020] bg-[#111111] text-white">
            <Rocket className="h-[28px] w-[28px]" />
          </span>
          <h2 className="mt-[24px] text-[24px] font-semibold tracking-[-0.04em] text-white">
            Preparando sua VPS...
          </h2>
          <p className="mt-[12px] text-[14px] leading-[1.6] text-[#8E8E8E]">
            Estamos alocando os recursos na regiao escolhida, configurando seu ambiente isolado e integrando o GitHub.
            <br /><br />
            Volte aqui em cerca de <strong className="text-white">3 minutos</strong>. Voce tambem sera avisado por e-mail assim que a maquina estiver online e pronta para uso.
          </p>
          <div className="mt-[36px] flex flex-col items-center justify-center gap-[14px]">
            <Loader2 className="h-[24px] w-[24px] animate-spin text-[#0F62FE]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#555555]">
              Provisionando infraestrutura
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flowdesk-vps-ui min-h-screen bg-[#050505] text-[#F1F1F1]">
      <div className="flex h-screen min-h-screen overflow-hidden">
        <aside className="hidden h-screen w-[318px] shrink-0 lg:block">
          <div className={`${vpsSidebarShellClass} h-full rounded-none border-y-0 border-l-0 border-r-[#151515]`}>
            <div className="flex h-full flex-col px-[14px] py-[14px]">
              <div className="flex w-full items-center justify-between gap-[12px] rounded-[18px] border border-[#111111] bg-[#080808] px-[10px] py-[10px] text-left">
                <div className="flex min-w-0 items-center gap-[10px]">
                  <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_32%_28%,#4B8DFF_0%,#0F62FE_58%,#06204E_100%)] shadow-[0_0_30px_rgba(15,98,254,0.20)]">
                    <Server className="h-[17px] w-[17px] text-white" strokeWidth={2.1} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium leading-none tracking-[-0.03em] text-[#E5E5E5]" title={`${snapshot.project.planName} - ${snapshot.project.repository.name}`}>
                      {snapshot.project.repository.name}
                    </p>
                    <p className="mt-[5px] truncate text-[12px] leading-none text-[#6D6D6D]" title={snapshot.project.planName}>
                      {snapshot.project.planName} - {snapshot.project.kindLabel}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex h-[28px] min-w-[28px] items-center justify-center rounded-[10px] border px-[8px] text-[10px] font-bold uppercase tracking-[0.1em] ${statusClasses(snapshot.project.runtimeStatus)}`} title={statusLabel(snapshot.project.runtimeStatus)}>
                  <span className="h-[7px] w-[7px] rounded-full bg-current" />
                </span>
              </div>

              <div className="mt-[10px] rounded-[16px] border border-[#111111] bg-[#070707] px-[12px] py-[10px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#555555]">Codigo da VPS</p>
                <p className="mt-[6px] truncate font-mono text-[11px] font-semibold text-[#DADADA]" title={snapshot.project.vpsCode}>{snapshot.project.vpsCode}</p>
              </div>

              <div className="mt-[14px] flex items-center gap-[10px] rounded-[16px] border border-[#141414] bg-[#080808] px-[14px] py-[12px]">
                <Search className="h-[18px] w-[18px] shrink-0 text-[#6F6F6F]" strokeWidth={1.85} aria-hidden="true" />
                <input
                  type="text"
                  value={sidebarSearchText}
                  onChange={(event) => setSidebarSearchText(event.currentTarget.value)}
                  placeholder="Buscar..."
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-[#D5D5D5] outline-none placeholder:text-[#5A5A5A]"
                />
                <SidebarSearchShortcutIcon />
              </div>

              <div className="mt-[14px] min-h-0 flex-1 overflow-y-auto pr-[2px] thin-scrollbar">
                <div className="space-y-[4px]">
                  {(!normalizedSidebarSearch || normalizeSearchText("Dashboard voltar hospedagem").includes(normalizedSidebarSearch)) ? (
                    <button
                      type="button"
                      onClick={() => router.push("/dashboard/hosting")}
                      className="group flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[11px] text-left text-[#B5B5B5] transition-all duration-200 hover:bg-[#111111] hover:text-[#E3E3E3]"
                    >
                      <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-[#8A8A8A] group-hover:text-[#DADADA]">
                        <ArrowLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-none tracking-[-0.03em]">
                        Dashboard
                      </span>
                    </button>
                  ) : null}

                  {filteredSidebarTabs.map((item) => {
                    const isActive = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigateToTab(item.id)}
                        className={`group flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[11px] text-left transition-all duration-200 ${isActive
                            ? "bg-[#1E1E1E] text-[#F0F0F0]"
                            : "text-[#B5B5B5] hover:bg-[#111111] hover:text-[#E3E3E3]"
                          }`}
                      >
                        <span className={`inline-flex h-[22px] w-[22px] items-center justify-center ${isActive ? "text-[#F0F0F0]" : "text-[#8A8A8A] group-hover:text-[#DADADA]"}`}>
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-none tracking-[-0.03em]">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {filteredActionItems.length ? (
                  <div className="mt-[12px] border-t border-[#121212] pt-[12px]">
                    <p className="mb-[6px] px-[12px] text-[10px] font-bold uppercase tracking-[0.16em] text-[#555555]">Acoes</p>
                    <div className="space-y-[4px]">
                      {filteredActionItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() => void runAction(item.id)}
                            className="group flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[11px] text-left text-[#B5B5B5] transition-all duration-200 hover:bg-[#111111] hover:text-[#E3E3E3] disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-[#8A8A8A] group-hover:text-[#DADADA]">
                              {busyAction === item.id ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-none tracking-[-0.03em]">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {showSidebarEmptyState ? (
                  <div className="mt-[14px] rounded-[16px] border border-[#141414] bg-[#080808] px-[14px] py-[14px]">
                    <p className="text-[13px] leading-[1.55] text-[#6F6F6F]">
                      Nenhum item encontrado para essa pesquisa.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-auto shrink-0 pt-[14px]">
                <div className="px-[2px]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#555555]">Repositorio</p>
                  <p className="mt-[6px] truncate font-mono text-[12px] font-semibold text-[#DADADA]" title={snapshot.project.repository.fullName}>{snapshot.project.repository.fullName}</p>
                  <p className="mt-[4px] truncate text-[12px] text-[#777777]" title={runtimeHealth?.regionLabel || snapshot.project.regionLabel}>
                    {runtimeHealth?.regionLabel || snapshot.project.regionLabel}{runtimeHealth?.latencyMs ? ` - ${runtimeHealth.latencyMs}ms` : ""}
                  </p>
                </div>
                <div className="mt-[14px] border-t border-[#151515] pt-[14px]">
                  <div ref={profileMenuRef} className="relative">
                    {isProfileMenuOpen ? (
                      <div className="absolute inset-x-0 bottom-[calc(100%+10px)] z-[140] overflow-hidden rounded-[22px] border border-[#151515] bg-[#070707] p-[12px] shadow-[0_26px_80px_rgba(0,0,0,0.54)]">
                        <div className="space-y-[8px]">
                          <button
                            type="button"
                            onClick={() => window.location.assign(buildDiscordAuthStartHref("/dashboard/hosting"))}
                            className="flex w-full items-center gap-[12px] rounded-[16px] border border-[#171717] bg-[#0D0D0D] px-[12px] py-[12px] text-left text-[#D8D8D8] transition-colors hover:border-[#222222] hover:bg-[#111111]"
                          >
                            <span className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[11px] border border-[#1A1A1A] bg-[#101010] text-[#CFCFCF]">
                              <Plus className="h-[18px] w-[18px]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-medium leading-none tracking-[-0.03em]">Adicionar outra conta</span>
                              <span className="mt-[6px] block truncate text-[11px] leading-none text-[#686868]">Ate 3 contas salvas neste navegador</span>
                            </span>
                          </button>

                          <div className="border-t border-[#121212] pt-[12px]">
                            <p className="px-[4px] text-[11px] uppercase tracking-[0.16em] text-[#5F5F5F]">Contas salvas</p>
                            <div className="mt-[10px] space-y-[6px]">
                              {savedAccounts.map((account) => {
                                const isCurrent = resolveSavedAccountKey(account) === resolveSavedAccountKey(currentAccount);
                                return (
                                  <button
                                    key={resolveSavedAccountKey(account)}
                                    type="button"
                                    onClick={() => handleSwitchSavedAccount(account)}
                                    className={`flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[11px] text-left transition-colors ${isCurrent ? "bg-[#141414] text-[#ECECEC]" : "text-[#A7A7A7] hover:bg-[#111111] hover:text-[#E6E6E6]"
                                      }`}
                                  >
                                    <AccountAvatar avatarUrl={account.avatarUrl} displayName={account.displayName} username={account.username} className="h-[36px] w-[36px] shrink-0" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[14px] font-medium leading-none tracking-[-0.03em]">{account.displayName}</span>
                                      <span className="mt-[6px] block truncate text-[11px] leading-none text-[#666666]">@{account.username}</span>
                                    </span>
                                    {isCurrent ? (
                                      <span className="inline-flex rounded-full border border-[rgba(0,98,255,0.28)] bg-[rgba(0,98,255,0.1)] px-[8px] py-[5px] text-[10px] font-medium leading-none text-[#8AB6FF]">ativa</span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="border-t border-[#121212] pt-[12px]">
                            <div className="space-y-[4px]">
                              <button type="button" onClick={() => router.push("/account")} className="flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[11px] text-left text-[#B7B7B7] transition-colors hover:bg-[#111111] hover:text-[#ECECEC]">
                                <UserRound className="h-[18px] w-[18px]" />
                                <span className="text-[14px] font-medium leading-none">Minha conta</span>
                              </button>
                              <button type="button" onClick={() => router.push("/account/status")} className="flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[11px] text-left text-[#B7B7B7] transition-colors hover:bg-[#111111] hover:text-[#ECECEC]">
                                <Cog className="h-[18px] w-[18px]" />
                                <span className="text-[14px] font-medium leading-none">Configuracoes</span>
                              </button>
                              <button type="button" onClick={() => window.open(OFFICIAL_DISCORD_INVITE_URL, "_blank", "noopener,noreferrer")} className="flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[11px] text-left text-[#B7B7B7] transition-colors hover:bg-[#111111] hover:text-[#ECECEC]">
                                <CircleHelp className="h-[18px] w-[18px]" />
                                <span className="text-[14px] font-medium leading-none">Ajuda</span>
                              </button>
                              <button type="button" onClick={() => void handleLogout()} disabled={isLoggingOut} className="flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[11px] text-left text-[#DB9E9E] transition-colors hover:bg-[#111111] hover:text-[#F1C0C0] disabled:cursor-not-allowed disabled:opacity-70">
                                {isLoggingOut ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <LogOut className="h-[18px] w-[18px]" />}
                                <span className="text-[14px] font-medium leading-none">Sair</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setIsProfileMenuOpen((current) => !current)}
                      className="flex w-full items-center justify-between gap-[12px] rounded-[18px] border border-[#111111] bg-[#080808] px-[10px] py-[10px] text-left transition-colors hover:border-[#1A1A1A] hover:bg-[#0B0B0B]"
                      aria-expanded={isProfileMenuOpen}
                      aria-haspopup="menu"
                    >
                      <div className="flex min-w-0 items-center gap-[10px]">
                        <AccountAvatar avatarUrl={currentAccount.avatarUrl} displayName={currentAccount.displayName} username={currentAccount.username} className="h-[38px] w-[38px] shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-medium leading-none tracking-[-0.03em] text-[#E5E5E5]">{currentAccount.displayName}</p>
                          <p className="mt-[5px] truncate text-[12px] leading-none text-[#686868]">@{currentAccount.username}</p>
                        </div>
                      </div>
                      <span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[10px] text-[#7E7E7E] transition-colors hover:bg-[#101010] hover:text-[#D8D8D8]">
                        <ChevronDown className={`h-[14px] w-[14px] shrink-0 transition-transform ${isProfileMenuOpen ? "rotate-180" : ""}`} strokeWidth={1.9} />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-[64px] items-center justify-between gap-[12px] border-b border-[#171717] bg-[#080808] px-[14px] lg:px-[22px]">
            <div className="min-w-0">
              <div className="flex items-center gap-[8px] lg:hidden">
                <Server className="h-[17px] w-[17px] text-[#0F62FE]" />
                <span className="truncate text-[13px] font-semibold text-white">{snapshot.project.repository.name}</span>
              </div>
              <p className="hidden truncate text-[14px] font-semibold text-white lg:block">
                {tabs.find((item) => item.id === tab)?.label || "VPS"} / {snapshot.project.repository.name}
              </p>
              <p className="mt-[3px] hidden truncate font-mono text-[11px] text-[#777777] lg:block">{snapshot.project.vpsCode}</p>
            </div>
            <div className="flex items-center gap-[8px]">
              <span className={`hidden items-center gap-[7px] rounded-full border px-[9px] py-[5px] text-[11px] font-bold uppercase tracking-[0.12em] sm:inline-flex ${statusClasses(snapshot.project.runtimeStatus)}`}>
                <span className="h-[6px] w-[6px] rounded-full bg-current" />
                {statusLabel(snapshot.project.runtimeStatus)}
              </span>
              <div className="flex gap-[6px] lg:hidden">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateToTab(item.id)}
                    className={`flex h-[34px] w-[34px] items-center justify-center rounded-[10px] ${tab === item.id ? "bg-[#0F62FE] text-white" : "bg-[#101010] text-[#9B9B9B]"
                      }`}
                    aria-label={item.label}
                  >
                    {item.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={tab === "files" ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-auto p-[18px] lg:p-[24px]"}>
            {shouldShowTabSkeleton ? (
              <div className={centeredMainTabs ? "mx-auto w-full max-w-[1180px]" : ""}>
                <TabMainSkeleton tab={tab} />
              </div>
            ) : (
              <div className={centeredMainTabs ? "mx-auto w-full max-w-[1180px]" : ""}>

                {tab === "overview" && isMinecraftProject && snapshot.project.minecraft ? (
                  <section className="grid gap-[20px]">
                    <div className="grid gap-[12px] md:grid-cols-3 xl:grid-cols-6">
                      {[
                        ["CPU", formatMetricNumber(metricSummary.cpu, "%"), metricSummary.cpu, "bg-[#8AE6FF]"],
                        ["RAM", formatMetricNumber(metricSummary.ram, "%"), metricSummary.ram, "bg-[#66E89A]"],
                        ["Disco", formatMetricNumber(metricSummary.disk, "%"), metricSummary.disk, "bg-[#FFB84D]"],
                        ["Uptime", formatUptime(metricSummary.uptime), metricSummary.uptime ? 100 : 0, "bg-[#8A9BFF]"],
                        ["Jogadores", `0/${minecraftMaxPlayers}`, 0, "bg-[#8AE6FF]"],
                        ["Status", statusLabel(snapshot.project.runtimeStatus), snapshot.project.runtimeStatus === "online" ? 100 : 0, "bg-[#66E89A]"],
                      ].map(([label, value, progress, color]) => (
                        <div key={String(label)} className="rounded-[16px] border border-[#171717] bg-[#080808] px-[14px] py-[13px] text-center">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A8A8A]">{label}</p>
                          <p className="mt-[5px] text-[24px] font-bold tracking-[-0.04em] text-white">{String(value)}</p>
                          <div className="mt-[10px] h-[4px] overflow-hidden rounded-full bg-[#171717]">
                            <div className={`h-full rounded-full ${String(color)}`} style={{ width: `${Math.min(100, Number(progress) || 0)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-[20px] xl:grid-cols-[380px_minmax(0,1fr)]">
                      <aside className="space-y-[18px]">
                        <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[20px]">
                          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8A8A8A]">Server</p>
                          <div className="mt-[16px] flex items-center gap-[14px]">
                            <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[14px] border border-[#242424] bg-[#0B0B0B]">
                              <Layers className="h-[27px] w-[27px] text-white" />
                            </div>
                            <div className="min-w-0">
                              <h2 className="truncate text-[21px] font-bold tracking-[-0.04em] text-white">{snapshot.project.minecraft.serverName}</h2>
                              <p className="mt-[3px] text-[12px] text-[#8A8A8A]">{snapshot.project.minecraft.version} / {snapshot.project.minecraft.serverType}</p>
                            </div>
                          </div>
                          <div className="mt-[18px] divide-y divide-[#151515]">
                            {[
                              ["Server Name", snapshot.project.minecraft.serverName],
                              ["Players", `0/${minecraftMaxPlayers} online`],
                              ["IP Address", snapshot.project.minecraft.primaryDomain],
                              ["Gamemode", "survival"],
                              ["Difficulty", "normal"],
                            ].map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between gap-[14px] py-[11px] text-[13px]">
                                <span className="text-[#9AA3AF]">{label}</span>
                                <span className="truncate text-right font-semibold text-white">{value}</span>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[20px]">
                          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8A8A8A]">Quick Tasks</p>
                          <div className="mt-[14px] grid grid-cols-6 gap-[10px]">
                            {[
                              ["start", "Iniciar", Play],
                              ["stop", "Parar", Power],
                              ["restart", "Reiniciar", RotateCcw],
                              ["kill", "Forcar Kill", X],
                              ["reset-world", "Resetar Mundo", Trash2],
                              ["settings", "Configuracoes", Cog],
                            ].map(([action, label, Icon]) => (
                              <button
                                key={String(action)}
                                type="button"
                                onClick={() => action === "settings" ? navigateToTab("settings") : void runAction(action as "start" | "stop" | "restart" | "kill" | "reset-world")}
                                disabled={Boolean(busyAction) && action !== "settings"}
                                className="flex h-[46px] items-center justify-center rounded-[12px] border border-[#242424] bg-[#0B0B0B] text-[#DADADA] transition-colors hover:bg-[#111111] hover:text-white disabled:opacity-50"
                                title={String(label)}
                              >
                                <Icon className="h-[18px] w-[18px]" />
                              </button>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[20px]">
                          <div className="flex items-center justify-between gap-[12px]">
                            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8A8A8A]">Active Players</p>
                            <span className="text-[13px] font-semibold text-[#DADADA]">0/{minecraftMaxPlayers}</span>
                          </div>
                          <div className="flex min-h-[92px] items-center justify-center text-[13px] text-[#666666]">Nenhum jogador online</div>
                        </section>
                      </aside>

                      <main className="space-y-[20px]">
                        <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[20px]">
                          <div className="flex items-center justify-between gap-[12px]">
                            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8A8A8A]">Console <span className="ml-[6px] rounded-full bg-[#451111] px-[7px] py-[2px] text-[10px] text-[#FFB3B3]">{errorConsoleCount} errors</span></p>
                            <div className="flex gap-[8px]">
                              <button onClick={() => void clearConsoleLogs()} className="h-[30px] rounded-[9px] border border-[#242424] bg-[#0B0B0B] px-[10px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111]">Limpar</button>
                              <button onClick={refreshConsoleLogs} className="h-[30px] rounded-[9px] border border-[#242424] bg-[#0B0B0B] px-[10px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111]">Auto ↓</button>
                            </div>
                          </div>
                          <div ref={consoleRef} className="mt-[12px] h-[490px] overflow-auto rounded-[14px] border border-[#171717] bg-black p-[14px] font-mono text-[12px] leading-[1.7] text-white [scrollbar-color:#2A2A2A_#050505] [scrollbar-width:thin]">
                            {visibleConsoleEntries.length ? visibleConsoleEntries.slice(-90).map((entry) => (
                              <div key={entry.key} className={entry.message.includes("[STDERR]") || entry.level === "error" ? "text-[#FFD28A]" : "text-[#F5F5F5]"}>
                                <span className="mr-[8px] text-[#555555]">{formatConsoleClock(entry.time)}</span>
                                <span>{entry.message}</span>
                              </div>
                            )) : (
                              <div className="flex h-full items-center justify-center text-[#666666]">Nenhum log do servidor ainda.</div>
                            )}
                          </div>
                          <div className="mt-[12px] flex gap-[10px]">
                            <input
                              value={minecraftCommand}
                              onChange={(event) => setMinecraftCommand(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void sendMinecraftConsoleCommand();
                              }}
                              placeholder="Enter a command..."
                              className="h-[40px] min-w-0 flex-1 rounded-[12px] border border-[#242424] bg-[#050505] px-[13px] font-mono text-[13px] text-white outline-none placeholder:text-[#555555]"
                            />
                            <button onClick={() => void sendMinecraftConsoleCommand()} className="h-[40px] rounded-[12px] bg-[#F2F2F2] px-[20px] text-[13px] font-semibold text-[#050505] hover:bg-white">Enviar</button>
                          </div>
                        </section>

                        <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[20px]">
                          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8A8A8A]">Usage</p>
                          <div className="mt-[12px] h-[220px] rounded-[14px] border border-[#151515] bg-[#050505] p-[10px]">
                            <LazyVpsMetricsChart metrics={snapshot.metrics} variant="compact" className="h-[198px]" />
                          </div>
                        </section>
                      </main>
                    </div>
                  </section>
                ) : null}

                {tab === "overview" && !isMinecraftProject ? (
                  <section className="grid gap-[14px]">
                    <div className="overflow-hidden rounded-[24px] border border-[#171717] bg-[#070707]">
                      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px]">
                        <div className="p-[18px] lg:p-[22px]">
                          <div className="flex flex-wrap items-start justify-between gap-[14px]">
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#606060]">VPS control plane</p>
                              <h2 className="mt-[8px] truncate text-[30px] font-semibold tracking-[-0.055em] text-white" title={snapshot.settings.hostName}>
                                {snapshot.settings.hostName}
                              </h2>
                              <div className="mt-[9px] flex flex-wrap items-center gap-[8px] text-[12px] text-[#8A8A8A]">
                                <span className={`inline-flex items-center gap-[7px] rounded-full border px-[9px] py-[5px] text-[11px] font-bold uppercase tracking-[0.12em] ${statusClasses(snapshot.project.runtimeStatus)}`}>
                                  <span className="h-[6px] w-[6px] rounded-full bg-current" />
                                  {statusLabel(snapshot.project.runtimeStatus)}
                                </span>
                                <span className="font-mono">{primaryDomain?.hostname || snapshot.project.vpsCode}</span>
                                <span className="text-[#3A3A3A]">/</span>
                                <span>{snapshot.project.planName}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void runAction("sync")}
                              disabled={Boolean(busyAction)}
                              className="inline-flex h-[38px] items-center gap-[8px] rounded-[11px] border border-[#202020] bg-[#0B0B0B] px-[12px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyAction === "sync" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <RefreshCw className="h-[14px] w-[14px]" />}
                              Verificar
                            </button>
                          </div>

                          <div className="mt-[20px] grid gap-[10px] md:grid-cols-2 xl:grid-cols-4">
                            {([
                              ["CPU", formatMetricNumber(metricSummary.cpu, "%"), metricSummary.cpu, Cpu],
                              ["RAM", formatMetricNumber(metricSummary.ram, "%"), metricSummary.ram, Database],
                              ["Disco", formatMetricNumber(metricSummary.disk, "%"), metricSummary.disk, HardDrive],
                              ["Uptime", formatUptime(metricSummary.uptime), Math.min(100, metricSummary.uptime ? 100 : 0), Wifi],
                            ] as Array<[string, string, number, typeof Cpu]>).map(([label, value, width, Icon]) => (
                              <div key={String(label)} className="rounded-[16px] border border-[#151515] bg-[#0B0B0B] p-[12px]">
                                <div className="flex items-center justify-between gap-[10px]">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#555555]">{String(label)}</p>
                                  <Icon className="h-[15px] w-[15px] text-[#8AB6FF]" />
                                </div>
                                <p className="mt-[8px] text-[20px] font-semibold tracking-[-0.035em] text-white">{String(value)}</p>
                                <div className="mt-[10px] h-[4px] overflow-hidden rounded-full bg-[#151515]">
                                  <div className="h-full rounded-full bg-[#0F62FE]" style={{ width: `${Math.min(100, Number(width) || 0)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-[14px] h-[320px] rounded-[18px] border border-[#151515] bg-[#050505] p-[12px]">
                            <div className="mb-[10px] flex items-center justify-between gap-[12px]">
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#606060]">Janela de recursos</p>
                                <p className="mt-[4px] text-[12px] text-[#777777]">{metricsWindowLabel}</p>
                              </div>
                              <span className="rounded-full border border-[#1F2F48] bg-[#07111F] px-[9px] py-[5px] text-[11px] font-semibold text-[#9BC2FF]">
                                {snapshot.metrics.length} amostras
                              </span>
                            </div>
                            <LazyVpsMetricsChart
                              metrics={snapshot.metrics}
                              variant="compact"
                              className="h-[248px]"
                            />
                          </div>
                        </div>

                        <aside className="border-t border-[#171717] bg-[#080808] p-[18px] xl:border-l xl:border-t-0">
                          <div className="rounded-[18px] border border-[#171717] bg-[#0B0B0B] p-[14px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#606060]">Localizacao real</p>
                            <p className="mt-[8px] text-[15px] font-semibold text-white">{runtimeHealth?.regionLabel || snapshot.project.regionLabel}</p>
                            <div className="mt-[10px] grid grid-cols-2 gap-[8px] text-[12px]">
                              <div className="rounded-[12px] border border-[#151515] bg-[#060606] p-[10px]">
                                <p className="text-[#666666]">Fonte</p>
                                <p className="mt-[5px] font-semibold text-[#DADADA]">{healthStatusLabel(runtimeHealth)}</p>
                              </div>
                              <div className="rounded-[12px] border border-[#151515] bg-[#060606] p-[10px]">
                                <p className="text-[#666666]">Latencia</p>
                                <p className="mt-[5px] font-mono font-semibold text-[#DADADA]">{runtimeHealth?.latencyMs ? `${runtimeHealth.latencyMs}ms` : "n/d"}</p>
                              </div>
                            </div>
                            <p className="mt-[10px] truncate text-[11px] text-[#777777]" title={runtimeHealth?.checkedAt || snapshot.project.runtimeLastSeenAt || ""}>
                              Atualizado {formatRelative(runtimeHealth?.checkedAt || snapshot.project.runtimeLastSeenAt)}
                            </p>
                          </div>

                          <div className="mt-[12px] rounded-[18px] border border-[#171717] bg-[#0B0B0B] p-[14px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#606060]">Deploy atual</p>
                            <p className="mt-[8px] line-clamp-2 text-[15px] font-semibold leading-[1.35] text-white">{latestDeployment?.commit_message || "Aguardando primeiro deploy automatico"}</p>
                            <div className="mt-[12px] space-y-[8px] text-[12px]">
                              {[
                                ["Ready", `${readyDeploymentCount}/${snapshot.deployments.length || 0}`],
                                ["Falhas", String(failedDeploymentCount)],
                                ["Branch", latestDeployment?.branch || snapshot.project.repository.branch],
                                ["Commit", latestDeployment?.commit_sha ? latestDeployment.commit_sha.slice(0, 8) : "pendente"],
                              ].map(([label, value]) => (
                                <div key={label} className="flex items-center justify-between gap-[12px]">
                                  <span className="text-[#777777]">{label}</span>
                                  <span className="truncate font-mono font-semibold text-[#DADADA]">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="mt-[12px] rounded-[18px] border border-[#171717] bg-[#0B0B0B] p-[14px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#606060]">Sinais operacionais</p>
                            <div className="mt-[12px] grid gap-[8px]">
                              {[
                                ["Console", errorConsoleCount ? `${errorConsoleCount} erro(s)` : "Sem erro recente", errorConsoleCount ? "text-[#FFD28A]" : "text-[#9BE7AC]"],
                                ["Env", `${snapshot.envVars.length} variaveis protegidas`, "text-[#DADADA]"],
                                ["Firewall", `${snapshot.settings.firewall.length} regra(s)`, "text-[#DADADA]"],
                              ].map(([label, value, className]) => (
                                <div key={label} className="flex items-center justify-between gap-[12px] rounded-[12px] border border-[#151515] bg-[#060606] px-[10px] py-[9px] text-[12px]">
                                  <span className="text-[#777777]">{label}</span>
                                  <span className={`truncate font-semibold ${className}`}>{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </aside>
                      </div>
                    </div>
                  </section>
                ) : null}

                {tab === "metrics" ? (
                  <section className="grid gap-[14px]">
                    <div className="overflow-hidden rounded-[24px] border border-[#171717] bg-[#070707]">
                      <div className="flex flex-col gap-[16px] border-b border-[#171717] p-[18px] lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#606060]">Observabilidade</p>
                          <h2 className="mt-[8px] text-[26px] font-semibold tracking-[-0.055em] text-white">Metricas da VPS</h2>
                          <p className="mt-[8px] max-w-[760px] text-[13px] leading-[1.6] text-[#8A8A8A]">
                            Serie das ultimas {snapshot.metrics.length || 0} amostras com horario, consumo de sistema, rede e processo da aplicacao.
                          </p>
                        </div>
                        <div className="grid min-w-[280px] grid-cols-2 gap-[8px]">
                          {[
                            ["Agente", healthStatusLabel(runtimeHealth)],
                            ["Latency", runtimeHealth?.latencyMs ? `${runtimeHealth.latencyMs}ms` : "n/d"],
                            ["Download", formatMetricNumber(metricSummary.rx, "kb/s")],
                            ["Upload", formatMetricNumber(metricSummary.tx, "kb/s")],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-[14px] border border-[#151515] bg-[#0B0B0B] p-[10px]">
                              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#555555]">{label}</p>
                              <p className="mt-[6px] truncate text-[13px] font-semibold text-[#E7E7E7]">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="min-h-[540px] p-[14px] lg:p-[18px]">
                          <div className="h-[500px] rounded-[18px] border border-[#151515] bg-[#050505] p-[12px]">
                            <LazyVpsMetricsChart metrics={snapshot.metrics} />
                          </div>
                        </div>

                        <aside className="border-t border-[#171717] p-[14px] xl:border-l xl:border-t-0">
                          <div className="space-y-[10px]">
                            {([
                              ["CPU", "cpu_percent", "%", Cpu, "Processador da maquina"],
                              ["RAM", "ram_percent", "%", Database, "Memoria do host"],
                              ["Disco", "disk_percent", "%", HardDrive, "Volume provisionado"],
                              ["App CPU", "app_cpu_percent", "%", Activity, "Processo principal"],
                              ["App RAM", "app_ram_mb", "MB", Bot, "Memoria do app"],
                              ["Processos", "process_count", "", Layers, "Processos ativos"],
                            ] as Array<[string, keyof VpsMetric, string, typeof Cpu, string]>).map(([label, key, suffix, Icon, description]) => {
                              const values = snapshot.metrics.map((item) => metricValue(item, key));
                              const current = values[values.length - 1] || 0;
                              const peak = Math.max(0, ...values);
                              const average = metricAverage(values);
                              const trend = metricTrend(values);
                              const barWidth = suffix === "%" ? current : peak ? (current / peak) * 100 : 0;
                              return (
                                <article key={String(key)} className="rounded-[16px] border border-[#171717] bg-[#0B0B0B] p-[12px]">
                                  <div className="flex items-start justify-between gap-[12px]">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-[8px]">
                                        <Icon className="h-[15px] w-[15px] text-[#9BC2FF]" />
                                        <p className="text-[12px] font-semibold text-white">{label}</p>
                                      </div>
                                      <p className="mt-[4px] truncate text-[11px] text-[#666666]">{description}</p>
                                    </div>
                                    <p className="font-mono text-[16px] font-semibold text-white">{formatMetricNumber(current, suffix)}</p>
                                  </div>
                                  <div className="mt-[10px] h-[4px] overflow-hidden rounded-full bg-[#151515]">
                                    <div className="h-full rounded-full bg-[#0F62FE]" style={{ width: `${Math.min(100, Math.max(0, barWidth))}%` }} />
                                  </div>
                                  <div className="mt-[9px] flex items-center justify-between gap-[10px] text-[10px] text-[#777777]">
                                    <span>Media <b className="font-mono font-semibold text-[#CFCFCF]">{formatMetricNumber(average, suffix)}</b></span>
                                    <span>Pico <b className="font-mono font-semibold text-[#CFCFCF]">{formatMetricNumber(peak, suffix)}</b></span>
                                    <span className={trend > 0 ? "text-[#FFD28A]" : trend < 0 ? "text-[#9BE7AC]" : "text-[#777777]"}>
                                      {trend > 0 ? "+" : ""}{formatMetricNumber(trend, suffix)}
                                    </span>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </aside>
                      </div>
                    </div>
                  </section>
                ) : null}

                {tab === "console" ? (
                  <section className={`grid h-[calc(100vh-136px)] min-h-[620px] w-full overflow-hidden bg-[#050505] ${selectedConsoleEntry ? "xl:grid-cols-[minmax(0,1fr)_352px]" : "xl:grid-cols-1"
                    }`}>
                    <div className="flex min-h-0 min-w-0 flex-col">
                      <div className="flex flex-col gap-[10px] border-b border-[#171717] bg-[#070707] p-[10px] lg:flex-row lg:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-[10px] rounded-[10px] border border-[#1B1B1B] bg-[#030303] px-[12px]">
                          <Search className="h-[15px] w-[15px] text-[#777777]" />
                          <input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder="Search logs..." className="h-[38px] min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-[#555555]" />
                        </div>
                        <div className="flex flex-wrap items-center gap-[8px]">
                          <CustomSelect value={logLevel} onChange={setLogLevel} options={[...LOG_OPTIONS]} className="w-[154px]" />
                          <button onClick={() => setLogsPaused((current) => !current)} className={`inline-flex h-[38px] items-center gap-[8px] rounded-[10px] border px-[12px] text-[12px] font-semibold transition-all ${logsPaused ? "border-[#292929] bg-[#111111] text-[#DADADA]" : "border-[#1E3425] bg-[#07140B] text-[#9BE7AC] shadow-[0_0_22px_rgba(52,168,83,0.08)]"}`}>
                            {logsPaused ? <Pause className="h-[14px] w-[14px]" /> : <span className="h-[7px] w-[7px] rounded-full bg-[#34A853] shadow-[0_0_0_4px_rgba(52,168,83,0.12)]" />}
                            {logsPaused ? "Live desativado" : "Live ativo"}
                          </button>
                          <button onClick={refreshConsoleLogs} disabled={logsRefreshing} className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[#1B1B1B] bg-[#0B0B0B] text-[#DADADA] transition-colors hover:border-[#2A2A2A] disabled:cursor-not-allowed disabled:opacity-60" title="Atualizar logs">
                            <RefreshCw className={`h-[15px] w-[15px] ${logsRefreshing ? "animate-spin" : ""}`} />
                          </button>
                          <button onClick={exportConsoleLogs} className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[#1B1B1B] bg-[#0B0B0B] text-[#DADADA] transition-colors hover:border-[#2A2A2A]" title="Exportar logs">
                            <Upload className="h-[15px] w-[15px]" />
                          </button>
                          <button onClick={() => void clearConsoleLogs()} disabled={logsClearing} className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[#1B1B1B] bg-[#0B0B0B] text-[#DADADA] transition-colors hover:border-[#2A2A2A] disabled:cursor-not-allowed disabled:opacity-60" title="Limpar console">
                            {logsClearing ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Trash2 className="h-[15px] w-[15px]" />}
                          </button>
                        </div>
                      </div>

                      <div className="border-b border-[#151515] bg-[#050505] px-[10px] py-[8px]">
                        <div className="flex flex-wrap items-center gap-[6px]">
                          {CONSOLE_STATUS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => setConsoleStatusFilter(option.value)}
                              className={`inline-flex h-[28px] items-center gap-[6px] rounded-[8px] border px-[9px] text-[11px] font-semibold transition-colors ${consoleStatusFilter === option.value ? "border-[#2C2C2C] bg-[#171717] text-white" : "border-[#171717] bg-[#0A0A0A] text-[#8A8A8A] hover:text-white"
                                }`}
                            >
                              {option.label}
                              <span className="font-mono text-[10px] text-[#5E5E5E]">{consoleStats[option.value as keyof typeof consoleStats]}</span>
                            </button>
                          ))}
                        </div>
                        <div className="mt-[10px] h-[36px] border-t border-[#101010]">
                          <div className="relative h-full">
                            {consoleEntries.length ? consoleEntries.slice(-80).map((entry, index, list) => {
                              const left = list.length <= 1 ? 0 : (index / (list.length - 1)) * 100;
                              const height = entry.family === "5xx" ? 26 : entry.family === "4xx" ? 20 : 14;
                              return (
                                <button
                                  key={`timeline-${entry.key}`}
                                  onClick={() => {
                                    setSelectedConsoleKey(entry.key);
                                    setConsoleStatusFilter(entry.family);
                                  }}
                                  className={`absolute bottom-[2px] w-[4px] rounded-t-[2px] ${entry.family === "5xx" ? "bg-[#FF8E8E]" : entry.family === "4xx" ? "bg-[#FFD28A]" : "bg-[#4A4A4A]"}`}
                                  style={{ left: `${left}%`, height }}
                                  title={`${entry.status} ${entry.path}`}
                                />
                              );
                            }) : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-[104px_1fr_1.4fr_minmax(220px,2fr)] gap-[12px] border-b border-[#171717] bg-[#070707] px-[12px] py-[9px] text-[11px] font-semibold text-[#6A6A6A]">
                        <span>Status</span>
                        <span>Host</span>
                        <span>Request</span>
                        <span>Messages</span>
                      </div>
                      <div ref={consoleRef} className="h-0 min-h-0 flex-1 overflow-x-auto overflow-y-auto bg-[#030303] font-mono text-[12px] [scrollbar-color:#2A2A2A_#050505] [scrollbar-gutter:stable] [scrollbar-width:thin]">
                        {visibleConsoleEntries.length ? visibleConsoleEntries.map((entry) => (
                          <button
                            key={entry.key}
                            onClick={() => setSelectedConsoleKey(entry.key)}
                            className={`grid w-full min-w-[980px] grid-cols-[104px_1fr_1.4fr_minmax(220px,2fr)] gap-[12px] border-b border-[#0D0D0D] px-[12px] py-[7px] text-left transition-colors hover:bg-[#141414] ${selectedConsoleEntry?.key === entry.key ? "bg-[#191919]" : "odd:bg-[#060606] even:bg-[#0A0A0A]"
                              }`}
                          >
                            <span className="flex items-center gap-[7px] whitespace-nowrap">
                              <span className="text-[#7A7A7A]">{formatConsoleClock(entry.time)}</span>
                              <span className={statusClassName(entry.status)}>{entry.status}</span>
                            </span>
                            <span className="truncate font-semibold text-[#EFEFEF]">{entry.host}</span>
                            <span className="flex min-w-0 items-center gap-[7px]">
                              <span className="rounded-[4px] border border-[#2A2A2A] px-[4px] py-[1px] text-[10px] text-[#BDBDBD]">{entry.method}</span>
                              <span className="truncate text-[#F4F4F4]">{entry.path}</span>
                            </span>
                            <span className="truncate text-[#BDBDBD]">{entry.message}</span>
                          </button>
                        )) : (
                          <div className="flex h-full items-center justify-center text-[#666666]">Nenhum log encontrado para os filtros atuais.</div>
                        )}
                      </div>
                    </div>

                    {selectedConsoleEntry ? (
                      <aside className="min-h-0 overflow-auto border-t border-[#171717] bg-[#070707] xl:border-l xl:border-t-0">
                        <div className="p-[14px]">
                          <div className="flex items-start justify-between gap-[10px]">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-[8px]">
                                <span className="rounded-[4px] border border-[#2A2A2A] px-[5px] py-[2px] font-mono text-[10px] text-white">{selectedConsoleEntry.method}</span>
                                <span className="truncate font-mono text-[13px] font-semibold text-white">{selectedConsoleEntry.path}</span>
                                <span className={`font-mono text-[12px] font-bold ${statusClassName(selectedConsoleEntry.status)}`}>{selectedConsoleEntry.status}</span>
                              </div>
                              <p className="mt-[8px] text-[11px] text-[#777777]">Request started</p>
                              <p className="mt-[2px] font-mono text-[11px] text-[#DADADA]">{formatDate(selectedConsoleEntry.time)}</p>
                            </div>
                            <div className="flex items-center gap-[6px]">
                              <button
                                onClick={() => {
                                  const previous = visibleConsoleEntries[Math.max(0, selectedConsoleIndex - 1)];
                                  if (previous) setSelectedConsoleKey(previous.key);
                                }}
                                disabled={selectedConsoleIndex <= 0}
                                className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[#1B1B1B] text-[#AAAAAA] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                title="Evento anterior"
                              >
                                <ChevronDown className="h-[14px] w-[14px] rotate-180" />
                              </button>
                              <button
                                onClick={() => {
                                  const next = visibleConsoleEntries[Math.min(visibleConsoleEntries.length - 1, selectedConsoleIndex + 1)];
                                  if (next) setSelectedConsoleKey(next.key);
                                }}
                                disabled={selectedConsoleIndex < 0 || selectedConsoleIndex >= visibleConsoleEntries.length - 1}
                                className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[#1B1B1B] text-[#AAAAAA] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                title="Proximo evento"
                              >
                                <ChevronDown className="h-[14px] w-[14px]" />
                              </button>
                              <button onClick={() => navigator.clipboard?.writeText(selectedConsoleEntry.requestId)} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[#1B1B1B] text-[#AAAAAA] hover:text-white" title="Copiar request id">
                                <Copy className="h-[14px] w-[14px]" />
                              </button>
                              <button onClick={() => setSelectedConsoleKey(null)} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[#1B1B1B] text-[#AAAAAA] hover:text-white" title="Fechar detalhe">
                                <X className="h-[14px] w-[14px]" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-[14px] rounded-[14px] border border-[#1A1A1A] bg-[#0B0B0B]">
                            {[
                              ["Request ID", selectedConsoleEntry.requestId],
                              ["Path", selectedConsoleEntry.path],
                              ["Host", selectedConsoleEntry.host],
                              ["Level", selectedConsoleEntry.level.toUpperCase()],
                              ["Source", selectedConsoleEntry.source],
                              ["User Agent", selectedConsoleEntry.userAgent],
                            ].map(([label, value]) => (
                              <div key={label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-[10px] border-b border-[#151515] px-[12px] py-[10px] last:border-b-0">
                                <span className="text-[11px] text-[#777777]">{label}</span>
                                <span className="break-words text-right font-mono text-[11px] text-[#DADADA]">{value}</span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-[14px] space-y-[10px]">
                            <article className="rounded-[14px] border border-[#1A1A1A] bg-[#0B0B0B] p-[12px]">
                              <div className="flex items-center justify-between">
                                <p className="text-[13px] font-semibold text-white">Firewall</p>
                                <span className={selectedConsoleEntry.status >= 400 ? "text-[11px] font-semibold text-[#FFD28A]" : "text-[11px] font-semibold text-[#9BE7AC]"}>
                                  {selectedConsoleEntry.status >= 400 ? "Inspecionado" : "Allowed"}
                                </span>
                              </div>
                              <p className="mt-[8px] text-[12px] text-[#777777]">Received in {selectedConsoleEntry.location}</p>
                            </article>
                            <article className="rounded-[14px] border border-[#1A1A1A] bg-[#0B0B0B] p-[12px]">
                              <div className="flex items-center justify-between">
                                <p className="text-[13px] font-semibold text-white">Middleware</p>
                                <span className={`font-mono text-[11px] ${statusClassName(selectedConsoleEntry.status)}`}>{selectedConsoleEntry.status}</span>
                              </div>
                              <div className="mt-[10px] grid gap-[8px] text-[12px]">
                                <div className="flex items-center justify-between text-[#888888]">
                                  <span>Execution Duration</span>
                                  <span className="font-mono text-[#DADADA]">{selectedConsoleEntry.durationMs ?? 0}ms</span>
                                </div>
                                <div className="flex items-center justify-between text-[#888888]">
                                  <span>External APIs</span>
                                  <span className="font-mono text-[#DADADA]">{selectedConsoleEntry.externalApis ? `${selectedConsoleEntry.externalApis} request(s)` : "No outgoing requests"}</span>
                                </div>
                              </div>
                            </article>
                            <article className="rounded-[14px] border border-[#1A1A1A] bg-[#0B0B0B] p-[12px]">
                              <p className="text-[13px] font-semibold text-white">Function Invocation</p>
                              <div className="mt-[10px] grid gap-[8px] text-[12px]">
                                <div className="flex items-center justify-between gap-[12px] text-[#888888]">
                                  <span>Route</span>
                                  <span className="truncate font-mono text-[#DADADA]">{selectedConsoleEntry.path}</span>
                                </div>
                                <div className="rounded-[10px] border border-[#171717] bg-[#050505] p-[10px] font-mono text-[11px] text-[#CFCFCF]">
                                  {selectedConsoleEntry.message}
                                </div>
                              </div>
                            </article>
                          </div>

                          <p className={`mt-[14px] flex items-center gap-[7px] text-[12px] font-semibold ${selectedConsoleEntry.status >= 500 ? "text-[#FF8E8E]" : "text-[#9BE7AC]"}`}>
                            <span className="h-[7px] w-[7px] rounded-full bg-current" />
                            {selectedConsoleEntry.status >= 500 ? "Request failed" : `Response finished in ${selectedConsoleEntry.durationMs ?? 0}ms`}
                          </p>
                        </div>
                      </aside>
                    ) : null}
                  </section>
                ) : null}

                {tab === "files" ? (
                  <section
                    className="grid h-[calc(100vh-64px)] min-h-0 grid-cols-1 bg-[#050505] md:grid-cols-[var(--flowdesk-vps-explorer)_minmax(0,1fr)]"
                    style={{ "--flowdesk-vps-explorer": `${explorerWidth}px` } as CSSProperties}
                  >
                    <aside className="relative min-h-0 border-r border-[#171717] bg-[#080808]">
                      <div className="flex h-[48px] items-center justify-between gap-[10px] border-b border-[#171717] px-[12px]">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-bold uppercase tracking-[0.14em] text-[#E2E2E2]" title={snapshot.project.repository.fullName}>{snapshot.project.repository.fullName}</p>
                          <p className="mt-[2px] text-[10px] text-[#575757]">{explorerWidth}px</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-[3px]">
                          <button type="button" onClick={() => startCreateFile("", "file")} className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-[#AFAFAF] hover:bg-[#111111] hover:text-white" title="Novo arquivo">
                            <FilePlus2 className="h-[15px] w-[15px]" />
                          </button>
                          <button type="button" onClick={() => startCreateFile("", "directory")} className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-[#AFAFAF] hover:bg-[#111111] hover:text-white" title="Nova pasta">
                            <FolderPlus className="h-[15px] w-[15px]" />
                          </button>
                          <button type="button" onClick={() => void syncFiles()} disabled={filesBusy} className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-[#AFAFAF] hover:bg-[#111111] hover:text-white disabled:opacity-50" title="Atualizar">
                            {filesBusy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <RefreshCw className="h-[15px] w-[15px]" />}
                          </button>
                          <button type="button" onClick={() => setExpandedFilePaths(new Set())} className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-[#AFAFAF] hover:bg-[#111111] hover:text-white" title="Recolher tudo">
                            <Layers className="h-[15px] w-[15px]" />
                          </button>
                        </div>
                      </div>
                      <div className="m-[10px] flex items-center gap-[8px] rounded-[10px] border border-[#171717] bg-[#0B0B0B] px-[10px]">
                        <Search className="h-[15px] w-[15px] text-[#777777]" />
                        <input value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="Buscar arquivo" className="h-[38px] min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none" />
                      </div>
                      <div
                        className="h-[calc(100vh-160px)] overflow-auto px-[6px] pb-[12px]"
                        onContextMenu={(event) => {
                          if (event.defaultPrevented) return;
                          openFileContextMenu(event, { kind: "empty", parentPath: "" });
                        }}
                      >
                        {fileInlineDraft && !fileInlineDraft.parentPath ? (
                          <InlineFileDraft
                            draft={fileInlineDraft}
                            level={0}
                            onChange={(value) => setFileInlineDraft((current) => current ? { ...current, value } : current)}
                            onCommit={() => void commitInlineCreate()}
                            onCancel={() => setFileInlineDraft(null)}
                          />
                        ) : null}
                        {filteredTree.length ? filteredTree.map((node) => (
                          <FileTreeNode
                            key={node.path}
                            node={node}
                            activePath={selectedFile?.path || ""}
                            onSelect={loadFile}
                            expandedPaths={expandedFilePaths}
                            onToggle={(path) => setExpandedFilePaths((current) => {
                              const next = new Set(current);
                              if (next.has(path)) next.delete(path);
                              else next.add(path);
                              return next;
                            })}
                            onContextMenu={(event, contextNode) => {
                              openFileContextMenu(event, { kind: "node", node: contextNode });
                            }}
                            inlineDraft={fileInlineDraft}
                            onInlineDraftChange={(value) => setFileInlineDraft((current) => current ? { ...current, value } : current)}
                            onInlineDraftCommit={() => void commitInlineCreate()}
                            onInlineDraftCancel={() => setFileInlineDraft(null)}
                            renamingPath={renamingFilePath}
                            renamingValue={renamingValue}
                            onRenamingChange={setRenamingValue}
                            onRenameCommit={(contextNode) => void commitRenameFile(contextNode)}
                            onRenameCancel={() => setRenamingFilePath(null)}
                            draggedPath={draggedFilePath}
                            onDragStart={(contextNode) => setDraggedFilePath(contextNode.path)}
                            onDragEnd={() => setDraggedFilePath(null)}
                            onDropOnDirectory={(contextNode) => {
                              if (draggedFilePath) void moveFileNode(draggedFilePath, contextNode.path);
                              setDraggedFilePath(null);
                            }}
                          />
                        )) : (
                          <div className="m-[8px] rounded-[12px] border border-[#151515] bg-[#0B0B0B] p-[14px] text-[13px] text-[#777777]">
                            {filesBusy ? "Espelhando arquivos do GitHub..." : "Aguardando arquivos do repositorio."}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onPointerDown={startExplorerResize}
                        className="absolute right-[-4px] top-0 z-20 h-full w-[8px] cursor-col-resize border-x border-transparent transition-colors hover:border-[rgba(15,98,254,0.28)] hover:bg-[rgba(15,98,254,0.14)]"
                        aria-label="Redimensionar Explorer"
                        title="Redimensionar Explorer"
                      />
                    </aside>
                    <div className="flex min-h-0 min-w-0 bg-[#050505]">
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <div className="flex h-[48px] items-center justify-between gap-[12px] border-b border-[#171717] bg-[#080808] px-[12px]">
                          <div className="min-w-0">
                            <p className="min-w-0 truncate font-mono text-[13px] text-[#DADADA]">{selectedFile?.path || "Selecione um arquivo"}</p>
                            {selectedFile ? (
                              <p className="mt-[2px] text-[10px] font-bold uppercase tracking-[0.12em] text-[#555555]">
                                {showingImagePreview
                                  ? `${selectedFileIsSvg ? "SVG preview" : "Imagem"}${loadedFileSizeLabel ? ` / ${loadedFileSizeLabel}` : ""}`
                                  : highlightedLanguage}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-[8px]">
                            {selectedFileIsPreviewableImage ? (
                              <div className="hidden items-center gap-[4px] md:flex">
                                <button
                                  type="button"
                                  onClick={() => setFilePreviewMode("preview")}
                                  className={`flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border transition-colors ${filePreviewMode === "preview"
                                      ? "border-[#2A2A2A] bg-[#171717] text-white"
                                      : "border-[#202020] bg-[#0B0B0B] text-[#9B9B9B] hover:bg-[#111111] hover:text-white"
                                    }`}
                                  title="Preview"
                                >
                                  <ImageIcon className="h-[14px] w-[14px]" />
                                </button>
                                {selectedFileIsSvg ? (
                                  <button
                                    type="button"
                                    onClick={() => setFilePreviewMode("code")}
                                    className={`flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border transition-colors ${filePreviewMode === "code"
                                        ? "border-[#2A2A2A] bg-[#171717] text-white"
                                        : "border-[#202020] bg-[#0B0B0B] text-[#9B9B9B] hover:bg-[#111111] hover:text-white"
                                      }`}
                                    title="Codigo SVG"
                                  >
                                    <Code2 className="h-[14px] w-[14px]" />
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            {showingImagePreview ? (
                              <div className="hidden items-center gap-[4px] md:flex">
                                <button type="button" onClick={() => setImageZoom((value) => clampImageZoom(value - 0.25))} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[#202020] bg-[#0B0B0B] text-[#9B9B9B] hover:bg-[#111111] hover:text-white" title="Diminuir zoom">
                                  <ZoomOut className="h-[14px] w-[14px]" />
                                </button>
                                <button type="button" onClick={() => setImageZoom(1)} className="h-[30px] min-w-[54px] rounded-[8px] border border-[#202020] bg-[#0B0B0B] px-[8px] font-mono text-[11px] font-semibold text-[#DADADA] hover:bg-[#111111]" title="Resetar zoom">
                                  {Math.round(imageZoom * 100)}%
                                </button>
                                <button type="button" onClick={() => setImageZoom((value) => clampImageZoom(value + 0.25))} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-[#202020] bg-[#0B0B0B] text-[#9B9B9B] hover:bg-[#111111] hover:text-white" title="Aumentar zoom">
                                  <ZoomIn className="h-[14px] w-[14px]" />
                                </button>
                              </div>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setFlowChatOpen((current) => {
                                  const next = !current;
                                  if (next) void loadFlowChatHistory();
                                  return next;
                                });
                              }}
                              className={`inline-flex h-[32px] items-center gap-[8px] rounded-[9px] px-[11px] text-[12px] font-semibold transition-colors ${flowChatOpen
                                  ? "border border-[#2A2A2A] bg-[#171717] text-white"
                                  : "border border-[#242424] bg-[#E6E6E6] text-[#050505] hover:bg-white"
                                }`}
                            >
                              <Sparkles className="h-[15px] w-[15px]" /> Falar com Flow
                            </button>
                            <button disabled={!selectedFile || !fileDirty} onClick={saveFile} className="inline-flex h-[32px] items-center gap-[8px] rounded-[9px] bg-[#0F62FE] px-[11px] text-[12px] font-semibold text-white disabled:opacity-45">
                              <Save className="h-[15px] w-[15px]" /> Salvar
                            </button>
                          </div>
                        </div>
                        {!selectedFile ? (
                          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#050505]">
                            <div className="relative flex h-full min-h-[520px] items-center justify-center px-[28px] py-[34px]">
                              <div className="grid w-full max-w-[1040px] gap-[28px] lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)]">
                                <div className="flex min-w-0 flex-col justify-center">
                                  <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#666666]">Flowdesk Files</p>
                                  <h2 className="mt-[10px] text-[34px] font-semibold tracking-[-0.055em] text-[#EDEDED]">Painel de arquivos</h2>
                                  <p className="mt-[6px] text-[14px] leading-[1.6] text-[#8D8D8D]">
                                    {snapshot.project.repository.fullName}
                                  </p>
                                  <div className="mt-[24px] grid gap-[10px] sm:grid-cols-2">
                                    <button type="button" onClick={() => startCreateFile("", "file")} className="group flex h-[52px] items-center gap-[12px] rounded-[14px] border border-[#202020] bg-[#0B0B0B] px-[14px] text-left text-[13px] font-semibold text-[#E8E8E8] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all hover:border-[#303030] hover:bg-[#111111]">
                                      <FilePlus2 className="h-[17px] w-[17px] text-[#9BC2FF] transition-transform group-hover:scale-110" />
                                      Novo arquivo
                                    </button>
                                    <button type="button" onClick={() => startCreateFile("", "directory")} className="group flex h-[52px] items-center gap-[12px] rounded-[14px] border border-[#202020] bg-[#0B0B0B] px-[14px] text-left text-[13px] font-semibold text-[#E8E8E8] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all hover:border-[#303030] hover:bg-[#111111]">
                                      <FolderPlus className="h-[17px] w-[17px] text-[#9BE7AC] transition-transform group-hover:scale-110" />
                                      Nova pasta
                                    </button>
                                    {!isMinecraftProject ? (
                                      <>
                                        <button type="button" onClick={() => void syncFiles()} disabled={filesBusy} className="group flex h-[52px] items-center gap-[12px] rounded-[14px] border border-[#202020] bg-[#0B0B0B] px-[14px] text-left text-[13px] font-semibold text-[#E8E8E8] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all hover:border-[#303030] hover:bg-[#111111] disabled:opacity-60">
                                          {filesBusy ? <Loader2 className="h-[17px] w-[17px] animate-spin text-[#9BC2FF]" /> : <RefreshCw className="h-[17px] w-[17px] text-[#9BC2FF] transition-transform group-hover:rotate-45" />}
                                          Sincronizar GitHub
                                        </button>
                                        <button type="button" onClick={() => navigateToTab("env")} className="group flex h-[52px] items-center gap-[12px] rounded-[14px] border border-[#202020] bg-[#0B0B0B] px-[14px] text-left text-[13px] font-semibold text-[#E8E8E8] shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all hover:border-[#303030] hover:bg-[#111111]">
                                          <KeyRound className="h-[17px] w-[17px] text-[#FFD28A] transition-transform group-hover:scale-110" />
                                          Variaveis
                                        </button>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="grid gap-[10px]">
                                  {[
                                    { icon: <Search className="h-[16px] w-[16px]" />, title: "Busca rapida", value: `${flattenFileTreePaths(snapshot.fileTree).length} itens indexados` },
                                    { icon: <ImageIcon className="h-[16px] w-[16px]" />, title: "Preview de imagens", value: "PNG, JPG, GIF, WEBP, SVG" },
                                    { icon: <Terminal className="h-[16px] w-[16px]" />, title: "Console live", value: logsPaused ? "desativado" : "ativo" },
                                    { icon: <Sparkles className="h-[16px] w-[16px]" />, title: "Flow", value: flowChatOpen ? "aberto" : "pronto" },
                                  ].map((item) => (
                                    <article key={item.title} className="group flex min-h-[70px] items-center gap-[14px] rounded-[16px] border border-[#1B1B1B] bg-[rgba(11,11,11,0.78)] px-[15px] shadow-[0_20px_70px_rgba(0,0,0,0.20)] backdrop-blur transition-all hover:border-[#2A2A2A] hover:bg-[#101010]">
                                      <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[12px] border border-[#242424] bg-[#050505] text-[#9B9B9B] transition-colors group-hover:text-white">
                                        {item.icon}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate text-[13px] font-semibold text-[#E8E8E8]">{item.title}</p>
                                        <p className="mt-[3px] truncate text-[12px] text-[#777777]">{item.value}</p>
                                      </div>
                                    </article>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFlowChatOpen(true);
                                      void loadFlowChatHistory();
                                    }}
                                    className="mt-[4px] flex h-[46px] items-center justify-center gap-[9px] rounded-[14px] bg-[#F2F2F2] px-[14px] text-[13px] font-semibold text-[#050505] transition-all hover:bg-white"
                                  >
                                    <Sparkles className="h-[16px] w-[16px]" />
                                    Falar com Flow
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : showingImagePreview ? (
                          <div
                            className="relative min-h-0 flex-1 overflow-hidden bg-[#050505]"
                            onContextMenu={(event) => {
                              if (!selectedFile) return;
                              openFileContextMenu(event, { kind: "preview", node: selectedFile });
                            }}
                            onWheel={(event) => {
                              event.preventDefault();
                              setImageZoom((value) => clampImageZoom(value + (event.deltaY > 0 ? -0.12 : 0.12)));
                            }}
                          >
                            <div className="h-full overflow-auto [scrollbar-color:#2A2A2A_#050505] [scrollbar-gutter:stable] [scrollbar-width:thin]">
                              <div
                                className="flex min-h-full min-w-full items-center justify-center p-[28px]"
                                style={{
                                  minWidth: `${Math.max(100, imageZoom * 100)}%`,
                                  minHeight: `${Math.max(100, imageZoom * 100)}%`,
                                }}
                              >
                                {selectedImagePreviewSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- File previews can be blob/data URLs and must preserve browser-native image behavior.
                                  <img
                                    src={selectedImagePreviewSrc}
                                    alt={selectedFile?.name || "Preview da imagem"}
                                    draggable={false}
                                    className="select-none rounded-[6px] border border-[#1A1A1A] bg-[#0B0B0B] shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
                                    style={{
                                      maxWidth: "min(100%, 1120px)",
                                      maxHeight: "calc(100vh - 236px)",
                                      transform: `scale(${imageZoom})`,
                                      transformOrigin: "center",
                                      imageRendering: imageZoom >= 3 ? "pixelated" : "auto",
                                    }}
                                  />
                                ) : (
                                  <div className="rounded-[12px] border border-[#1A1A1A] bg-[#080808] px-[16px] py-[14px] text-center">
                                    <ImageIcon className="mx-auto h-[20px] w-[20px] text-[#777777]" />
                                    <p className="mt-[8px] text-[13px] font-semibold text-[#DADADA]">Preview indisponivel</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : selectedFileIsJar ? (
                          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#050505]">
                            <div className="flex h-full min-h-[520px] items-center justify-center p-[28px]">
                              <div className="flex w-full max-w-[420px] flex-col items-center rounded-[18px] border border-[#1A1A1A] bg-[#080808] px-[28px] py-[34px] text-center shadow-[0_24px_90px_rgba(0,0,0,0.34)]">
                                <span className="flex h-[86px] w-[86px] items-center justify-center rounded-[24px] border border-[#263322] bg-[#071208] text-[#9BE7AC] shadow-[0_0_38px_rgba(52,168,83,0.12)]">
                                  <Package className="h-[42px] w-[42px]" />
                                </span>
                                <p className="mt-[18px] max-w-full truncate text-[18px] font-semibold tracking-[-0.025em] text-white">
                                  {selectedFile.name}
                                </p>
                                <p className="mt-[8px] text-[13px] leading-[1.55] text-[#8A8A8A]">
                                  Arquivo Java do Minecraft. O painel nao carrega o binario para evitar travamento e consumo desnecessario de memoria.
                                </p>
                                <div className="mt-[18px] flex flex-wrap justify-center gap-[8px]">
                                  <span className="rounded-full border border-[#242424] bg-[#0B0B0B] px-[10px] py-[5px] font-mono text-[11px] text-[#BDBDBD]">
                                    {selectedFile.path}
                                  </span>
                                  <span className="rounded-full border border-[#242424] bg-[#0B0B0B] px-[10px] py-[5px] text-[11px] font-semibold text-[#9BE7AC]">
                                    Mod/Plugin
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)]">
                            <div
                              ref={lineNumbersRef}
                              className="select-none overflow-hidden border-r border-[#111111] bg-[#070707] py-[12px] text-right font-mono text-[13px] leading-[22.1px] text-[#444444]"
                            >
                              <div style={{ height: editorVirtualHeight }}>
                                <div style={{ transform: `translateY(${visibleLineStart * FILE_EDITOR_LINE_HEIGHT}px)` }}>
                                  {Array.from({ length: visibleLineEnd - visibleLineStart }).map((_, index) => {
                                    const lineNumber = visibleLineStart + index + 1;
                                    return (
                                      <div key={lineNumber} className="h-[22.1px] pr-[10px] leading-[22.1px]">
                                        {lineNumber}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="relative min-h-0 min-w-0 bg-[#050505]">
                              <div
                                ref={highlightedCodeRef}
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 overflow-hidden p-[12px] font-mono text-[13px] leading-[22.1px]"
                              >
                                <pre className="m-0 min-w-max whitespace-pre" style={{ height: editorVirtualHeight }}>
                                  <div style={{ transform: `translateY(${visibleLineStart * FILE_EDITOR_LINE_HEIGHT}px)` }}>
                                    {visibleLines.map((line, index) => (
                                      <div key={visibleLineStart + index} className="h-[22.1px] leading-[22.1px]">
                                        {line ? renderHighlightedLine(line, highlightedLanguage) : " "}
                                      </div>
                                    ))}
                                  </div>
                                </pre>
                              </div>
                              <textarea
                                ref={fileEditorTextareaRef}
                                value={fileContent}
                                onChange={(event) => {
                                  setFileContent(event.target.value);
                                  setFileDirty(true);
                                }}
                                onScroll={(event) => {
                                  if (lineNumbersRef.current) {
                                    lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
                                  }
                                  if (highlightedCodeRef.current) {
                                    highlightedCodeRef.current.scrollTop = event.currentTarget.scrollTop;
                                    highlightedCodeRef.current.scrollLeft = event.currentTarget.scrollLeft;
                                  }
                                  setFileEditorViewport({
                                    scrollTop: event.currentTarget.scrollTop,
                                    scrollLeft: event.currentTarget.scrollLeft,
                                    height: event.currentTarget.clientHeight || fileEditorViewport.height,
                                  });
                                }}
                                spellCheck={false}
                                wrap="off"
                                className="absolute inset-0 h-full min-h-0 w-full resize-none overflow-auto border-0 bg-transparent p-[12px] font-mono text-[13px] leading-[22.1px] text-transparent caret-[#E8E8E8] outline-none selection:bg-[rgba(15,98,254,0.35)] placeholder:text-[#5A5A5A]"
                                placeholder="O conteudo real aparece quando um arquivo sincronizado for selecionado."
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      {flowChatOpen ? (
                        <aside
                          className="relative hidden min-h-0 shrink-0 flex-col border-l border-[#171717] bg-[#080808] md:flex"
                          style={{ width: flowChatWidth }}
                        >
                          <button
                            type="button"
                            onPointerDown={startFlowChatResize}
                            className="absolute left-[-4px] top-0 z-20 h-full w-[8px] cursor-col-resize border-x border-transparent transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)]"
                            aria-label="Redimensionar chat Flow"
                            title="Redimensionar chat Flow"
                          />
                          <div className="flex h-[48px] items-center justify-between gap-[10px] border-b border-[#171717] px-[12px]">
                            <div className="flex min-w-0 items-center gap-[9px]">
                              <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[9px] border border-[#242424] bg-[#111111] text-[#E8E8E8]">
                                <Bot className="h-[15px] w-[15px]" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-white">Flow</p>
                                <p className="truncate text-[10px] text-[#686868]">Assistente do projeto</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-[4px]">
                              <button
                                type="button"
                                onClick={() => {
                                  setFlowChatHistoryOpen((current) => !current);
                                  void loadFlowChatHistory();
                                }}
                                className={`flex h-[30px] w-[30px] items-center justify-center rounded-[9px] transition-colors ${flowChatHistoryOpen ? "bg-[#151515] text-white" : "text-[#9B9B9B] hover:bg-[#111111] hover:text-white"
                                  }`}
                                aria-label="Historico do Flow"
                                title="Historico do Flow"
                              >
                                <History className="h-[15px] w-[15px]" />
                              </button>
                              <button type="button" onClick={() => setFlowChatOpen(false)} className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[#9B9B9B] hover:bg-[#111111] hover:text-white" aria-label="Fechar Flow">
                                <X className="h-[15px] w-[15px]" />
                              </button>
                            </div>
                          </div>
                          {flowChatHistoryOpen ? (
                            <div className="absolute right-[10px] top-[54px] z-40 w-[min(330px,calc(100%-20px))] overflow-hidden rounded-[16px] border border-[#242424] bg-[#090909] shadow-[0_22px_70px_rgba(0,0,0,0.55)]">
                              <div className="flex items-center justify-between border-b border-[#171717] px-[12px] py-[10px]">
                                <div>
                                  <p className="text-[12px] font-semibold text-white">Historico</p>
                                  <p className="text-[10px] text-[#686868]">Conversas desta VPS</p>
                                </div>
                                <button type="button" onClick={startNewFlowChat} className="rounded-[8px] border border-[#242424] bg-[#111111] px-[9px] py-[6px] text-[11px] font-semibold text-[#DADADA] hover:bg-[#171717] hover:text-white">
                                  Novo chat
                                </button>
                              </div>
                              <div className="max-h-[320px] overflow-auto p-[6px] [scrollbar-color:#2A2A2A_#090909] [scrollbar-width:thin]">
                                {flowChatSessions.length ? flowChatSessions.map((chat) => (
                                  <button
                                    key={chat.id}
                                    type="button"
                                    onClick={() => void loadFlowChatHistory(chat.id).then(() => setFlowChatHistoryOpen(false))}
                                    className={`flex w-full flex-col rounded-[11px] px-[10px] py-[9px] text-left transition-colors ${chat.id === flowChatSessionId ? "bg-[#171717]" : "hover:bg-[#111111]"
                                      }`}
                                  >
                                    <span className="truncate text-[12px] font-semibold text-[#E8E8E8]">{chat.title || "Novo chat"}</span>
                                    <span className="mt-[2px] text-[10px] text-[#666666]">{formatDate(chat.updated_at || chat.created_at || "")}</span>
                                  </button>
                                )) : (
                                  <div className="px-[10px] py-[18px] text-center text-[12px] text-[#777777]">
                                    Nenhuma conversa salva ainda.
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                          <div ref={flowChatScrollRef} className="min-h-0 flex-1 space-y-[12px] overflow-auto p-[12px] [scrollbar-color:#2A2A2A_#080808] [scrollbar-width:thin]">
                            {flowChatMessages.map((message) => (
                              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[92%] rounded-[18px] border px-[13px] py-[11px] text-[13px] leading-[1.55] ${message.role === "user"
                                    ? "border-[#1E3D75] bg-[#0F62FE] text-white"
                                    : "border-[#1C1C1C] bg-[#101010] text-[#DADADA]"
                                  }`}>
                                  <FlowChatMessageContent
                                    content={message.content}
                                    onCopy={(value) => {
                                      navigator.clipboard?.writeText(value).then(
                                        () => notify("success", "Codigo copiado.", "Flow"),
                                        () => notify("error", "Nao consegui copiar o codigo.", "Flow"),
                                      );
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                            {flowChatBusy ? (
                              <div className="flex items-center gap-[8px] text-[12px] text-[#777777]">
                                <Loader2 className="h-[14px] w-[14px] animate-spin" />
                                Flow analisando contexto...
                              </div>
                            ) : null}
                          </div>

                          <div className="border-t border-[#171717] p-[10px]">
                            <div className="overflow-hidden rounded-[18px] border border-[#202020] bg-[#101010]">
                              {flowChatQuota.blocked ? (
                                <div className="border-b border-[#2A1D1D] bg-[#170B0B] px-[12px] py-[10px] text-[12px] leading-[1.45] text-[#FFB4B4]">
                                  Voce atingiu o limite diario do Flow. A IA volta em {flowQuotaResetLabel}.
                                </div>
                              ) : null}
                              <div className="p-[9px]">
                                <input
                                  ref={flowChatImageInputRef}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(event) => addFlowChatImages(event.target.files)}
                                />
                                <textarea
                                  value={flowChatInput}
                                  onChange={(event) => setFlowChatInput(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                      event.preventDefault();
                                      void sendFlowChatMessage();
                                    }
                                  }}
                                  placeholder="Pergunte, pe├ºa review ou uma altera├º├úo no arquivo..."
                                  disabled={flowChatQuota.blocked}
                                  className="max-h-[160px] min-h-[76px] w-full resize-none bg-transparent text-[13px] leading-[1.5] text-white outline-none placeholder:text-[#5F5F5F] disabled:cursor-not-allowed disabled:opacity-55"
                                />
                                {flowChatAttachments.length ? (
                                  <div className="mt-[8px] flex flex-wrap gap-[6px]">
                                    {flowChatAttachments.map((attachment) => (
                                      <span key={attachment.id} className="inline-flex h-[26px] max-w-full items-center gap-[6px] rounded-[8px] border border-[#242424] bg-[#080808] px-[8px] text-[11px] text-[#CFCFCF]">
                                        <ImageIcon className="h-[13px] w-[13px] text-[#9BE7AC]" />
                                        <span className="max-w-[160px] truncate">{attachment.name}</span>
                                        <button type="button" onClick={() => setFlowChatAttachments((current) => current.filter((item) => item.id !== attachment.id))} className="text-[#777777] hover:text-white" aria-label="Remover imagem">
                                          <X className="h-[12px] w-[12px]" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="mt-[8px] flex items-center justify-between gap-[10px]">
                                  <div className="flex items-center gap-[6px]">
                                    <button type="button" onClick={() => flowChatImageInputRef.current?.click()} className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[#9B9B9B] hover:bg-[#191919] hover:text-white" title="Adicionar imagem">
                                      <ImageIcon className="h-[15px] w-[15px]" />
                                    </button>
                                    <button type="button" onClick={() => notify("success", "Contexto atual anexado: repositorio, arquivo aberto, deploy ativo e variaveis visiveis foram enviados junto com a proxima mensagem.", "Flow")} className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[#9B9B9B] hover:bg-[#191919] hover:text-white" title="Anexar contexto">
                                      <Paperclip className="h-[15px] w-[15px]" />
                                    </button>
                                    <span className="hidden items-center gap-[5px] text-[11px] text-[#686868] xl:inline-flex">
                                      <MessageSquare className="h-[13px] w-[13px]" />
                                      Projeto
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-[9px]">
                                    <div
                                      className="relative h-[28px] w-[28px] rounded-full"
                                      title={`${flowChatQuota.used.toLocaleString("pt-BR")}/${flowChatQuota.limit.toLocaleString("pt-BR")} tokens usados. Renova em ${flowQuotaResetLabel}. ${flowChatQuota.requestCount}/${flowChatQuota.requestLimit} envios.`}
                                      style={{ background: `conic-gradient(#0F62FE ${flowQuotaPercent}%, #242424 ${flowQuotaPercent}% 100%)` }}
                                    >
                                      <div className="absolute inset-[3px] rounded-full bg-[#101010]" />
                                      <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-[#CFCFCF]">
                                        {Math.round(flowQuotaPercent)}
                                      </div>
                                    </div>
                                    <button type="button" disabled={(!flowChatInput.trim() && !flowChatAttachments.length) || flowChatBusy || flowChatQuota.blocked} onClick={() => void sendFlowChatMessage()} className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#E8E8E8] text-[#050505] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45" aria-label="Enviar mensagem">
                                      {flowChatBusy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Send className="h-[15px] w-[15px]" />}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </aside>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {tab === "minecraft" && snapshot.project.minecraft ? (
                  <div className="space-y-[18px]">
                    <div className="grid gap-[14px] xl:grid-cols-[minmax(0,1fr)_360px]">
                      <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                        <div className="flex flex-wrap items-start justify-between gap-[12px]">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Minecraft control-plane</p>
                            <h2 className="mt-[8px] text-[24px] font-semibold tracking-[-0.04em] text-white">{snapshot.project.minecraft.serverName}</h2>
                            <p className="mt-[6px] text-[13px] text-[#8A8A8A]">
                              {snapshot.project.minecraft.serverType} / {snapshot.project.minecraft.version}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void refreshMinecraftWorlds()}
                            disabled={minecraftBusy}
                            className="inline-flex h-[38px] items-center gap-[8px] rounded-[11px] border border-[#242424] bg-[#0B0B0B] px-[12px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111] disabled:opacity-60"
                          >
                            {minecraftBusy ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <RefreshCw className="h-[14px] w-[14px]" />}
                            Atualizar
                          </button>
                        </div>

                        <div className="mt-[18px] grid gap-[10px] md:grid-cols-3">
                          {[
                            ["Dominio", snapshot.project.minecraft.primaryDomain],
                            ["Mundos", `${minecraftWorlds.length}`],
                            ["Limite", snapshot.project.minecraft.limits.maxWorlds === null ? "Ilimitado" : `${snapshot.project.minecraft.limits.maxWorlds || "Plano"}`],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-[14px] border border-[#151515] bg-[#0B0B0B] p-[12px]">
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#555555]">{label}</p>
                              <p className="mt-[5px] break-words text-[13px] font-semibold text-[#DADADA]">{String(value)}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-[18px] flex flex-col gap-[10px] md:flex-row">
                          <input
                            value={minecraftWorldName}
                            onChange={(event) => setMinecraftWorldName(event.target.value)}
                            placeholder="Nome do novo mundo"
                            className="h-[42px] min-w-0 flex-1 rounded-[12px] border border-[#242424] bg-[#050505] px-[13px] text-[13px] text-white outline-none focus:border-[#3A3A3A]"
                          />
                          <button
                            type="button"
                            onClick={() => void createMinecraftWorld()}
                            disabled={!minecraftWorldName.trim() || minecraftBusy}
                            className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[14px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {minecraftBusy ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Plus className="h-[14px] w-[14px]" />}
                            Criar mundo
                          </button>
                        </div>
                      </section>

                      <aside className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Limites do plano</p>
                        <div className="mt-[12px] space-y-[9px]">
                          {Object.entries(snapshot.project.minecraft.limits || {}).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between gap-[12px] rounded-[12px] border border-[#151515] bg-[#0B0B0B] px-[11px] py-[9px]">
                              <span className="text-[12px] font-semibold text-[#8A8A8A]">{key}</span>
                              <span className="text-[12px] font-bold text-[#EDEDED]">{value === null ? "Ilimitado" : String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </aside>
                    </div>

                    <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Mundos isolados</p>
                      <div className="mt-[14px] grid gap-[10px] md:grid-cols-2 xl:grid-cols-3">
                        {minecraftWorlds.map((world) => (
                          <div key={world} className="rounded-[14px] border border-[#151515] bg-[#0B0B0B] p-[13px]">
                            <p className="text-[14px] font-semibold text-white">{world}</p>
                            <p className="mt-[5px] text-[12px] text-[#777777]">/worlds/{world}</p>
                          </div>
                        ))}
                        {!minecraftWorlds.length ? (
                          <div className="rounded-[14px] border border-[#151515] bg-[#0B0B0B] p-[13px] text-[13px] text-[#777777]">
                            Nenhum mundo carregado ainda.
                          </div>
                        ) : null}
                      </div>
                    </section>
                  </div>
                ) : null}

                {tab === "library" && supportsMinecraftAddons && snapshot.project.minecraft ? (
                  <section className="space-y-[14px]">
                    {!minecraftLibraryDetail ? (
                      <>
                        <div className="flex flex-col gap-[12px] rounded-[18px] border border-[#171717] bg-[#080808] p-[16px] lg:flex-row lg:items-end lg:justify-between">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Minecraft / Biblioteca</p>
                            <h2 className="mt-[6px] text-[24px] font-semibold tracking-[-0.04em] text-white">
                              Catalogo de {minecraftAddonKind === "mods" ? "mods" : "plugins"}
                            </h2>
                            <p className="mt-[6px] text-[13px] text-[#8A8A8A]">
                              Busca automatica para {snapshot.project.minecraft.serverType} / Minecraft {snapshot.project.minecraft.version}.
                            </p>
                          </div>
                          <div className="flex min-w-0 flex-1 gap-[8px] lg:max-w-[560px]">
                            <div className="flex h-[42px] min-w-0 flex-1 items-center gap-[10px] rounded-[12px] border border-[#242424] bg-[#050505] px-[12px]">
                              <Search className="h-[15px] w-[15px] text-[#777777]" />
                              <input
                                value={minecraftLibraryQuery}
                                onChange={(event) => setMinecraftLibraryQuery(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void searchMinecraftLibrary();
                                }}
                                placeholder={minecraftAddonKind === "mods" ? "Buscar mod..." : "Buscar plugin..."}
                                className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#555555]"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => void searchMinecraftLibrary()}
                              disabled={minecraftLibraryBusy}
                              className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[14px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:opacity-60"
                            >
                              {minecraftLibraryBusy ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Search className="h-[14px] w-[14px]" />}
                              Buscar
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-3">
                          {minecraftLibraryHits.map((hit) => (
                            <button
                              key={hit.project_id}
                              type="button"
                              onClick={() => void openMinecraftLibraryDetail(hit.project_id)}
                              className="group flex min-h-[154px] gap-[13px] rounded-[16px] border border-[#171717] bg-[#080808] p-[14px] text-left transition-colors hover:border-[#2A2A2A] hover:bg-[#0B0B0B]"
                            >
                              <img src={hit.icon_url || "/favicon.ico"} alt="" className="h-[52px] w-[52px] shrink-0 rounded-[12px] border border-[#202020] bg-[#0B0B0B] object-cover" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-[10px]">
                                  <p className="line-clamp-1 text-[15px] font-semibold text-white">{hit.title}</p>
                                  <span className="rounded-full border border-[#202020] bg-[#0B0B0B] px-[8px] py-[4px] text-[10px] font-semibold text-[#DADADA]">
                                    {formatCount(hit.downloads)} downloads
                                  </span>
                                </div>
                                <p className="mt-[3px] text-[12px] text-[#8A8A8A]">por {hit.author || "Modrinth"}</p>
                                <p className="mt-[8px] line-clamp-2 text-[12px] leading-[1.45] text-[#777777]">{hit.description || "Sem descricao curta."}</p>
                                <div className="mt-[10px] flex flex-wrap gap-[6px]">
                                  {(hit.display_categories || hit.categories || []).slice(0, 4).map((tag) => (
                                    <span key={tag} className="rounded-full border border-[#202020] bg-[#0B0B0B] px-[7px] py-[3px] text-[10px] font-semibold text-[#8A8A8A]">{tag}</span>
                                  ))}
                                </div>
                              </div>
                            </button>
                          ))}
                          {!minecraftLibraryHits.length ? (
                            <div className="rounded-[16px] border border-[#171717] bg-[#080808] p-[18px] text-[13px] text-[#777777]">
                              {minecraftLibraryBusy ? "Carregando biblioteca..." : "Nenhum resultado carregado ainda."}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-[14px]">
                        <button
                          type="button"
                          onClick={() => setMinecraftLibraryDetail(null)}
                          className="inline-flex h-[36px] items-center gap-[8px] rounded-[10px] border border-[#242424] bg-[#0B0B0B] px-[11px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111]"
                        >
                          <ArrowLeft className="h-[14px] w-[14px]" />
                          Voltar
                        </button>
                        <section className="grid gap-[14px] xl:grid-cols-[minmax(0,1fr)_340px]">
                          <div className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                            <div className="flex flex-wrap gap-[16px]">
                              <img src={minecraftLibraryDetail.project?.icon_url || "/favicon.ico"} alt="" className="h-[72px] w-[72px] rounded-[16px] border border-[#202020] bg-[#0B0B0B] object-cover" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Modrinth / {minecraftLibraryDetail.project?.slug || minecraftLibraryDetail.project?.id}</p>
                                <h2 className="mt-[6px] text-[28px] font-semibold tracking-[-0.05em] text-white">{minecraftLibraryDetail.project?.title || "Projeto"}</h2>
                                <p className="mt-[7px] max-w-[820px] text-[13px] leading-[1.6] text-[#8A8A8A]">{minecraftLibraryDetail.project?.description || "Sem descricao curta."}</p>
                              </div>
                            </div>
                          </div>
                          <aside className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Instalar</p>
                            <button
                              type="button"
                              onClick={() => void installMinecraftLibraryVersion(minecraftLibraryDetail.latestVersion)}
                              disabled={!minecraftLibraryDetail.latestVersion || Boolean(minecraftLibraryInstalling)}
                              className="mt-[12px] inline-flex h-[42px] w-full items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[14px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:opacity-50"
                            >
                              {minecraftLibraryInstalling ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Download className="h-[14px] w-[14px]" />}
                              Instalar ultima compativel
                            </button>
                          </aside>
                        </section>
                        <div className="flex flex-wrap gap-[8px] rounded-[16px] border border-[#171717] bg-[#080808] p-[8px]">
                          {([
                            ["description", "Description"],
                            ["gallery", "Gallery"],
                            ["changelog", "Changelog"],
                            ["versions", "Versions"],
                          ] as const).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setMinecraftLibraryDetailTab(id)}
                              className={`h-[38px] rounded-[999px] px-[14px] text-[13px] font-semibold transition-colors ${minecraftLibraryDetailTab === id ? "bg-[#0F7A3D] text-white" : "text-[#BDBDBD] hover:bg-[#111111] hover:text-white"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {minecraftLibraryDetailTab === "description" ? (
                          <section className="grid gap-[14px] xl:grid-cols-[minmax(0,1fr)_330px]">
                            <main className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Descricao</p>
                              <div className="mt-[14px] space-y-[12px] text-[14px] leading-[1.65] text-[#CFCFCF]">
                                {renderTextBlocks(minecraftLibraryDetail.project?.body || minecraftLibraryDetail.project?.description).map((block, index) => (
                                  <p key={`${index}-${block.slice(0, 20)}`}>{block}</p>
                                ))}
                              </div>
                            </main>
                            <aside className="space-y-[14px]">
                              <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                                <p className="text-[16px] font-semibold text-white">Compatibility</p>
                                <div className="mt-[14px] space-y-[10px] text-[13px]">
                                  {[
                                    ["Minecraft", "Java Edition"],
                                    ["Servidor atual", snapshot.project.minecraft.version],
                                    ["Client-side", minecraftLibraryDetail.project?.client_side || "unknown"],
                                    ["Server-side", minecraftLibraryDetail.project?.server_side || "unknown"],
                                    ["License", minecraftLibraryDetail.project?.license?.name || minecraftLibraryDetail.project?.license?.id || "N/A"],
                                  ].map(([label, value]) => (
                                    <div key={label} className="flex items-center justify-between gap-[12px] border-b border-[#151515] pb-[8px] last:border-b-0">
                                      <span className="text-[#9AA3AF]">{label}</span>
                                      <span className="text-right font-semibold text-white">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </section>
                              <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                                <p className="text-[16px] font-semibold text-white">Links</p>
                                <div className="mt-[12px] space-y-[8px]">
                                  {libraryProjectLinks(minecraftLibraryDetail.project).map(([label, href]) => (
                                    <a key={label} href={href} target="_blank" rel="noreferrer" className="flex h-[38px] items-center justify-between rounded-[10px] border border-[#171717] bg-[#0B0B0B] px-[12px] text-[13px] font-semibold text-white hover:bg-[#111111]">
                                      {label}
                                      <ArrowLeft className="h-[13px] w-[13px] rotate-[135deg]" />
                                    </a>
                                  ))}
                                </div>
                              </section>
                            </aside>
                          </section>
                        ) : null}

                        {minecraftLibraryDetailTab === "gallery" ? (
                          <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                            <p className="text-[16px] font-semibold text-white">Gallery</p>
                            <div className="mt-[14px] grid gap-[14px] md:grid-cols-2">
                              {libraryGalleryItems(minecraftLibraryDetail.project).map((item) => (
                                <article key={item.url} className="overflow-hidden rounded-[16px] border border-[#171717] bg-[#0B0B0B]">
                                  {/\.(mp4|webm)(\?|$)/i.test(item.url) ? (
                                    <video src={item.url} controls className="aspect-video w-full bg-black object-cover" />
                                  ) : (
                                    <img src={item.url} alt={item.title} className="aspect-video w-full bg-black object-cover" />
                                  )}
                                  <div className="p-[14px]">
                                    <p className="text-[16px] font-semibold text-white">{item.title}</p>
                                    <p className="mt-[5px] text-[12px] text-[#777777]">{item.description || formatRelative(item.created)}</p>
                                  </div>
                                </article>
                              ))}
                              {!libraryGalleryItems(minecraftLibraryDetail.project).length ? (
                                <div className="rounded-[14px] border border-[#171717] bg-[#0B0B0B] p-[16px] text-[13px] text-[#777777]">Este projeto nao publicou galeria.</div>
                              ) : null}
                            </div>
                          </section>
                        ) : null}

                        {minecraftLibraryDetailTab === "changelog" ? (
                          <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                            <p className="text-[16px] font-semibold text-white">Changelog</p>
                            <div className="relative mt-[18px] space-y-[0] border-l border-[#1FA463] pl-[24px]">
                              {(minecraftLibraryDetail.versions || []).slice(0, 12).map((version) => (
                                <article key={version.id} className="relative border-b border-[#151515] pb-[18px] pt-[4px] last:border-b-0">
                                  <span className="absolute left-[-33px] top-[6px] h-[17px] w-[17px] rounded-full border border-[#0B0B0B] bg-[#54D98C]" />
                                  <div className="flex flex-wrap items-start justify-between gap-[12px]">
                                    <div>
                                      <h3 className="text-[20px] font-semibold text-white">{version.name || version.version_number || "Versao"}</h3>
                                      <p className="mt-[3px] text-[12px] text-[#777777]">{formatRelative(version.date_published)}</p>
                                    </div>
                                    <button onClick={() => void installMinecraftLibraryVersion(version)} className="inline-flex h-[34px] items-center gap-[7px] rounded-[10px] bg-[#20B864] px-[12px] text-[12px] font-semibold text-[#031308]">
                                      <Download className="h-[13px] w-[13px]" />
                                      Download
                                    </button>
                                  </div>
                                  <div className="mt-[12px] space-y-[8px] text-[13px] leading-[1.6] text-[#CFCFCF]">
                                    {renderTextBlocks(version.changelog || "Sem changelog publicado.").slice(0, 4).map((block, index) => (
                                      <p key={`${version.id}-${index}`}>{block}</p>
                                    ))}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        {minecraftLibraryDetailTab === "versions" ? (
                          <section className="rounded-[18px] border border-[#171717] bg-[#080808] p-[18px]">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Versoes compativeis</p>
                          <div className="mt-[12px] divide-y divide-[#151515] overflow-hidden rounded-[14px] border border-[#151515]">
                            {(minecraftLibraryDetail.versions || []).slice(0, 14).map((version) => {
                              const file = version.files?.find((item) => item.primary && item.filename) || version.files?.find((item) => item.filename);
                              return (
                                <div key={version.id} className="flex flex-wrap items-center justify-between gap-[12px] bg-[#0B0B0B] px-[13px] py-[12px]">
                                  <div className="min-w-0">
                                    <p className="truncate text-[13px] font-semibold text-white">{version.name || version.version_number || version.id}</p>
                                    <p className="mt-[3px] text-[11px] text-[#777777]">{(version.loaders || []).join(", ")} / {(version.game_versions || []).slice(0, 6).join(", ")}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void installMinecraftLibraryVersion(version)}
                                    disabled={!file || minecraftLibraryInstalling === version.id}
                                    className="inline-flex h-[34px] items-center gap-[7px] rounded-[10px] border border-[#242424] bg-[#111111] px-[10px] text-[12px] font-semibold text-[#EDEDED] hover:bg-[#171717] disabled:opacity-50"
                                  >
                                    {minecraftLibraryInstalling === version.id ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Download className="h-[13px] w-[13px]" />}
                                    Instalar
                                  </button>
                                </div>
                              );
                            })}
                            {!minecraftLibraryDetail.versions?.length ? (
                              <div className="bg-[#0B0B0B] px-[13px] py-[12px] text-[13px] text-[#777777]">Nenhuma versao compativel encontrada.</div>
                            ) : null}
                          </div>
                        </section>
                        ) : null}
                      </div>
                    )}
                  </section>
                ) : null}

                {tab === "installed" && minecraftAddonTabType && snapshot.project.minecraft ? (
                  <section className="space-y-[14px]">
                    <div className="flex flex-wrap items-start justify-between gap-[12px]">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#666666]">Minecraft / {minecraftAddonTabType}</p>
                        <h2 className="mt-[6px] text-[24px] font-semibold tracking-[-0.04em] text-white">
                          {minecraftAddonTabType === "mods" ? "Mods instalados" : "Plugins instalados"}
                        </h2>
                        <p className="mt-[6px] text-[13px] text-[#8A8A8A]">
                          {minecraftAddonTabType === "mods"
                            ? "Arquivos carregados da pasta mods/ deste servidor."
                            : "Arquivos carregados da pasta plugins/ deste servidor."}
                        </p>
                      </div>
                      <div className="flex items-center gap-[8px]">
                        <button
                          type="button"
                          onClick={() => navigateToTab("files")}
                          className="inline-flex h-[38px] items-center gap-[8px] rounded-[11px] border border-[#242424] bg-[#0B0B0B] px-[12px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111]"
                        >
                          <Folder className="h-[14px] w-[14px]" />
                          Abrir arquivos
                        </button>
                        <button
                          type="button"
                          onClick={() => void refreshMinecraftAddons(minecraftAddonTabType)}
                          disabled={minecraftAddonsBusy === minecraftAddonTabType}
                          className="inline-flex h-[38px] items-center gap-[8px] rounded-[11px] border border-[#242424] bg-[#0B0B0B] px-[12px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111] disabled:opacity-60"
                        >
                          {minecraftAddonsBusy === minecraftAddonTabType ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <RefreshCw className="h-[14px] w-[14px]" />}
                          Atualizar
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-[10px] md:grid-cols-3">
                      {[
                        ["Total", `${minecraftAddonList.length}`],
                        ["Limite do plano", minecraftAddonLimit === null ? "Ilimitado" : String(minecraftAddonLimit || "Plano")],
                        ["Servidor", `${snapshot.project.minecraft.serverType} ${snapshot.project.minecraft.version}`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-[14px] border border-[#151515] bg-[#080808] p-[12px]">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#555555]">{label}</p>
                          <p className="mt-[5px] break-words text-[13px] font-semibold text-[#DADADA]">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-hidden rounded-[18px] border border-[#171717] bg-[#080808]">
                      {minecraftAddonList.length ? (
                        <div className="divide-y divide-[#151515]">
                          {minecraftAddonList.map((addon) => (
                            <div key={addon.path} className="flex flex-wrap items-center justify-between gap-[12px] px-[16px] py-[13px]">
                              <div className="flex min-w-0 items-center gap-[12px]">
                                <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-[#202020] bg-[#0B0B0B] text-[#DADADA]">
                                  {addon.folder === "mods" ? <Puzzle className="h-[16px] w-[16px]" /> : <Package className="h-[16px] w-[16px]" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-semibold text-white">{addon.name}</p>
                                  <p className="mt-[3px] truncate font-mono text-[11px] text-[#777777]">{addon.path}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-[8px] text-[12px] text-[#8A8A8A]">
                                <span className="rounded-[999px] border border-[#202020] bg-[#0B0B0B] px-[9px] py-[5px] font-semibold text-[#DADADA]">{formatFileSize(addon.size)}</span>
                                <span>{formatRelative(addon.updatedAt)}</span>
                                <button
                                  type="button"
                                  onClick={() => void deleteMinecraftInstalled(addon)}
                                  disabled={minecraftLibraryInstalling === addon.path}
                                  className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[9px] border border-[#242424] bg-[#0B0B0B] text-[#DADADA] hover:bg-[#111111] hover:text-[#FF9B9B] disabled:opacity-50"
                                  title="Remover"
                                >
                                  {minecraftLibraryInstalling === addon.path ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Trash2 className="h-[14px] w-[14px]" />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[180px] flex-col items-center justify-center px-[16px] text-center">
                          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] border border-[#202020] bg-[#0B0B0B] text-[#DADADA]">
                            {minecraftAddonTabType === "mods" ? <Puzzle className="h-[18px] w-[18px]" /> : <Package className="h-[18px] w-[18px]" />}
                          </div>
                          <p className="mt-[12px] text-[14px] font-semibold text-white">
                            {minecraftAddonTabType === "mods" ? "Nenhum mod instalado" : "Nenhum plugin instalado"}
                          </p>
                          <p className="mt-[5px] max-w-[420px] text-[12px] leading-[1.6] text-[#777777]">
                            Envie arquivos .jar pela aba Arquivos dentro de {minecraftAddonTabType}/ e reinicie o servidor para carregar.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}

                {tab === "domains" ? (
                  <section className="min-h-[calc(100vh-150px)] overflow-hidden rounded-[22px] border border-[#171717] bg-[#050505]">
                    <div className="flex h-[54px] items-center justify-between border-b border-[#171717] px-[14px]">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-white">{snapshot.project.vpsCode}</p>
                      </div>
                      <h2 className="text-[14px] font-semibold text-white">Domains</h2>
                      <div className="w-[120px]" />
                    </div>

                    <div className="flex flex-col gap-[10px] border-b border-[#171717] p-[12px] lg:flex-row lg:items-center">
                      <button
                        type="button"
                        onClick={() => setDomainSearch("")}
                        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] border border-[#242424] bg-[#080808] text-[#DADADA] hover:border-[#333333] hover:bg-[#101010]"
                        title="Limpar busca"
                      >
                        <X className="h-[15px] w-[15px]" />
                      </button>
                      <div className="flex h-[42px] min-w-0 flex-1 items-center gap-[10px] rounded-[10px] border border-[#242424] bg-[#080808] px-[12px]">
                        <Search className="h-[16px] w-[16px] text-[#777777]" />
                        <input
                          value={domainSearch}
                          onChange={(event) => setDomainSearch(event.target.value)}
                          placeholder="Search any domain"
                          className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-[#777777]"
                        />
                      </div>
                      <div className="flex gap-[8px]">
                        <button
                          type="button"
                          onClick={openAddDomainDrawer}
                          className="h-[42px] rounded-[10px] border border-[#2A2A2A] bg-[#070707] px-[14px] text-[13px] font-semibold text-white hover:border-[#3A3A3A] hover:bg-[#101010]"
                        >
                          Add Existing
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push("/dashboard/domains/acquire")}
                          className="h-[42px] rounded-[10px] bg-[#F2F2F2] px-[16px] text-[13px] font-semibold text-[#050505] hover:bg-white"
                        >
                          Buy
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-[#171717]">
                      {filteredDomains.length ? filteredDomains.map((domain) => {
                        const isValid = domain.status === "active";
                        const isEditing = editingDomainHostname === domain.hostname && domainDrawerOpen && domainDrawerMode === "edit";
                        return (
                          <article key={domain.id} className="group bg-[#060606] transition-colors hover:bg-[#090909]">
                            <div className="grid gap-[12px] px-[18px] py-[18px] lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)_auto] lg:items-center">
                              <div className="flex min-w-0 items-center gap-[14px]">
                                <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${isValid ? "bg-[#0F8BFF] text-[#050505]" : "border border-[#6A4B16] bg-[#171006] text-[#FFD28A]"}`}>
                                  {isValid ? <Check className="h-[12px] w-[12px] stroke-[3]" /> : <CircleHelp className="h-[12px] w-[12px]" />}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-[14px] font-semibold text-white">{domain.hostname}</p>
                                  <p className={`mt-[4px] text-[13px] ${isValid ? "text-[#B8D7F5]" : "text-[#FFD28A]"}`}>
                                    {isValid ? "Valid Configuration" : "Pending DNS Configuration"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex min-w-0 items-center gap-[9px] font-mono text-[14px] text-[#BDBDBD]">
                                {domain.redirectTo ? (
                                  <>
                                    <ArrowLeft className="h-[15px] w-[15px] rotate-180 text-[#8A8A8A]" />
                                    <span className="rounded-full bg-[#1A1A1A] px-[7px] py-[3px] text-[11px] font-bold text-white">{domain.redirectStatus || 307}</span>
                                    <span className="truncate">{domain.redirectTo}</span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-[15px] w-[15px] rotate-180 text-[#8A8A8A]" />
                                    <span>Production</span>
                                  </>
                                )}
                              </div>

                              <div className="flex justify-start gap-[8px] lg:justify-end">
                                <button
                                  type="button"
                                  onClick={() => void saveProjectSettings("refresh_domain", { hostname: domain.hostname })}
                                  disabled={settingsSaving === "refresh_domain"}
                                  className="inline-flex h-[36px] items-center justify-center gap-[8px] rounded-[10px] border border-[#242424] bg-[#080808] px-[12px] text-[13px] font-semibold text-white hover:border-[#333333] hover:bg-[#101010] disabled:opacity-60"
                                >
                                  {settingsSaving === "refresh_domain" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : null}
                                  Refresh
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditDomainDrawer(domain)}
                                  className="h-[36px] rounded-[10px] border border-[#242424] bg-[#080808] px-[12px] text-[13px] font-semibold text-white hover:border-[#333333] hover:bg-[#101010]"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="border-t border-[#171717] px-[18px] pb-[22px] pt-[18px]">
                                <div className="grid gap-[14px]">
                                  <label className="block text-[13px] text-[#BDBDBD]">
                                    Domain
                                    <input
                                      value={domainInput}
                                      onChange={(event) => setDomainInput(
                                        isMinecraftProject
                                          ? minecraftDomainInputValue(event.target.value).replace(/[^a-z0-9-]/g, "")
                                          : event.target.value.toLowerCase(),
                                      )}
                                      placeholder={isMinecraftProject ? "nome-do-servidor" : "meusite.flwdesk.com"}
                                      className="mt-[8px] h-[48px] w-full rounded-[10px] border border-[#2A2A2A] bg-[#080808] px-[12px] font-mono text-[14px] font-semibold text-white outline-none focus:border-[#4A4A4A]"
                                    />
                                    {isMinecraftProject ? (
                                      <span className="mt-[7px] block font-mono text-[12px] text-[#8A8A8A]">
                                        {domainInput || "nome-do-servidor"}.mine.flwdesk.com
                                      </span>
                                    ) : null}
                                  </label>
                                  <div className="grid gap-[12px] lg:grid-cols-[260px_minmax(0,1fr)]">
                                    <button
                                      type="button"
                                      onClick={() => setDomainDestination("production")}
                                      className={`flex h-[52px] items-center gap-[10px] rounded-[12px] border px-[12px] text-left text-[14px] font-semibold ${domainDestination === "production" ? "border-[#3A3A3A] bg-[#101010] text-white" : "border-[#242424] bg-[#080808] text-[#AFAFAF]"}`}
                                    >
                                      <span className={`h-[16px] w-[16px] rounded-full border ${domainDestination === "production" ? "border-white bg-white" : "border-[#777777]"}`} />
                                      Connect to an environment
                                    </button>
                                    <CustomSelect value="production" onChange={() => undefined} options={[{ value: "production", label: "Production" }]} icon={<Upload className="h-[14px] w-[14px] rotate-180" />} />
                                  </div>
                                  <div className="grid gap-[12px] lg:grid-cols-[260px_1fr_1fr]">
                                    <button
                                      type="button"
                                      onClick={() => setDomainDestination("redirect")}
                                      className={`flex h-[52px] items-center gap-[10px] rounded-[12px] border px-[12px] text-left text-[14px] font-semibold ${domainDestination === "redirect" ? "border-[#3A3A3A] bg-[#101010] text-white" : "border-[#242424] bg-[#080808] text-[#AFAFAF]"}`}
                                    >
                                      <span className={`h-[16px] w-[16px] rounded-full border ${domainDestination === "redirect" ? "border-white bg-white" : "border-[#777777]"}`} />
                                      Redirect to Another Domain
                                    </button>
                                    <CustomSelect value={domainRedirectStatus} onChange={setDomainRedirectStatus} options={[
                                      { value: "307", label: "307 Temporary Redirect" },
                                      { value: "308", label: "308 Permanent Redirect" },
                                      { value: "302", label: "302 Found" },
                                      { value: "301", label: "301 Moved Permanently" },
                                    ]} />
                                    <div className="flex h-[52px] items-center gap-[10px] rounded-[12px] border border-[#242424] bg-[#080808] px-[12px]">
                                      <Search className="h-[15px] w-[15px] text-[#777777]" />
                                      <input value={domainRedirectTo} onChange={(event) => setDomainRedirectTo(event.target.value.toLowerCase())} placeholder="No Redirect" className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none" />
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-[10px] sm:flex-row sm:items-center sm:justify-between">
                                    <button
                                      type="button"
                                      onClick={() => void saveProjectSettings("remove_domain", { hostname: domain.hostname }).then((saved) => { if (saved) setDomainDrawerOpen(false); })}
                                      disabled={(!isMinecraftProject && snapshot.settings.domains.length <= 1) || settingsSaving === "remove_domain"}
                                      className="h-[42px] rounded-[10px] bg-[#E9323A] px-[16px] text-[13px] font-semibold text-white hover:bg-[#FF424A] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Remove
                                    </button>
                                    <div className="flex justify-end gap-[8px]">
                                      <button type="button" onClick={() => setDomainDrawerOpen(false)} className="h-[42px] rounded-[10px] border border-[#2A2A2A] bg-[#080808] px-[16px] text-[13px] font-semibold text-white hover:bg-[#101010]">Cancel</button>
                                      <button type="button" onClick={() => void submitDomainDrawer()} disabled={Boolean(settingsSaving)} className="inline-flex h-[42px] min-w-[84px] items-center justify-center gap-[8px] rounded-[10px] bg-[#F2F2F2] px-[18px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:opacity-60">
                                        {settingsSaving ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : null}
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </article>
                        );
                      }) : (
                        <div className="flex min-h-[300px] flex-col items-center justify-center px-[18px] text-center">
                          <Globe2 className="h-[26px] w-[26px] text-[#777777]" />
                          <p className="mt-[12px] text-[15px] font-semibold text-white">Nenhum dominio encontrado</p>
                          <p className="mt-[6px] text-[13px] text-[#777777]">Adicione um subdominio gratuito *.flwdesk.com ou conecte um dominio existente.</p>
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}

                {fileContextMenu ? (
                  <div
                    ref={fileContextMenuRef}
                    className="fixed z-[220] w-[196px] overflow-hidden rounded-[14px] border border-[#242424] bg-[#0B0B0B] p-[6px] shadow-[0_18px_60px_rgba(0,0,0,0.48)]"
                    style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
                  >
                    {fileContextMenu.kind === "preview" ? (
                      <>
                        <button onClick={() => copyImageLink(fileContextMenu.node)} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                          <Copy className="h-[14px] w-[14px]" /> Copiar
                        </button>
                        {isSvgFile(fileContextMenu.node) ? (
                          <button onClick={copySelectedSvgCode} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                            <Code2 className="h-[14px] w-[14px]" /> Copiar Codigo
                          </button>
                        ) : null}
                      </>
                    ) : fileContextMenu.kind === "empty" ? (
                      <>
                        <button onClick={() => startCreateFile(fileContextMenu.parentPath, "file")} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                          <FilePlus2 className="h-[14px] w-[14px]" /> New File
                        </button>
                        <button onClick={() => startCreateFile(fileContextMenu.parentPath, "directory")} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                          <FolderPlus className="h-[14px] w-[14px]" /> New Folder
                        </button>
                        <div className="my-[5px] h-px bg-[#171717]" />
                        <button onClick={() => copyExplorerPath(fileContextMenu.parentPath)} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                          <Copy className="h-[14px] w-[14px]" /> Copy Path
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startRenameFile(fileContextMenu.node)} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                          <Pencil className="h-[14px] w-[14px]" /> Rename
                        </button>
                        {fileContextMenu.node.type === "file" ? (
                          <>
                            <button onClick={() => isPreviewableImageFile(fileContextMenu.node) ? copyImageLink(fileContextMenu.node) : copyFileNode(fileContextMenu.node)} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                              <Copy className="h-[14px] w-[14px]" /> {isPreviewableImageFile(fileContextMenu.node) ? "Copiar" : "Copy"}
                            </button>
                            {isSvgFile(fileContextMenu.node) && selectedFile?.path === fileContextMenu.node.path ? (
                              <button onClick={copySelectedSvgCode} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                                <Code2 className="h-[14px] w-[14px]" /> Copiar Codigo
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <button onClick={() => startCreateFile(fileContextMenu.node.path, "file")} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                              <FilePlus2 className="h-[14px] w-[14px]" /> Add File
                            </button>
                            <button onClick={() => startCreateFile(fileContextMenu.node.path, "directory")} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                              <FolderPlus className="h-[14px] w-[14px]" /> Add Folder
                            </button>
                          </>
                        )}
                        <div className="my-[5px] h-px bg-[#171717]" />
                        <button onClick={() => void deleteFileNode(fileContextMenu.node)} className="flex h-[36px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-left text-[13px] font-semibold text-[#FF7373] hover:bg-[#191919]">
                          <Trash2 className="h-[14px] w-[14px]" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                ) : null}

                {tab === "deploys" ? (
                  <section className="flex h-[calc(100vh-136px)] min-h-[620px] w-full flex-col overflow-hidden bg-[#050505]">
                    <div className="shrink-0 border-b border-[#151515] bg-[#080808] p-[12px]">
                      <div className="flex flex-col gap-[12px] xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <h2 className="text-[18px] font-semibold tracking-[-0.035em] text-white">Deployments</h2>
                          <p className="mt-[4px] truncate text-[12px] text-[#777777]">
                            Commits, previews e producao sincronizados de {snapshot.project.repository.fullName}.
                          </p>
                        </div>
                        <button onClick={() => void syncDeployments()} disabled={Boolean(busyAction)} className="inline-flex h-[36px] shrink-0 items-center justify-center gap-[8px] rounded-[10px] border border-[#202020] bg-[#101010] px-[12px] text-[12px] font-semibold text-[#DADADA] transition-colors hover:bg-[#151515] disabled:cursor-not-allowed disabled:opacity-60">
                          {busyAction === "sync" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <RefreshCw className="h-[14px] w-[14px]" />}
                          Sincronizar
                        </button>
                      </div>
                      <div className="mt-[12px] grid gap-[8px] xl:grid-cols-[minmax(190px,1fr)_minmax(190px,1fr)_220px_210px_180px_42px]">
                        <CustomSelect value={deploymentBranchFilter} onChange={setDeploymentBranchFilter} options={deploymentBranchOptions} icon={<GitBranch className="h-[14px] w-[14px]" />} />
                        <CustomSelect value={deploymentAuthorFilter} onChange={setDeploymentAuthorFilter} options={deploymentAuthorOptions} icon={<Search className="h-[14px] w-[14px]" />} />
                        <CustomSelect value={deploymentEnvironmentFilter} onChange={setDeploymentEnvironmentFilter} options={deploymentEnvironmentOptions} icon={<Globe2 className="h-[14px] w-[14px]" />} />
                        <CustomSelect
                          value={deploymentDateFilter}
                          onChange={setDeploymentDateFilter}
                          options={[
                            { value: "all", label: "Select Date Range" },
                            { value: "24h", label: "Last 24 hours" },
                            { value: "7d", label: "Last 7 days" },
                            { value: "30d", label: "Last 30 days" },
                          ]}
                          icon={<History className="h-[14px] w-[14px]" />}
                        />
                        <CustomSelect value={deploymentStatusFilter} onChange={setDeploymentStatusFilter} options={deploymentStatusOptions} icon={<Activity className="h-[14px] w-[14px]" />} />
                        <button
                          type="button"
                          onClick={() => {
                            setDeploymentBranchFilter("all");
                            setDeploymentAuthorFilter("all");
                            setDeploymentEnvironmentFilter("all");
                            setDeploymentStatusFilter("all");
                            setDeploymentDateFilter("all");
                          }}
                          className="flex h-[42px] items-center justify-center rounded-[12px] border border-[#202020] bg-[#080808] text-[#9B9B9B] transition-colors hover:border-[#303030] hover:text-white"
                          title="Limpar filtros"
                        >
                          <X className="h-[15px] w-[15px]" />
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto [scrollbar-color:#2A2A2A_#050505] [scrollbar-gutter:stable] [scrollbar-width:thin]">
                      <div className="min-w-[1180px]">
                        {(() => {
                          const activeProductionDeployId = snapshot.deployments.find((d) =>
                            d.environment === "production" &&
                            d.branch === snapshot.project.repository.branch &&
                            !deploymentMetadataString(d, "pullRequestUrl") &&
                            deploymentStatusFamily(d.status) === "ready"
                          )?.id;

                          return (
                            <>
                              <div className="grid grid-cols-[minmax(360px,1.8fr)_132px_116px_112px_minmax(190px,0.9fr)_120px_54px] border-b border-[#101010] bg-[#060606] px-[12px] py-[9px] text-[10px] font-bold uppercase tracking-[0.12em] text-[#565656]">
                                <span>Deployment</span>
                                <span>Status</span>
                                <span>Environment</span>
                                <span>Commit</span>
                                <span>Branch</span>
                                <span className="text-right">Updated</span>
                                <span />
                              </div>
                              {filteredDeployments.length ? filteredDeployments.map((deploy) => {
                                const commitUrl = deploymentMetadataString(deploy, "commitUrl") ||
                                  (deploy.commit_sha ? `${snapshot.project.repository.htmlUrl}/commit/${deploy.commit_sha}` : null);
                                const pullRequestUrl = deploymentMetadataString(deploy, "pullRequestUrl");
                                const authorAvatarUrl = deploymentMetadataString(deploy, "authorAvatarUrl");
                                const statusBadge = deploymentPrimaryBadge(deploy);
                                const environmentBadges = deploymentEnvironmentBadges(deploy, snapshot.project.repository.branch, deploy.id === activeProductionDeployId);

                                return (
                                  <article key={deploy.id} className={`relative grid min-h-[56px] grid-cols-[minmax(360px,1.8fr)_132px_116px_112px_minmax(190px,0.9fr)_120px_54px] items-center border-b border-[#101010] px-[12px] text-[12px] transition-colors hover:bg-[#0B0B0B] ${deploymentMenuId === deploy.id ? "z-[170]" : "z-0"}`}>
                                    <div className="min-w-0 pr-[18px]">
                                      <p className="truncate text-[13px] font-semibold text-[#F2F2F2]">
                                        {deploy.commit_message || `Deploy ${deploy.branch}`}
                                      </p>
                                      <div className="mt-[4px] flex min-w-0 items-center gap-[8px] text-[11px] text-[#777777]">
                                        <span className="truncate">{deploy.commit_author || "GitHub"}</span>
                                        {pullRequestUrl ? (
                                          <>
                                            <span className="text-[#303030]">/</span>
                                            <span className="truncate text-[#9B9B9B]">Pull request preparado</span>
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="flex min-w-0 items-center gap-[7px]">
                                      <span className={`inline-flex h-[24px] shrink-0 items-center rounded-full border px-[9px] text-[11px] font-semibold ${statusBadge.className}`}>
                                        {statusBadge.label}
                                      </span>
                                      <span className="whitespace-nowrap text-[11px] text-[#777777]">{deploymentDurationLabel(deploy)}</span>
                                    </div>
                                    <div className="flex min-w-0 flex-wrap items-center gap-[5px]">
                                      {environmentBadges.map((badge) => (
                                        <span key={badge.label} className={`inline-flex h-[22px] items-center gap-[6px] whitespace-nowrap rounded-full border px-[8px] text-[11px] font-semibold ${badge.className}`}>
                                          <span className="h-[6px] w-[6px] rounded-full bg-current opacity-80" />
                                          {badge.label}
                                        </span>
                                      ))}
                                    </div>
                                    <a
                                      href={commitUrl || undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(event) => {
                                        if (!commitUrl) event.preventDefault();
                                      }}
                                      className={`inline-flex min-w-0 items-center gap-[7px] font-mono text-[12px] font-semibold ${commitUrl ? "text-[#E8E8E8] hover:text-white" : "text-[#777777]"}`}
                                    >
                                      <GitBranch className="h-[13px] w-[13px] shrink-0 text-[#777777]" />
                                      <span className="truncate">{deploymentShortSha(deploy.commit_sha)}</span>
                                    </a>
                                    <div className="flex min-w-0 items-center gap-[8px] font-mono text-[12px] font-semibold text-[#DADADA]">
                                      <GitBranch className="h-[13px] w-[13px] shrink-0 text-[#777777]" />
                                      <span className="truncate">{deploy.branch || "main"}</span>
                                    </div>
                                    <div className="flex items-center justify-end gap-[8px] text-right text-[12px] text-[#9B9B9B]">
                                      <span className="whitespace-nowrap">{formatRelative(deploy.deployed_at || deploy.created_at)}</span>
                                      {authorAvatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar URLs are small external images outside the app image pipeline.
                                        <img src={authorAvatarUrl} alt="" className="h-[20px] w-[20px] rounded-full border border-[#242424]" />
                                      ) : (
                                        <span className="flex h-[20px] w-[20px] items-center justify-center rounded-full border border-[#242424] bg-[#111111] text-[9px] font-bold text-[#AFAFAF]">
                                          {deploymentAuthorInitials(deploy.commit_author)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => setDeploymentMenuId((current) => current === deploy.id ? null : deploy.id)}
                                        className="flex h-[32px] w-[34px] items-center justify-center rounded-[9px] border border-transparent text-[#9B9B9B] transition-colors hover:border-[#242424] hover:bg-[#101010] hover:text-white"
                                        aria-label="Opcoes do deployment"
                                      >
                                        <MoreHorizontal className="h-[16px] w-[16px]" />
                                      </button>
                                    </div>
                                    {deploymentMenuId === deploy.id ? (
                                      <div className="absolute right-[10px] top-[42px] z-[180] w-[216px] overflow-hidden rounded-[14px] border border-[#242424] bg-[#0B0B0B] p-[6px] shadow-[0_18px_60px_rgba(0,0,0,0.48)]">
                                        <button onClick={() => { setDeploymentMenuId(null); if (commitUrl) window.open(commitUrl, "_blank", "noopener,noreferrer"); }} className="flex h-[36px] w-full items-center gap-[9px] rounded-[9px] px-[10px] text-left text-[12px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                                          <GitBranch className="h-[14px] w-[14px]" /> Abrir commit
                                        </button>
                                        {pullRequestUrl ? (
                                          <button onClick={() => { setDeploymentMenuId(null); window.open(pullRequestUrl, "_blank", "noopener,noreferrer"); }} className="flex h-[36px] w-full items-center gap-[9px] rounded-[9px] px-[10px] text-left text-[12px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                                            <GitBranch className="h-[14px] w-[14px]" /> Abrir pull request
                                          </button>
                                        ) : null}
                                        <button onClick={() => { setDeploymentMenuId(null); void navigator.clipboard?.writeText(deploy.commit_sha || ""); notify("success", "SHA copiado.", "Deployments"); }} className="flex h-[36px] w-full items-center gap-[9px] rounded-[9px] px-[10px] text-left text-[12px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                                          <Copy className="h-[14px] w-[14px]" /> Copiar SHA
                                        </button>
                                        <button onClick={() => { setDeploymentMenuId(null); void syncDeployments(); }} className="flex h-[36px] w-full items-center gap-[9px] rounded-[9px] px-[10px] text-left text-[12px] font-semibold text-[#E8E8E8] hover:bg-[#191919]">
                                          <RefreshCw className="h-[14px] w-[14px]" /> Revalidar status
                                        </button>
                                      </div>
                                    ) : null}
                                  </article>
                                );
                              }) : (
                                <div className="flex min-h-[280px] items-center justify-center border-b border-[#101010] px-[18px] text-center">
                                  <div>
                                    <div className="mx-auto flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border border-[#202020] bg-[#0B0B0B] text-[#777777]">
                                      <GitBranch className="h-[18px] w-[18px]" />
                                    </div>
                                    <p className="mt-[12px] text-[13px] font-semibold text-[#DADADA]">
                                      {snapshot.deployments.length ? "Nenhum deployment corresponde aos filtros." : "Nenhum commit/deploy sincronizado ainda."}
                                    </p>
                                    <p className="mt-[5px] text-[12px] text-[#777777]">Sincronize com o GitHub para carregar commits, previews e producao.</p>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </section>
                ) : null}

                {tab === "env" ? (
                  <section className="rounded-[24px] border border-[#171717] bg-[#080808] p-[16px]">
                    <div className="flex flex-col gap-[12px] lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h2 className="text-[20px] font-semibold text-white">Environment Variables</h2>
                        <p className="mt-[4px] text-[13px] text-[#777777]">Variaveis injetadas no runtime da VPS e nos proximos deploys.</p>
                      </div>
                      <button onClick={openCreateEnvDrawer} className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[14px] text-[13px] font-semibold text-[#050505] transition-colors hover:bg-white">
                        <Plus className="h-[15px] w-[15px]" /> Adicionar Variavel
                      </button>
                    </div>
                    <div className="mt-[16px] grid gap-[8px] xl:grid-cols-[minmax(220px,1fr)_250px_230px]">
                      <div className="flex items-center gap-[10px] rounded-[14px] border border-[#202020] bg-[#080808] px-[12px]">
                        <Search className="h-[16px] w-[16px] text-[#777777]" />
                        <input value={envSearch} onChange={(event) => setEnvSearch(event.target.value)} placeholder="Search variables" className="h-[42px] min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none" />
                      </div>
                      <CustomSelect value={envFilter} onChange={setEnvFilter} options={[{ value: "all", label: "All Environments" }, ...ENV_OPTIONS]} icon={<Layers className="h-[15px] w-[15px]" />} />
                      <CustomSelect value={envSort} onChange={setEnvSort} options={[{ value: "updated", label: "Last Updated" }, { value: "name", label: "Name" }]} />
                    </div>

                    <div className="mt-[18px] space-y-[8px]">
                      {filteredEnvVars.length ? filteredEnvVars.map((item) => {
                        const canReveal = item.sensitive === false;
                        const revealed = canReveal && visibleEnvValues[item.id];
                        const displayValue = revealed ? item.visible_value || item.value_preview || "" : "************";
                        return (
                          <article key={`${item.environment}-${item.key}-${item.id}`} className={`relative rounded-[16px] border border-[#202020] bg-[#090909] ${envMenuId === item.id ? "z-[170]" : "z-0"}`}>
                            <div className="grid min-h-[86px] items-center gap-[12px] px-[18px] py-[14px] lg:grid-cols-[minmax(220px,1fr)_minmax(180px,360px)_220px_82px]">
                              <div className="flex min-w-0 items-center gap-[14px]">
                                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-[#242424] bg-[#050505] text-[#9B9B9B]">
                                  <Code2 className="h-[17px] w-[17px]" />
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-[15px] font-semibold text-white">{item.key}</p>
                                  <p className="mt-[3px] text-[13px] text-[#9B9B9B]">{item.environment === "production" ? "Production" : item.environment === "preview" ? "Preview" : "Development"}</p>
                                </div>
                              </div>
                              <div className="flex min-w-0 items-center gap-[10px] font-mono text-[13px] text-[#DADADA]">
                                {canReveal ? (
                                  <button type="button" onClick={() => setVisibleEnvValues((current) => ({ ...current, [item.id]: !current[item.id] }))} className="text-[#8E8E8E] hover:text-white">
                                    <Eye className="h-[16px] w-[16px]" />
                                  </button>
                                ) : null}
                                <span className="truncate">{displayValue}</span>
                              </div>
                              <div className="whitespace-nowrap text-[13px] text-[#9B9B9B]">{formatRelative(item.updated_at)}</div>
                              <div className="flex justify-end">
                                <button type="button" onClick={() => setEnvMenuId((current) => current === item.id ? null : item.id)} className="flex h-[36px] w-[42px] items-center justify-center rounded-[10px] bg-[#151515] text-[#DADADA] hover:bg-[#1C1C1C]">
                                  <MoreHorizontal className="h-[18px] w-[18px]" />
                                </button>
                              </div>
                            </div>
                            {envMenuId === item.id ? (
                              <div className="absolute right-[14px] top-[64px] z-[180] w-[220px] overflow-hidden rounded-[16px] border border-[#242424] bg-[#0B0B0B] p-[6px] shadow-[0_18px_60px_rgba(0,0,0,0.48)]">
                                <button onClick={() => openEditEnvDrawer(item)} className="flex h-[40px] w-full items-center gap-[10px] rounded-[10px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]"><Code2 className="h-[15px] w-[15px]" /> Edit</button>
                                <button onClick={() => void copyEnvValue(item)} className="flex h-[40px] w-full items-center gap-[10px] rounded-[10px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]"><Copy className="h-[15px] w-[15px]" /> Copy to Clipboard</button>
                                <button onClick={() => { setEnvMenuId(null); notify("info", `Versao atual: v${item.version || 1}.`, "Historico"); }} className="flex h-[40px] w-full items-center gap-[10px] rounded-[10px] px-[10px] text-left text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#191919]"><History className="h-[15px] w-[15px]" /> View History</button>
                                <button onClick={() => void deleteEnvVar(item)} className="flex h-[40px] w-full items-center gap-[10px] rounded-[10px] px-[10px] text-left text-[13px] font-semibold text-[#FF5252] hover:bg-[#191919]"><Trash2 className="h-[15px] w-[15px]" /> Delete</button>
                              </div>
                            ) : null}
                          </article>
                        );
                      }) : (
                        <div className="rounded-[18px] border border-[#151515] bg-[#0B0B0B] p-[18px] text-[13px] text-[#777777]">Nenhuma variavel cadastrada.</div>
                      )}
                    </div>
                  </section>
                ) : null}

                {tab === "settings" ? (
                  <section className="grid gap-[18px] pb-[48px] lg:grid-cols-[230px_minmax(0,1fr)]">
                    <aside className="lg:sticky lg:top-[18px] lg:self-start">
                      <div className="flex gap-[6px] overflow-auto rounded-[18px] border border-[#171717] bg-[#080808] p-[6px] lg:flex-col">
                        {([
                          ["general", "General", Cog],
                          ["domains", "Domains", Globe2],
                          ["git", "Git", GitBranch],
                          ["members", "Members", Users],
                          ["security", "Security", Lock],
                          ["danger", "Danger", AlertTriangle],
                        ] as Array<[string, string, typeof Cog]>).map(([id, label, Icon]) => (
                          <button
                            key={String(id)}
                            type="button"
                            onClick={() => setSettingsSection(String(id))}
                            className={`flex h-[38px] shrink-0 items-center gap-[9px] rounded-[12px] px-[10px] text-left text-[13px] font-semibold ${settingsSection === id
                                ? id === "danger"
                                  ? "bg-[rgba(255,82,82,0.1)] text-[#FF9B9B]"
                                  : "bg-[#151515] text-white"
                                : id === "danger"
                                  ? "text-[#C77A7A] hover:bg-[#111111]"
                                  : "text-[#9B9B9B] hover:bg-[#111111] hover:text-white"
                              }`}
                          >
                            <Icon className="h-[15px] w-[15px]" />
                            {String(label)}
                          </button>
                        ))}
                      </div>
                    </aside>

                    <div className="grid gap-[14px]">
                      {(settingsSection === "general" || settingsSection === "domains") ? (
                        <section className="overflow-hidden rounded-[22px] border border-[#171717] bg-[#080808]">
                          <div className="border-b border-[#171717] p-[18px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#606060]">Project</p>
                            <h2 className="mt-[8px] text-[22px] font-semibold tracking-[-0.04em] text-white">Host name</h2>
                            <div className="mt-[16px] flex flex-col gap-[10px] sm:flex-row">
                              <input
                                value={settingsHostName}
                                onChange={(event) => setSettingsHostName(event.target.value)}
                                maxLength={64}
                                className="h-[42px] min-w-0 flex-1 rounded-[12px] border border-[#242424] bg-[#050505] px-[13px] text-[13px] font-semibold text-white outline-none focus:border-[#3A3A3A]"
                              />
                              <button
                                type="button"
                                disabled={settingsSaving === "hostname" || settingsHostName.trim() === snapshot.settings.hostName}
                                onClick={() => void saveProjectSettings("hostname", { hostName: settingsHostName })}
                                className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[14px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {settingsSaving === "hostname" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Save className="h-[14px] w-[14px]" />}
                                Save
                              </button>
                            </div>
                          </div>
                          <div className="grid gap-[10px] p-[18px] md:grid-cols-3">
                            {[
                              ["Primary domain", primaryDomain?.hostname || "n/d"],
                              ["Runtime", snapshot.project.runtime],
                              ["Billing", snapshot.project.paymentAmount],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-[14px] border border-[#151515] bg-[#0B0B0B] p-[12px]">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#555555]">{label}</p>
                                <p className="mt-[7px] truncate text-[13px] font-semibold text-[#E7E7E7]" title={value}>{value}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {settingsSection === "domains" ? (
                        <section className="overflow-hidden rounded-[22px] border border-[#171717] bg-[#080808]">
                          <div className="flex flex-col gap-[12px] border-b border-[#171717] p-[18px] lg:flex-row lg:items-end lg:justify-between">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#606060]">Domains</p>
                              <h2 className="mt-[8px] text-[22px] font-semibold tracking-[-0.04em] text-white">Production domains</h2>
                            </div>
                            <div className="flex min-w-0 flex-col gap-[8px] sm:flex-row">
                              <input
                                value={settingsDomainInput}
                                onChange={(event) => setSettingsDomainInput(event.target.value.toLowerCase())}
                                placeholder="meusite.flwdesk.com"
                                className="h-[42px] min-w-0 rounded-[12px] border border-[#242424] bg-[#050505] px-[13px] font-mono text-[13px] text-white outline-none focus:border-[#3A3A3A] sm:w-[280px]"
                              />
                              <button
                                type="button"
                                disabled={settingsSaving === "add_domain" || !settingsDomainInput.trim()}
                                onClick={() => void saveProjectSettings("add_domain", { hostname: settingsDomainInput }).then((saved) => { if (saved) setSettingsDomainInput(""); })}
                                className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[14px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {settingsSaving === "add_domain" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Plus className="h-[14px] w-[14px]" />}
                                Add
                              </button>
                            </div>
                          </div>
                          <div className="divide-y divide-[#121212]">
                            {snapshot.settings.domains.map((domain) => (
                              <div key={domain.id} className="grid gap-[12px] px-[18px] py-[14px] md:grid-cols-[minmax(0,1fr)_130px_170px] md:items-center">
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-[9px]">
                                    <Globe2 className="h-[16px] w-[16px] shrink-0 text-[#9BC2FF]" />
                                    <p className="truncate font-mono text-[14px] font-semibold text-white">{domain.hostname}</p>
                                    {domain.primary ? <span className="rounded-full border border-[#263926] bg-[#07140B] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[0.12em] text-[#9BE7AC]">Primary</span> : null}
                                  </div>
                                  <p className="mt-[5px] text-[12px] text-[#777777]">{domain.source === "flowdesk_subdomain" ? "Flowdesk subdomain" : "Custom domain"} / {domain.status}</p>
                                </div>
                                <span className={`w-fit rounded-full border px-[9px] py-[5px] text-[11px] font-semibold ${domain.status === "active" ? "border-[#1E3425] bg-[#07140B] text-[#9BE7AC]" : "border-[#3B2E16] bg-[#120D04] text-[#FFD28A]"
                                  }`}>
                                  {domain.status === "active" ? "Valid" : "Pending DNS"}
                                </span>
                                <div className="flex justify-start gap-[8px] md:justify-end">
                                  {!domain.primary ? (
                                    <button type="button" onClick={() => void saveProjectSettings("primary_domain", { hostname: domain.hostname })} className="h-[34px] rounded-[10px] border border-[#242424] bg-[#0B0B0B] px-[10px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111]">Primary</button>
                                  ) : null}
                                  <button type="button" onClick={() => void saveProjectSettings("remove_domain", { hostname: domain.hostname })} disabled={!isMinecraftProject && snapshot.settings.domains.length <= 1} className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[#242424] bg-[#0B0B0B] text-[#DADADA] hover:bg-[#111111] hover:text-[#FF9B9B] disabled:cursor-not-allowed disabled:opacity-45">
                                    <Trash2 className="h-[14px] w-[14px]" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {settingsSection === "git" ? (
                        <section className="overflow-hidden rounded-[22px] border border-[#171717] bg-[#080808]">
                          <div className="border-b border-[#171717] p-[18px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#606060]">Connected Git Repository</p>
                            <div className="mt-[12px] flex flex-col gap-[12px] lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-0">
                                <h2 className="truncate text-[20px] font-semibold tracking-[-0.035em] text-white">
                                  {snapshot.settings.repository.connected ? snapshot.settings.repository.fullName : "No repository connected"}
                                </h2>
                                <p className="mt-[5px] truncate text-[12px] text-[#777777]">Branch {snapshot.settings.repository.branch || "main"}</p>
                              </div>
                              <div className="flex gap-[8px]">
                                {snapshot.settings.repository.htmlUrl && snapshot.settings.repository.connected ? (
                                  <button type="button" onClick={() => window.open(snapshot.settings.repository.htmlUrl || "", "_blank", "noopener,noreferrer")} className="inline-flex h-[38px] items-center gap-[8px] rounded-[11px] border border-[#242424] bg-[#0B0B0B] px-[12px] text-[12px] font-semibold text-[#DADADA] hover:bg-[#111111]">
                                    <Link2 className="h-[14px] w-[14px]" />
                                    Open
                                  </button>
                                ) : null}
                                <button type="button" onClick={() => void saveProjectSettings("repository_remove")} disabled={!snapshot.settings.repository.connected || settingsSaving === "repository_remove"} className="inline-flex h-[38px] items-center gap-[8px] rounded-[11px] border border-[#3A1F1F] bg-[#120707] px-[12px] text-[12px] font-semibold text-[#FF9B9B] hover:bg-[#180909] disabled:cursor-not-allowed disabled:opacity-45">
                                  {settingsSaving === "repository_remove" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <X className="h-[14px] w-[14px]" />}
                                  Disconnect
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="p-[18px]">
                            <div className="flex flex-col gap-[8px] sm:flex-row">
                              <div className="flex min-w-0 flex-1 items-center gap-[10px] rounded-[12px] border border-[#242424] bg-[#050505] px-[12px]">
                                <Search className="h-[15px] w-[15px] text-[#777777]" />
                                <input value={settingsRepoQuery} onChange={(event) => setSettingsRepoQuery(event.target.value)} placeholder="Search repositories" className="h-[42px] min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none" />
                              </div>
                              <button type="button" onClick={() => void loadAvailableRepositories()} disabled={settingsReposLoading} className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] border border-[#242424] bg-[#0B0B0B] px-[13px] text-[13px] font-semibold text-[#DADADA] hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-60">
                                {settingsReposLoading ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <RefreshCw className="h-[14px] w-[14px]" />}
                                Refresh
                              </button>
                            </div>
                            <div className="mt-[12px] grid gap-[8px]">
                              {settingsRepos.slice(0, 8).map((repo) => {
                                const fullName = repo.fullName || `${repo.owner}/${repo.name}`;
                                return (
                                  <button
                                    key={repo.id || fullName}
                                    type="button"
                                    disabled={settingsSaving === "repository_update"}
                                    onClick={() => void saveProjectSettings("repository_update", { repository: { ...repo, fullName, htmlUrl: repo.htmlUrl || `https://github.com/${fullName}` } })}
                                    className="grid gap-[10px] rounded-[14px] border border-[#171717] bg-[#0B0B0B] p-[12px] text-left hover:border-[#2A2A2A] disabled:cursor-not-allowed disabled:opacity-60 sm:grid-cols-[minmax(0,1fr)_120px]"
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate text-[13px] font-semibold text-white">{fullName}</span>
                                      <span className="mt-[4px] block truncate text-[12px] text-[#777777]">{repo.description || repo.language || "GitHub repository"}</span>
                                    </span>
                                    <span className="flex items-center justify-start gap-[7px] font-mono text-[12px] font-semibold text-[#DADADA] sm:justify-end">
                                      <GitBranch className="h-[13px] w-[13px] text-[#777777]" />
                                      {repo.branch || "main"}
                                    </span>
                                  </button>
                                );
                              })}
                              {!settingsRepos.length ? (
                                <div className="rounded-[14px] border border-[#171717] bg-[#0B0B0B] p-[14px] text-[13px] text-[#777777]">
                                  Nenhum repositorio disponivel para troca agora.
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </section>
                      ) : null}

                      {settingsSection === "members" ? (
                        <section className="overflow-hidden rounded-[22px] border border-[#171717] bg-[#080808]">
                          <div className="border-b border-[#171717] p-[18px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#606060]">Project Members</p>
                            <div className="mt-[14px] grid gap-[8px] lg:grid-cols-[minmax(0,1fr)_180px_110px]">
                              <input value={settingsMemberEmail} onChange={(event) => setSettingsMemberEmail(event.target.value)} placeholder="email@empresa.com" className="h-[42px] min-w-0 rounded-[12px] border border-[#242424] bg-[#050505] px-[13px] text-[13px] text-white outline-none focus:border-[#3A3A3A]" />
                              <CustomSelect value={settingsMemberRole} onChange={(value) => setSettingsMemberRole(value as VpsMemberRole)} options={[{ value: "viewer", label: "Viewer" }, { value: "developer", label: "Developer" }, { value: "admin", label: "Admin" }]} />
                              <button type="button" disabled={!settingsMemberEmail.trim() || settingsSaving === "add_member"} onClick={() => void saveProjectSettings("add_member", { email: settingsMemberEmail, role: settingsMemberRole }).then((saved) => { if (saved) setSettingsMemberEmail(""); })} className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[13px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                                {settingsSaving === "add_member" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Plus className="h-[14px] w-[14px]" />}
                                Add
                              </button>
                            </div>
                          </div>
                          <div className="divide-y divide-[#121212]">
                            {snapshot.settings.members.map((member) => (
                              <div key={member.id} className="grid gap-[10px] px-[18px] py-[14px] md:grid-cols-[minmax(0,1fr)_160px_120px_42px] md:items-center">
                                <div className="min-w-0">
                                  <p className="truncate text-[14px] font-semibold text-white">{member.email}</p>
                                  <p className="mt-[4px] text-[12px] text-[#777777]">{member.status}</p>
                                </div>
                                <CustomSelect value={member.role} onChange={(role) => void saveProjectSettings("member_role", { id: member.id, role })} options={[{ value: "owner", label: "Owner" }, { value: "admin", label: "Admin" }, { value: "developer", label: "Developer" }, { value: "viewer", label: "Viewer" }]} />
                                <span className="font-mono text-[12px] text-[#777777]">{formatRelative(member.addedAt)}</span>
                                <button type="button" disabled={member.role === "owner"} onClick={() => void saveProjectSettings("remove_member", { id: member.id })} className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] border border-[#242424] bg-[#0B0B0B] text-[#DADADA] hover:bg-[#111111] hover:text-[#FF9B9B] disabled:cursor-not-allowed disabled:opacity-45">
                                  <Trash2 className="h-[14px] w-[14px]" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {settingsSection === "security" ? (
                        <section className="grid gap-[14px]">
                          <div className="overflow-hidden rounded-[22px] border border-[#171717] bg-[#080808]">
                            <div className="border-b border-[#171717] p-[18px]">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#606060]">Network & Security</p>
                              <h2 className="mt-[8px] text-[22px] font-semibold tracking-[-0.04em] text-white">Firewall rules</h2>
                              <div className="mt-[14px] grid gap-[8px] lg:grid-cols-[minmax(0,1fr)_150px_110px]">
                                <input value={settingsIpInput} onChange={(event) => setSettingsIpInput(event.target.value)} placeholder="203.0.113.10 ou 10.0.0.0/24" className="h-[42px] min-w-0 rounded-[12px] border border-[#242424] bg-[#050505] px-[13px] font-mono text-[13px] text-white outline-none focus:border-[#3A3A3A]" />
                                <CustomSelect value={settingsIpMode} onChange={(value) => setSettingsIpMode(value as VpsFirewallMode)} options={[{ value: "allow", label: "Allowlist" }, { value: "block", label: "Blocklist" }]} />
                                <button type="button" disabled={!settingsIpInput.trim() || settingsSaving === "add_firewall"} onClick={() => void saveProjectSettings("add_firewall", { value: settingsIpInput, mode: settingsIpMode }).then((saved) => { if (saved) setSettingsIpInput(""); })} className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[13px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                                  {settingsSaving === "add_firewall" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Plus className="h-[14px] w-[14px]" />}
                                  Add
                                </button>
                              </div>
                            </div>
                            <div className="divide-y divide-[#121212]">
                              {snapshot.settings.firewall.length ? snapshot.settings.firewall.map((rule) => (
                                <div key={rule.id} className="grid gap-[10px] px-[18px] py-[14px] md:grid-cols-[minmax(0,1fr)_130px_42px] md:items-center">
                                  <p className="truncate font-mono text-[13px] font-semibold text-white">{rule.value}</p>
                                  <span className={`w-fit rounded-full border px-[9px] py-[5px] text-[11px] font-semibold ${rule.mode === "allow" ? "border-[#1E3425] bg-[#07140B] text-[#9BE7AC]" : "border-[#3A1F1F] bg-[#120707] text-[#FF9B9B]"}`}>{rule.mode}</span>
                                  <button type="button" onClick={() => void saveProjectSettings("remove_firewall", { id: rule.id })} className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] border border-[#242424] bg-[#0B0B0B] text-[#DADADA] hover:bg-[#111111] hover:text-[#FF9B9B]">
                                    <Trash2 className="h-[14px] w-[14px]" />
                                  </button>
                                </div>
                              )) : (
                                <div className="p-[18px] text-[13px] text-[#777777]">Nenhuma regra manual. O agente interno assinado continua restrito ao backend Flowdesk.</div>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-[10px] md:grid-cols-2">
                            {[
                              ["Env secrets", snapshot.settings.security.envSecretsLocked],
                              ["Signed agent requests", snapshot.settings.security.signedAgentRequests],
                              ["Internal agent only", snapshot.settings.security.internalAgentOnly],
                              ["2FA for danger zone", snapshot.settings.security.twoFactorRequiredForDanger],
                            ].map(([label, enabled]) => (
                              <div key={String(label)} className="flex items-center justify-between gap-[14px] rounded-[16px] border border-[#171717] bg-[#080808] p-[14px]">
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-semibold text-white">{String(label)}</p>
                                  <p className="mt-[4px] text-[12px] text-[#777777]">{enabled ? "Enabled" : "Disabled"}</p>
                                </div>
                                <span className={`h-[10px] w-[10px] rounded-full ${enabled ? "bg-[#34A853]" : "bg-[#555555]"}`} />
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {settingsSection === "danger" ? (
                        <section className="overflow-hidden rounded-[22px] border border-[rgba(255,82,82,0.32)] bg-[#080505]">
                          <div className="p-[18px]">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#C77A7A]">Danger Zone</p>
                            <h2 className="mt-[8px] text-[22px] font-semibold tracking-[-0.04em] text-[#FFB3B3]">Delete Project and VPS</h2>
                            <p className="mt-[8px] max-w-[760px] text-[13px] leading-[1.6] text-[#A77A7A]">
                              Remove runtime, env vars, deploys, logs e arquivos da VPS. O pedido pago fica livre para criar outra VPS enquanto o periodo de acesso ainda estiver ativo.
                            </p>
                            <div className="mt-[16px] max-w-[520px]">
                              <label className="text-[12px] font-semibold text-[#D8A0A0]">Digite {snapshot.settings.hostName}</label>
                              <input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} className="mt-[8px] h-[42px] w-full rounded-[12px] border border-[#3A1F1F] bg-[#090303] px-[13px] text-[13px] text-white outline-none focus:border-[#6A2A2A]" />
                            </div>
                          </div>
                          <div className="flex flex-col gap-[10px] border-t border-[rgba(255,82,82,0.25)] bg-[#110606] px-[18px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[12px] text-[#A77A7A]">Aciona confirmacao sensivel se a conta tiver 2FA/passkey ativo.</p>
                            <button
                              type="button"
                              disabled={deleteConfirmText !== snapshot.settings.hostName || settingsSaving === "delete_project"}
                              onClick={() => setDeleteModalOpen(true)}
                              className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#E5484D] px-[14px] text-[13px] font-semibold text-white hover:bg-[#F2555A] disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {settingsSaving === "delete_project" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Trash2 className="h-[14px] w-[14px]" />}
                              Delete Project
                            </button>
                          </div>
                        </section>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>

      {githubReconnectOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-[18px] backdrop-blur-[6px]">
          <div className="w-full max-w-[520px] overflow-hidden rounded-[24px] border border-[#202020] bg-[#080808] shadow-[0_26px_90px_rgba(0,0,0,0.54)]">
            <div className="border-b border-[#171717] px-[20px] py-[18px]">
              <div className="flex items-start justify-between gap-[14px]">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#777777]">GitHub</p>
                  <h2 className="mt-[8px] text-[22px] font-semibold tracking-[-0.04em] text-white">Reconectar repositorio</h2>
                </div>
                {snapshot.project.githubConnected ? (
                  <button
                    type="button"
                    onClick={() => setGithubReconnectOpen(false)}
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] text-[#9B9B9B] hover:bg-[#111111] hover:text-white"
                    aria-label="Fechar"
                  >
                    <X className="h-[18px] w-[18px]" />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="px-[20px] py-[18px]">
              <div className="rounded-[18px] border border-[#171717] bg-[#0B0B0B] p-[14px]">
                <p className="text-[14px] leading-[1.55] text-[#BDBDBD]">
                  A VPS precisa de uma conexao GitHub valida para espelhar arquivos, ler commits e aplicar deploys do repositorio
                  <span className="font-mono text-white"> {snapshot.project.repository.fullName}</span>.
                </p>
                <p className="mt-[10px] text-[12px] leading-[1.5] text-[#777777]">
                  O token fica criptografado por usuario no backend e nunca e exposto para o navegador.
                </p>
              </div>
              {githubReconnectMessage ? (
                <p className="mt-[12px] rounded-[14px] border border-[#171717] bg-[#060606] px-[12px] py-[10px] text-[12px] leading-[1.5] text-[#9B9B9B]">
                  {githubReconnectMessage}
                </p>
              ) : null}
              <div className="mt-[16px] flex flex-col-reverse gap-[10px] sm:flex-row sm:justify-end">
                {snapshot.project.githubConnected ? (
                  <button
                    type="button"
                    onClick={() => setGithubReconnectOpen(false)}
                    className="inline-flex h-[42px] items-center justify-center rounded-[12px] border border-[#202020] bg-[#0D0D0D] px-[14px] text-[13px] font-semibold text-[#DADADA] hover:bg-[#121212]"
                  >
                    Agora nao
                  </button>
                ) : null}
                {githubReconnectSsoUrl ? (
                  <a
                    href={githubReconnectSsoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-[42px] items-center justify-center rounded-[12px] border border-[#202020] bg-[#0D0D0D] px-[14px] text-[13px] font-semibold text-[#DADADA] hover:bg-[#121212] hover:text-white"
                  >
                    Autorizar SSO
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={openGithubReconnectPopup}
                  disabled={githubReconnectBusy}
                  className="inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[15px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {githubReconnectBusy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <GitBranch className="h-[15px] w-[15px]" />}
                  Conectar GitHub
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {domainDrawerOpen && domainDrawerMode === "add" ? (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-[rgba(0,0,0,0.72)] p-[18px] backdrop-blur-sm" onClick={() => setDomainDrawerOpen(false)}>
          <div className="w-full max-w-[680px] overflow-hidden rounded-[18px] border border-[#2A2A2A] bg-[#050505] shadow-[0_30px_100px_rgba(0,0,0,0.62)]" onClick={(event) => event.stopPropagation()}>
            <div className="p-[28px]">
              <h2 className="text-[28px] font-semibold tracking-[-0.055em] text-white">Add Domains</h2>
              <p className="mt-[18px] max-w-[620px] text-[15px] leading-[1.55] text-[#A0A0A0]">
                Adicione um dominio a este projeto. Subdominios <span className="font-mono text-white">*.flwdesk.com</span> sao gratuitos quando o slug estiver disponivel.
              </p>
              <div className="mt-[26px] flex h-[58px] items-center gap-[12px] rounded-[12px] border border-[#5A5A5A] bg-[#0B0B0B] px-[14px] shadow-[0_0_0_3px_rgba(255,255,255,0.12)]">
                <Search className="h-[20px] w-[20px] text-[#A0A0A0]" />
                <input
                  autoFocus
                  value={domainInput}
                  onChange={(event) => setDomainInput(
                    isMinecraftProject
                      ? minecraftDomainInputValue(event.target.value).replace(/[^a-z0-9-]/g, "")
                      : event.target.value.toLowerCase(),
                  )}
                  placeholder={isMinecraftProject ? "nome-do-servidor" : "example.flwdesk.com"}
                  className="min-w-0 flex-1 bg-transparent text-[18px] text-white outline-none placeholder:text-[#777777]"
                />
                {isMinecraftProject ? <span className="shrink-0 font-mono text-[14px] font-semibold text-[#A0A0A0]">.mine.flwdesk.com</span> : null}
                <ChevronDown className="h-[18px] w-[18px] text-[#A0A0A0]" />
              </div>
              <p className="mt-[10px] text-[13px] text-[#8A8A8A]">
                {isMinecraftProject
                  ? "Use somente o primeiro nome, sem ponto. O sufixo .mine.flwdesk.com e automatico."
                  : "Use letras, numeros e hifen no slug. Exemplo: minha-loja.flwdesk.com."}
              </p>

              <div className="mt-[22px] overflow-hidden rounded-[12px] border border-[#242424]">
                <button
                  type="button"
                  onClick={() => setDomainDestination("production")}
                  className="flex w-full items-start gap-[12px] border-b border-[#242424] bg-[#070707] px-[20px] py-[18px] text-left"
                >
                  <span className={`mt-[3px] h-[18px] w-[18px] rounded-full border ${domainDestination === "production" ? "border-white bg-white shadow-[inset_0_0_0_5px_#070707]" : "border-[#777777]"}`} />
                  <div>
                    <p className="text-[15px] font-semibold text-white">Connect to an environment</p>
                    <div className="mt-[12px] w-[270px]">
                      <CustomSelect value="production" onChange={() => undefined} options={[{ value: "production", label: "Production" }]} icon={<Upload className="h-[14px] w-[14px] rotate-180" />} />
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setDomainDestination("redirect")}
                  className="grid w-full gap-[12px] bg-[#070707] px-[20px] py-[18px] text-left lg:grid-cols-[260px_1fr_1fr]"
                >
                  <span className="flex items-center gap-[12px] text-[15px] font-semibold text-[#AFAFAF]">
                    <span className={`h-[18px] w-[18px] rounded-full border ${domainDestination === "redirect" ? "border-white bg-white shadow-[inset_0_0_0_5px_#070707]" : "border-[#777777]"}`} />
                    Redirect to Another Domain
                  </span>
                  <CustomSelect value={domainRedirectStatus} onChange={setDomainRedirectStatus} options={[
                    { value: "307", label: "307 Temporary Redirect" },
                    { value: "308", label: "308 Permanent Redirect" },
                    { value: "302", label: "302 Found" },
                    { value: "301", label: "301 Moved Permanently" },
                  ]} />
                  <div className="flex h-[42px] items-center gap-[10px] rounded-[12px] border border-[#242424] bg-[#101010] px-[12px]">
                    <Search className="h-[15px] w-[15px] text-[#777777]" />
                    <input value={domainRedirectTo} onChange={(event) => setDomainRedirectTo(event.target.value.toLowerCase())} placeholder="No Redirect" className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none" />
                  </div>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[#242424] px-[20px] py-[20px]">
              <button type="button" onClick={() => setDomainDrawerOpen(false)} className="h-[48px] rounded-[10px] border border-[#2A2A2A] bg-[#080808] px-[20px] text-[15px] font-semibold text-white hover:bg-[#101010]">Cancel</button>
              <button
                type="button"
                onClick={() => void submitDomainDrawer()}
                disabled={!domainInput.trim() || Boolean(settingsSaving)}
                className="inline-flex h-[48px] min-w-[150px] items-center justify-center gap-[8px] rounded-[10px] bg-[#F2F2F2] px-[20px] text-[15px] font-semibold text-[#050505] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {settingsSaving ? <Loader2 className="h-[16px] w-[16px] animate-spin" /> : null}
                Add {domainInput.trim() ? 1 : 0} Domain
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {envDrawerOpen ? (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]">
          <aside className="absolute bottom-[12px] right-[12px] top-[12px] flex w-[min(960px,calc(100vw-24px))] animate-[flowdeskSlideIn_220ms_ease-out] flex-col overflow-hidden rounded-[22px] border border-[#242424] bg-[#080808] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between border-b border-[#1D1D1D] px-[22px] py-[18px]">
              <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-white">{envDrawerMode === "edit" ? "Edit Environment Variable" : "Add Environment Variable"}</h3>
              <button disabled={envSaving} onClick={() => setEnvDrawerOpen(false)} className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] text-[#DADADA] hover:bg-[#151515] disabled:cursor-not-allowed disabled:opacity-45"><X className="h-[18px] w-[18px]" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-[22px] py-[18px]">
              <div className="mb-[18px] flex flex-col gap-[10px] rounded-[16px] border border-[#1D1D1D] bg-[#090909] p-[10px] lg:flex-row lg:items-center lg:justify-between">
                <div className="grid gap-[7px] sm:grid-cols-3">
                  {ENV_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={envSaving}
                      onClick={() => setEnvEnvironment(option.value)}
                      className={`h-[36px] rounded-[10px] border px-[12px] text-[12px] font-semibold transition-all ${envEnvironment === option.value
                          ? "border-[#3A3A3A] bg-[#F2F2F2] text-[#050505]"
                          : "border-[#242424] bg-[#0B0B0B] text-[#BDBDBD] hover:bg-[#111111] hover:text-white"
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-[8px]">
                  {envDrawerMode === "create" ? (
                    <>
                      <button type="button" disabled={envSaving} onClick={() => void pasteEnvFromClipboard()} className="inline-flex h-[36px] items-center gap-[8px] rounded-[10px] border border-[#242424] bg-[#0B0B0B] px-[11px] text-[12px] font-semibold text-[#E8E8E8] hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-45">
                        <Copy className="h-[14px] w-[14px]" /> Paste .env
                      </button>
                      <button type="button" disabled={envSaving} onClick={() => fileInputRef.current?.click()} className="inline-flex h-[36px] items-center gap-[8px] rounded-[10px] border border-[#242424] bg-[#0B0B0B] px-[11px] text-[12px] font-semibold text-[#E8E8E8] hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-45">
                        <Upload className="h-[14px] w-[14px]" /> Import
                      </button>
                      <button type="button" disabled={envSaving} onClick={() => setEnvRows((current) => [...current, createDraftRow()])} className="inline-flex h-[36px] items-center gap-[8px] rounded-[10px] border border-[#242424] bg-[#0B0B0B] px-[11px] text-[12px] font-semibold text-[#E8E8E8] hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-45">
                        <Plus className="h-[14px] w-[14px]" /> Add
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="space-y-[22px]">
                {envRows.map((row, index) => (
                  <div key={row.id} className={`rounded-[16px] border border-[#1D1D1D] bg-[#0A0A0A] p-[14px] ${index > 0 ? "" : ""}`}>
                    <div className="mb-[12px] flex items-center justify-between gap-[12px]">
                      <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#606060]">Variable {index + 1}</span>
                      {envRows.length > 1 ? (
                        <button type="button" disabled={envSaving} onClick={() => setEnvRows((current) => current.filter((item) => item.id !== row.id))} className="text-[#DADADA] hover:text-[#FF8E8E] disabled:cursor-not-allowed disabled:opacity-45"><Trash2 className="h-[17px] w-[17px]" /></button>
                      ) : null}
                    </div>
                    <div className="grid gap-[12px] lg:grid-cols-[minmax(180px,0.7fr)_minmax(220px,1fr)]">
                      <div>
                        <label className="text-[13px] font-medium text-[#BDBDBD]">Key</label>
                        <input value={row.key} onChange={(event) => updateEnvKey(row.id, event.target.value)} placeholder="DATABASE_URL" className="mt-[8px] h-[50px] w-full rounded-[12px] border border-[#2A2A2A] bg-[#070707] px-[14px] font-mono text-[14px] text-white outline-none transition-colors focus:border-[#3A3A3A]" />
                      </div>
                      <div>
                        <label className="text-[13px] font-medium text-[#BDBDBD]">Value</label>
                        <div className="mt-[8px] flex h-[50px] items-center rounded-[12px] border border-[#2A2A2A] bg-[#070707] px-[14px] transition-colors focus-within:border-[#3A3A3A]">
                          <input
                            value={row.value}
                            type="text"
                            name={`flowdesk_env_${row.id}`}
                            autoComplete="new-password"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            style={secureTextStyle(row.showValue)}
                            onChange={(event) => setEnvRows((current) => current.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))}
                            placeholder="valor"
                            className="min-w-0 flex-1 bg-transparent font-mono text-[14px] text-white outline-none"
                          />
                          {!row.sensitive ? (
                            <button type="button" onClick={() => setEnvRows((current) => current.map((item) => item.id === row.id ? { ...item, showValue: !item.showValue } : item))} className="text-[#8E8E8E] hover:text-white"><Eye className="h-[18px] w-[18px]" /></button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <label className="mt-[14px] block text-[13px] font-medium text-[#BDBDBD]">Note (Optional)</label>
                    <input value={row.note} onChange={(event) => setEnvRows((current) => current.map((item) => item.id === row.id ? { ...item, note: event.target.value } : item))} placeholder="Rotacao, dono ou contexto" className="mt-[8px] h-[48px] w-full rounded-[12px] border border-[#2A2A2A] bg-[#070707] px-[14px] text-[14px] text-white outline-none transition-colors focus:border-[#3A3A3A]" />
                    <div className="mt-[16px] flex items-start justify-between gap-[16px] rounded-[14px] border border-[#1D1D1D] bg-[#0B0B0B] p-[12px]">
                      <div>
                        <p className="text-[13px] font-semibold text-[#DADADA]">Sensitive</p>
                        <p className="mt-[3px] text-[12px] leading-[1.4] text-[#777777]">
                          {row.sensitive ? "Valor nao podera ser revelado depois de salvo." : "Valor podera ser visto e copiado no painel."}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.sensitive}
                        onClick={() => setEnvRows((current) => current.map((item) => item.id === row.id ? { ...item, sensitive: !item.sensitive, showValue: false } : item))}
                        className={`relative h-[30px] w-[52px] shrink-0 rounded-full border transition-colors ${row.sensitive
                            ? "border-[rgba(15,98,254,0.45)] bg-[#0F62FE]"
                            : "border-[#303030] bg-[#202020]"
                          }`}
                      >
                        <span
                          className={`absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform ${row.sensitive ? "translate-x-[22px]" : "translate-x-0"
                            }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-[12px] border-t border-[#1D1D1D] px-[22px] py-[16px] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-[10px]">
                <input ref={fileInputRef} type="file" accept=".env,text/plain" className="hidden" onChange={(event) => importEnvFile(event.target.files?.[0] || null)} />
                <span className="text-[13px] text-[#9B9B9B]">{envRows.length} {envRows.length === 1 ? "variavel" : "variaveis"} em {envEnvironment}</span>
              </div>
              <div className="flex justify-end gap-[10px]">
                <button type="button" disabled={envSaving} onClick={() => setEnvDrawerOpen(false)} className="h-[42px] rounded-[12px] border border-[#2A2A2A] bg-[#0B0B0B] px-[16px] text-[13px] font-semibold text-[#E8E8E8] hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-45">Cancel</button>
                <button type="button" disabled={envSaving} onClick={() => void saveEnvRows()} className="inline-flex h-[42px] min-w-[92px] items-center justify-center gap-[8px] rounded-[12px] bg-[#F2F2F2] px-[18px] text-[13px] font-semibold text-[#050505] hover:bg-white disabled:cursor-not-allowed disabled:opacity-70">
                  {envSaving ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : null}
                  {envSaving ? "Saving" : "Save"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
      {deleteModalOpen ? (
        <SensitiveActionModal
          isOpen={deleteModalOpen}
          action="vps_delete"
          target={snapshot.project.vpsCode}
          title="Confirmar exclusao da VPS"
          description="Esta acao remove o projeto, limpa os segredos e desativa o runtime da VPS."
          onClose={() => setDeleteModalOpen(false)}
          onVerified={deleteProjectWithProof}
        />
      ) : null}
      <style jsx global>{`
        @keyframes flowdeskSlideIn {
          from { transform: translateX(32px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @keyframes flowdeskSoftIn {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes flowdeskLivePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(52, 168, 83, 0.22); }
          50% { box-shadow: 0 0 0 6px rgba(52, 168, 83, 0); }
        }

        .flowdesk-vps-ui section,
        .flowdesk-vps-ui article {
          animation: flowdeskSoftIn 260ms ease-out both;
        }

        .flowdesk-vps-ui button,
        .flowdesk-vps-ui a,
        .flowdesk-vps-ui input,
        .flowdesk-vps-ui textarea,
        .flowdesk-vps-ui article {
          transition-property: background-color, border-color, color, opacity, transform, box-shadow;
          transition-duration: 170ms;
          transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
        }

        .flowdesk-vps-ui button:not(:disabled):hover,
        .flowdesk-vps-ui article:hover {
          transform: translateY(-1px);
        }

        .flowdesk-vps-ui input:focus,
        .flowdesk-vps-ui textarea:focus {
          box-shadow: 0 0 0 3px rgba(15, 98, 254, 0.12);
        }

        .flowdesk-vps-ui button span[class*="bg-[#34A853]"] {
          animation: flowdeskLivePulse 1.6s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .flowdesk-vps-ui *,
          .flowdesk-vps-ui *::before,
          .flowdesk-vps-ui *::after {
            animation-duration: 1ms !important;
            transition-duration: 1ms !important;
          }
        }
      `}</style>
    </main>
  );
}

function FileTreeNode({
  node,
  activePath,
  onSelect,
  expandedPaths,
  onToggle,
  onContextMenu,
  inlineDraft,
  onInlineDraftChange,
  onInlineDraftCommit,
  onInlineDraftCancel,
  renamingPath,
  renamingValue,
  onRenamingChange,
  onRenameCommit,
  onRenameCancel,
  draggedPath,
  onDragStart,
  onDragEnd,
  onDropOnDirectory,
  level = 0,
}: {
  node: VpsFileNode;
  activePath: string;
  onSelect: (node: VpsFileNode) => void;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onContextMenu: (event: ReactMouseEvent, node: VpsFileNode) => void;
  inlineDraft: FileInlineDraft;
  onInlineDraftChange: (value: string) => void;
  onInlineDraftCommit: () => void;
  onInlineDraftCancel: () => void;
  renamingPath: string | null;
  renamingValue: string;
  onRenamingChange: (value: string) => void;
  onRenameCommit: (node: VpsFileNode) => void;
  onRenameCancel: () => void;
  draggedPath: string | null;
  onDragStart: (node: VpsFileNode) => void;
  onDragEnd: () => void;
  onDropOnDirectory: (node: VpsFileNode) => void;
  level?: number;
}) {
  const isDirectory = node.type === "directory";
  const open = isDirectory && expandedPaths.has(node.path);
  const isRenaming = renamingPath === node.path;
  const isDropTarget = isDirectory && draggedPath && draggedPath !== node.path && !node.path.startsWith(`${draggedPath}/`);
  const previewName = isRenaming ? renamingValue.trim() || node.name : node.name;
  const previewPath = isRenaming ? joinFilePath(parentFilePath(node.path), previewName) : node.path;
  const { Icon, className: iconClassName } = fileIconStyle({
    ...node,
    name: previewName,
    path: previewPath,
    language: isRenaming && node.type === "file" ? languageFromFilePath(previewPath) : node.language,
  });
  return (
    <div>
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.path);
          onDragStart(node);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (!isDropTarget) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          if (!isDropTarget) return;
          event.preventDefault();
          onDropOnDirectory(node);
        }}
        onContextMenu={(event) => {
          event.stopPropagation();
          onContextMenu(event, node);
        }}
        onClick={() => isDirectory ? onToggle(node.path) : onSelect(node)}
        className={`flex h-[32px] w-full items-center gap-[8px] rounded-[10px] px-[8px] text-left text-[13px] transition-colors ${activePath === node.path ? "bg-[#0F62FE] text-white" : isDropTarget ? "bg-[rgba(15,98,254,0.13)] text-white" : "text-[#BDBDBD] hover:bg-[#111111] hover:text-white"
          }`}
        style={{ paddingLeft: 8 + level * 12 }}
      >
        {isDirectory ? (
          <>
            <ChevronRight className={`h-[13px] w-[13px] transition-transform ${open ? "rotate-90" : ""}`} />
            <Icon className={`h-[15px] w-[15px] ${iconClassName}`} />
          </>
        ) : (
          <>
            <span className="w-[13px]" />
            <Icon className={`h-[15px] w-[15px] ${iconClassName}`} />
          </>
        )}
        {isRenaming ? (
          <input
            autoFocus
            value={renamingValue}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onRenamingChange(event.target.value)}
            onBlur={() => onRenameCommit(node)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onRenameCommit(node);
              if (event.key === "Escape") onRenameCancel();
            }}
            className="h-[24px] min-w-0 flex-1 rounded-[6px] border border-[#303030] bg-[#050505] px-[7px] text-[12px] text-white outline-none"
          />
        ) : (
          <span className="min-w-0 truncate">{node.name}</span>
        )}
      </button>
      {isDirectory && open ? (
        <div>
          {inlineDraft && inlineDraft.parentPath === node.path ? (
            <InlineFileDraft
              draft={inlineDraft}
              level={level + 1}
              onChange={onInlineDraftChange}
              onCommit={onInlineDraftCommit}
              onCancel={onInlineDraftCancel}
            />
          ) : null}
          {(node.children || []).map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              activePath={activePath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              inlineDraft={inlineDraft}
              onInlineDraftChange={onInlineDraftChange}
              onInlineDraftCommit={onInlineDraftCommit}
              onInlineDraftCancel={onInlineDraftCancel}
              renamingPath={renamingPath}
              renamingValue={renamingValue}
              onRenamingChange={onRenamingChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              draggedPath={draggedPath}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropOnDirectory={onDropOnDirectory}
              level={level + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InlineFileDraft({
  draft,
  level,
  onChange,
  onCommit,
  onCancel,
}: {
  draft: NonNullable<FileInlineDraft>;
  level: number;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const draftName = draft.value.trim() || (draft.type === "directory" ? "nova-pasta" : "arquivo");
  const draftPath = joinFilePath(draft.parentPath, draftName);
  const { Icon, className: iconClassName } = fileIconStyle({
    name: draftName,
    path: draftPath,
    type: draft.type,
    language: draft.type === "file" ? languageFromFilePath(draftPath) : null,
  });
  return (
    <div
      className="flex h-[32px] w-full items-center gap-[8px] rounded-[10px] px-[8px] text-left text-[13px] text-[#BDBDBD]"
      style={{ paddingLeft: 8 + level * 12 }}
    >
      <span className="w-[13px]" />
      <Icon className={`h-[15px] w-[15px] ${iconClassName}`} />
      <input
        autoFocus
        value={draft.value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => draft.value.trim() ? onCommit() : onCancel()}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit();
          if (event.key === "Escape") onCancel();
        }}
        placeholder={draft.type === "directory" ? "nova-pasta" : "arquivo.ts"}
        className="h-[24px] min-w-0 flex-1 rounded-[6px] border border-[#303030] bg-[#050505] px-[7px] text-[12px] text-white outline-none placeholder:text-[#555555]"
      />
    </div>
  );
}

