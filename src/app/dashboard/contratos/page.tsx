"use client";

import { useState } from "react";
import {
  ScrollText, CheckCircle2, Clock, Eye, PenLine, Send, Download, X, FileText
} from "lucide-react";
import { mockStudents, mockPlans } from "@/lib/mockData";
import { formatDate, formatDateTime } from "@/lib/utils";

const CONTRACT_TEMPLATE = (nome: string, cpf: string, plano: string, valor: string, data: string, cidade: string) =>
`CONTRATO DE PRESTAÇÃO DE SERVIÇOS
Studio Corpo e Evolução — CNPJ: 00.000.000/0001-00

CONTRATANTE: ${nome}
CPF: ${cpf}

SERVIÇOS CONTRATADOS: ${plano}
VALOR MENSAL: R$ ${valor}
DATA DE INÍCIO: ${data}

CLÁUSULAS
1. O CONTRATANTE contrata os serviços de atividades físicas conforme plano selecionado.
2. O pagamento deverá ser efetuado até o dia 10 de cada mês.
3. Em caso de atraso, será cobrada multa de 2% ao mês.
4. O cancelamento deverá ser solicitado com 30 dias de antecedência.
5. O Studio não se responsabiliza por objetos deixados nas dependências.

Ao assinar este contrato, o CONTRATANTE declara ter lido e concordado com todas as cláusulas.

${cidade}, ${data}

_______________________________
CONTRATANTE: ${nome}`;

const INIT = [
  { id:"c1", studentId:"student-1", planId:"plan-1", status:"signed" as const, createdAt:"2024-01-15T10:00:00Z", signedAt:"2024-01-15T10:30:00Z" },
  { id:"c2", studentId:"student-2", planId:"plan-5", status:"signed" as const, createdAt:"2024-02-01T09:00:00Z", signedAt:"2024-02-01T09:45:00Z" },
  { id:"c3", studentId:"student-3", planId:"plan-3", status:"pending" as const, createdAt:"2024-02-15T14:00:00Z", signedAt:undefined },
];

