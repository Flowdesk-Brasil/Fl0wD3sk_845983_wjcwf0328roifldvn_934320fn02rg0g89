"use client";

import { useState } from "react";
import { Bell, Plus, Send, Trash2, Users, User, X, AlertCircle } from "lucide-react";
import { mockNotifications } from "@/lib/mockData";
import { formatDateTime } from "@/lib/utils";

export default function NotificacoesPage() {
  const [notes, setNotes] = useState(mockNotifications);
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ title:"", message:"", target:"all" });

  const send = () => {
    if (!form.title || !form.message) return;
    setNotes(prev => [{
      id:`n${Date.now()}`, targetId: form.target, targetType: form.target === "all" ? "all" as const : "student" as const,
      title: form.title, message: form.message, read: false, createdAt: new Date().toISOString(),
    }, ...prev]);
    setForm({ title:"", message:"", target:"all" });
    setModal(false);
  };

  return (
    <div className="space-y-5 max-w-[900px]">
      <div className="flex items-center justify-between anim-fadeUp">
        <p className="text-sm" style={{ color:"#71717a" }}>{notes.length} comunicados</p>
        <button onClick={() => setModal(true)} className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" /> Novo Comunicado
        </button>
      </div>

      <div className="space-y-3">
        {notes.map((n, i) => (
          <div key={n.id} className={`card p-5 anim-fadeUp stagger-${(i%6)+1}`}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: n.targetType === "all" ? "#fb923c18" : "#8b5cf618" }}>
                {n.targetType === "all"
                  ? <Users className="w-5 h-5" style={{ color:"#fb923c" }} />
                  : <User  className="w-5 h-5" style={{ color:"#8b5cf6" }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-sm text-white">{n.title}</h3>
                  <button onClick={() => setNotes(prev => prev.filter(x => x.id !== n.id))}
                    className="btn-icon flex-shrink-0" style={{ color:"#ef4444" }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm mt-1" style={{ color:"#71717a" }}>{n.message}</p>
                <div className="flex items-center gap-3 mt-3">
                  <span className={`badge ${n.targetType === "all" ? "badge-orange" : "badge-purple"}`}>
                    {n.targetType === "all" ? "Todos os alunos" : "Aluno específico"}
                  </span>
                  <span className="text-[11px]" style={{ color:"#3f3f46" }}>{formatDateTime(n.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {!notes.length && (
          <div className="card p-12 flex flex-col items-center gap-3">
            <Bell className="w-10 h-10" style={{ color:"#27272a" }} />
            <p className="text-sm" style={{ color:"#52525b" }}>Nenhum comunicado enviado</p>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal-box max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-base text-white">Novo Comunicado</h3>
              <button className="btn-icon" onClick={() => setModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#52525b" }}>Destinatário</label>
                <select className="field" id="nt-target" value={form.target} onChange={e => setForm(f => ({...f,target:e.target.value}))}>
                  <option value="all">Todos os alunos</option>
                  <option value="active">Alunos ativos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#52525b" }}>Título *</label>
                <input className="field" id="nt-title" placeholder="Título do comunicado"
                  value={form.title} onChange={e => setForm(f => ({...f,title:e.target.value}))} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#52525b" }}>Mensagem *</label>
                <textarea className="field text-sm" rows={4} id="nt-msg" placeholder="Conteúdo..."
                  style={{ resize:"vertical" }}
                  value={form.message} onChange={e => setForm(f => ({...f,message:e.target.value}))} />
              </div>
              {(!form.title || !form.message) && (
                <div className="flex items-center gap-2 text-xs" style={{ color:"#52525b" }}>
                  <AlertCircle className="w-3.5 h-3.5" /> Preencha título e mensagem
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={send} disabled={!form.title || !form.message} className="btn btn-primary flex-1 text-sm">
                  <Send className="w-4 h-4" /> Enviar
                </button>
                <button onClick={() => setModal(false)} className="btn btn-ghost text-sm">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
