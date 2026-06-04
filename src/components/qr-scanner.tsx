"use client";

import { Camera, CameraOff, Loader2, ScanLine, X, CheckCircle2, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ErrorBanner } from "@/components/ui";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

type BarcodeResult = { rawValue: string };
type BarcodeDetectorLike = {
  detect(source: ImageBitmapSource): Promise<BarcodeResult[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export function QrScanner({
  onRead,
  disabled,
}: {
  onRead: (value: string) => any;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const readingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ status: 'allowed' | 'denied', name: string, message: string } | null>(null);

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    readingRef.current = false;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const close = useCallback(() => {
    stop();
    setOpen(false);
    setStarting(false);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function start() {
      setStarting(true);
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Este navegador não oferece acesso à câmera.");
        }

        const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
        if (!Detector) {
          throw new Error("A leitura automática de QR Code não é suportada neste navegador. Use Chrome ou Edge atualizado.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { 
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, min: 30 },
            // @ts-ignore - Propriedades avançadas não tipadas em todos os navegadores, mas que aceleram o foco se disponíveis
            advanced: [{ focusMode: "continuous" }]
          },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats: ["qr_code"] });

        const scan = async () => {
          if (!active || !videoRef.current || readingRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const value = results[0]?.rawValue?.trim();
            if (value) {
              readingRef.current = true;
              const res = await onRead(value);
              
              if (res) {
                const isAllowed = res.status === "allowed";
                setValidationResult({
                  status: isAllowed ? 'allowed' : 'denied',
                  name: res.student?.full_name?.split(" ")[0] || "Aluno",
                  message: res.duplicate ? "Check-in já realizado" : res.reason || (isAllowed ? "Acesso liberado" : "Acesso negado")
                });
                
                setTimeout(() => {
                  setValidationResult(null);
                  readingRef.current = false;
                  if (active && videoRef.current) {
                    frameRef.current = requestAnimationFrame(scan);
                  }
                }, 3000);
              } else {
                readingRef.current = false;
                frameRef.current = requestAnimationFrame(scan);
              }
              return;
            }
          } catch {
            // A próxima imagem costuma resolver falhas transitórias do detector.
          }
          frameRef.current = requestAnimationFrame(scan);
        };
        frameRef.current = requestAnimationFrame(scan);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Não foi possível iniciar a câmera.";
        setError(message.includes("Permission") || message.includes("NotAllowed")
          ? "Permissão de câmera negada. Libere a câmera nas configurações do navegador."
          : message);
        stop();
      } finally {
        if (active) setStarting(false);
      }
    }

    void start();
    return () => {
      active = false;
      stop();
    };
  }, [close, onRead, open, stop]);

  if (!open) {
    return (
      <button className="btn btn-secondary w-full" type="button" disabled={disabled} onClick={() => setOpen(true)}>
        <Camera className="h-4 w-4" /> Abrir câmera
      </button>
    );
  }

  const scannerContent = (
    <div className="fixed inset-0 z-[999] bg-black">
      <video 
        ref={videoRef} 
        className="h-full w-full object-cover" 
        style={{ transform: "scaleX(-1)" }} 
        muted 
        playsInline 
      />
      
      <div className="absolute top-6 right-6 z-10">
        <button 
          className="rounded-full bg-black/60 p-3 text-white backdrop-blur-md transition-colors hover:bg-red-500" 
          onClick={close}
          title="Fechar Câmera"
        >
          <X className="h-8 w-8" />
        </button>
      </div>
      
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <div className="text-center text-white">
            <Loader2 className="mx-auto h-14 w-14 animate-spin text-blue-500" />
            <p className="mt-6 text-2xl font-bold tracking-wide">Iniciando câmera...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/95">
          <div className="max-w-md p-8 text-center text-white">
            <CameraOff className="mx-auto h-20 w-20 text-red-500 mb-6" />
            <p className="text-xl font-bold tracking-tight mb-4">{error}</p>
            <button onClick={close} className="btn mt-6 w-full bg-white text-black font-bold border-none hover:bg-slate-200 py-3">Fechar</button>
          </div>
        </div>
      )}

      {!error && !starting && !validationResult && (
        <div className="absolute inset-0 pointer-events-none flex flex-col">
           <div className="flex-1 bg-black/40 transition-colors" />
           <div className="flex">
             <div className="w-12 bg-black/40 sm:w-32" />
             <div className="relative aspect-square flex-1 border-2 border-dashed border-white/60 rounded-3xl" />
             <div className="w-12 bg-black/40 sm:w-32" />
           </div>
           <div className="flex-1 bg-black/40 flex items-center justify-center pb-10">
             <div className="bg-black/60 px-6 py-3 rounded-full backdrop-blur flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-blue-400" />
                <p className="text-sm text-white font-bold tracking-wider uppercase">Validação Automática</p>
             </div>
           </div>
        </div>
      )}

      {validationResult && (
        <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center animate-in fade-in duration-300 ${validationResult.status === 'allowed' ? 'bg-green-500' : 'bg-red-500'}`}>
          {validationResult.status === 'allowed' ? (
            <CheckCircle2 className="h-40 w-40 text-white mb-8 drop-shadow-lg" />
          ) : (
            <ShieldAlert className="h-40 w-40 text-white mb-8 drop-shadow-lg" />
          )}
          <h1 className="text-5xl font-black text-white text-center tracking-tight drop-shadow-md px-6">
            {validationResult.status === 'allowed' ? `${getGreeting()}, seja bem-vindo(a)` : 'Acesso Negado'}
          </h1>
          <p className="text-6xl font-black text-white mt-4 uppercase drop-shadow-lg text-center px-6">
            {validationResult.name}
          </p>
          <div className="mt-12 bg-black/20 backdrop-blur-md rounded-full px-8 py-4">
            <p className="text-2xl font-bold text-white uppercase tracking-widest">{validationResult.message}</p>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(scannerContent, document.body);
}
