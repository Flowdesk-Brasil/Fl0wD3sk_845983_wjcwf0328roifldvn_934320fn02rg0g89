"use client";

import { useState } from "react";
import { Building2, Bell, Shield, CreditCard, CheckCircle2, Save } from "lucide-react";

export default function ConfiguracoesPage() {
  const [saved, setSaved] = useState(false);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const Field = ({ label, placeholder }: { label:string; placeholder?:string }) => (
    <div>
      <label className="block text-sm font-semibold text-zinc-700 mb-2">{label}</label>
      <input type="text" placeholder={placeholder} className="field py-3" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Configurações</h1>
          <p className="text-zinc-500 text-sm mt-1">Ajustes gerais do sistema e do Studio</p>
        </div>
        <button onClick={save} className="btn btn-primary shadow-lg shadow-[var(--brand-primary)]/20">
          {saved ? <><CheckCircle2 className="w-4 h-4" /> Salvo!</> : <><Save className="w-4 h-4" /> Salvar</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 anim-fadeUp stagger-1">
        
        {/* Sidebar Nav (Simulated) */}
        <div className="space-y-2">
          {[
            { id:"studio", label:"Dados do Studio", icon: Building2, active:true },
            { id:"notifs", label:"Notificações", icon: Bell },
            { id:"seg", label:"Segurança", icon: Shield },
            { id:"pay", label:"Pagamentos", icon: CreditCard },
          ].map(t => (
            <button key={t.id} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left
              ${t.active ? "bg-[var(--brand-light)] text-[var(--brand-primary)]" : "text-zinc-600 hover:bg-zinc-100"}`}>
              <t.icon className="w-5 h-5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="md:col-span-2 space-y-6">
          <div className="card p-8 space-y-6">
            <h3 className="text-lg font-bold text-zinc-900">Informações Principais</h3>
            <div className="grid grid-cols-1 gap-5">
              <Field label="Nome do Studio" placeholder="Studio Corpo & Evolução" />
              <Field label="CNPJ" placeholder="00.000.000/0001-00" />
              <div className="grid grid-cols-2 gap-5">
                <Field label="Telefone" placeholder="(11) 99999-9999" />
                <Field label="E-mail" placeholder="contato@studio.com.br" />
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
