"use client";

import { useEffect, useState } from "react";
import { Shield, Plus, Loader2, X, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { localDB } from "@/lib/localDB";
import { formatDate } from "@/lib/utils";

const isDummy = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy.supabase.co");

export default function UsuariosPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "receptionist" });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    if (isDummy) {
      setUsers(localDB.get('profiles'));
    } else {
      const { data } = await supabase.from('profiles').select('*');
      setUsers(data || []);
    }
    setLoading(false);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDummy) {
      localDB.insert('profiles', form);
      setModal(false);
      load();
    } else {
      alert("Para criar usuários reais no Supabase, configure o Supabase Auth no backend.");
    }
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-white" /></div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Usuários & Funcionários</h1>
          <p className="text-[#888] text-sm mt-1">Gerenciamento de acessos ao painel</p>
        </div>
        <button onClick={() => setModal(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      <div className="card anim-fadeUp stagger-1">
        <div className="tbl-container">
          <table className="tbl">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white bg-[#222]">
                        {u.full_name?.[0] || "U"}
                      </div>
                      <div className="font-bold text-white">{u.full_name}</div>
                    </div>
                  </td>
                  <td><div className="text-[13px] text-[#888]">{u.email}</div></td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-purple' : u.role === 'professor' ? 'badge-blue' : 'badge-green'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="text-sm text-[#666]">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {users.length === 0 && (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <Shield className="w-12 h-12 text-[#333] mb-4" />
              <h3 className="text-lg font-bold text-white mb-1">Nenhum perfil listado</h3>
              <p className="text-[#666] text-sm">O sistema retornou 0 profiles.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Criar Usuário */}
      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Adicionar Funcionário</h2>
              <button onClick={() => setModal(false)} className="btn-icon"><X className="w-5 h-5 text-[#888]" /></button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#888] mb-2 uppercase">Nome Completo</label>
                <input type="text" required value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} className="field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#888] mb-2 uppercase">E-mail (Login)</label>
                <input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#888] mb-2 uppercase">Senha</label>
                <input type="password" required value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#888] mb-2 uppercase">Nível de Acesso</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="field text-white">
                  <option value="receptionist">Recepcionista</option>
                  <option value="professor">Professor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setModal(false)} className="btn btn-ghost">Cancelar</button>
                <button type="submit" className="btn btn-primary"><Save className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
