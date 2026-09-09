"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  Copy,
  EyeOff,
  ExternalLink,
  Globe2,
  Keyboard,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  Settings,
  Terminal,
  X,
} from "lucide-react";
import { siteHttpTone, type SiteHttpProbe } from "@/lib/hosting/siteHttpProbe";

type OverlayPosition = "bottom-left" | "bottom-right";
type OverlaySize = "compact" | "medium";

type OverlayPrefs = {
  position: OverlayPosition;
  size: OverlaySize;
  hiddenUntil: number | null;
  shortcut: string;
};

const PREFS_KEY = "flowdesk_vps_overlay_prefs_v1";

const DEFAULT_PREFS: OverlayPrefs = {
  position: "bottom-left",
  size: "medium",
  hiddenUntil: null,
  shortcut: "Control+.",
};

type FlowdeskVpsOverlayProps = {
  hostname: string | null;
  runtimeStatus: string;
  frameworkLabel?: string | null;
  regionLabel?: string | null;
  latencyMs?: number | null;
  siteHttp?: SiteHttpProbe | null;
  busyAction?: string | null;
  onAction: (action: "start" | "stop" | "restart" | "deploy" | "sync") => void;
  onOpenTab: (tab: "console" | "deploys" | "domains" | "overview") => void;
};

function loadPrefs(): OverlayPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
    return {
      position: raw.position === "bottom-right" ? "bottom-right" : "bottom-left",
      size: raw.size === "compact" ? "compact" : "medium",
      hiddenUntil: typeof raw.hiddenUntil === "number" ? raw.hiddenUntil : null,
      shortcut: typeof raw.shortcut === "string" && raw.shortcut.trim() ? raw.shortcut : DEFAULT_PREFS.shortcut,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function FlowdeskMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="currentColor" d="M10 16h12v8H10zm12-10h18v10H22zm0 18H10l10 10v-8h9l4-10H22z" />
    </svg>
  );
}

function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const parts = shortcut.toLowerCase().split("+").map((part) => part.trim());
  const key = parts[parts.length - 1] || "";
  const needCtrl = parts.includes("control") || parts.includes("ctrl");
  const needAlt = parts.includes("alt");
  const needShift = parts.includes("shift");
  const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  return Boolean(key) && pressed === key && event.ctrlKey === needCtrl && event.altKey === needAlt && event.shiftKey === needShift;
}