export default function ContratosPage() {
  const [contracts, setContracts] = useState(INIT);
  const [viewing,   setViewing]   = useState<typeof INIT[0] | null>(null);
  const [signing,   setSigning]   = useState<typeof INIT[0] | null>(null);
  const [loading,   setLoading]   = useState(false);

  const enrich = (c: typeof INIT[0]) => ({
    ...c,
    student: mockStudents.find(s => s.id === c.studentId),
    plan:    mockPlans.find(p => p.id === c.planId),
  });

  const doSign = () => {
    if (!signing) return;
    setLoading(true);
    setTimeout(() => {
      setContracts(prev => prev.map(c => c.id === signing.id
        ? { ...c, status: "signed" as const, signedAt: new Date().toISOString() } : c));
      setLoading(false);
      setSigning(null);
    }, 1500);
  };

  const counts = {
    total:   contracts.length,
    signed:  contracts.filter(c => c.status === "signed").length,
    pending: contracts.filter(c => c.status === "pending").length,
  };

  return (
    <div className="space-y-5 max-w-[1200px]">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { l:"Total",    v: counts.total,   c:"#8b5cf6" },
          { l:"Assinados", v: counts.signed,  c:"#22c55e" },
          { l:"Pendentes", v: counts.pending, c:"#eab308" },
        ].map((s, i) => (
          <div key={s.l} className={`card p-4 anim-fadeUp stagger-${i+1}`}>
            <div className="text-2xl font-black" style={{ color: s.c }}>{s.v}</div>
            <div className="text-xs mt-1" style={{ color: "#71717a" }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div className="card anim-fadeUp stagger-2">
        <div className="p-5" style={{ borderBottom:"1px solid #1a1a1a" }}>
          <h2 className="text-sm font-bold text-white">Contratos Digitais</h2>
          <p className="text-xs mt-0.5" style={{ color:"#52525b" }}>Gerencie contratos dos alunos</p>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Plano</th>
                <th className="hide-mobile">Gerado em</th>
                <th className="hide-mobile">Assinado em</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map(c => {
                const e = enrich(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background:"#ec489918", color:"#f472b6" }}>
                          {e.student?.fullName?.[0]}
                        </div>
                        <span className="font-medium text-white text-sm">
                          {e.student?.fullName?.split(" ").slice(0,2).join(" ")}
                        </span>
                      </div>
                    </td>
                    <td>{e.plan?.name}</td>
                    <td className="hide-mobile">{formatDate(c.createdAt)}</td>
                    <td className="hide-mobile">{c.signedAt ? formatDate(c.signedAt) : "—"}</td>
                    <td>
                      {c.status === "signed"
                        ? <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" style={{ color:"#22c55e" }} />
                            <span className="badge badge-green">Assinado</span>
                          </div>
                        : <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" style={{ color:"#eab308" }} />
                            <span className="badge badge-yellow">Pendente</span>
                          </div>
                      }
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewing(c)} className="btn-icon" title="Visualizar">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {c.status === "pending" && (
                          <button onClick={() => setSigning(c)} className="btn-icon" style={{ color:"#22c55e" }} title="Assinar">
                            <PenLine className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button className="btn-icon" style={{ color:"#3b82f6" }} title="Enviar"><Send className="w-3.5 h-3.5" /></button>
                        <button className="btn-icon" title="Download"><Download className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View modal */}
      {viewing && (() => {
        const e = enrich(viewing);
        const text = CONTRACT_TEMPLATE(e.student?.fullName ?? "", e.student?.cpf ?? "", e.plan?.name ?? "", String(e.plan?.price.toFixed(2) ?? ""), formatDate(viewing.createdAt), e.student?.city ?? "São Paulo");
        return (
          <div className="modal-backdrop" onClick={() => setViewing(null)}>
            <div className="modal-box max-w-2xl" onClick={ev => ev.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5" style={{ color:"#ec4899" }} />
                  <h3 className="font-bold text-white">{e.student?.fullName?.split(" ")[0]} — Contrato</h3>
                </div>
                <div className="flex items-center gap-2">
                  {viewing.status === "pending" && (
                    <button onClick={() => { setViewing(null); setSigning(viewing); }}
                      className="btn btn-primary text-xs py-1.5">
                      <PenLine className="w-3 h-3" /> Assinar
                    </button>
                  )}
                  <button className="btn-icon" onClick={() => setViewing(null)}><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="rounded-xl overflow-y-auto p-5" style={{ background:"#0a0a0a", border:"1px solid #1a1a1a", maxHeight:"55vh" }}>
                <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono" style={{ color:"#71717a" }}>{text}</pre>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sign modal */}
      {signing && (() => {
        const e = enrich(signing);
        return (
          <div className="modal-backdrop" onClick={() => setSigning(null)}>
            <div className="modal-box max-w-md" onClick={ev => ev.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-base text-white">Assinatura Eletrônica</h3>
                <button className="btn-icon" onClick={() => setSigning(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div className="p-4 rounded-xl" style={{ background:"#8b5cf608", border:"1px solid #8b5cf620" }}>
                  <p className="text-xs" style={{ color:"#71717a" }}>
                    Ao confirmar, você atesta que leu e concorda com todos os termos. A assinatura será registrada com IP e data/hora.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { l:"Assinante",   v: e.student?.fullName },
                    { l:"Data e Hora", v: formatDateTime(new Date().toISOString()) },
                    { l:"IP Registrado", v: "192.168.1.100" },
                  ].map(f => (
                    <div key={f.l} className="p-3 rounded-xl" style={{ background:"#111", border:"1px solid #1a1a1a" }}>
                      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color:"#3f3f46" }}>{f.l}</div>
                      <div className="text-sm text-white font-medium">{f.v}</div>
                    </div>
                  ))}
                </div>
                <button onClick={doSign} disabled={loading} className="btn btn-primary w-full text-sm">
                  {loading
                    ? <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full anim-spin" />
                    : <><PenLine className="w-4 h-4" /> Confirmar Assinatura</>
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
