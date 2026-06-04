"use client";

import { Building2, CheckCircle2, FileUp, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorBanner, FieldLabel, LoadingState, PageHeader } from "@/components/ui";
import { getSettings, saveSettings, uploadContractTemplate } from "@/lib/api";
import type { StudioSettings } from "@/lib/types";
import { maskCNPJ, maskPhone } from "@/lib/utils";

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getSettings().then(setSettings).catch((reason: Error) => setError(reason.message)); }, []);

  function change(field: keyof StudioSettings, value: string) {
    const masked = field === "cnpj" ? maskCNPJ(value) : field === "phone" ? maskPhone(value) : value;
    setSettings((current) => current ? { ...current, [field]: masked } : current);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setError(null);
    try {
      setSettings(await saveSettings(settings));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar as configurações.");
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadContractTemplate(file);
      setSettings((current) => current ? { ...current, contract_template_path: result.path, contract_template_name: result.name } : current);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar o PDF.");
    } finally {
      setUploading(false);
    }
  }
  if (!settings && !error) return <LoadingState label="Carregando configurações..." />;
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Workspace" title="Configurações" description="Mantenha os dados operacionais do studio atualizados." />
      <ErrorBanner message={error} />
      {settings && <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className="card">
          <div className="card-header"><div><h2>Dados do studio</h2><p>Informações utilizadas em documentos e comunicações</p></div><Building2 className="h-5 w-5 text-blue-600" /></div>
          <div className="card-body form-grid">
            <label className="col-span-full"><FieldLabel required>Nome do studio</FieldLabel><input className="field" required value={settings.studio_name} onChange={(event) => change("studio_name", event.target.value)} /></label>
            <label><FieldLabel>CNPJ</FieldLabel><input className="field" value={settings.cnpj} onChange={(event) => change("cnpj", event.target.value)} /></label>
            <label><FieldLabel>Telefone</FieldLabel><input className="field" value={settings.phone} onChange={(event) => change("phone", event.target.value)} /></label>
            <label><FieldLabel>E-mail</FieldLabel><input className="field" type="email" value={settings.email} onChange={(event) => change("email", event.target.value)} /></label>
            <label><FieldLabel>Endereço</FieldLabel><input className="field" value={settings.address} onChange={(event) => change("address", event.target.value)} /></label>
          </div>
          <div className="flex justify-end border-t border-[#e3e8f0] p-5"><button className="btn btn-primary"><Save className="h-4 w-4" /> {saved ? "Configurações salvas" : "Salvar alterações"}</button></div>
        </section>
        <aside className="grid content-start gap-4">
          <section className="card p-5"><div className="grid h-11 w-11 place-items-center rounded-xl bg-green-50 text-green-600"><ShieldCheck className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-bold">Workspace protegido</h3><p className="mt-2 text-xs leading-5 text-[#657085]">Ações administrativas são registradas na trilha de auditoria.</p></section>
          <section className="card p-5">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileUp className="h-5 w-5" /></div>
            <h3 className="mt-4 text-sm font-bold">PDF padrão do contrato</h3>
            <p className="mt-2 text-xs leading-5 text-[#657085]">{settings.contract_template_name ? `Atual: ${settings.contract_template_name}` : "Envie o documento que o aluno verá antes de assinar."}</p>
            <label className="btn btn-secondary mt-4 w-full">
              <FileUp className="h-4 w-4" /> {uploading ? "Enviando..." : "Selecionar PDF"}
              <input className="hidden" type="file" accept="application/pdf" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} />
            </label>
          </section>
          {saved && <section className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-xs font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" /> Alterações salvas com sucesso.</section>}
        </aside>
      </form>}
    </div>
  );
}
