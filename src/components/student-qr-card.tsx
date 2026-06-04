"use client";

import { Download, QrCode } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function StudentQrCard({ code, name, compact = false }: { code: string; name: string; compact?: boolean }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(code, { width: 420, margin: 2, errorCorrectionLevel: "H", color: { dark: "#172033", light: "#ffffff" } }).then(setImage);
  }, [code]);

  return (
    <div className={`rounded-2xl border border-[#e3e8f0] bg-white text-center ${compact ? "p-4" : "p-6"}`}>
      {image ? <Image unoptimized width={compact ? 160 : 256} height={compact ? 160 : 256} className="mx-auto" src={image} alt={`QR Code de ${name}`} /> : <div className="mx-auto grid h-40 w-40 place-items-center rounded-2xl bg-[#f7f9fc]"><QrCode className="h-8 w-8 text-[#8d97aa]" /></div>}
      <strong className="mt-3 block text-sm">{name}</strong>
      <code className="mt-1 block text-[10px] font-bold text-blue-600">{code}</code>
      {image && !compact && <a className="btn btn-secondary mt-4" href={image} download={`qrcode-${name.toLowerCase().replace(/\s+/g, "-")}.png`}><Download className="h-4 w-4" /> Baixar QR Code</a>}
    </div>
  );
}
