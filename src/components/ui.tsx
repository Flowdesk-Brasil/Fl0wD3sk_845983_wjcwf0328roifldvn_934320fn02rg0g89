"use client";

import type { LucideIcon } from "lucide-react";
import { AlertCircle, Inbox, Loader2, Search, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        {eyebrow && <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#657085]">{eyebrow}</span>}
        <h1 className="text-3xl font-black tracking-[-.05em] text-[#172033]">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#657085]">{description}</p>
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}

export function Avatar({ src, fallback, size = "md" }: { src?: string | null; fallback: string; size?: "sm" | "md" | "lg" }) {
  const [error, setError] = useState(false);
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };
  const bgColors = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-purple-100 text-purple-700", "bg-orange-100 text-orange-700"];
  const colorIndex = fallback.length % bgColors.length;
  const initials = fallback.substring(0, 2).toUpperCase();

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-full font-bold uppercase", sizeClasses[size], !src || error ? bgColors[colorIndex] : "bg-slate-100")}>
      {src && !error ? <img src={src} alt={fallback} onError={() => setError(true)} className="h-full w-full object-cover" /> : initials}
    </div>
  );
}

export function LoadingState({ label = "Carregando dados..." }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon className="h-6 w-6" /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search className="h-4 w-4" />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={cn("modal-box", size === "sm" && "max-w-md", size === "md" && "max-w-xl", size === "lg" && "max-w-3xl")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="field-label">
      {children}
      {required && <span aria-hidden="true"> *</span>}
    </span>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "green" | "red" | "yellow" | "blue" | "gray" | "purple";
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
