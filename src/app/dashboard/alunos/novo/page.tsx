"use client";

import { ArrowLeft, CalendarDays, Clock3, MapPin, Save, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorBanner, FieldLabel, PageHeader } from "@/components/ui";
import { createClassBooking, createStudent, getClassSessions } from "@/lib/api";
import type { ClassSession } from "@/lib/types";
import { calculateIMC, digitsOnly, formatDateTime, maskCEP, maskCPF, maskPhone } from "@/lib/utils";

interface StudentForm {
  full_name: string;
  email: string;
  cpf: string;
  rg: string;
  birth_date: string;
  gender: string;
  phone: string;
  whatsapp: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  weight: string;
  height: string;
  objective: string;
  emergency_contact: string;
  emergency_phone: string;
  observations: string;
}

const emptyForm: StudentForm = {
  full_name: "", email: "", cpf: "", rg: "", birth_date: "", gender: "",
  phone: "", whatsapp: "", cep: "", street: "", number: "", complement: "", neighborhood: "",
  city: "", state: "", weight: "", height: "", objective: "",
  emergency_contact: "", emergency_phone: "", observations: "",
};

function TextField({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  id: keyof StudentForm;
  label: string;
  value: string;
  onChange: (id: keyof StudentForm, value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input id={id} name={id} className="field" type={type} required={required} value={value} placeholder={placeholder} onChange={(event) => onChange(id, event.target.value)} />
    </label>
  );
}

export default function NovoAlunoPage() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function change(id: keyof StudentForm, value: string) {
    const masked = id === "cpf"
      ? maskCPF(value)
      : id === "phone" || id === "whatsapp" || id === "emergency_phone"
        ? maskPhone(value)
        : id === "cep"
          ? maskCEP(value)
          : value;
    setForm((current) => ({ ...current, [id]: masked }));
  }

  useEffect(() => {
    const cep = digitsOnly(form.cep);
    if (cep.length !== 8) {
      setCepStatus(null);
      return;
    }
    const controller = new AbortController();
    setCepStatus("Buscando endereço...");
    fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string; complemento?: string }) => {
        if (data.erro) throw new Error("CEP não encontrado.");
        setForm((current) => ({
          ...current,
          street: data.logradouro || current.street,
          neighborhood: data.bairro || current.neighborhood,
          city: data.localidade || current.city,
          state: data.uf || current.state,
          complement: data.complemento || current.complement,
        }));
        setCepStatus("Endereço preenchido. Informe apenas o número e revise os dados.");
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setCepStatus(reason.message || "Não foi possível consultar o CEP.");
      });
    return () => controller.abort();
  }, [form.cep]);

  useEffect(() => {
    getClassSessions().then((items) => setSessions(items.filter((item) =>
      item.status === "scheduled" &&
      new Date(item.start_at).getTime() > Date.now() &&
      (item.bookings || []).filter((booking) => booking.status === "confirmed" || booking.status === "attended").length < item.capacity
    )));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const weight = form.weight ? Number(form.weight) : null;
      const height = form.height ? Number(form.height) : null;
      const student = await createStudent({
        ...form,
        email: form.email || null,
        rg: form.rg || null,
        gender: form.gender || null,
        whatsapp: form.whatsapp || null,
        cep: form.cep || null,
        street: form.street || null,
        number: form.number || null,
        complement: form.complement || null,
        neighborhood: form.neighborhood || null,
        city: form.city || null,
        state: form.state.toUpperCase() || null,
        weight,
        height,
        imc: weight && height ? calculateIMC(weight, height) : null,
        objective: form.objective || null,
        emergency_contact: form.emergency_contact || null,
        emergency_phone: form.emergency_phone || null,
        observations: form.observations || null,
      });
      await Promise.all(selectedSessions.map((sessionId) => createClassBooking(sessionId, student.id)));
      router.push("/dashboard/alunos");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o aluno.");
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Novo cadastro"
        title="Adicionar aluno"
        description="Centralize os dados necessários para atendimento, acesso e evolução."
        action={<Link href="/dashboard/alunos" className="btn btn-secondary"><ArrowLeft className="h-4 w-4" /> Voltar</Link>}
      />

      <form onSubmit={submit} className="grid gap-4">
        <ErrorBanner message={error} />
        <section className="card">
          <div className="card-header"><div><h2>Dados pessoais</h2><p>Identificação e canais de contato</p></div><UserRound className="h-5 w-5 text-blue-600" /></div>
          <div className="card-body form-grid">
            <TextField id="full_name" label="Nome completo" value={form.full_name} onChange={change} required />
            <TextField id="email" label="E-mail" value={form.email} onChange={change} type="email" />
            <TextField id="cpf" label="CPF" value={form.cpf} onChange={change} required placeholder="000.000.000-00" />
            <TextField id="rg" label="RG" value={form.rg} onChange={change} />
            <TextField id="birth_date" label="Data de nascimento" value={form.birth_date} onChange={change} type="date" required />
            <label><FieldLabel>Gênero</FieldLabel><select className="field" value={form.gender} onChange={(event) => change("gender", event.target.value)}><option value="">Não informado</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option><option value="outro">Outro</option></select></label>
            <TextField id="phone" label="Telefone" value={form.phone} onChange={change} required placeholder="(00) 00000-0000" />
            <TextField id="whatsapp" label="WhatsApp" value={form.whatsapp} onChange={change} placeholder="(00) 00000-0000" />
          </div>
        </section>

        <section className="card">
          <div className="card-header"><div><h2>Endereço e evolução</h2><p>Informações complementares para o acompanhamento</p></div><MapPin className="h-5 w-5 text-blue-600" /></div>
          <div className="card-body form-grid">
            <div><TextField id="cep" label="CEP" value={form.cep} onChange={change} placeholder="00000-000" />{cepStatus && <p className="mt-1.5 text-[11px] font-medium text-blue-600">{cepStatus}</p>}</div>
            <TextField id="street" label="Logradouro" value={form.street} onChange={change} />
            <TextField id="number" label="Número" value={form.number} onChange={change} />
            <TextField id="complement" label="Complemento" value={form.complement} onChange={change} />
            <TextField id="neighborhood" label="Bairro" value={form.neighborhood} onChange={change} />
            <TextField id="city" label="Cidade" value={form.city} onChange={change} />
            <TextField id="state" label="UF" value={form.state} onChange={change} />
            <TextField id="weight" label="Peso (kg)" value={form.weight} onChange={change} type="number" />
            <TextField id="height" label="Altura (cm)" value={form.height} onChange={change} type="number" />
            <TextField id="objective" label="Objetivo" value={form.objective} onChange={change} />
            <TextField id="emergency_contact" label="Contato de emergência" value={form.emergency_contact} onChange={change} />
            <TextField id="emergency_phone" label="Telefone de emergência" value={form.emergency_phone} onChange={change} placeholder="(00) 00000-0000" />
            <label><FieldLabel>Observações</FieldLabel><textarea className="field" value={form.observations} onChange={(event) => change("observations", event.target.value)} /></label>
          </div>
        </section>

        <section className="card">
          <div className="card-header"><div><h2>Horários de aulas</h2><p>Vincule o aluno às próximas aulas com vagas disponíveis</p></div><CalendarDays className="h-5 w-5 text-blue-600" /></div>
          <div className="card-body">
            {sessions.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sessions.slice(0, 12).map((session) => {
              const booked = (session.bookings || []).filter((booking) => booking.status === "confirmed" || booking.status === "attended").length;
              const selected = selectedSessions.includes(session.id);
              return <label key={session.id} className={`cursor-pointer rounded-2xl border p-4 transition ${selected ? "border-blue-500 bg-blue-50" : "border-[#e3e8f0] hover:border-blue-300"}`}>
                <input className="sr-only" type="checkbox" checked={selected} onChange={() => setSelectedSessions((current) => current.includes(session.id) ? current.filter((id) => id !== session.id) : [...current, session.id])} />
                <strong className="block text-sm">{session.class_type?.name || "Aula"}</strong>
                <span className="mt-2 flex items-center gap-1.5 text-[11px] text-[#657085]"><Clock3 className="h-3.5 w-3.5" /> {formatDateTime(session.start_at)}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[#657085]"><Users className="h-3.5 w-3.5" /> {session.capacity - booked} vagas restantes</span>
              </label>;
            })}</div> : <p className="rounded-xl bg-[#f7f9fc] p-4 text-xs text-[#657085]">Nenhum horário disponível. Crie aulas na aba Calendário para vinculá-las durante o cadastro.</p>}
          </div>
        </section>

        <div className="form-actions">
          <Link href="/dashboard/alunos" className="btn btn-secondary">Cancelar</Link>
          <button className="btn btn-primary" disabled={saving} type="submit"><Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar aluno"}</button>
        </div>
      </form>
    </div>
  );
}
