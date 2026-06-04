"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  LockKeyhole,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlink,
  Upload,
  X,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { SensitiveActionModal } from "@/components/account/SensitiveActionModal";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import type { SensitiveAccountAction } from "@/lib/auth/sensitiveAction";
import {
  buildDiscordAuthStartHref,
  buildGoogleAuthStartHref,
} from "@/lib/auth/paths";
import { getFriendlyWebAuthnError } from "@/lib/auth/webauthnClient";
import { getPasswordPolicyChecklist } from "@/lib/auth/passwordPolicy";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

type ProviderId = "discord" | "google" | "microsoft" | "github";

type ProviderData = {
  id: ProviderId;
  label: string;
  linked: boolean;
  canUnlink: boolean;
  identifier: string | null;
  avatarUrl: string | null;
  linkedAt: string | null;
  purpose: string;
};

type PersonalData = {
  profile: {
    displayName: string;
    username: string;
    email: string | null;
    emailVerified: boolean;
    avatarUrl: string | null;
    avatarSource: string | null;
  };
  nativeConnected: boolean;
  providers: ProviderData[];
  security: {
    totpEnabled: boolean;
    totpVerifiedAt: string | null;
    passkeys: Array<{
      id: string;
      name: string;
      deviceType: string | null;
      backedUp: boolean;
      createdAt: string;
      lastUsedAt: string | null;
    }>;
  };
};

type PersonalDataResponse = {
  ok: boolean;
  data?: PersonalData;
  message?: string;
};

type EmailChangeState = {
  changeId: string;
  current: { challengeId: string; maskedEmail: string } | null;
  next: { challengeId: string; maskedEmail: string };
};

type SensitiveActionPrompt = {
  action: SensitiveAccountAction;
  title: string;
  description: string;
  onVerified: (proof: string | null) => void | Promise<void>;
};

const panelClassName =
  "rounded-[20px] border border-[#141414] bg-[#090909] p-[18px] sm:p-[22px]";
const buttonClassName =
  "inline-flex h-[40px] items-center justify-center gap-[8px] rounded-[12px] border border-[#1A1A1A] bg-[#111111] px-[14px] text-[13px] font-medium text-[#D8D8D8] transition-colors hover:border-[#282828] hover:bg-[#151515] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName =
  "inline-flex h-[40px] items-center justify-center gap-[8px] rounded-[12px] border border-[rgba(0,98,255,0.45)] bg-[#0062FF] px-[14px] text-[13px] font-semibold text-white transition-colors hover:bg-[#146FFF] disabled:cursor-not-allowed disabled:opacity-50";
const inputClassName =
  "h-[44px] w-full rounded-[12px] border border-[#1A1A1A] bg-[#0D0D0D] px-[14px] text-[14px] text-[#E7E7E7] outline-none transition-colors placeholder:text-[#555555] focus:border-[#333333]";
const providerBrandAssets: Record<
  ProviderId,
  { src: string; imageClassName: string; badgeClassName: string }
> = {
  discord: {
    src: "/cdn/icons/providers/discord-symbol-blurple.svg",
    imageClassName: "h-[17px] w-auto",
    badgeClassName:
      "border-[rgba(88,101,242,0.28)] bg-[rgba(88,101,242,0.10)]",
  },
  google: {
    src: "/cdn/icons/providers/google-g.png",
    imageClassName: "h-[20px] w-[20px]",
    badgeClassName: "border-[#D9D9D9] bg-white",
  },
  github: {
    src: "/cdn/icons/providers/github-invertocat-black.svg",
    imageClassName: "h-[21px] w-[21px]",
    badgeClassName: "border-[#D9D9D9] bg-white",
  },
  microsoft: {
    src: "/cdn/icons/providers/microsoft-symbol.svg",
    imageClassName: "h-[19px] w-[19px]",
    badgeClassName: "border-[#D9D9D9] bg-white",
  },
};

async function fetchPersonalData(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as PersonalDataResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Nao foi possivel carregar seus dados.");
  }
  return payload;
}

