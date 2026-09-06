"use client";

export const TEAM_ICON_OPTIONS = [
  {
    key: "aurora",
    label: "Aurora",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#91B6FF_0%,#245BFF_48%,#081A4E_100%)]",
  },
  {
    key: "ember",
    label: "Ember",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#FFC18F_0%,#FF7A1A_48%,#4A1805_100%)]",
  },
  {
    key: "ocean",
    label: "Ocean",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#8AF2FF_0%,#148EBC_48%,#052238_100%)]",
  },
  {
    key: "amethyst",
    label: "Amethyst",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#D9A8FF_0%,#7D3BFF_48%,#220842_100%)]",
  },
  {
    key: "forest",
    label: "Forest",
    shell:
      "bg-[radial-gradient(circle_at_30%_20%,#A9FFB8_0%,#0E8E4E_48%,#062615_100%)]",
  },
  {
    key: "sunset",
    label: "Sunset",
    shell:
      "bg-[radial-gradient(circle_at_28%_18%,#FFD7A8_0%,#FF7A59_36%,#D83A7C_68%,#2D0718_100%)]",
  },
] as const;

export function getTeamIconShell(iconKey: string) {
  return (
    TEAM_ICON_OPTIONS.find((option) => option.key === iconKey)?.shell ||
    TEAM_ICON_OPTIONS[0].shell
  );
}

function teamInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "E";
}

export function TeamAvatar({
  iconKey,
  name,
  className = "",
  textClassName = "text-[#F3F3F3]",
}: {
  iconKey: string;
  name: string;
  className?: string;
  textClassName?: string;
}) {
  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-[12px] ${getTeamIconShell(
        iconKey,
      )} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18)_0%,transparent_58%)]" />
      <span
        className={`relative z-10 text-[14px] leading-none font-semibold tracking-[-0.04em] ${textClassName}`}
      >
        {teamInitial(name)}
      </span>
    </div>
  );
}
