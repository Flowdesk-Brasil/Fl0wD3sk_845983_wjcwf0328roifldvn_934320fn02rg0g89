"use client";

import { useEffect, useState } from "react";
import { Bell, Plus, Trash2, Users, User, X, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/utils";

export default function NotificacoesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
      setNotes(data || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" /></div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between anim-fadeUp">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Comunicados</h1>
        <button onClick={() => setModal(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>

      <div className="space-y-4">
        {notes.length === 0 ? (
          <div className="card p-16 flex flex-col items-center justify-center text-center anim-fadeUp">
            <Bell className="w-12 h-12 text-zinc-300 mb-4" />
            <h3 className="text-lg font-bold text-zinc-900 mb-1">Nenhum comunicado</h3>
            <p className="text-zinc-500 text-sm">Crie notificações para seus alunos.</p>
          </div>
        ) : notes.map((n, i) => (
          <div key={n.id} className={`card p-6 anim-fadeUp stagger-${(i%6)+1}`}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--brand-light)] text-[var(--brand-primary)]">
                {n.target_type === "all" ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-zinc-900 text-lg">{n.title}</h3>
                <p className="text-zinc-600 mt-1">{n.message}</p>
                <div className="flex items-center gap-3 mt-4 text-xs text-zinc-400 font-medium">
                  <span>{formatDateTime(n.created_at)}</span>
                  <span>•</span>
                  <span>{n.target_type === "all" ? "Todos os alunos" : "Aluno específico"}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