async function jsonMutation(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    [key: string]: unknown;
  };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Nao foi possivel concluir esta acao.");
  }
  return payload;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="flowdesk-account-modal-nui fixed inset-0 z-[4000] isolate overflow-y-auto overscroll-contain">
      <button
        type="button"
        aria-label="Fechar modal"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(0,0,0,0.86)] backdrop-blur-[9px]"
      />
      <div className="relative z-10 flex min-h-full items-center justify-center p-[16px] sm:p-[24px]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-[520px] overflow-hidden rounded-[20px] border border-[#1B1B1B] bg-[#080808] shadow-[0_30px_110px_rgba(0,0,0,0.72)]"
        >
          <div className="flex items-center justify-between border-b border-[#151515] px-[20px] py-[17px]">
            <h3 className="text-[16px] font-semibold text-[#EEEEEE]">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[#777777] transition-colors hover:bg-[#111111] hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-[17px] w-[17px]" />
            </button>
          </div>
          <div className="max-h-[calc(100vh-120px)] overflow-y-auto p-[20px]">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProviderBadge({ provider }: { provider: ProviderId | "native" }) {
  const badgeClassName =
    "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] border";

  if (provider === "native") {
    return (
      <span className={`${badgeClassName} border-[#1A1A1A] bg-[#101010] text-[#BDBDBD]`}>
        <Mail className="h-[19px] w-[19px]" />
      </span>
    );
  }

  const asset = providerBrandAssets[provider];
  return (
    <span className={`${badgeClassName} ${asset.badgeClassName}`}>
      <Image
        src={asset.src}
        alt=""
        width={24}
        height={24}
        className={asset.imageClassName}
      />
    </span>
  );
}

function StatusPill({ active, label }: { active: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] rounded-full border px-[9px] py-[5px] text-[11px] font-medium ${
        active
          ? "border-[rgba(22,163,74,0.28)] bg-[rgba(22,163,74,0.09)] text-[#82D39A]"
          : "border-[#1B1B1B] bg-[#101010] text-[#737373]"
      }`}
    >
      {active ? <Check className="h-[12px] w-[12px]" /> : null}
      {label || (active ? "Vinculado" : "Nao vinculado")}
    </span>
  );
}

export function PersonalDataTab() {
  const router = useRouter();
  const notifications = useNotifications();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarPreviewRef = useRef<string | null>(null);
  const { data: response, error, isLoading, mutate } = useSWR<PersonalDataResponse>(
    "/api/auth/me/personal-data",
    fetchPersonalData,
    {
      refreshInterval: 4_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    },
  );
  const data = response?.data;
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [unlinkProvider, setUnlinkProvider] = useState<ProviderData | null>(null);
  const [sensitiveAction, setSensitiveAction] = useState<SensitiveActionPrompt | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSecurityProof, setEmailSecurityProof] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailChange, setEmailChange] = useState<EmailChangeState | null>(null);
  const [emailStage, setEmailStage] = useState<"start" | "current" | "new">("start");
  const [emailCode, setEmailCode] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordSecurityProof, setPasswordSecurityProof] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [totpModalOpen, setTotpModalOpen] = useState(false);
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    return () => {
      if (avatarPreviewRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewRef.current);
      }
    };
  }, []);

  async function refresh() {
    await mutate();
    router.refresh();
  }

  function replaceAvatarPreview(nextUrl: string | null) {
    if (avatarPreviewRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreviewRef.current);
    }
    avatarPreviewRef.current = nextUrl;
    setAvatarPreviewUrl(nextUrl);
  }

  function requestSensitiveAction(prompt: SensitiveActionPrompt) {
    setSensitiveAction(() => prompt);
  }

  async function handleSensitiveActionVerified(proof: string | null) {
    const prompt = sensitiveAction;
    setSensitiveAction(null);
    if (prompt) await prompt.onVerified(proof);
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    replaceAvatarPreview(URL.createObjectURL(file));
    setBusyAction("avatar");
    try {
      const formData = new FormData();
      formData.set("avatar", file);
      const response = await fetch("/api/auth/me/personal-data/avatar", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Nao foi possivel atualizar o avatar.");
      }
      await mutate(
        (current) =>
          current?.data
            ? {
                ...current,
                data: {
                  ...current.data,
                  profile: {
                    ...current.data.profile,
                    avatarUrl: String(payload.avatarUrl),
                    avatarSource: "upload",
                  },
                },
              }
            : current,
        { revalidate: false },
      );
      notifications.success("Avatar atualizado.", { title: "Meus dados" });
      await refresh();
      replaceAvatarPreview(null);
    } catch (uploadError) {
      replaceAvatarPreview(null);
      notifications.error(
        uploadError instanceof Error ? uploadError.message : "Falha ao atualizar o avatar.",
        { title: "Meus dados" },
      );
    } finally {
      event.target.value = "";
      setBusyAction(null);
    }
  }

  async function removeAvatar() {
    setBusyAction("avatar");
    try {
      const payload = await jsonMutation("/api/auth/me/personal-data/avatar", "DELETE", {});
      await mutate(
        (current) =>
          current?.data
            ? {
                ...current,
                data: {
                  ...current.data,
                  profile: {
                    ...current.data.profile,
                    avatarUrl:
                      typeof payload.avatarUrl === "string" ? payload.avatarUrl : null,
                    avatarSource: null,
                  },
                },
              }
            : current,
        { revalidate: false },
      );
      notifications.success("Avatar personalizado removido.", { title: "Meus dados" });
      void refresh();
    } catch (removeError) {
      notifications.error(
        removeError instanceof Error ? removeError.message : "Falha ao remover o avatar.",
        { title: "Meus dados" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  function beginProviderLink(provider: ProviderId) {
    setLinkModalOpen(false);
    if (provider === "discord") {
      window.location.assign(buildDiscordAuthStartHref("/account/personal_data", "link"));
      return;
    }
    if (provider === "google") {
      window.location.assign(buildGoogleAuthStartHref("/account/personal_data", "link"));
      return;
    }
    if (provider === "github") {
      openGitHubPopup();
    }
  }

  function openGitHubPopup() {
    const width = 540;
    const height = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const popup = window.open(
      "/api/auth/github/hosting/start",
      "flowdesk-hosting-github",
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );
    if (!popup) {
      notifications.error("Permita popups para conectar o GitHub.", { title: "Contas e acessos" });
      return;
    }

    setBusyAction("github-link");
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      setBusyAction(null);
    }, 120_000);
    const onMessage = async (event: MessageEvent) => {
      const payload = event.data as {
        source?: string;
        ok?: boolean;
        message?: string;
        handoffToken?: string;
      };
      if (payload?.source !== "flowdesk-hosting-github") return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      try {
        if (!payload.ok || !payload.handoffToken) {
          throw new Error(payload.message || "GitHub recusou a vinculacao.");
        }
        await jsonMutation("/api/auth/me/hosting/github/complete", "POST", {
          handoffToken: payload.handoffToken,
        });
        notifications.success("GitHub vinculado.", { title: "Contas e acessos" });
        await refresh();
      } catch (githubError) {
        notifications.error(
          githubError instanceof Error ? githubError.message : "Falha ao vincular GitHub.",
          { title: "Contas e acessos" },
        );
      } finally {
        setBusyAction(null);
      }
    };
    window.addEventListener("message", onMessage);
  }

  function confirmUnlink() {
    const provider = unlinkProvider;
    if (!provider) return;
    setUnlinkProvider(null);
    requestSensitiveAction({
      action: "provider_unlink",
      title: `Confirmar desvinculacao do ${provider.label}`,
      description: "Confirme sua identidade antes de remover este metodo de acesso.",
      onVerified: (proof) => performUnlink(provider, proof),
    });
  }

  async function performUnlink(provider: ProviderData, securityProof: string | null) {
    setBusyAction(`unlink-${provider.id}`);
    try {
      await jsonMutation(
        `/api/auth/me/personal-data/providers/${provider.id}`,
        "DELETE",
        { securityProof },
      );
      notifications.success(`${provider.label} desvinculado.`, {
        title: "Contas e acessos",
      });
      await refresh();
    } catch (unlinkError) {
      notifications.error(
        unlinkError instanceof Error ? unlinkError.message : "Falha ao desvincular.",
        { title: "Contas e acessos" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function startEmailChange() {
    setBusyAction("email");
    try {
      const payload = await jsonMutation(
        "/api/auth/me/personal-data/email-change",
        "POST",
        { action: "start", newEmail, securityProof: emailSecurityProof },
      );
      setEmailChange({
        changeId: String(payload.changeId),
        current: payload.current as EmailChangeState["current"],
        next: payload.next as EmailChangeState["next"],
      });
      setEmailStage(payload.current ? "current" : "new");
      setEmailCode("");
      notifications.success("Codigos enviados para confirmacao.", { title: "Alterar email" });
    } catch (emailError) {
      notifications.error(
        emailError instanceof Error ? emailError.message : "Falha ao iniciar a alteracao.",
        { title: "Alterar email" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function verifyEmailStage() {
    if (!emailChange || emailStage === "start") return;
    setBusyAction("email");
    try {
      const payload = await jsonMutation(
        "/api/auth/me/personal-data/email-change",
        "POST",
        {
          action: "verify",
          changeId: emailChange.changeId,
          stage: emailStage,
          code: emailCode,
        },
      );
      if (payload.completed) {
        notifications.success("Email alterado com sucesso.", { title: "Alterar email" });
        closeEmailModal();
        await refresh();
        return;
      }
      setEmailStage("new");
      setEmailCode("");
      notifications.success("Email atual confirmado.", { title: "Alterar email" });
    } catch (emailError) {
      notifications.error(
        emailError instanceof Error ? emailError.message : "Codigo invalido.",
        { title: "Alterar email" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function resendEmailCode() {
    if (!emailChange || emailStage === "start") return;
    setBusyAction("email-resend");
    try {
      await jsonMutation("/api/auth/me/personal-data/email-change", "POST", {
        action: "resend",
        changeId: emailChange.changeId,
        stage: emailStage,
      });
      notifications.success("Novo codigo enviado.", { title: "Alterar email" });
    } catch (emailError) {
      notifications.error(
        emailError instanceof Error ? emailError.message : "Falha ao reenviar.",
        { title: "Alterar email" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  function closeEmailModal() {
    setEmailModalOpen(false);
    setEmailStage("start");
    setEmailChange(null);
    setNewEmail("");
    setEmailCode("");
    setEmailSecurityProof(null);
  }

  function openEmailChange() {
    requestSensitiveAction({
      action: "email_change",
      title: "Confirmar alteracao de email",
      description: "Esta alteracao muda o principal acesso da conta.",
      onVerified: (proof) => {
        setEmailSecurityProof(proof);
        setEmailModalOpen(true);
      },
    });
  }

  function closePasswordModal() {
    setPasswordModalOpen(false);
    setPasswordSecurityProof(null);
    setCurrentPassword("");
    setNewPasswordValue("");
    setConfirmPassword("");
    setPasswordVisible(false);
  }

  function openPasswordModal() {
    requestSensitiveAction({
      action: "password_change",
      title: data?.nativeConnected ? "Confirmar alteracao de senha" : "Confirmar criacao de senha",
      description: "Confirme sua identidade antes de alterar os metodos de entrada da conta.",
      onVerified: (proof) => {
        setPasswordSecurityProof(proof);
        setPasswordModalOpen(true);
      },
    });
  }

  async function submitPassword() {
    setBusyAction("password");
    try {
      const payload = await jsonMutation("/api/auth/me/personal-data/password", "POST", {
        currentPassword: data?.nativeConnected ? currentPassword : undefined,
        newPassword: newPasswordValue,
        confirmPassword,
        securityProof: passwordSecurityProof,
      });
      notifications.success(String(payload.message || "Senha atualizada."), {
        title: "Senha da conta",
      });
      closePasswordModal();
      await refresh();
    } catch (passwordError) {
      notifications.error(
        passwordError instanceof Error
          ? passwordError.message
          : "Nao foi possivel atualizar a senha.",
        { title: "Senha da conta" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  function addPasskey() {
    requestSensitiveAction({
      action: "passkey_add",
      title: "Confirmar nova Passkey",
      description: "Confirme sua identidade antes de adicionar um novo dispositivo de acesso.",
      onVerified: (proof) => performAddPasskey(proof),
    });
  }

  async function performAddPasskey(securityProof: string | null) {
    setBusyAction("passkey");
    try {
      const options = await jsonMutation(
        "/api/auth/me/personal-data/passkeys/options",
        "POST",
        { securityProof },
      );
      const credential = await startRegistration({
        optionsJSON: options.options as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });
      const platform = navigator.userAgent.includes("Windows")
        ? "Windows Hello"
        : navigator.userAgent.includes("Android")
          ? "Android"
          : "Passkey";
      await jsonMutation("/api/auth/me/personal-data/passkeys/verify", "POST", {
        challengeId: options.challengeId,
        name: platform,
        response: credential,
      });
      notifications.success("Passkey adicionada.", { title: "Autenticacao em duas etapas" });
      await refresh();
    } catch (passkeyError) {
      notifications.error(
        getFriendlyWebAuthnError(passkeyError, "register"),
        { title: "Autenticacao em duas etapas" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  function removePasskey(id: string) {
    requestSensitiveAction({
      action: "passkey_remove",
      title: "Confirmar remocao da Passkey",
      description: "A Passkey deixara de confirmar logins e alteracoes protegidas.",
      onVerified: (proof) => performRemovePasskey(id, proof),
    });
  }

  async function performRemovePasskey(id: string, securityProof: string | null) {
    setBusyAction(`passkey-${id}`);
    try {
      await jsonMutation(`/api/auth/me/personal-data/passkeys/${id}`, "DELETE", {
        securityProof,
      });
      notifications.success("Passkey removida.", { title: "Autenticacao em duas etapas" });
      await refresh();
    } catch (passkeyError) {
      notifications.error(
        passkeyError instanceof Error ? passkeyError.message : "Falha ao remover Passkey.",
        { title: "Autenticacao em duas etapas" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  function beginTotpSetup() {
    requestSensitiveAction({
      action: "totp_enable",
      title: "Confirmar novo autenticador",
      description: "Confirme sua identidade antes de adicionar outro metodo de protecao.",
      onVerified: (proof) => openTotpSetup(proof),
    });
  }

  async function openTotpSetup(securityProof: string | null) {
    setTotpModalOpen(true);
    setTotpCode("");
    setBusyAction("totp-start");
    try {
      const payload = await jsonMutation("/api/auth/me/personal-data/totp", "POST", {
        action: "start",
        securityProof,
      });
      setTotpQrCode(String(payload.qrCodeDataUrl));
      setTotpSecret(String(payload.secret));
    } catch (totpError) {
      setTotpModalOpen(false);
      notifications.error(
        totpError instanceof Error ? totpError.message : "Falha ao iniciar o autenticador.",
        { title: "Autenticacao em duas etapas" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function submitTotp() {
    setBusyAction("totp");
    try {
      await jsonMutation("/api/auth/me/personal-data/totp", "POST", {
        action: "verify",
        code: totpCode,
      });
      notifications.success("Aplicativo autenticador ativado.", {
        title: "Autenticacao em duas etapas",
      });
      setTotpModalOpen(false);
      setTotpCode("");
      await refresh();
    } catch (totpError) {
      notifications.error(
        totpError instanceof Error ? totpError.message : "Codigo invalido.",
        { title: "Autenticacao em duas etapas" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  function disableTotp() {
    requestSensitiveAction({
      action: "totp_disable",
      title: "Confirmar desativacao do autenticador",
      description: "Confirme sua identidade antes de reduzir a protecao da conta.",
      onVerified: (proof) => performDisableTotp(proof),
    });
  }

  async function performDisableTotp(securityProof: string | null) {
    setBusyAction("totp-disable");
    try {
      await jsonMutation("/api/auth/me/personal-data/totp", "DELETE", {
        securityProof,
      });
      notifications.success("Aplicativo autenticador desativado.", {
        title: "Autenticacao em duas etapas",
      });
      await refresh();
    } catch (totpError) {
      notifications.error(
        totpError instanceof Error ? totpError.message : "Falha ao desativar TOTP.",
        { title: "Autenticacao em duas etapas" },
      );
    } finally {
      setBusyAction(null);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-[16px]">
        <div className="flowdesk-shimmer h-[180px] rounded-[20px] border border-[#141414] bg-[#090909]" />
        <div className="flowdesk-shimmer h-[220px] rounded-[20px] border border-[#141414] bg-[#090909]" />
        <div className="flowdesk-shimmer h-[260px] rounded-[20px] border border-[#141414] bg-[#090909]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={panelClassName}>
        <p className="text-[14px] text-[#D9A0A0]">
          {error instanceof Error ? error.message : "Nao foi possivel carregar seus dados."}
        </p>
        <button type="button" onClick={() => void mutate()} className={`${buttonClassName} mt-[14px]`}>
          <RefreshCw className="h-[15px] w-[15px]" />
          Tentar novamente
        </button>
      </div>
    );
  }

  const visibleProviders = data.providers.filter(
    (provider) => provider.id !== "microsoft" || provider.linked,
  );
  const passwordChecklist = getPasswordPolicyChecklist(newPasswordValue);
  const twoFactorActive =
    data.security.totpEnabled || data.security.passkeys.length > 0;
  const renderedAvatarUrl = avatarPreviewUrl || data.profile.avatarUrl;

  return (
    <div className="space-y-[16px]">
      <section className={panelClassName}>
        <div className="flex flex-col gap-[20px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-[16px]">
            <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-full border border-[#222222] bg-[#111111]">
              {renderedAvatarUrl ? (
                <Image
                  src={renderedAvatarUrl}
                  alt={data.profile.displayName}
                  fill
                  sizes="76px"
                  priority
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[26px] font-semibold text-[#777777]">
                  {data.profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {busyAction === "avatar" ? (
                <span className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.48)] backdrop-blur-[2px]">
                  <RefreshCw className="h-[18px] w-[18px] animate-spin text-white" />
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold text-[#EEEEEE]">
                {data.profile.displayName}
              </p>
              <p className="mt-[5px] truncate text-[13px] text-[#777777]">
                @{data.profile.username}
              </p>
              <p className="mt-[8px] text-[12px] text-[#606060]">
                Sua foto permanece mesmo ao vincular outra conta.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-[8px]">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={busyAction === "avatar"}
              className={primaryButtonClassName}
            >
              {busyAction === "avatar" ? (
                <RefreshCw className="h-[15px] w-[15px] animate-spin" />
              ) : (
                <Upload className="h-[15px] w-[15px]" />
              )}
              {busyAction === "avatar" ? "Enviando..." : "Alterar avatar"}
            </button>
            {data.profile.avatarSource === "upload" ? (
              <button
                type="button"
                onClick={() => void removeAvatar()}
                disabled={busyAction === "avatar"}
                className={buttonClassName}
                aria-label="Remover avatar personalizado"
              >
                <Trash2 className="h-[15px] w-[15px]" />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className={panelClassName}>
        <div className="flex flex-col gap-[16px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-[13px]">
            <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] border border-[#1A1A1A] bg-[#101010] text-[#BDBDBD]">
              <Mail className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[#E8E8E8]">Email da conta</p>
              <p className="mt-[5px] truncate text-[14px] text-[#8A8A8A]">
                {data.profile.email || "Nenhum email cadastrado"}
              </p>
              <div className="mt-[8px]">
                <StatusPill
                  active={data.profile.emailVerified}
                  label={data.profile.emailVerified ? "Verificado" : "Pendente"}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={openEmailChange}
            className={`${buttonClassName} w-full sm:w-auto`}
          >
            Alterar email
            <ChevronRight className="h-[14px] w-[14px]" />
          </button>
        </div>
        <div className="my-[18px] h-px bg-[#151515]" />
        <div className="flex flex-col gap-[16px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-[13px]">
            <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] border border-[#1A1A1A] bg-[#101010] text-[#BDBDBD]">
              <KeyRound className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[#E8E8E8]">
                {data.nativeConnected ? "Senha da conta" : "Criar senha"}
              </p>
              <p className="mt-[5px] text-[12px] leading-[1.55] text-[#707070]">
                {data.nativeConnected
                  ? "Atualize a senha usada no acesso nativo."
                  : "Adicione acesso nativo por email e senha."}
              </p>
              <div className="mt-[8px]">
                <StatusPill
                  active={data.nativeConnected}
                  label={data.nativeConnected ? "Configurada" : "Nao criada"}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={openPasswordModal}
            disabled={!data.profile.email}
            title={
              data.profile.email
                ? data.nativeConnected
                  ? "Alterar senha"
                  : "Criar senha"
                : "Cadastre um email antes de criar uma senha"
            }
            className={`${buttonClassName} w-full sm:w-auto`}
          >
            {data.nativeConnected ? "Alterar senha" : "Criar senha"}
            <ChevronRight className="h-[14px] w-[14px]" />
          </button>
        </div>
      </section>

      <section className={panelClassName}>
        <div className="flex flex-col gap-[14px] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-[#ECECEC]">Contas e acessos</h3>
            <p className="mt-[5px] text-[13px] text-[#707070]">
              Metodos autorizados para entrar ou operar seus projetos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLinkModalOpen(true)}
            className={`${primaryButtonClassName} w-full sm:w-auto`}
          >
            <Link2 className="h-[15px] w-[15px]" />
            Vincular conta
          </button>
        </div>

        <div className="mt-[18px] divide-y divide-[#151515] border-t border-[#151515]">
          <div className="flex items-center gap-[13px] py-[15px]">
            <ProviderBadge provider="native" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-[#E0E0E0]">Nativo</p>
              <p className="mt-[4px] truncate text-[12px] text-[#666666]">
                {data.profile.email || "Email e senha"}
              </p>
            </div>
            <StatusPill active={data.nativeConnected} />
          </div>

          {visibleProviders.map((provider) => (
            <div key={provider.id} className="flex items-center gap-[10px] py-[15px] sm:gap-[13px]">
              <ProviderBadge provider={provider.id} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
                  <p className="text-[14px] font-medium text-[#E0E0E0]">{provider.label}</p>
                  <span className="text-[11px] text-[#555555]">{provider.purpose}</span>
                </div>
                <p className="mt-[4px] truncate text-[12px] text-[#666666]">
                  {provider.identifier || (provider.linked ? "Conta vinculada" : "Nao vinculado")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-[5px] sm:gap-[8px]">
                <StatusPill active={provider.linked} />
                {provider.linked ? (
                  <button
                    type="button"
                    onClick={() => setUnlinkProvider(provider)}
                    disabled={!provider.canUnlink || busyAction === `unlink-${provider.id}`}
                    className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[#777777] transition-colors hover:bg-[rgba(219,70,70,0.08)] hover:text-[#D68D8D] disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label={`Desvincular ${provider.label}`}
                    title={
                      provider.canUnlink
                        ? `Desvincular ${provider.label}`
                        : "Adicione outro metodo de entrada antes de desvincular"
                    }
                  >
                    <Unlink className="h-[15px] w-[15px]" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={panelClassName}>
        <div className="flex flex-col gap-[12px] sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-[#ECECEC]">Autenticacao em duas etapas</h3>
            <p className="mt-[5px] text-[13px] text-[#707070]">
              Proteja a conta com um dispositivo confiavel ou codigos temporarios.
            </p>
          </div>
          <StatusPill
            active={twoFactorActive}
            label={twoFactorActive ? "Protecao ativa" : "Nao configurada"}
          />
        </div>

        <div className="mt-[18px] space-y-[10px]">
          <div className="rounded-[16px] border border-[#161616] bg-[#0C0C0C] p-[15px]">
            <div className="flex flex-col gap-[14px] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-[13px]">
                <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] border border-[#1B1B1B] bg-[#111111] text-[#BDBDBD]">
                  <KeyRound className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <div className="flex items-center gap-[8px]">
                    <p className="text-[14px] font-medium text-[#E1E1E1]">Passkeys</p>
                    <StatusPill
                      active={data.security.passkeys.length > 0}
                      label={
                        data.security.passkeys.length
                          ? `${data.security.passkeys.length} vinculada${data.security.passkeys.length > 1 ? "s" : ""}`
                          : "Nao vinculada"
                      }
                    />
                  </div>
                  <p className="mt-[4px] text-[12px] leading-[1.5] text-[#666666]">
                    Windows Hello, biometria ou bloqueio do Android.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addPasskey}
                disabled={busyAction === "passkey"}
                className={buttonClassName}
              >
                <Plus className="h-[15px] w-[15px]" />
                Adicionar
              </button>
            </div>
            {data.security.passkeys.length ? (
              <div className="mt-[14px] divide-y divide-[#171717] border-t border-[#171717]">
                {data.security.passkeys.map((passkey) => (
                  <div key={passkey.id} className="flex items-center gap-[12px] py-[12px]">
                    <ShieldCheck className="h-[16px] w-[16px] shrink-0 text-[#7FCB95]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-[#D4D4D4]">{passkey.name}</p>
                      <p className="mt-[3px] text-[11px] text-[#5F5F5F]">
                        {passkey.backedUp ? "Sincronizada" : "Neste dispositivo"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePasskey(passkey.id)}
                      disabled={busyAction === `passkey-${passkey.id}`}
                      className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[9px] text-[#777777] transition-colors hover:bg-[rgba(219,70,70,0.08)] hover:text-[#D68D8D]"
                      aria-label="Remover Passkey"
                    >
                      <Trash2 className="h-[14px] w-[14px]" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-[14px] rounded-[16px] border border-[#161616] bg-[#0C0C0C] p-[15px] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-[13px]">
              <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] border border-[#1B1B1B] bg-[#111111] text-[#BDBDBD]">
                <LockKeyhole className="h-[18px] w-[18px]" />
              </span>
              <div>
                <div className="flex items-center gap-[8px]">
                  <p className="text-[14px] font-medium text-[#E1E1E1]">Authenticator App</p>
                  <StatusPill active={data.security.totpEnabled} />
                </div>
                <p className="mt-[4px] text-[12px] leading-[1.5] text-[#666666]">
                  Codigos TOTP compativeis com Google Authenticator, Authy e similares.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (data.security.totpEnabled) {
                  disableTotp();
                } else {
                  beginTotpSetup();
                }
              }}
              disabled={busyAction === "totp-disable"}
              className={buttonClassName}
            >
              {data.security.totpEnabled ? "Desativar" : "Configurar"}
            </button>
          </div>
        </div>
      </section>

      {linkModalOpen ? (
        <Modal title="Vincular conta" onClose={() => setLinkModalOpen(false)}>
          <div className="space-y-[8px]">
            {(["discord", "google", "github"] as ProviderId[]).map((providerId) => {
              const provider = data.providers.find((item) => item.id === providerId);
              return (
                <button
                  key={providerId}
                  type="button"
                  onClick={() => beginProviderLink(providerId)}
                  disabled={provider?.linked || busyAction === "github-link"}
                  className="flex w-full items-center gap-[13px] rounded-[14px] border border-[#171717] bg-[#0D0D0D] px-[14px] py-[13px] text-left transition-colors hover:border-[#242424] hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <ProviderBadge provider={providerId} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-[#E3E3E3]">
                      {provider?.label}
                    </span>
                    <span className="mt-[4px] block text-[12px] text-[#666666]">
                      {providerId === "github"
                        ? "Autorize o acesso aos projetos da VPS."
                        : "Use outra conta deste provedor para acessar a Flowdesk."}
                    </span>
                  </span>
                  <StatusPill active={Boolean(provider?.linked)} />
                </button>
              );
            })}
          </div>
        </Modal>
      ) : null}

      {unlinkProvider ? (
        <Modal title={`Desvincular ${unlinkProvider.label}`} onClose={() => setUnlinkProvider(null)}>
          <p className="text-[14px] leading-[1.65] text-[#9A9A9A]">
            Este acesso deixara de funcionar para sua conta. Seus projetos e dados continuam intactos.
          </p>
          <div className="mt-[20px] flex justify-end gap-[8px]">
            <button type="button" onClick={() => setUnlinkProvider(null)} className={buttonClassName}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmUnlink}
              disabled={busyAction === `unlink-${unlinkProvider.id}`}
              className="inline-flex h-[40px] items-center justify-center gap-[8px] rounded-[12px] border border-[rgba(219,70,70,0.35)] bg-[rgba(219,70,70,0.1)] px-[14px] text-[13px] font-semibold text-[#E0A0A0] transition-colors hover:bg-[rgba(219,70,70,0.16)]"
            >
              <Unlink className="h-[15px] w-[15px]" />
              Desvincular
            </button>
          </div>
        </Modal>
      ) : null}

      {emailModalOpen ? (
        <Modal title="Alterar email" onClose={closeEmailModal}>
          {emailStage === "start" ? (
            <div>
              <p className="text-[13px] leading-[1.6] text-[#777777]">
                Enviaremos um codigo para o email atual e outro para o novo email.
              </p>
              <label className="mt-[18px] block text-[12px] font-medium text-[#8A8A8A]">
                Novo email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="novo@email.com"
                className={`${inputClassName} mt-[8px]`}
              />
              <button
                type="button"
                onClick={() => void startEmailChange()}
                disabled={!newEmail.trim() || busyAction === "email"}
                className={`${primaryButtonClassName} mt-[16px] w-full`}
              >
                Enviar codigos
              </button>
            </div>
          ) : (
            <div>
              <p className="text-[13px] leading-[1.6] text-[#777777]">
                Digite o codigo enviado para{" "}
                <span className="text-[#BDBDBD]">
                  {emailStage === "current"
                    ? emailChange?.current?.maskedEmail
                    : emailChange?.next.maskedEmail}
                </span>
                .
              </p>
              <input
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={emailCode}
                onChange={(event) =>
                  setEmailCode(event.target.value.toUpperCase().replace(/\s+/g, ""))
                }
                placeholder="CODIGO"
                maxLength={8}
                className={`${inputClassName} mt-[16px] text-center font-mono text-[18px]`}
              />
              <button
                type="button"
                onClick={() => void verifyEmailStage()}
                disabled={emailCode.length < 6 || busyAction === "email"}
                className={`${primaryButtonClassName} mt-[12px] w-full`}
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => void resendEmailCode()}
                disabled={busyAction === "email-resend"}
                className="mt-[12px] w-full text-center text-[12px] text-[#777777] transition-colors hover:text-[#BBBBBB]"
              >
                Reenviar codigo
              </button>
            </div>
          )}
        </Modal>
      ) : null}

      {passwordModalOpen ? (
        <Modal
          title={data.nativeConnected ? "Alterar senha" : "Criar senha"}
          onClose={closePasswordModal}
        >
          <div className="space-y-[14px]">
            <p className="text-[13px] leading-[1.6] text-[#777777]">
              {data.nativeConnected
                ? "A nova senha encerra outras sessoes e revoga dispositivos confiaveis."
                : "Depois de criada, voce tambem podera entrar usando email e senha."}
            </p>
            {data.nativeConnected ? (
              <label className="block">
                <span className="text-[12px] font-medium text-[#8A8A8A]">Senha atual</span>
                <input
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className={`${inputClassName} mt-[7px]`}
                />
              </label>
            ) : null}
            <label className="block">
              <span className="text-[12px] font-medium text-[#8A8A8A]">Nova senha</span>
              <div className="relative mt-[7px]">
                <input
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPasswordValue}
                  onChange={(event) => setNewPasswordValue(event.target.value)}
                  className={`${inputClassName} pr-[46px]`}
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  className="absolute right-[6px] top-1/2 inline-flex h-[32px] w-[32px] -translate-y-1/2 items-center justify-center rounded-[9px] text-[#666666] transition-colors hover:bg-[#151515] hover:text-[#BBBBBB]"
                  aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
                >
                  {passwordVisible ? (
                    <EyeOff className="h-[15px] w-[15px]" />
                  ) : (
                    <Eye className="h-[15px] w-[15px]" />
                  )}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-[#8A8A8A]">Confirmar nova senha</span>
              <input
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`${inputClassName} mt-[7px]`}
              />
            </label>
            <div className="grid gap-[6px] rounded-[12px] border border-[#171717] bg-[#0C0C0C] p-[12px] sm:grid-cols-2">
              {passwordChecklist.map((item) => (
                <span
                  key={item.id}
                  className={`flex items-center gap-[6px] text-[11px] ${
                    item.valid ? "text-[#7FCB95]" : "text-[#656565]"
                  }`}
                >
                  <Check className="h-[12px] w-[12px] shrink-0" />
                  {item.label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void submitPassword()}
              disabled={
                busyAction === "password" ||
                (data.nativeConnected && !currentPassword) ||
                !passwordChecklist.every((item) => item.valid) ||
                !confirmPassword ||
                newPasswordValue !== confirmPassword
              }
              className={`${primaryButtonClassName} w-full`}
            >
              {data.nativeConnected ? "Salvar nova senha" : "Criar senha"}
            </button>
          </div>
        </Modal>
      ) : null}

      {totpModalOpen ? (
        <Modal
          title="Configurar autenticador"
          onClose={() => setTotpModalOpen(false)}
        >
          <div>
            {totpQrCode ? (
              <div className="mx-auto h-[196px] w-[196px] overflow-hidden rounded-[14px] border border-[#202020] bg-white p-[8px]">
                <Image
                  src={totpQrCode}
                  alt="QR Code do autenticador"
                  width={180}
                  height={180}
                  className="h-full w-full"
                />
              </div>
            ) : (
              <div className="flowdesk-shimmer mx-auto h-[196px] w-[196px] rounded-[14px] bg-[#111111]" />
            )}
            {totpSecret ? (
              <p className="mt-[12px] break-all text-center font-mono text-[11px] text-[#666666]">
                {totpSecret}
              </p>
            ) : null}
          </div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
            placeholder="000000"
            className={`${inputClassName} mt-[16px] text-center font-mono text-[18px]`}
          />
          <button
            type="button"
            onClick={() => void submitTotp()}
            disabled={totpCode.length !== 6 || busyAction === "totp" || !totpQrCode}
            className={`${primaryButtonClassName} mt-[12px] w-full`}
          >
            Ativar autenticador
          </button>
        </Modal>
      ) : null}

      {sensitiveAction ? (
        <SensitiveActionModal
          isOpen
          action={sensitiveAction.action}
          title={sensitiveAction.title}
          description={sensitiveAction.description}
          onClose={() => setSensitiveAction(null)}
          onVerified={handleSensitiveActionVerified}
        />
      ) : null}
    </div>
  );
}
