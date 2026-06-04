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

  const [fullScreen, setFullScreen] = useState(false);

  return (
    <>
      <div className={`rounded-2xl border border-[#e3e8f0] bg-white text-center ${compact ? "p-4" : "p-6"} flex flex-col`}>
        {image ? <Image unoptimized width={compact ? 160 : 256} height={compact ? 160 : 256} className="mx-auto" src={image} alt={`QR Code de ${name}`} /> : <div className="mx-auto grid h-40 w-40 place-items-center rounded-2xl bg-[#f7f9fc]"><QrCode className="h-8 w-8 text-[#8d97aa]" /></div>}
        <strong className="mt-3 block text-sm">{name}</strong>
        <code className="mt-1 block text-[10px] font-bold text-blue-600">{code}</code>
        {image && !compact && (
          <button 
            onClick={() => setFullScreen(true)}
            className="btn btn-primary mt-4 w-full py-4 text-sm font-bold bg-blue-600 border-none shadow-md hover:bg-blue-700 hover:scale-[1.02] transition-all"
          >
            <QrCode className="h-5 w-5 mr-2" /> Fazer CHECK-IN
          </button>
        )}
      </div>

      {fullScreen && image && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
          <button 
            onClick={() => setFullScreen(false)}
            className="absolute top-6 right-6 p-4 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <span className="sr-only">Fechar</span>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          
          <h2 className="text-3xl font-black text-slate-800 mb-8 tracking-tight text-center">Aproxime da catraca</h2>
          
          <div className="bg-white p-4 rounded-3xl shadow-2xl border-4 border-slate-100 max-w-[400px] w-full aspect-square">
            <Image unoptimized width={800} height={800} className="w-full h-full object-contain" src={image} alt={`QR Code de ${name}`} />
          </div>
          
          <p className="mt-8 text-xl font-bold text-blue-600 uppercase tracking-widest">{name}</p>
          <p className="mt-2 text-sm font-semibold text-slate-400">Aumente o brilho da tela para facilitar a leitura</p>
        </div>
      )}
    </>
  );
}
