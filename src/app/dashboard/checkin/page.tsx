"use client";

import { useState } from "react";
import {
  QrCode, Search, CheckCircle2, XCircle, Shield,
  AlertTriangle, Clock, Fingerprint
} from "lucide-react";
import { mockCheckIns, mockStudents, mockEnrollments, mockPlans, mockPayments } from "@/lib/mockData";
import { formatDateTime, formatDate } from "@/lib/utils";

type Result = {
  status: "allowed" | "denied";
  student?: typeof mockStudents[0];
  enrollment?: typeof mockEnrollments[0];
  plan?: typeof mockPlans[0];
  reason?: string;
};

export default function CheckInPage() {
  const [qrInput, setQrInput]  = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult]    = useState<Result | null>(null);

  const validate = (code: string) => {
    const student = mockStudents.find(s => s.qrCode === code || s.id === code.replace("QR-","").split("-").slice(0,2).join("-"));
    if (!student) return setResult({ status: "denied", reason: "QR Code não encontrado no sistema." });
    if (student.status !== "active") return setResult({ status: "denied", student, reason: student.status === "blocked" ? "Aluno bloqueado." : "Aluno inativo." });

    const enrollment = mockEnrollments.find(e => e.studentId === student.id && e.status === "active");
    if (!enrollment) return setResult({ status: "denied", student, reason: "Nenhuma matrícula ativa." });

    const overdue = mockPayments.filter(p => p.studentId === student.id && p.status === "pending" && new Date(p.dueDate) < new Date());
    if (overdue.length) return setResult({ status: "denied", student, enrollment, reason: `Pagamento em atraso desde ${formatDate(overdue[0].dueDate)}.` });

    const plan = mockPlans.find(p => p.id === enrollment.planId);
    setResult({ status: "allowed", student, enrollment, plan });
  };

  const processInput = (code: string) => {
    if (!code.trim()) return;
    setScanning(true);
    setTimeout(() => { validate(code.trim()); setScanning(false); }, 700);
  };

  const clear = () => { setResult(null); setQrInput(""); };

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left – scanner */}
        <div className="space-y-4">
          {/* Scanner card */}
          <div className="card p-5 anim-fadeUp">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#06b6d418" }}>
                <QrCode className="w-5 h-5" style={{ color: "#06b6d4" }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Leitor de QR Code</h2>
                <p className="text-xs" style={{ color: "#52525b" }}>Leia ou insira o código do aluno</p>
              </div>
            </div>

            {/* Scanner area */}
            <div className="relative rounded-2xl flex items-center justify-center mb-5 overflow-hidden"
              style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", minHeight: 200 }}>
              {scanning ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-zinc-700 border-t-cyan-400 rounded-full anim-spin" />
                  <p className="text-sm" style={{ color: "#71717a" }}>Validando...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-2xl" style={{ border: "2px solid #1a1a1a" }} />
                    <QrCode className="w-10 h-10 absolute inset-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: "#3f3f46" }} />
                    {/* Corner indicators */}
                    {[["top-0 left-0","border-t-2 border-l-2 rounded-tl-lg"],["top-0 right-0","border-t-2 border-r-2 rounded-tr-lg"],
                      ["bottom-0 left-0","border-b-2 border-l-2 rounded-bl-lg"],["bottom-0 right-0","border-b-2 border-r-2 rounded-br-lg"]
                    ].map(([pos,cls]) => (
                      <div key={pos} className={`absolute ${pos} w-5 h-5 ${cls}`} style={{ borderColor: "#06b6d4" }} />
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: "#3f3f46" }}>Aponte o leitor para o QR Code</p>
                </div>
              )}
            </div>

            {/* Input row */}
            <form onSubmit={e => { e.preventDefault(); processInput(qrInput); }} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#52525b" }} />
                <input type="text" value={qrInput} onChange={e => setQrInput(e.target.value)}
                  placeholder="Código manual..." className="field pl-9 text-sm" id="qr-input" />
              </div>
              <button type="submit" className="btn btn-primary text-sm px-4">Validar</button>
            </form>
          </div>

          {/* Demo buttons */}
          <div className="card p-4 anim-fadeUp stagger-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#3f3f46" }}>
              Simular check-in
            </p>
            <div className="space-y-2">
              {mockStudents.slice(0,4).map(s => (
                <button key={s.id}
                  onClick={() => { setQrInput(s.qrCode); processInput(s.qrCode); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-zinc-900"
                  style={{ border: "1px solid #1a1a1a" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: s.status === "active" ? "#22c55e15" : "#ef444415",
                      color: s.status === "active" ? "#4ade80" : "#f87171",
                    }}>
                    {s.fullName[0]}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium text-white truncate">{s.fullName.split(" ").slice(0,2).join(" ")}</div>
                    <div className="text-[10px] truncate" style={{ color: "#3f3f46" }}>{s.qrCode}</div>
                  </div>
                  <QrCode className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3f3f46" }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right – result + history */}
        <div className="space-y-4">
          {/* Result */}
          {result ? (
            <div className={`card p-5 anim-scaleIn`}
              style={{ borderColor: result.status === "allowed" ? "#22c55e40" : "#ef444440" }}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: result.status === "allowed" ? "#22c55e18" : "#ef444415" }}>
                    {result.status === "allowed"
                      ? <CheckCircle2 className="w-8 h-8" style={{ color: "#22c55e" }} />
                      : <XCircle className="w-8 h-8" style={{ color: "#ef4444" }} />}
                  </div>
                  <div>
                    <div className="text-xl font-black tracking-tight"
                      style={{ color: result.status === "allowed" ? "#22c55e" : "#ef4444" }}>
                      {result.status === "allowed" ? "ACESSO LIBERADO" : "ACESSO NEGADO"}
                    </div>
                    <div className="text-xs" style={{ color: "#52525b" }}>{formatDateTime(new Date().toISOString())}</div>
                  </div>
                </div>
                <button className="btn-icon" onClick={clear}>
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {result.student && (
                <div className="space-y-3">
                  {/* Student card */}
                  <div className="flex items-center gap-4 p-4 rounded-2xl"
                    style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0"
                      style={{ background: "#8b5cf618", color: "#a78bfa" }}>
                      {result.student.fullName[0]}
                    </div>
                    <div>
                      <div className="font-bold text-base text-white">{result.student.fullName}</div>
                      <div className="text-sm" style={{ color: "#71717a" }}>{result.plan?.name ?? "Sem plano"}</div>
                    </div>
                  </div>

                  {result.reason && (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl"
                      style={{ background: "#ef444410", border: "1px solid #ef444428" }}>
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#f87171" }} />
                      <p className="text-sm" style={{ color: "#f87171" }}>{result.reason}</p>
                    </div>
                  )}

                  {result.status === "allowed" && result.enrollment && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { l: "Matrícula", v: result.enrollment.matriculaNumber },
                        { l: "Plano",     v: result.plan?.name },
                        { l: "Válida até",v: formatDate(result.enrollment.endDate) },
                        { l: "Situação",  v: "Em dia ✅" },
                      ].map(f => (
                        <div key={f.l} className="p-3 rounded-xl" style={{ background: "#111", border: "1px solid #1a1a1a" }}>
                          <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#3f3f46" }}>{f.l}</div>
                          <div className="text-sm text-white font-medium">{f.v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button onClick={clear} className="btn btn-ghost w-full mt-4 text-sm">
                Próximo Aluno
              </button>
            </div>
          ) : (
            <div className="card p-8 flex flex-col items-center justify-center text-center anim-fadeUp"
              style={{ minHeight: 220 }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "#111", border: "1px solid #1a1a1a" }}>
                <Shield className="w-8 h-8" style={{ color: "#27272a" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#52525b" }}>Aguardando leitura</p>
              <p className="text-xs mt-1" style={{ color: "#27272a" }}>Escaneie o QR Code do aluno</p>
            </div>
          )}

          {/* Recent check-ins */}
          <div className="card anim-fadeUp stagger-2">
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid #1a1a1a" }}>
              <h2 className="text-sm font-bold text-white">Check-ins Recentes</h2>
              <span className="badge badge-green">{mockCheckIns.length} hoje</span>
            </div>
            <div className="p-3 space-y-1">
              {mockCheckIns.map(ci => {
                const student = mockStudents.find(s => s.id === ci.studentId);
                return (
                  <div key={ci.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-colors">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: ci.status === "allowed" ? "#22c55e15" : "#ef444415",
                        color: ci.status === "allowed" ? "#4ade80" : "#f87171",
                      }}>
                      {student?.fullName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {student?.fullName?.split(" ").slice(0,2).join(" ")}
                      </div>
                      <div className="text-[11px]" style={{ color: "#3f3f46" }}>
                        {formatDateTime(ci.checkedAt)} · {ci.unit}
                      </div>
                    </div>
                    {ci.status === "allowed"
                      ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#22c55e" }} />
                      : <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#ef4444" }} />
                    }
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
