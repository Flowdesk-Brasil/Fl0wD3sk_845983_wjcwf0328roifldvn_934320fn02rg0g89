"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { UserCheck } from "lucide-react";
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

  // Load Models & Students
  useEffect(() => {
    let mounted = true;
    async function loadFaces() {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        
        const { data: students } = await supabase.from('students').select('id, full_name, photo_url').not('photo_url', 'is', null);
        if (students && students.length > 0 && mounted) {
          const labeledDescriptors = [];
          for (const s of students) {
            try {
              // Attempt to fetch via proxy or direct (Supabase might have CORS on localhost, but we try)
              const img = await faceapi.fetchImage(s.photo_url);
              const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
              if (detection) {
                labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(s.id + "|||" + s.full_name + "|||" + s.photo_url, [detection.descriptor]));
              }
            } catch (e) {
              console.warn("Could not load face for:", s.full_name, e);
            }
          }
          if (labeledDescriptors.length > 0 && mounted) {
            // INCREASED TOLERANCE TO 0.6 (Standard) FOR BETTER MATCHING
            faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
          }
        }
      } catch (err) {
        console.error("Face API Error:", err);
      }
    }
    loadFaces();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (disabled || !videoRef.current) return;

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

        const scanFrame = async () => {
          if (!active) return;
          if (readingRef.current) {
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

          // 1. QR Code Scan
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, canvas.width, canvas.height);

          if (code?.data) {
            readingRef.current = true;
            onRead(code.data);
            return;
          }

          // 2. Facial Recognition Scan (Draw Laser)
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

          if (Date.now() - lastFaceCheck > 150) {
            lastFaceCheck = Date.now();
            try {
              const faceDetection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
              if (faceDetection) {
                lastBox = faceDetection.detection.box;
                if (faceMatcherRef.current) {
                  const bestMatch = faceMatcherRef.current.findBestMatch(faceDetection.descriptor);
                  if (bestMatch.label !== 'unknown' && bestMatch.distance < 0.6) {
                    const [id, name, photo_url] = bestMatch.label.split("|||");
                    readingRef.current = true;
                    setDetectedFace({ id, name, photo_url });
                    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                    return;
                  }
                }
              } else {
                lastBox = null;
              }
            } catch (err) {}
          }

          // Render Laser Box if face detected recently
          if (lastBox) {
            // Mirror coordinates for the overlay because video is scaleX(-1)
            // But if we overlay canvas on top of video, and canvas is ALSO scaleX(-1), they align perfectly!
            // We just draw normally.
            const { x, y, width, height } = lastBox;
            
            overlayCtx.strokeStyle = "#00ffcc";
            overlayCtx.lineWidth = 4;
            overlayCtx.shadowColor = "#00ffcc";
            overlayCtx.shadowBlur = 15;
            overlayCtx.strokeRect(x, y, width, height);

            // Laser line
            const time = Date.now() / 300;
            const scanY = y + (Math.sin(time) + 1) / 2 * height;
            
            overlayCtx.beginPath();
            overlayCtx.moveTo(x, scanY);
            overlayCtx.lineTo(x + width, scanY);
            overlayCtx.strokeStyle = "rgba(0, 255, 204, 0.9)";
            overlayCtx.lineWidth = 3;
            overlayCtx.stroke();
            
            // Draw corners
            const l = 20; // length
            overlayCtx.lineWidth = 6;
            overlayCtx.beginPath();
            // Top left
            overlayCtx.moveTo(x, y + l); overlayCtx.lineTo(x, y); overlayCtx.lineTo(x + l, y);
            // Top right
            overlayCtx.moveTo(x + width - l, y); overlayCtx.lineTo(x + width, y); overlayCtx.lineTo(x + width, y + l);
            // Bottom right
            overlayCtx.moveTo(x + width, y + height - l); overlayCtx.lineTo(x + width, y + height); overlayCtx.lineTo(x + width - l, y + height);
            // Bottom left
            overlayCtx.moveTo(x + l, y + height); overlayCtx.lineTo(x, y + height); overlayCtx.lineTo(x, y + height - l);
            overlayCtx.stroke();
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
  }, [disabled, onRead]);

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
      {/* Offscreen canvas for QR parsing */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Onscreen canvas for Laser Drawing */}
      <canvas 
        ref={overlayCanvasRef} 
        className="absolute inset-0 h-full w-full object-cover pointer-events-none" 
        style={{ transform: "scaleX(-1)" }}
      />
      
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

      {/* Rosto Detectado Modal */}
      {detectedFace && !disabled && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
             <div className="w-32 h-32 rounded-full border-4 border-blue-500 overflow-hidden mb-6 shadow-lg bg-slate-100 flex items-center justify-center">
                {detectedFace.photo_url && detectedFace.photo_url !== 'null' ? (
                  <img src={detectedFace.photo_url} alt="Foto Aluno" className="w-full h-full object-cover" />
                ) : (
                  <UserCheck className="w-12 h-12 text-blue-500" />
                )}
             </div>
             <h2 className="text-2xl font-black text-slate-900 mb-2">Rosto Identificado</h2>
             <p className="text-lg text-slate-600 font-semibold mb-8">{detectedFace.name}</p>
             
             <div className="flex gap-3 w-full">
                <button onClick={cancelFace} className="flex-1 py-4 rounded-2xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">Cancelar</button>
                <button onClick={confirmFace} className="flex-1 py-4 rounded-2xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-md">Confirmar</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
