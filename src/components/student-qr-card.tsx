"use client";

import { QrCode } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function StudentQrCard({ code, name, compact = false, variant = "light" }: { code: string; name: string; compact?: boolean; variant?: "light" | "dark" }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(code, { width: 420, margin: 2, errorCorrectionLevel: "H", color: { dark: "#172033", light: "#ffffff" } }).then(setImage);
  }, [code]);

  const dark = variant === "dark";

  return (
    <div className={`flex flex-col rounded-[28px] border text-center transition duration-300 ${compact ? "p-4" : "p-5"} ${dark ? "border-white/10 bg-white/[.06] text-white" : "border-[#e3e8f0] bg-white text-[#172033]"}`}>
      <div className={`mx-auto rounded-[24px] transition duration-300 ${dark ? "bg-white p-3 shadow-[0_20px_70px_rgba(0,0,0,.35)]" : ""}`}>
        {image ? <Image unoptimized width={compact ? 160 : 256} height={compact ? 160 : 256} className="mx-auto animate-in fade-in zoom-in-95 duration-300" src={image} alt={`QR Code de ${name}`} /> : <div className="mx-auto grid h-40 w-40 place-items-center rounded-2xl bg-[#f7f9fc]"><QrCode className="h-8 w-8 text-[#8d97aa]" /></div>}
      </div>
      <strong className="mt-4 block text-sm">{name}</strong>
      <code className={`mt-1 block text-[10px] font-bold ${dark ? "text-white/48" : "text-blue-600"}`}>{code}</code>
    </div>
  );
}
