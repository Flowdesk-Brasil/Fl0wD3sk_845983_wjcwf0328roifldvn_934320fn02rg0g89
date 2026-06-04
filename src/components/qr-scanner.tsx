"use client";

import { Camera, CameraOff, Loader2, ScanLine, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui";

type BarcodeResult = { rawValue: string };
type BarcodeDetectorLike = {
  detect(source: ImageBitmapSource): Promise<BarcodeResult[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export function QrScanner({
  onRead,
  disabled,
}: {
  onRead: (value: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const readingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          video: { facingMode: { ideal: "environment" } },
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
              await onRead(value);
              close();
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

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex items-center justify-between">
        <div>
          <strong className="block text-sm">Leitura por câmera</strong>
          <span className="text-xs text-[#657085]">Centralize o QR Code do aluno dentro da moldura.</span>
        </div>
        <button className="icon-btn" type="button" onClick={close} aria-label="Fechar câmera"><X className="h-4 w-4" /></button>
      </div>
      <ErrorBanner message={error} />
      <div className="scanner-shell">
        <video ref={videoRef} className="scanner-video" muted playsInline />
        {!error && <div className="scanner-guide" />}
        {starting && <div className="absolute inset-0 grid place-items-center bg-[#08111f]/80 text-white"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {error && <div className="absolute inset-0 grid place-items-center px-8 text-center text-white/70"><CameraOff className="h-8 w-8" /></div>}
      </div>
      <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-[#657085]"><ScanLine className="h-4 w-4 text-blue-600" /> A leitura é automática e fecha após identificar o código.</div>
    </div>
  );
}
