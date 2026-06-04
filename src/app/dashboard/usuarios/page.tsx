"use client";

import { useState } from "react";
import { Shield, Plus, Check, X } from "lucide-react";
import { mockUsers } from "@/lib/mockData";
import { User, UserRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const ROLE_CFG: Record<UserRole, { label: string; badge: string; color: string }> = {
  admin:        { label:"Administrador", badge:"badge-purple", color:"#8b5cf6" },
  receptionist: { label:"Recepcionista", badge:"badge-green",  color:"#22c55e" },
  professor:    { label:"Professor",     badge:"badge-orange", color:"#f97316" },
  student:      { label:"Aluno",         badge:"badge-blue",   color:"#3b82f6" },
};

const MODULES = ["Dashboard","Alunos","Matrículas","Planos","Contratos","Pagamentos","Check-in","Relatórios","Notificações","Usuários","Auditoria"];
const PERMS: Record<UserRole, string[]> = {
  admin:        MODULES,
  receptionist: ["Dashboard","Alunos","Matrículas","Contratos","Pagamentos","Check-in"],
  professor:    ["Dashboard","Alunos"],
  student:      [],
};

export default function UsuariosPage() {
  const [users] = useState<User[]>(mockUsers);
  const [modal, setModal] = useState(false);

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between anim-fadeUp">
        <p className="text-sm" style={{ color:"#71717a" }}>{users.filter(u=>u.active).length} ativos</p>
        <button onClick={() => setModal(true)} className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Users table */}
        <div className="card anim-fadeUp stagger-1">
          <div className="p-5" style={{ borderBottom:"1px solid #1a1a1a" }}>
            <h2 className="text-sm font-bold text-white">Usuários do Sistema</h2>
          </div>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th className="hide-mobile">Último acesso</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const cfg = ROLE_CFG[u.role];
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: cfg.color + "18", color: cfg.color }}>
                            {u.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate">{u.name}</div>
                            <div className="text-[11px] truncate" style={{ color:"#3f3f46" }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`badge ${cfg.badge}`}>{cfg.label}</span></td>
                      <td className="hide-mobile">{u.lastLogin ? formatDate(u.lastLogin) : "—"}</td>
                      <td>
                        <span className={`badge ${u.active ? "badge-green" : "badge-gray"}`}>
                          {u.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Permissions matrix */}
        <div className="card p-5 anim-fadeUp stagger-2">
          <h2 className="text-sm font-bold text-white mb-4">Matriz de Permissões</h2>
          <div className="scroll-x">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-4">Módulo</th>
                  {(["admin","receptionist","professor"] as UserRole[]).map(r => (
                    <th key={r} className="py-2 px-2 text-center whitespace-nowrap" style={{ color: ROLE_CFG[r].color }}>
                      {ROLE_CFG[r].label.split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map(mod => (
                  <tr key={mod}>
                    <td className="pr-4 py-1.5" style={{ color:"#71717a", borderBottomColor:"#0f0f0f" }}>{mod}</td>
                    {(["admin","receptionist","professor"] as UserRole[]).map(r => (
                      <td key={r} className="text-center py-1.5" style={{ borderBottomColor:"#0f0f0f" }}>
                        {PERMS[r].includes(mod)
                          ? <Check className="w-3 h-3 mx-auto" style={{ color:"#22c55e" }} />
                          : <span style={{ color:"#27272a" }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal-box max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-base text-white">Novo Usuário</h3>
              <button className="btn-icon" onClick={() => setModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              {[{l:"Nome Completo",id:"u-name",t:"text"},{l:"E-mail",id:"u-email",t:"email"},{l:"Senha",id:"u-pw",t:"password"}].map(f => (
                <div key={f.id}>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#52525b" }}>{f.l}</label>
                  <input type={f.t} id={f.id} className="field" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#52525b" }}>Perfil</label>
                <select className="field" id="u-role">
                  {(["admin","receptionist","professor"] as const).map(r => (
                    <option key={r} value={r}>{ROLE_CFG[r].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setModal(false)} className="btn btn-primary flex-1 text-sm">
                  <Plus className="w-4 h-4" /> Criar Usuário
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
