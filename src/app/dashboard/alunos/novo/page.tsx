"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, ArrowLeft, Loader2, User, Phone, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function NovoAlunoPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    full_name: "", email: "", cpf: "", rg: "", birth_date: "", gender: "masculino",
    phone: "", whatsapp: "", cep: "", street: "", number: "", city: "", state: "",
    weight: "", height: "", objective: ""
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const isDummy = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy.supabase.co");
      const data = {
        full_name: form.full_name,
        email: form.email || null,
        cpf: form.cpf,
        rg: form.rg || null,
        birth_date: form.birth_date,
        gender: form.gender,
        phone: form.phone,
        whatsapp: form.whatsapp || null,
        cep: form.cep || null,
        street: form.street || null,
        number: form.number || null,
        city: form.city || null,
        state: form.state || null,
        weight: form.weight ? parseFloat(form.weight) : null,
        height: form.height ? parseFloat(form.height) : null,
        objective: form.objective || null,
        status: 'active'
      };

      if (isDummy) {
        import("@/lib/localDB").then(({ localDB }) => {
          localDB.insert('students', data);
          router.push('/dashboard/alunos');
        });
        return;
      }

      const { error } = await supabase.from('students').insert([data]);
      if (error) throw error;
      router.push('/dashboard/alunos');
    } catch (e: any) {
      alert("Erro ao salvar aluno: " + e.message);
      setSaving(false);
    }
  };

  const Field = ({ label, id, type="text", required=false }: any) => (
    <div>
      <label className="block text-sm font-semibold text-zinc-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input type={type} required={required} className="field" 
        value={(form as any)[id]} onChange={e => setForm({...form, [id]: e.target.value})} />
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 anim-fadeUp">
        <button onClick={() => router.back()} className="btn-icon bg-white border border-zinc-200">
          <ArrowLeft className="w-5 h-5 text-zinc-700" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Novo Aluno</h1>
          <p className="text-zinc-500 text-sm mt-1">Cadastro completo de novo membro</p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-6">
        <div className="card p-8 anim-fadeUp stagger-1 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-zinc-100">
            <User className="w-5 h-5 text-[var(--brand-primary)]" />
            <h2 className="text-lg font-bold text-zinc-900">Dados Pessoais</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Nome Completo" id="full_name" required />
            <Field label="E-mail" id="email" type="email" />
            <Field label="CPF" id="cpf" required />
            <Field label="Data de Nasc." id="birth_date" type="date" required />
          </div>
        </div>

        <div className="card p-8 anim-fadeUp stagger-2 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-zinc-100">
            <Phone className="w-5 h-5 text-[var(--brand-primary)]" />
            <h2 className="text-lg font-bold text-zinc-900">Contato</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Telefone / Celular" id="phone" required />
            <Field label="WhatsApp" id="whatsapp" />
          </div>
        </div>

        <div className="flex justify-end gap-3 anim-fadeUp stagger-3">
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">Cancelar</button>
          <button type="submit" disabled={saving} className="btn btn-primary px-8">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4" /> Finalizar Cadastro</>}
          </button>
        </div>
      </form>
    </div>
  );
}
