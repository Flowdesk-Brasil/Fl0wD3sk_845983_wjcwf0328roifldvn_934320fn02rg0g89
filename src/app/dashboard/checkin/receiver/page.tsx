"use client";

import { useCallback, useEffect, useState } from "react";
import { QRScannerReceiver } from "@/components/qr-scanner-receiver";
import { getEnrollments, getStudents, processCheckin } from "@/lib/api";
import type { Checkin, Enrollment, Student } from "@/lib/types";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

interface CheckinResult {
  status: "idle" | "allowed" | "denied" | "loading";
  student?: Student | null;
  enrollment?: Enrollment | null;
  reason?: string | null;
  checkin?: Checkin | null;
}

export default function CheckinReceiverPage() {
  const [result, setResult] = useState<CheckinResult>({ status: "idle" });
  const [isValidating, setIsValidating] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    void (async () => {
      setStudents(await getStudents());
    })();
  }, []);

  const handleQRCode = useCallback(
    async (code: string) => {
      if (isValidating || result.status === "allowed" || result.status === "denied") return;

      setIsValidating(true);
      setResult({ status: "loading" });

      try {
        const checkin = await processCheckin(code);
        const student = students.find((s) => s.id === checkin.student_id);
        const enrollments = await getEnrollments();
        const enrollment = enrollments.find(
          (e) => e.student_id === checkin.student_id && e.status === "active"
        );

        setResult({
          status: checkin.status,
          student,
          enrollment,
          reason: checkin.reason,
          checkin,
        });

        setTimeout(() => {
          setResult({ status: "idle" });
        }, 3000);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Erro desconhecido";
        setResult({
          status: "denied",
          reason: error,
        });

        setTimeout(() => {
          setResult({ status: "idle" });
        }, 3000);
      } finally {
        setIsValidating(false);
      }
    },
    [isValidating, result.status, students]
  );

  if (result.status === "idle") {
    return <QRScannerReceiver onRead={handleQRCode} disabled={false} />;
  }

  return (
    <div className="fixed inset-0 z-50">
      <QRScannerReceiver onRead={handleQRCode} disabled={true} />

      <div
        className={`absolute inset-0 flex items-center justify-center transition-colors duration-300 ${
          result.status === "loading"
            ? "bg-blue-600/90 backdrop-blur-md"
            : result.status === "denied"
              ? "bg-red-600/95 backdrop-blur-sm"
              : "bg-green-500/95 backdrop-blur-sm"
        }`}
      >
        <div className="px-8 py-12 text-center">
          {result.status === "loading" && (
            <div className="space-y-6">
              <div className="mx-auto h-24 w-24 animate-spin rounded-full border-4 border-white/30 border-t-white" />
              <p className="text-3xl font-bold text-white tracking-wide">Validando...</p>
            </div>
          )}

          {result.status === "denied" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-8xl mb-6">❌</div>
              <p className="text-6xl font-black text-white uppercase tracking-wider mb-4">Acesso Negado</p>
              <p className="text-2xl text-white/90 bg-black/20 px-6 py-3 rounded-full inline-block">
                {result.reason}
              </p>
            </div>
          )}

          {result.status === "allowed" && result.student && (
            <div className="space-y-8 animate-fadeIn flex flex-col items-center">
              <div className="h-32 w-32 bg-white rounded-full flex items-center justify-center shadow-2xl mb-4">
                <span className="text-7xl">✅</span>
              </div>
              <div className="space-y-4">
                <p className="text-5xl font-extrabold text-white mb-2 tracking-tight">
                  {getGreeting()}!
                </p>
                <p className="text-6xl font-black text-white uppercase drop-shadow-lg">
                  {result.student.full_name}
                </p>
              </div>
              <div className="pt-8 border-t border-white/30 w-full max-w-lg mt-8">
                <p className="text-2xl font-bold text-white/95 uppercase tracking-widest mb-2">
                  Tipo de Aula: <span className="text-white">{result.enrollment?.plan?.name || "Geral"}</span>
                </p>
                <p className="text-xl text-white/80 font-medium">
                  {new Date().toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}
