import Image from "next/image";

function accountInitial(displayName: string, username: string) {
  const source = displayName.trim() || username.trim();
  return source.slice(0, 1).toUpperCase() || "U";
}

export function PanelAvatar({
  avatarUrl,
  displayName,
  username,
  size = 32,
  className = "",
}: {
  avatarUrl: string | null;
  displayName: string;
  username: string;
  size?: number;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={displayName}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`.trim()}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[#2a2a30] font-semibold text-[#EDEDED] ${className}`.trim()}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {accountInitial(displayName, username)}
    </div>
  );
}