export function FlowdeskVpsOverlay({
  hostname,
  runtimeStatus,
  frameworkLabel,
  regionLabel,
  latencyMs,
  siteHttp,
  busyAction,
  onAction,
  onOpenTab,
}: FlowdeskVpsOverlayProps) {
  const [prefs, setPrefs] = useState<OverlayPrefs>(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs, prefsReady]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (recording) {
        event.preventDefault();
        const parts = [
          event.ctrlKey ? "Control" : null,
          event.altKey ? "Alt" : null,
          event.shiftKey ? "Shift" : null,
          event.key.length === 1 ? event.key.toUpperCase() : event.key,
        ].filter(Boolean);
        setPrefs((current) => ({ ...current, shortcut: parts.join("+") }));
        setRecording(false);
        return;
      }
      if (matchesShortcut(event, prefs.shortcut)) {
        event.preventDefault();
        setOpen((current) => !current);
        setPrefsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.shortcut, recording]);

  const hidden = Boolean(prefs.hiddenUntil && prefs.hiddenUntil > Date.now());
  const tone = siteHttpTone(siteHttp?.status ?? null, siteHttp?.ok ?? false);
  const httpLabel = siteHttp?.status ? String(siteHttp.status) : siteHttp?.error === "timeout" ? "TO" : runtimeStatus === "online" ? "…" : "OFF";
  const ring =
    tone === "ok" ? "shadow-[0_0_0_2px_#34A853]" :
    tone === "warn" ? "shadow-[0_0_0_2px_#F5A524]" :
    tone === "error" ? "shadow-[0_0_0_2px_#E24B4A]" :
    "shadow-[0_0_0_2px_#3A3A3A]";

  const rows = useMemo(() => [
    ["HTTP", siteHttp?.status ? `${siteHttp.status}` : siteHttp?.error || "checando"],
    ["Runtime", runtimeStatus],
    ["Framework", frameworkLabel || "auto"],
    ["Latencia", latencyMs ? `${latencyMs}ms` : siteHttp?.latencyMs ? `${siteHttp.latencyMs}ms` : "n/d"],
    ["Regiao", regionLabel || "n/d"],
  ], [frameworkLabel, latencyMs, regionLabel, runtimeStatus, siteHttp]);

  if (hidden) return null;

  return (
    <div className={`pointer-events-none fixed z-[80] ${prefs.position === "bottom-right" ? "bottom-[18px] right-[18px]" : "bottom-[18px] left-[18px]"}`}>
      {open ? (
        <div className={`pointer-events-auto mb-[10px] overflow-hidden rounded-[16px] border border-[#262626] bg-[#0A0A0A] text-[#E8E8E8] shadow-[0_18px_60px_rgba(0,0,0,0.5)] ${prefs.size === "compact" ? "w-[280px]" : "w-[320px]"}`}>
          <div className="flex items-center justify-between border-b border-[#1C1C1C] px-[12px] py-[10px]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Flowdesk Live</p>
              <p className="mt-[3px] truncate font-mono text-[12px] text-[#C8C8C8]">{hostname || "sem dominio"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-[#888] hover:bg-[#161616]" aria-label="Fechar">
              <X className="h-[14px] w-[14px]" />
            </button>
          </div>

          <div className="grid gap-[6px] px-[10px] py-[10px]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-[10px] px-[4px] text-[12px]">
                <span className="text-[#777]">{label}</span>
                <span className="truncate font-medium text-[#EDEDED]">{value}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-[6px] border-t border-[#1C1C1C] p-[10px]">
            {([
              ["start", "Iniciar", Play],
              ["restart", "Reiniciar", RotateCcw],
              ["stop", "Parar", Pause],
              ["deploy", "Deploy", Rocket],
            ] as const).map(([action, label, Icon]) => (
              <button
                key={action}
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => onAction(action)}
                className="inline-flex h-[34px] items-center justify-center gap-[6px] rounded-[10px] border border-[#222] bg-[#111] text-[11px] font-semibold text-[#E8E8E8] hover:bg-[#171717] disabled:opacity-50"
              >
                {busyAction === action ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Icon className="h-[13px] w-[13px]" />}
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-[2px] border-t border-[#1C1C1C] p-[6px]">
            <button type="button" onClick={() => onAction("sync")} className="flex h-[34px] items-center justify-between rounded-[10px] px-[10px] text-[12px] text-[#D4D4D4] hover:bg-[#141414]">
              <span className="inline-flex items-center gap-[8px]"><RefreshCw className="h-[13px] w-[13px]" /> Verificar agora</span>
              <ChevronRight className="h-[13px] w-[13px] text-[#555]" />
            </button>
            {hostname ? (
              <a href={`https://${hostname}`} target="_blank" rel="noreferrer" className="flex h-[34px] items-center justify-between rounded-[10px] px-[10px] text-[12px] text-[#D4D4D4] hover:bg-[#141414]">
                <span className="inline-flex items-center gap-[8px]"><ExternalLink className="h-[13px] w-[13px]" /> Abrir site</span>
                <ChevronRight className="h-[13px] w-[13px] text-[#555]" />
              </a>
            ) : null}
            <button type="button" onClick={() => hostname && navigator.clipboard.writeText(`https://${hostname}`)} className="flex h-[34px] items-center justify-between rounded-[10px] px-[10px] text-[12px] text-[#D4D4D4] hover:bg-[#141414]">
              <span className="inline-flex items-center gap-[8px]"><Copy className="h-[13px] w-[13px]" /> Copiar URL</span>
            </button>
            <button type="button" onClick={() => { onOpenTab("console"); setOpen(false); }} className="flex h-[34px] items-center justify-between rounded-[10px] px-[10px] text-[12px] text-[#D4D4D4] hover:bg-[#141414]">
              <span className="inline-flex items-center gap-[8px]"><Terminal className="h-[13px] w-[13px]" /> Console</span>
              <ChevronRight className="h-[13px] w-[13px] text-[#555]" />
            </button>
            <button type="button" onClick={() => { onOpenTab("deploys"); setOpen(false); }} className="flex h-[34px] items-center justify-between rounded-[10px] px-[10px] text-[12px] text-[#D4D4D4] hover:bg-[#141414]">
              <span className="inline-flex items-center gap-[8px]"><Activity className="h-[13px] w-[13px]" /> Deploys</span>
              <ChevronRight className="h-[13px] w-[13px] text-[#555]" />
            </button>
            <button type="button" onClick={() => { onOpenTab("domains"); setOpen(false); }} className="flex h-[34px] items-center justify-between rounded-[10px] px-[10px] text-[12px] text-[#D4D4D4] hover:bg-[#141414]">
              <span className="inline-flex items-center gap-[8px]"><Globe2 className="h-[13px] w-[13px]" /> Dominios</span>
              <ChevronRight className="h-[13px] w-[13px] text-[#555]" />
            </button>
            <button type="button" onClick={() => setPrefsOpen(true)} className="flex h-[34px] items-center justify-between rounded-[10px] bg-[#101010] px-[10px] text-[12px] text-[#D4D4D4] hover:bg-[#161616]">
              <span>Preferences</span>
              <Settings className="h-[13px] w-[13px] text-[#888]" />
            </button>
          </div>
        </div>
      ) : null}

      {prefsOpen ? (
        <div className="pointer-events-auto mb-[10px] w-[320px] overflow-hidden rounded-[16px] border border-[#262626] bg-[#0A0A0A] shadow-[0_18px_60px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between border-b border-[#1C1C1C] px-[14px] py-[12px]">
            <p className="text-[14px] font-semibold text-white">Preferences</p>
            <button type="button" onClick={() => setPrefsOpen(false)} className="text-[#888]" aria-label="Fechar preferencias">
              <X className="h-[15px] w-[15px]" />
            </button>
          </div>
          <div className="grid gap-[14px] p-[14px] text-[12px]">
            <label className="grid gap-[6px]">
              <span className="font-semibold text-white">Posicao</span>
              <span className="text-[#777]">Canto do overlay ao vivo.</span>
              <select
                value={prefs.position}
                onChange={(event) => setPrefs((current) => ({ ...current, position: event.target.value as OverlayPosition }))}
                className="h-[34px] rounded-[10px] border border-[#222] bg-[#111] px-[10px] text-[#E8E8E8]"
              >
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </label>
            <label className="grid gap-[6px]">
              <span className="font-semibold text-white">Tamanho</span>
              <select
                value={prefs.size}
                onChange={(event) => setPrefs((current) => ({ ...current, size: event.target.value as OverlaySize }))}
                className="h-[34px] rounded-[10px] border border-[#222] bg-[#111] px-[10px] text-[#E8E8E8]"
              >
                <option value="medium">Medium</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <div className="flex items-center justify-between gap-[10px]">
              <div>
                <p className="font-semibold text-white">Ocultar nesta sessao</p>
                <p className="text-[#777]">Esconde por 1 dia.</p>
              </div>
              <button
                type="button"
                onClick={() => setPrefs((current) => ({ ...current, hiddenUntil: Date.now() + 86_400_000 }))}
                className="inline-flex h-[32px] items-center gap-[6px] rounded-[9px] border border-[#2A2A2A] px-[10px] text-[#E8E8E8]"
              >
                <EyeOff className="h-[13px] w-[13px]" /> Hide
              </button>
            </div>
            <div className="flex items-center justify-between gap-[10px]">
              <div>
                <p className="font-semibold text-white">Atalho</p>
                <p className="text-[#777]">{prefs.shortcut}</p>
              </div>
              <button
                type="button"
                onClick={() => setRecording(true)}
                className="inline-flex h-[32px] items-center gap-[6px] rounded-[9px] border border-dashed border-[#3A3A3A] px-[10px] text-[#E8E8E8]"
              >
                <Keyboard className="h-[13px] w-[13px]" /> {recording ? "Pressione..." : "Record"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setPrefsOpen(false);
        }}
        className={`pointer-events-auto flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[#2A2A2A] bg-[#050505] text-white ${ring}`}
        aria-label="Abrir Flowdesk Live"
        title={`HTTP ${httpLabel}`}
      >
        <span className="relative flex h-[34px] w-[34px] items-center justify-center">
          <FlowdeskMark className="h-[18px] w-[18px]" />
          <span className="absolute -bottom-[7px] rounded-full bg-[#111] px-[4px] font-mono text-[8px] font-bold leading-none text-[#E8E8E8]">{httpLabel}</span>
        </span>
      </button>
    </div>
  );
}
