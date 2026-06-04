"use client";

import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function IconInput({
  icon: Icon,
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon }) {
  const [visible, setVisible] = useState(false);
  const password = type === "password";

  return (
    <span className="input-shell">
      <Icon className="input-leading-icon" aria-hidden="true" />
      <input
        {...props}
        type={password && visible ? "text" : type}
        className={cn("field field-with-icon", password && "field-with-action", className)}
      />
      {password && (
        <button
          className="input-action"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </span>
  );
}
