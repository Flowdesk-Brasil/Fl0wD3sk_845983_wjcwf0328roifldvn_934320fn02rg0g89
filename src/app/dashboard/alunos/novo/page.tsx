"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, MapPin, Activity, Phone, Save, CheckCircle2, ChevronRight } from "lucide-react";
import { calculateIMC } from "@/lib/utils";

const TABS = [
  { id: "personal", label: "Dados Pessoais", icon: User, color: "#8b5cf6" },
  { id: "address",  label: "Endereço",       icon: MapPin, color: "#3b82f6" },
  { id: "physical", label: "Dados Físicos",  icon: Activity, color: "#22c55e" },
  { id: "contacts", label: "Contatos",       icon: Phone, color: "#f97316" },
];

const STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function NovoAlunoPage() {
  const router = useRouter();
  const [tab, setTab]   = useState("personal");
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    fullName:"", birthDate:"", gender:"F", cpf:"", rg:"", phone:"", whatsapp:"", email:"",
    cep:"", street:"", number:"", complement:"", neighborhood:"", city:"", state:"",
    weight:"", height:"", objective:"",
    emergencyContact:"", emergencyPhone:"", observations:"", status:"active",
  });

  const imc = form.weight && form.height ? calculateIMC(+form.weight, +form.height) : 0;
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const fetchCEP = async (cep: string) => {
    set("cep", cep);
    if (cep.replace(/\D/g,"").length === 8) {
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g,"")}/json/`);
        const d = await r.json();
        if (!d.erro) { set("street", d.logradouro); set("neighborhood", d.bairro); set("city", d.localidade); set("state", d.uf); }
      } catch {}
    }
  };

  const nextTab = () => {
    const idx = TABS.findIndex(t => t.id === tab);
    if (idx < TABS.length - 1) setTab(TABS[idx+1].id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setDone(true);
    setTimeout(() => router.push("/dashboard/alunos"), 1800);
  };

  const Field = ({ label, id, type="text", value, onChange, placeholder, required }:
    { label: string; id: string; type?: string; value: string; onChange: (v:string)=>void; placeholder?: string; required?: boolean }) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <input type={type} id={id} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} className="field" required={required} />
    </div>
  );

  const Select = ({ label, id, value, onChange, options, required }:
    { label: string; id: string; value: string; onChange: (v:string)=>void; options:{v:string;l:string}[]; required?: boolean }) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className="field" required={required}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 anim-bounceIn">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: "#22c55e18", border: "1px solid #22c55e30" }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: "#22c55e" }} />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Aluno cadastrado!</h2>
          <p className="text-sm mt-1" style={{ color: "#71717a" }}>Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Back + title */}
      <div className="flex items-center gap-3 anim-fadeUp">
        <button onClick={() => router.back()} className="btn-icon"
          style={{ background: "#111", border: "1px solid #1a1a1a" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-base font-bold text-white">Cadastrar Novo Aluno</h2>
          <p className="text-xs" style={{ color: "#52525b" }}>Preencha todos os dados</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar anim-fadeUp stagger-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`tab-item text-xs ${tab === t.id ? "active" : ""}`}>
              <Icon className="w-3.5 h-3.5" style={{ color: tab === t.id ? t.color : undefined }} />
              <span className="hide-mobile">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="card p-6 anim-fadeUp stagger-2">
          {/* Personal */}
          {tab === "personal" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white mb-4">Dados Pessoais</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field label="Nome Completo" id="fn" value={form.fullName} onChange={v=>set("fullName",v)} placeholder="Nome completo" required />
                </div>
                <Field label="Data de Nascimento" id="bd" type="date" value={form.birthDate} onChange={v=>set("birthDate",v)} required />
                <Select label="Sexo" id="gnd" value={form.gender} onChange={v=>set("gender",v)} required
                  options={[{v:"F",l:"Feminino"},{v:"M",l:"Masculino"},{v:"Other",l:"Outro"}]} />
                <Field label="CPF" id="cpf" value={form.cpf} onChange={v=>set("cpf",v)} placeholder="000.000.000-00" required />
                <Field label="RG" id="rg" value={form.rg} onChange={v=>set("rg",v)} placeholder="0000000" />
                <Field label="Telefone" id="ph" value={form.phone} onChange={v=>set("phone",v)} placeholder="(11) 99999-9999" required />
                <Field label="WhatsApp" id="wa" value={form.whatsapp} onChange={v=>set("whatsapp",v)} placeholder="(11) 99999-9999" />
                <div className="sm:col-span-2">
                  <Field label="E-mail" id="em" type="email" value={form.email} onChange={v=>set("email",v)} placeholder="aluno@email.com" required />
                </div>
                <Select label="Status" id="st" value={form.status} onChange={v=>set("status",v)}
                  options={[{v:"active",l:"Ativo"},{v:"inactive",l:"Inativo"},{v:"blocked",l:"Bloqueado"}]} />
              </div>
            </div>
          )}

          {/* Address */}
          {tab === "address" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white mb-4">Endereço</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>CEP</label>
                  <input type="text" id="cep" value={form.cep} onChange={e=>fetchCEP(e.target.value)}
                    placeholder="00000-000" className="field" maxLength={9} />
                </div>
                <div className="sm:col-span-2">
                  <Field label="Rua" id="st2" value={form.street} onChange={v=>set("street",v)} placeholder="Rua, Avenida..." />
                </div>
                <Field label="Número" id="num" value={form.number} onChange={v=>set("number",v)} placeholder="123" />
                <Field label="Complemento" id="comp" value={form.complement} onChange={v=>set("complement",v)} placeholder="Apto, Bloco..." />
                <Field label="Bairro" id="nbr" value={form.neighborhood} onChange={v=>set("neighborhood",v)} placeholder="Bairro" />
                <Field label="Cidade" id="city" value={form.city} onChange={v=>set("city",v)} placeholder="Cidade" />
                <Select label="Estado" id="state" value={form.state} onChange={v=>set("state",v)}
                  options={[{v:"",l:"Selecione..."},...STATES.map(s=>({v:s,l:s}))]} />
              </div>
            </div>
          )}

          {/* Physical */}
          {tab === "physical" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white mb-4">Dados Físicos</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Peso (kg)" id="wt" type="number" value={form.weight} onChange={v=>set("weight",v)} placeholder="65.0" />
                <Field label="Altura (cm)" id="ht" type="number" value={form.height} onChange={v=>set("height",v)} placeholder="170" />
              </div>
              {imc > 0 && (
                <div className="p-4 rounded-xl" style={{ background: "#8b5cf608", border: "1px solid #8b5cf620" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: "#a1a1aa" }}>IMC Calculado</span>
                    <span className="text-2xl font-black" style={{ color: "#a78bfa" }}>{imc.toFixed(1)}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#52525b" }}>
                    {imc < 18.5 ? "Abaixo do peso" : imc < 25 ? "✅ Peso normal" : imc < 30 ? "⚠️ Sobrepeso" : "🔴 Obesidade"}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>Objetivo</label>
                <textarea id="obj" value={form.objective} onChange={e=>set("objective",e.target.value)}
                  placeholder="Objetivo do aluno..." className="field text-sm" rows={4} style={{ resize: "vertical" }} />
              </div>
            </div>
          )}

          {/* Contacts */}
          {tab === "contacts" && (
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-white">Contato de Emergência</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nome" id="ec" value={form.emergencyContact} onChange={v=>set("emergencyContact",v)} placeholder="Nome completo" />
                <Field label="Telefone" id="ep" value={form.emergencyPhone} onChange={v=>set("emergencyPhone",v)} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>Observações</label>
                <textarea id="obs" value={form.observations} onChange={e=>set("observations",e.target.value)}
                  placeholder="Observações gerais..." className="field text-sm" rows={3} style={{ resize: "vertical" }} />
              </div>
              <div>
                <p className="text-sm font-bold text-white mb-3">Documentos</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {["Foto","RG Frente","RG Verso","CPF","Comprovante"].map(doc => (
                    <label key={doc}
                      className="p-4 rounded-xl flex flex-col items-center gap-2 cursor-pointer hover:border-zinc-700 transition-colors"
                      style={{ border: "1px dashed #222", textAlign: "center" }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#111" }}>
                        <Phone className="w-4 h-4" style={{ color: "#3f3f46" }} />
                      </div>
                      <span className="text-xs font-medium" style={{ color: "#52525b" }}>{doc}</span>
                      <input type="file" className="hidden" />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 anim-fadeUp stagger-3">
          <button type="button" onClick={() => router.back()} className="btn btn-ghost text-sm">Cancelar</button>
          <div className="flex items-center gap-2">
            {tab !== "contacts" ? (
              <button type="button" onClick={nextTab} className="btn btn-primary text-sm">
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="submit" className="btn btn-primary text-sm">
                <Save className="w-4 h-4" /> Salvar Aluno
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
