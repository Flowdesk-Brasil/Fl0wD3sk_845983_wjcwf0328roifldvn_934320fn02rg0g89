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
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="page-actions">{action}</div>}
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
