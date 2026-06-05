"use client";

import { Camera, CameraOff, Loader2, ScanLine, X, CheckCircle2, ShieldAlert, UserCheck, ScanFace } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import * as faceapi from '@vladmandic/face-api';

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
  
  // Face Recognition State
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const [detectedFace, setDetectedFace] = useState<{ id: string; name: string; photo_url: string } | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string>("Iniciando Reconhecimento Facial...");
  const [isReady, setIsReady] = useState(false);
  const cooldownRef = useRef(0);

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
    setDetectedFace(null);
  }, [stop]);

  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  const interruptedRef = useRef(false);

  useEffect(() => {
    const channel = supabase.channel("face-scan-qr-interrupt", { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "START_SCAN" }, () => {
        if (openRef.current) {
          interruptedRef.current = true;
          close();
        }
      })
      .on("broadcast", { event: "STOP_SCAN" }, () => {
        if (interruptedRef.current) {
          interruptedRef.current = false;
          setOpen(true);
        }
      })
      .on("broadcast", { event: "SCAN_RESULT" }, () => {
        if (interruptedRef.current) {
          interruptedRef.current = false;
          setOpen(true);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [close]);

  // Load Face Models & Students
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    
    async function loadFaces() {
      try {
        setLoadingMsg("Carregando IA de Reconhecimento Facial...");
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        
        setLoadingMsg("Sincronizando banco de rostos (Aguarde)...");
        const { data: students } = await supabase.from('students').select('id, full_name, photo_url').not('photo_url', 'is', null);
        if (students && students.length > 0 && mounted) {
          const labeledDescriptors = [];
          let loadedCount = 0;
          for (const s of students) {
            if (!mounted) break;
            try {
              setLoadingMsg(`Processando aluno ${loadedCount + 1}/${students.length}...`);
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.src = s.photo_url;
              await new Promise((resolve, reject) => {
                 img.onload = resolve;
                 img.onerror = reject;
              });

              const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
              if (detection) {
                labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(s.id + "|||" + s.full_name + "|||" + s.photo_url, [detection.descriptor]));
              }
              loadedCount++;
            } catch (e) {
               console.warn("Could not load face for:", s.full_name, e);
            }
          }
          if (labeledDescriptors.length > 0 && mounted) {
            faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
          }
        }
        if (mounted) {
          setLoadingMsg("Sistema de Catraca Ativo!");
          setTimeout(() => setIsReady(true), 1000);
        }
      } catch (err) {
        console.error("Face API Error:", err);
        if (mounted) {
          setLoadingMsg("Erro ao carregar IA. Operando via QR Code.");
          setTimeout(() => setIsReady(true), 3000);
        }
      }
    }
    loadFaces();
    return () => { mounted = false; };
  }, [open]);

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
            // @ts-ignore
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
        
        let lastFaceCheck = Date.now();
        let lastBox: any = null;
        let lastMatch: any = null;

        const scan = async () => {
          if (!active || !videoRef.current) return;
          if (readingRef.current) {
            frameRef.current = requestAnimationFrame(scan);
            return;
          }
          
          const overlayCanvas = overlayCanvasRef.current;
          if (!overlayCanvas || !video.videoWidth) {
            frameRef.current = requestAnimationFrame(scan);
            return;
          }

          const overlayCtx = overlayCanvas.getContext("2d");
          if (!overlayCtx) {
            frameRef.current = requestAnimationFrame(scan);
            return;
          }

          overlayCanvas.width = video.videoWidth;
          overlayCanvas.height = video.videoHeight;
          
          try {
            // 1. QR Code ALWAYS RUNS FIRST (Non-blocking)
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
                  cooldownRef.current = Date.now() + 2000;
                }, 3000);
              } else {
                readingRef.current = false;
              }
              overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
              frameRef.current = requestAnimationFrame(scan);
              return;
            }
            
            // 2. Facial Recognition (Non-blocking, runs every 250ms)
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            if (Date.now() < cooldownRef.current) {
              lastBox = null;
              lastMatch = null;
            } else if (Date.now() - lastFaceCheck > 250) {
              lastFaceCheck = Date.now();
              const faceDetection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
              if (faceDetection) {
                lastBox = faceDetection.detection.box;
                if (faceMatcherRef.current) {
                  const bestMatch = faceMatcherRef.current.findBestMatch(faceDetection.descriptor);
                  if (bestMatch.label !== 'unknown' && bestMatch.distance < 0.55) {
                    lastMatch = bestMatch;
                    const [id, name, photo_url] = bestMatch.label.split("|||");
                    readingRef.current = true;
                    setDetectedFace({ id, name, photo_url });
                    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                    return; 
                  } else {
                    lastMatch = 'unknown';
                  }
                } else {
                  lastMatch = 'unknown';
                }
              } else {
                 lastBox = null;
                 lastMatch = null;
              }
            }
            
            if (lastBox) {
              const { x, y, width, height } = lastBox;
              const isUnknown = lastMatch === 'unknown';
              
              const colorPrimary = isUnknown ? "#ff3366" : "#00ffcc";
              const colorRgba = isUnknown ? "rgba(255, 51, 102, 0.9)" : "rgba(0, 255, 204, 0.9)";
              
              overlayCtx.strokeStyle = colorPrimary;
              overlayCtx.lineWidth = 4;
              overlayCtx.shadowColor = colorPrimary;
              overlayCtx.shadowBlur = 20;
              overlayCtx.strokeRect(x, y, width, height);

              const time = Date.now() / 200;
              const scanY = y + (Math.sin(time) + 1) / 2 * height;
              
              overlayCtx.beginPath();
              overlayCtx.moveTo(x, scanY);
              overlayCtx.lineTo(x + width, scanY);
              overlayCtx.strokeStyle = colorRgba;
              overlayCtx.lineWidth = 3;
              overlayCtx.stroke();
              
              const l = 30; 
              overlayCtx.lineWidth = 8;
              overlayCtx.beginPath();
              overlayCtx.moveTo(x, y + l); overlayCtx.lineTo(x, y); overlayCtx.lineTo(x + l, y);
              overlayCtx.moveTo(x + width - l, y); overlayCtx.lineTo(x + width, y); overlayCtx.lineTo(x + width, y + l);
              overlayCtx.moveTo(x + width, y + height - l); overlayCtx.lineTo(x + width, y + height); overlayCtx.lineTo(x + width - l, y + height);
              overlayCtx.moveTo(x + l, y + height); overlayCtx.lineTo(x, y + height); overlayCtx.lineTo(x, y + height - l);
              overlayCtx.stroke();

              overlayCtx.font = "20px monospace";
              overlayCtx.fillStyle = colorPrimary;
              overlayCtx.fillText(isUnknown ? "ANALISANDO FACIAL..." : "ALUNO IDENTIFICADO", x, y - 10);
            }

          } catch {
            // Transient errors
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

  const confirmFace = async () => {
    if (!detectedFace) return;
    const res = await onRead(detectedFace.id);
    setDetectedFace(null);
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
        cooldownRef.current = Date.now() + 2000;
      }, 3000);
    } else {
      readingRef.current = false;
    }
  };

  const cancelFace = () => {
    setDetectedFace(null);
    readingRef.current = false;
    cooldownRef.current = Date.now() + 3000;
  };

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
        className="absolute inset-0 h-full w-full object-cover" 
        style={{ transform: "scaleX(-1)" }} 
        muted 
        playsInline 
      />
      
      <canvas 
        ref={overlayCanvasRef} 
        className="absolute inset-0 h-full w-full object-cover pointer-events-none" 
        style={{ transform: "scaleX(-1)" }}
      />

      {!isReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30">
          <ScanFace className="h-24 w-24 text-blue-500 animate-pulse mb-6" />
          <div className="flex items-center gap-3 bg-white/10 px-6 py-3 rounded-full text-white">
            <Loader2 className="animate-spin h-5 w-5 text-blue-400" />
            <span className="font-medium tracking-wide">{loadingMsg}</span>
          </div>
        </div>
      )}
      
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
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center text-white">
            <Loader2 className="mx-auto h-14 w-14 animate-spin text-blue-500" />
            <p className="mt-6 text-2xl font-bold tracking-wide">Iniciando câmera...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/95 z-50">
          <div className="max-w-md p-8 text-center text-white">
            <CameraOff className="mx-auto h-20 w-20 text-red-500 mb-6" />
            <p className="text-xl font-bold tracking-tight mb-4">{error}</p>
            <button onClick={close} className="btn mt-6 w-full bg-white text-black font-bold border-none hover:bg-slate-200 py-3">Fechar</button>
          </div>
        </div>
      )}

      {/* Rosto Detectado Modal */}
      {detectedFace && !validationResult && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
             <div className="w-40 h-40 rounded-full border-8 border-green-500 overflow-hidden mb-6 shadow-[0_0_30px_rgba(74,222,128,0.5)] bg-slate-100 flex items-center justify-center">
                {detectedFace.photo_url && detectedFace.photo_url !== 'null' ? (
                  <img src={detectedFace.photo_url} alt="Foto Aluno" className="w-full h-full object-cover" />
                ) : (
                  <UserCheck className="w-16 h-16 text-green-500" />
                )}
             </div>
             <h2 className="text-3xl font-black text-slate-900 mb-2">Identificado</h2>
             <p className="text-xl text-slate-600 font-bold mb-8 uppercase tracking-wide">{detectedFace.name}</p>
             
             <div className="flex gap-4 w-full">
                <button onClick={cancelFace} className="flex-1 py-4 rounded-2xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">Não sou eu</button>
                <button onClick={confirmFace} className="flex-1 py-4 rounded-2xl font-black text-white bg-green-600 hover:bg-green-700 transition shadow-lg text-lg uppercase tracking-wider">Confirmar</button>
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
