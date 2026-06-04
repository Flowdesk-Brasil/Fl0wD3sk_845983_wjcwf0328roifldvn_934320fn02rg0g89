"use client";

import { useEffect, useState } from "react";
import { Shield, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";

export default function UsuariosPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('profiles').select('*');
      setUsers(data || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" /></div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Usuários</h1>
          <p className="text-zinc-500 text-sm mt-1">Gerenciamento de acessos ao painel</p>
        </div>
        <button className="btn btn-primary">
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      <div className="card anim-fadeUp stagger-1">
        <div className="tbl-container">
          <table className="tbl">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[var(--brand-primary)] bg-[var(--brand-light)]">
                        {u.full_name?.[0] || "U"}
                      </div>
                      <div>
                        <div className="font-bold text-zinc-900">{u.full_name}</div>
                        <div className="text-[13px] text-zinc-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="badge badge-purple">{u.role}</span></td>
                  <td className="text-sm text-zinc-600">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {users.length === 0 && (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <Shield className="w-12 h-12 text-zinc-300 mb-4" />
              <h3 className="text-lg font-bold text-zinc-900 mb-1">Nenhum perfil listado</h3>
              <p className="text-zinc-500 text-sm">O Supabase retornou 0 profiles.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
