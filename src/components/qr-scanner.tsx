"use client";

import { Camera, CameraOff, Loader2, ScanLine, X, CheckCircle2, ShieldAlert, UserCheck, ScanFace } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import * as faceapi from '@vladmandic/face-api';
import { getDeviceId } from "@/lib/device-id";
import { Screensaver } from "@/components/screensaver";

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
  const [isConfirming, setIsConfirming] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState<string>("Iniciando Reconhecimento Facial...");
  const [isReady, setIsReady] = useState(false);
  const [qrSupported, setQrSupported] = useState(true);
  const cooldownRef = useRef(0);
  const labeledDescriptorsRef = useRef<faceapi.LabeledFaceDescriptors[]>([]);
  const modelsLoadedRef = useRef(false);
  const fullscreenRequestedRef = useRef(false);
  const openStartedAtRef = useRef(0);
  const displayedCheckinsRef = useRef<Set<string>>(new Set());

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
    if (fullscreenRequestedRef.current && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    fullscreenRequestedRef.current = false;
    setOpen(false);
    setStarting(false);
    setError(null);
    setIsReady(false);
    setValidationResult(null);
    setDetectedFace(null);
    setIsConfirming(false);
  }, [stop]);

  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  const interruptedRef = useRef(false);

  const requestKioskFullscreen = useCallback(() => {
    if (typeof document === "undefined" || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen?.()
      .then(() => { fullscreenRequestedRef.current = true; })
      .catch(() => { fullscreenRequestedRef.current = false; });
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("checkin:camera-state", { detail: { open } }));
    if (open && !document.fullscreenElement) {
      requestKioskFullscreen();
    }
    return () => {
      window.dispatchEvent(new CustomEvent("checkin:camera-state", { detail: { open: false } }));
      if (open && fullscreenRequestedRef.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
        fullscreenRequestedRef.current = false;
      }
    };
  }, [open, requestKioskFullscreen]);

  // Auto-abrir após reload se solicitado
  useEffect(() => {
    if (sessionStorage.getItem("autoOpenScanner") === "true") {
      sessionStorage.removeItem("autoOpenScanner");
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const channel = supabase.channel("face-scan-qr-interrupt", { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "START_SCAN" }, ({ payload }) => {
        if (payload?.targetDeviceId && payload.targetDeviceId !== getDeviceId()) return;
        if (openRef.current) {
          interruptedRef.current = true;
          close();
        }
      })
      .on("broadcast", { event: "STOP_SCAN" }, ({ payload }) => {
        if (payload?.targetDeviceId && payload.targetDeviceId !== getDeviceId()) return;
        if (interruptedRef.current) {
          interruptedRef.current = false;
          setOpen(true);
        }
      })
      .on("broadcast", { event: "SCAN_RESULT" }, ({ payload }) => {
        if (payload?.targetDeviceId && payload.targetDeviceId !== getDeviceId()) return;
        if (interruptedRef.current) {
          interruptedRef.current = false;
          setOpen(true);
        }
      })
      .on("broadcast", { event: "REBOOT_CAMERA" }, ({ payload }) => {
        if (payload?.targetDeviceId && payload.targetDeviceId !== getDeviceId()) return;
        if (openRef.current) {
          sessionStorage.setItem("autoOpenScanner", "true");
        }
        window.location.reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [close]);

  useEffect(() => {
    if (!open) return;
    openStartedAtRef.current = Date.now();

    function displayCheckin(payload: any) {
      if (!payload?.status) return;
      if (payload.id) displayedCheckinsRef.current.add(String(payload.id));
      const manualName = typeof payload?.reason === "string"
        ? payload.reason.match(/^Liberacao manual para (.+?) pela recepcao\./)?.[1]
        : null;
      const studentName = typeof payload?.student?.full_name === "string"
        ? payload.student.full_name
        : manualName
          ? manualName
          : "Aluno";
      const firstName = studentName.split(" ")[0] || (payload.status === "allowed" ? "Liberado" : "Bloqueado");

      setValidationResult({
        status: payload.status === "allowed" ? "allowed" : "denied",
        name: firstName,
        message: payload?.manual || manualName
          ? "Liberado manualmente"
          : payload?.reason || (payload.status === "allowed" ? "Acesso liberado" : "Acesso bloqueado"),
      });

      window.setTimeout(() => setValidationResult(null), 3200);
    }

    async function displayCheckinById(id: string) {
      if (displayedCheckinsRef.current.has(id)) return;
      const { data } = await supabase
        .from("checkins")
        .select("*, student:students(id, full_name, photo_url), enrollment:enrollments(id, matricula_number, status, start_date, end_date, plan:plans(name))")
        .eq("id", id)
        .maybeSingle();
      if (data) displayCheckin(data);
    }

    async function displayLatestRecentCheckin() {
      const { data } = await supabase
        .from("checkins")
        .select("*, student:students(id, full_name, photo_url), enrollment:enrollments(id, matricula_number, status, start_date, end_date, plan:plans(name))")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data?.id || displayedCheckinsRef.current.has(data.id)) return;
      const checkedAt = new Date(data.checked_at).getTime();
      if (Number.isFinite(checkedAt) && checkedAt >= openStartedAtRef.current - 5000) displayCheckin(data);
    }

    const channel = supabase.channel("checkins-camera-realtime")
      .on("broadcast", { event: "CHECKIN_CREATED" }, ({ payload }) => {
        if (payload?.sourceDeviceId === getDeviceId()) return;
        displayCheckin(payload);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins" }, (payload) => {
        const id = (payload.new as any)?.id;
        if (id) void displayCheckinById(id);
      })
      .subscribe();
    const fallbackInterval = window.setInterval(() => {
      void displayLatestRecentCheckin();
    }, 3000);

    return () => {
      window.clearInterval(fallbackInterval);
      supabase.removeChannel(channel);
    };
  }, [open]);

  // Load Face Models & Students
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    
    async function loadFaces() {
      try {
        if (modelsLoadedRef.current && labeledDescriptorsRef.current.length > 0) {
          setIsReady(true);
          setLoadingMsg("Sistema de Catraca Ativo!");
          return;
        }

        setLoadingMsg("Carregando IA de Reconhecimento Facial...");
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        
        modelsLoadedRef.current = true;
        if (mounted) {
          setIsReady(true);
          setLoadingMsg("Camera ativa. Sincronizando rostos...");
        }
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

              const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
              if (detection) {
                labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(s.id + "|||" + s.full_name + "|||" + s.photo_url, [detection.descriptor]));
              }
              loadedCount++;
            } catch (e) {
               console.warn("Could not load face for:", s.full_name, e);
            }
          }
          if (mounted) {
            labeledDescriptorsRef.current = labeledDescriptors;
            if (labeledDescriptors.length > 0) {
              faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
            }
          }
        }
        if (mounted) {
          setLoadingMsg("Sistema de Catraca Ativo!");
          setIsReady(true);
        }
      } catch (err) {
        console.error("Face API Error:", err);
        if (mounted) {
          setLoadingMsg("Camera ativa. Reabra se o reconhecimento facial nao carregar.");
          setIsReady(true);
        }
      }
    }
    loadFaces();
    return () => { mounted = false; };
  }, [open]);

  // REALTIME: Sincroniza novos alunos automaticamente via broadcast (sem reabrir o site)
  useEffect(() => {
    if (!open) return;
    
    const channel = supabase.channel('students-sync', { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'STUDENT_FACE_UPDATED' }, async ({ payload }: any) => {
        if (!modelsLoadedRef.current) return;
        const { id, full_name, photo_url } = payload;
        if (!photo_url || !id || !full_name) return;
        
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = photo_url;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          
          const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
          
          if (detection) {
            const label = id + "|||" + full_name + "|||" + photo_url;
            const updated = labeledDescriptorsRef.current.filter(d => !d.label.startsWith(id + "|||"));
            updated.push(new faceapi.LabeledFaceDescriptors(label, [detection.descriptor]));
            labeledDescriptorsRef.current = updated;
            faceMatcherRef.current = new faceapi.FaceMatcher(updated, 0.55);
            console.log(`[CATRACA REALTIME] Novo rosto sincronizado: ${full_name}`);
          }
        } catch (e) {
          console.warn("[CATRACA REALTIME] Erro ao processar rosto:", e);
        }
      })
      .on('broadcast', { event: 'STUDENT_FACE_REMOVED' }, ({ payload }: any) => {
        const { id } = payload;
        if (!id) return;
        const updated = labeledDescriptorsRef.current.filter(d => !d.label.startsWith(id + "|||"));
        labeledDescriptorsRef.current = updated;
        faceMatcherRef.current = updated.length > 0 ? new faceapi.FaceMatcher(updated, 0.55) : null;
        console.log(`[CATRACA REALTIME] Rosto removido: ${id}`);
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [open]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function start() {
      setStarting(true);
      setError(null);
      setIsReady(false);
      setLoadingMsg("Abrindo camera...");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Este navegador não oferece acesso à câmera.");
        }

        const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
        let detector: BarcodeDetectorLike | null = null;
        if (Detector) {
          try {
            detector = new Detector({ formats: ["qr_code"] });
            setQrSupported(true);
          } catch {
            setQrSupported(false);
          }
        } else {
          setQrSupported(false);
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { 
            facingMode: "user",
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 30, min: 20 },
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
        setIsReady(true);
        setLoadingMsg(detector ? "Camera ativa. Aproxime o rosto ou QR Code." : "Camera ativa. QR indisponivel neste navegador.");
        
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
            const results = detector ? await detector.detect(videoRef.current) : [];
            const value = results[0]?.rawValue?.trim();
            if (value) {
              readingRef.current = true;
              const res = await onRead(value);
              if (res) {
                if (res.id) displayedCheckinsRef.current.add(String(res.id));
                const isAllowed = res.status === "allowed";
                setValidationResult({
                  status: isAllowed ? 'allowed' : 'denied',
                  name: res.student?.full_name?.split(" ")[0] || "Aluno",
                  message: res.duplicate ? "Check-in já realizado" : res.reason || (isAllowed ? "Acesso liberado" : "Acesso negado")
                });
                setTimeout(() => {
                  setValidationResult(null);
                  readingRef.current = false;
                }, 2000);
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
            } else if (modelsLoadedRef.current && Date.now() - lastFaceCheck > 450) {
              lastFaceCheck = Date.now();
              const faceDetection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
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
                    frameRef.current = requestAnimationFrame(scan);
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
    if (!detectedFace || isConfirming) return;
    setIsConfirming(true);
    try {
      const res = await onRead(detectedFace.id);
      setDetectedFace(null);
      if (res) {
        if (res.id) displayedCheckinsRef.current.add(String(res.id));
        const isAllowed = res.status === "allowed";
        setValidationResult({
          status: isAllowed ? 'allowed' : 'denied',
          name: res.student?.full_name?.split(" ")[0] || "Aluno",
          message: res.duplicate ? "Check-in já realizado" : res.reason || (isAllowed ? "Acesso liberado" : "Acesso negado")
        });
        setTimeout(() => {
          setValidationResult(null);
          readingRef.current = false;
        }, 2000);
      } else {
        readingRef.current = false;
      }
    } finally {
      setIsConfirming(false);
    }
  };

  const cancelFace = () => {
    setDetectedFace(null);
    readingRef.current = false;
    cooldownRef.current = Date.now() + 2000;
  };

  if (!open) {
    return (
      <button className="btn btn-secondary w-full" type="button" disabled={disabled} onClick={() => {
        setError(null);
        setValidationResult(null);
        setDetectedFace(null);
        requestKioskFullscreen();
        setOpen(true);
      }}>
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
      
      <div className="absolute right-6 top-6 z-10">
        <button 
          className="grid h-14 w-14 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-red-500"
          onClick={close}
          title="Fechar Câmera"
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      {isReady && !error && !validationResult && !detectedFace && (
        <div className="absolute left-6 right-[92px] top-6 z-10 flex h-14 items-center">
          <div className="inline-flex min-h-11 max-w-full items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-xs font-bold text-white/80 shadow-2xl backdrop-blur-xl">
            <span className="truncate">{loadingMsg}</span>
            <span className="shrink-0 rounded-full bg-white/12 px-2 py-1 text-[10px] uppercase tracking-[.12em] text-white/55">
              {qrSupported ? "QR ativo" : "Facial ativo"}
            </span>
          </div>
        </div>
      )}
      
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
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(16,185,129,.22),rgba(0,0,0,.88)_52%,#000)] p-5 backdrop-blur-xl animate-in fade-in zoom-in duration-300">
          <div className="relative w-full max-w-[430px] overflow-hidden rounded-[32px] border border-white/20 bg-white/[.96] p-6 text-center shadow-[0_30px_90px_rgba(0,0,0,.45)]">
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
            <div className="absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl" />

            <div className="relative mx-auto mb-5 grid h-48 w-48 place-items-center">
              <div className="absolute inset-0 rounded-full border border-emerald-400/30 shadow-[0_0_60px_rgba(16,185,129,.35)]" />
              <div className="absolute inset-3 rounded-full border-4 border-emerald-500/90" />
              <div className="absolute inset-0 rounded-full border-t-4 border-t-white/90 border-r-4 border-r-emerald-300/80 border-b-4 border-b-transparent border-l-4 border-l-transparent animate-spin" />
              <div className="relative h-40 w-40 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                {detectedFace.photo_url && detectedFace.photo_url !== 'null' ? (
                  <img src={detectedFace.photo_url} alt="Foto Aluno" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-emerald-50">
                    <UserCheck className="h-16 w-16 text-emerald-500" />
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[.16em] text-emerald-700">
                <ScanFace className="h-3.5 w-3.5" /> Rosto identificado
              </div>
              <h2 className="text-3xl font-black tracking-[-.04em] text-slate-950">{detectedFace.name}</h2>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-slate-500">
                Confirme a identidade para registrar o check-in e liberar a catraca.
              </p>
            </div>

            {isConfirming && (
              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
                Validando matricula, pagamento e presenca...
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={cancelFace} disabled={isConfirming} className="min-h-14 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">Nao sou eu</button>
              <button onClick={confirmFace} disabled={isConfirming} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black uppercase tracking-[.08em] text-white shadow-[0_14px_34px_rgba(16,185,129,.34)] transition hover:bg-emerald-700 disabled:opacity-80">
                {isConfirming ? <><Loader2 className="h-5 w-5 animate-spin" /> Confirmando</> : <><CheckCircle2 className="h-5 w-5" /> Confirmar</>}
              </button>
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

      <Screensaver
        videoRef={videoRef}
        idleTimeout={10}
        isReady={isReady && !starting && !error}
        isOverlayActive={Boolean(validationResult || detectedFace)}
      />
    </div>
  );

  return createPortal(scannerContent, document.body);
}
