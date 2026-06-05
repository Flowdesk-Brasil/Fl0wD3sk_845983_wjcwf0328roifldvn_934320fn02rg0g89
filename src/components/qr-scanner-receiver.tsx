"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { UserCheck, ScanFace, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import * as faceapi from '@vladmandic/face-api';

interface QRScannerReceiverProps {
  onRead: (code: string) => void;
  disabled?: boolean;
}

export function QRScannerReceiver({ onRead, disabled }: QRScannerReceiverProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Face Recognition State
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const [detectedFace, setDetectedFace] = useState<{ id: string; name: string; photo_url: string } | null>(null);
  const readingRef = useRef(false);
  const [loadingMsg, setLoadingMsg] = useState<string>("Iniciando Reconhecimento Facial...");
  const [isReady, setIsReady] = useState(false);
  const disabledRef = useRef(disabled);
  const cooldownRef = useRef(0);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  // Load Models & Students
  useEffect(() => {
    let mounted = true;
    async function loadFaces() {
      try {
        setLoadingMsg("Carregando IA de Reconhecimento Facial...");
        // Using TinyFaceDetector with higher inputSize is fast AND highly accurate, avoiding UI freeze!
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

              // Use high resolution TinyFaceDetector for precision
              const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
              if (detection) {
                labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(s.id + "|||" + s.full_name + "|||" + s.photo_url, [detection.descriptor]));
              }
              loadedCount++;
            } catch (e) {
              console.warn("Could not process face for:", s.full_name, e);
            }
          }
          if (labeledDescriptors.length > 0 && mounted) {
            // Tolerance 0.55 for precision
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
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    let animationId: number;
    let active = true;
    const video = videoRef.current;

    const startScanning = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        video.srcObject = stream;
        video.play();

        let lastFaceCheck = Date.now();
        let lastBox: any = null;
        let lastMatch: any = null;

        const scanFrame = async () => {
          if (!active) return;
          if (readingRef.current || disabledRef.current) {
            animationId = requestAnimationFrame(scanFrame);
            return;
          }

          const canvas = canvasRef.current;
          const overlayCanvas = overlayCanvasRef.current;
          
          if (!canvas || !video.videoWidth || !overlayCanvas) {
            animationId = requestAnimationFrame(scanFrame);
            return;
          }

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          const overlayCtx = overlayCanvas.getContext("2d");
          if (!ctx || !overlayCtx) {
            animationId = requestAnimationFrame(scanFrame);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          overlayCanvas.width = video.videoWidth;
          overlayCanvas.height = video.videoHeight;
          
          ctx.drawImage(video, 0, 0);

          // 1. QR Code Scan (Always runs first, guarantees it works instantly)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, canvas.width, canvas.height);

          if (code?.data) {
            readingRef.current = true;
            onRead(code.data);
            animationId = requestAnimationFrame(scanFrame);
            return;
          }

          // 2. Facial Recognition Scan (Non-blocking, runs every 250ms)
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

          if (Date.now() < cooldownRef.current) {
            lastBox = null;
            lastMatch = null;
          } else if (Date.now() - lastFaceCheck > 250) {
            lastFaceCheck = Date.now();
            try {
              // High resolution tinyFaceDetector ensures accuracy WITHOUT freezing the UI
              const faceDetection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
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
                    animationId = requestAnimationFrame(scanFrame);
                    return;
                  } else {
                    lastMatch = 'unknown'; // Face found but not recognized
                  }
                } else {
                  lastMatch = 'unknown'; // Database empty
                }
              } else {
                lastBox = null;
                lastMatch = null;
              }
            } catch (err) {}
          }

          // Render Advanced Laser Box
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

            // Laser line
            const time = Date.now() / 200;
            const scanY = y + (Math.sin(time) + 1) / 2 * height;
            
            overlayCtx.beginPath();
            overlayCtx.moveTo(x, scanY);
            overlayCtx.lineTo(x + width, scanY);
            overlayCtx.strokeStyle = colorRgba;
            overlayCtx.lineWidth = 3;
            overlayCtx.stroke();
            
            // Draw corners
            const l = 30; 
            overlayCtx.lineWidth = 8;
            overlayCtx.beginPath();
            overlayCtx.moveTo(x, y + l); overlayCtx.lineTo(x, y); overlayCtx.lineTo(x + l, y);
            overlayCtx.moveTo(x + width - l, y); overlayCtx.lineTo(x + width, y); overlayCtx.lineTo(x + width, y + l);
            overlayCtx.moveTo(x + width, y + height - l); overlayCtx.lineTo(x + width, y + height); overlayCtx.lineTo(x + width - l, y + height);
            overlayCtx.moveTo(x + l, y + height); overlayCtx.lineTo(x, y + height); overlayCtx.lineTo(x, y + height - l);
            overlayCtx.stroke();
            
            // Write HUD Text
            overlayCtx.font = "20px monospace";
            overlayCtx.fillStyle = colorPrimary;
            overlayCtx.fillText(isUnknown ? "ANALISANDO FACIAL..." : "ALUNO IDENTIFICADO", x, y - 10);
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
      active = false;
      cancelAnimationFrame(animationId);
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onRead]);

  useEffect(() => {
    if (!disabled) {
      readingRef.current = false;
      setDetectedFace(null);
    }
  }, [disabled]);

  const confirmFace = () => {
    if (!detectedFace) return;
    onRead(detectedFace.id);
    setDetectedFace(null);
  };

  const cancelFace = () => {
    setDetectedFace(null);
    readingRef.current = false;
    cooldownRef.current = Date.now() + 3000; // Pause facial scan for 3s
  };

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: "scaleX(-1)" }}
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />
      
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

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 z-50">
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

      {/* Rosto Detectado Modal */}
      {detectedFace && !disabled && (
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
    </div>
  );
}
