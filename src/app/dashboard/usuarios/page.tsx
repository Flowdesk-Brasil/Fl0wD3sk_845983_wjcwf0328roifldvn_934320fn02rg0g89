"use client";

import { Plus, Shield, Trash2, UserCog } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { createProfile, deleteProfile, getProfiles } from "@/lib/api";
import type { Profile, UserRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const roleLabels: Record<UserRole, string> = { admin: "Administrador", receptionist: "Recepção", professor: "Professor", student: "Aluno" };
const roleTones: Record<UserRole, "purple" | "green" | "blue" | "gray"> = { admin: "purple", receptionist: "green", professor: "blue", student: "gray" };

export default function UsuariosPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "receptionist" as UserRole });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const allProfiles = await getProfiles();
    setProfiles(allProfiles.filter(p => p.role !== 'student'));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createProfile(form);
      setOpen(false);
      setForm({ full_name: "", email: "", password: "", role: "receptionist" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o usuário.");
    }
  }

  async function remove(profile: Profile) {
    if (!window.confirm(`Remover o acesso de ${profile.full_name}? Esta ação encerra o usuário no sistema.`)) return;
    setError(null);
    try {
      await deleteProfile(profile.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover o usuário.");
    }
  }

  if (loading) return <LoadingState label="Carregando equipe..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Administração" title="Equipe e acessos" description="Gerencie quem pode operar cada área do workspace." action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo usuário</button>} />
      <ErrorBanner message={error} />
      <section className="card">
        {profiles.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th className="hide-mobile">Criado em</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>{profiles.map((profile) => <tr key={profile.id}>
            <td><div className="flex items-center gap-3"><span className="avatar"><UserCog className="h-4 w-4" /></span><strong className="text-xs text-[#172033]">{profile.full_name}</strong></div></td>
            <td>{profile.email}</td>
            <td><StatusBadge tone={roleTones[profile.role]}>{roleLabels[profile.role]}</StatusBadge></td>
            <td className="hide-mobile">{formatDate(profile.created_at)}</td>
            <td><StatusBadge tone={profile.active ? "green" : "gray"}>{profile.active ? "Ativo" : "Inativo"}</StatusBadge></td>
            <td><button className="btn btn-danger min-h-8 px-3 py-1.5 text-[10px]" disabled={profile.id === user?.id} title={profile.id === user?.id ? "Você não pode remover seu próprio acesso" : "Remover usuário"} onClick={() => void remove(profile)}><Trash2 className="h-3.5 w-3.5" /> Remover</button></td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon={Shield} title="Nenhum usuário" description="Adicione pessoas da equipe para compartilhar a operação." />}
      </section>
      <Modal open={open} onClose={() => setOpen(false)} title="Novo usuário" description="O usuário receberá acesso conforme o perfil selecionado.">
        <form className="grid gap-4" onSubmit={submit}>
          <ErrorBanner message={error} />
          <label><FieldLabel required>Nome completo</FieldLabel><input className="field" required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
          <label><FieldLabel required>E-mail</FieldLabel><input className="field" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label><FieldLabel required>Senha inicial</FieldLabel><input className="field" type="password" minLength={8} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          <label><FieldLabel required>Perfil de acesso</FieldLabel><select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}><option value="receptionist">Recepção</option><option value="professor">Professor</option><option value="admin">Administrador</option></select></label>
          <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-primary">Criar usuário</button></div>
        </form>
      </Modal>
    </div>
  );
}
