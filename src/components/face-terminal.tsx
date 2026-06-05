"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Camera, X } from "lucide-react";
import { getDeviceId } from "@/lib/device-id";

export function FaceTerminalListener({ email }: { email: string }) {
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Apenas celulares em modo paisagem ou retrato devem agir como câmera
    const isMobile = window.innerWidth < 1024;
    if (!isMobile || email !== "admin@admin.com") return;

    const channel = supabase.channel("face-scan-channel", {
      config: { broadcast: { self: true } }
    })
      .on("broadcast", { event: "START_SCAN" }, ({ payload }) => {
        if (payload?.targetDeviceId && payload.targetDeviceId !== getDeviceId()) return;
        setScanning(true);
      })
      .on("broadcast", { event: "CAPTURE_SCAN" }, ({ payload }) => {
        if (payload?.targetDeviceId && payload.targetDeviceId !== getDeviceId()) return;
        captureFrame(channel);
      })
      .on("broadcast", { event: "STOP_SCAN" }, ({ payload }) => {
        if (payload?.targetDeviceId && payload.targetDeviceId !== getDeviceId()) return;
        setScanning(false);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      stopCamera();
    };
  }, [email]);

  useEffect(() => {
    if (scanning) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [scanning]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Stream frames to desktop
      if (channelRef.current) {
        streamIntervalRef.current = setInterval(() => {
          if (!videoRef.current || !channelRef.current) return;
          const canvas = document.createElement("canvas");
          canvas.width = 320; // baixa resolução para stream
          canvas.height = 240;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          const frameBase64 = canvas.toDataURL("image/jpeg", 0.4);
          
          channelRef.current.send({
            type: "broadcast",
            event: "STREAM_FRAME",
            payload: { frame: frameBase64 }
          });
        }, 300); // 3 frames por segundo
      }

    } catch (err) {
      console.error("Camera access denied", err);
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const captureFrame = (channel: any) => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.7);
    
    // Envia a foto capturada
    channel.send({
      type: "broadcast",
      event: "SCAN_RESULT",
      payload: { imageBase64: base64 }
    });
    
    setScanning(false);
  };

  if (!scanning) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="w-full h-full object-cover scale-x-[-1]" 
      />
      
      <div className="absolute top-8 left-8 right-8 flex justify-between items-center z-10">
        <h2 className="text-xl font-bold flex items-center gap-2 text-white drop-shadow-md"><Camera className="h-6 w-6" /> SCAN FACIAL</h2>
        <button onClick={() => { setScanning(false); channelRef.current?.send({ type: "broadcast", event: "STOP_SCAN" }); }} className="p-3 bg-black/40 text-white rounded-full backdrop-blur transition-colors hover:bg-red-500">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Face Frame Overlay - Egg Shape */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center overflow-hidden">
         {/* A shadow muito grande cria o overlay escuro ao redor do ovo */}
         <div 
           className="w-64 h-80 sm:w-80 sm:h-96 border-4 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]" 
           style={{ borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%' }}
         />
         <p className="absolute bottom-24 w-full text-center text-lg font-bold animate-pulse text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] px-6">
           Alinhe o rosto no centro oval.
         </p>
         <p className="absolute bottom-16 w-full text-center text-sm font-semibold text-white/80 drop-shadow-md px-6">
           O atendente irá capturar a foto.
         </p>
      </div>
    </div>
  );
}
