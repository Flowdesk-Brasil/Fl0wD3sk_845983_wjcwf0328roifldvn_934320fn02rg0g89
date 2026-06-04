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
  status: "allowed" | "denied" | "loading";
  student?: Student | null;
  enrollment?: Enrollment | null;
  reason?: string | null;
  checkin?: Checkin | null;
}

export default function CheckinReceiverPage() {
  const [result, setResult] = useState<CheckinResult>({ status: "allowed" });
  const [isValidating, setIsValidating] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    void (async () => {
      setStudents(await getStudents());
    })();
  }, []);

  const handleQRCode = useCallback(
    async (code: string) => {
      if (isValidating || result.status === "allowed") return;

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
          setResult({ status: "allowed" });
        }, 3000);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Erro desconhecido";
        setResult({
          status: "denied",
          reason: error,
        });

        setTimeout(() => {
          setResult({ status: "allowed" });
        }, 3000);
      } finally {
        setIsValidating(false);
      }
    },
    [isValidating, result.status, students]
  );

  if (result.status === "allowed") {
    return <QRScannerReceiver onRead={handleQRCode} disabled={false} />;
  }

  return (
    <div className="fixed inset-0">
      <QRScannerReceiver onRead={handleQRCode} disabled={true} />

      <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div
          className={`max-w-sm rounded-3xl px-8 py-12 text-center shadow-2xl ${
            result.status === "allowed"
              ? "bg-white"
              : result.status === "loading"
                ? "bg-blue-500"
                : result.status === "denied"
                  ? "bg-red-500"
                  : "bg-green-500"
          }`}
        >
          {result.status === "loading" && (
            <div className="space-y-4">
              <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-white/30 border-t-white" />
              <p className="text-lg font-semibold text-white">Validando...</p>
            </div>
          )}

          {result.status === "denied" && (
            <div className="space-y-4">
              <div className="text-5xl">❌</div>
              <p className="text-2xl font-bold text-white">Acesso negado</p>
              <p className="text-sm text-white/90">{result.reason}</p>
            </div>
          )}

          {result.status === "allowed" && result.student && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-6xl">✅</div>
              <div>
                <p className="text-3xl font-extrabold text-white mb-2">
                  {getGreeting()}!
                </p>
                <p className="text-4xl font-bold text-white">{result.student.full_name}</p>
              </div>
              <div className="pt-2 border-t border-white/20">
                <p className="text-sm font-semibold text-white/90">
                  Plano: {result.enrollment?.plan?.name || "Não identificado"}
                </p>
                <p className="text-xs text-white/75 mt-1">
                  {new Date().toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="pt-4 text-sm font-semibold text-white/80">
                Próximo aluno em 3 segundos...
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
