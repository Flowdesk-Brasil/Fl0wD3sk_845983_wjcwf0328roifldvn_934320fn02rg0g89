"use client";

import { Bell, Plus, Send, Trash2, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader, StatusBadge } from "@/components/ui";
import { createNotification, deleteNotification, getNotifications } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function NotificacoesPage() {
  const [notes, setNotes] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", message: "", target_type: "all" as const });
  const [loading, setLoading] = useState(true);
  async function load() { setNotes(await getNotifications()); setLoading(false); }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createNotification(form);
      setForm({ title: "", message: "", target_type: "all" });
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel criar o comunicado.");
    }
  }
  async function remove(id: string) { await deleteNotification(id); await load(); }
  if (loading) return <LoadingState label="Carregando comunicados..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Relacionamento" title="Comunicados" description="Centralize avisos para manter todos alinhados." action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo comunicado</button>} />
      {notes.length ? <div className="grid gap-3">{notes.map((note) => (
        <article className="card flex items-start gap-4 p-5" key={note.id}>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Bell className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold">{note.title}</h2><StatusBadge tone="blue">{note.target_type === "all" ? "Todos" : "Individual"}</StatusBadge></div><p className="mt-2 text-xs leading-5 text-[#657085]">{note.message}</p><span className="mt-3 block text-[10px] text-[#8d97aa]">{formatDateTime(note.created_at)}</span></div>
          <button className="icon-btn shrink-0" onClick={() => void remove(note.id)} aria-label="Excluir comunicado"><Trash2 className="h-4 w-4" /></button>
        </article>
      ))}</div> : <section className="card"><EmptyState icon={Bell} title="Nenhum comunicado" description="Crie um aviso para compartilhar novidades com os alunos." /></section>}

      <Modal open={open} onClose={() => setOpen(false)} title="Novo comunicado" description="O comunicado ficarÃ¡ disponÃ­vel no histÃ³rico do workspace.">
        <form className="grid gap-4" onSubmit={submit}>
          <ErrorBanner message={error} />
          <label><FieldLabel required>TÃ­tulo</FieldLabel><input className="field" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label><FieldLabel required>Mensagem</FieldLabel><textarea className="field" required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
          <div className="rounded-xl bg-[#f3f6fb] p-3 text-xs text-[#657085]"><Users className="mr-2 inline h-4 w-4 text-blue-600" /> DestinatÃ¡rios: todos os alunos</div>
          <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-primary"><Send className="h-4 w-4" /> Publicar</button></div>
        </form>
      </Modal>
    </div>
  );
}
