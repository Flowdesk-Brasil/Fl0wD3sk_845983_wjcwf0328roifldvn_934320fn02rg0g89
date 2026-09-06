"use client";

import Image from "next/image";
import { resolveDefaultDiscordAvatarUrl } from "@/lib/servers/batePontoFormatting";

type Props = {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  size: number;
  className?: string;
  ringClassName?: string;
};

export function BatePontoMemberAvatar({
  userId,
  displayName,
  avatarUrl,
  size,
  className = "",
  ringClassName = "border-[#2A2A2A]",
}: Props) {
  const resolvedAvatarUrl = avatarUrl || resolveDefaultDiscordAvatarUrl(userId);
  const label = (displayName || userId).trim();
  const initial = label.replace(/^@/, "").charAt(0).toUpperCase() || "?";

  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-full border bg-[#111111] ${ringClassName} ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={resolvedAvatarUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="h-full w-full object-cover"
        onError={(event) => {
          const target = event.currentTarget;
          target.style.display = "none";
          const fallback = target.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = "flex";
        }}
      />
      <span
        className="absolute inset-0 hidden items-center justify-center bg-[#151515] text-[13px] font-semibold text-[#CFCFCF]"
        aria-hidden="true"
      >
        {initial}
      </span>
    </span>
  );
}
