"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface QRScannerReceiverProps {
  onRead: (code: string) => void;
  disabled?: boolean;
}

export function QRScannerReceiver({ onRead, disabled }: QRScannerReceiverProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disabled || !videoRef.current) return;

    let animationId: number;
    const video = videoRef.current;

    const startScanning = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        video.srcObject = stream;
        video.play();

        const scanFrame = () => {
          const canvas = canvasRef.current;
          if (!canvas || !video.videoWidth) {
            animationId = requestAnimationFrame(scanFrame);
            return;
          }

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            animationId = requestAnimationFrame(scanFrame);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, canvas.width, canvas.height);

          if (code?.data) {
            onRead(code.data);
          }

          animationId = requestAnimationFrame(scanFrame);
        };

        animationId = requestAnimationFrame(scanFrame);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Câmera não disponível";
        setError(error);
      }
    };

    startScanning();

    return () => {
      cancelAnimationFrame(animationId);
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [disabled, onRead]);

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />
      <canvas ref={canvasRef} className="hidden" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80">
          <div className="max-w-md rounded-2xl bg-red-900/20 p-8 text-center backdrop-blur">
            <p className="text-lg font-semibold text-red-300">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
            >
              Recarregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
