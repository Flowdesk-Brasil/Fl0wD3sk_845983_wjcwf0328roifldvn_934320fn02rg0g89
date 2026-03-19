"use client";

type ConfigLogoutButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export function ConfigLogoutButton({
  onClick,
  disabled = false,
}: ConfigLogoutButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="fixed bottom-0 left-1/2 z-40 -translate-x-1/2 bg-[#0A0A0A] text-center text-[13px] font-medium text-[#DB4646] transition-opacity disabled:cursor-not-allowed disabled:opacity-65"
      style={{
        width: "250px",
        height: "36px",
        borderTopLeftRadius: "3px",
        borderTopRightRadius: "3px",
        borderBottomLeftRadius: "0px",
        borderBottomRightRadius: "0px",
      }}
    >
      Logout
    </button>
  );
}
