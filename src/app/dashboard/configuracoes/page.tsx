"use client";

import { useState } from "react";
import { Building2, Bell, Shield, CreditCard, CheckCircle2, Save } from "lucide-react";

const TABS = [
  { id:"studio",     label:"Studio",        icon: Building2, color:"#8b5cf6" },
  { id:"notifs",     label:"Notificações",  icon: Bell,      color:"#fb923c" },
  { id:"security",   label:"Segurança",     icon: Shield,    color:"#ef4444" },
  { id:"payments",   label:"Pagamentos",    icon: CreditCard, color:"#22c55e" },
];

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div className={`toggle-track ${on ? "on" : ""}`} onClick={onChange} role="switch" aria-checked={on}>
      <div className="toggle-thumb" />
    </div>
  );
}

export default function ConfiguracoesPage() {
  const [tab, setTab]   = useState("studio");
  const [saved, setSaved] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    "notif-payment":true, "notif-contract":true, "notif-checkin":false,
    "notif-weekly":true,  "notif-overdue":true,
    "sec-2fa":false, "sec-session":true, "sec-logs":true, "sec-strong-pw":true,
  });

  const tog = (k: string) => setToggles(p => ({ ...p, [k]: !p[k] }));

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const Field = ({ label, id, type="text", placeholder }: { label:string; id:string; type?:string; placeholder?:string }) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#52525b" }}>{label}</label>
      <input type={type} id={id} placeholder={placeholder} className="field" />
    </div>
  );

  const ToggleRow = ({ k, label, sub }: { k:string; label:string; sub:string }) => (
    <div className="flex items-center justify-between p-4 rounded-xl"
      style={{ background:"#0a0a0a", border:"1px solid #1a1a1a" }}>
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs mt-0.5" style={{ color:"#52525b" }}>{sub}</div>
      </div>
      <Toggle on={!!toggles[k]} onChange={() => tog(k)} />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-5">
      {/* Tab bar */}
      <div className="tab-bar anim-fadeUp">
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

      {/* Studio */}
      {tab === "studio" && (
        <div className="card p-6 space-y-4 anim-fadeUp">
          <h3 className="text-sm font-bold text-white">Dados do Studio</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Field label="Nome do Studio" id="s-name" placeholder="Studio Corpo e Evolução" /></div>
            <Field label="CNPJ" id="s-cnpj" placeholder="00.000.000/0001-00" />
            <Field label="Telefone" id="s-phone" placeholder="(11) 99999-9999" />
            <div className="sm:col-span-2"><Field label="E-mail Comercial" id="s-email" type="email" placeholder="contato@studio.com.br" /></div>
            <div className="sm:col-span-2"><Field label="Endereço" id="s-addr" placeholder="Rua das Flores, 123 – São Paulo/SP" /></div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color:"#52525b" }}>Horário de Funcionamento</label>
            <div className="flex items-center gap-3">
              <input type="time" defaultValue="06:00" className="field" id="s-open" />
              <span style={{ color:"#3f3f46" }}>até</span>
              <input type="time" defaultValue="22:00" className="field" id="s-close" />
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {tab === "notifs" && (
        <div className="card p-6 space-y-3 anim-fadeUp">
          <h3 className="text-sm font-bold text-white mb-2">Notificações Automáticas</h3>
          <ToggleRow k="notif-payment"  label="E-mail de vencimento"    sub="Enviar antes do vencimento" />
          <ToggleRow k="notif-contract" label="E-mail de contrato"       sub="Notificar quando gerado" />
          <ToggleRow k="notif-checkin"  label="Alerta de bloqueio"       sub="Push para recepcionista" />
          <ToggleRow k="notif-weekly"   label="Relatório semanal"        sub="Resumo de receita por e-mail" />
          <ToggleRow k="notif-overdue"  label="Alerta de inadimplência"  sub="Aviso quando taxa > 10%" />
        </div>
      )}

      {/* Security */}
      {tab === "security" && (
        <div className="space-y-4 anim-fadeUp">
          <div className="card p-6 space-y-3">
            <h3 className="text-sm font-bold text-white mb-2">Configurações de Segurança</h3>
            <ToggleRow k="sec-2fa"       label="Autenticação 2FA"     sub="Exigir para administradores" />
            <ToggleRow k="sec-session"   label="Sessão automática"    sub="Desconectar após 30 min" />
            <ToggleRow k="sec-logs"      label="Log de acessos"       sub="Registrar todos os logins" />
            <ToggleRow k="sec-strong-pw" label="Senha forte"          sub="Mínimo 8 caracteres" />
          </div>
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Alterar Senha</h3>
            <Field label="Senha atual" id="pw0" type="password" placeholder="••••••••" />
            <Field label="Nova senha"  id="pw1" type="password" placeholder="••••••••" />
            <Field label="Confirmar"   id="pw2" type="password" placeholder="••••••••" />
          </div>
        </div>
      )}

      {/* Payments */}
      {tab === "payments" && (
        <div className="card p-6 space-y-5 anim-fadeUp">
          <h3 className="text-sm font-bold text-white">Configurações de Pagamento</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Dia de vencimento" id="p-day"   placeholder="10" />
            <Field label="Multa por atraso (%)" id="p-fine" placeholder="2.0" />
            <Field label="Juros mensais (%)" id="p-int"   placeholder="1.0" />
            <Field label="Dias de carência"  id="p-grace" placeholder="3" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-3" style={{ color:"#52525b" }}>Métodos Aceitos</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["PIX","Crédito","Débito","Dinheiro"].map(m => (
                <label key={m} className="flex items-center gap-2.5 p-3 rounded-xl cursor-pointer"
                  style={{ background:"#0a0a0a", border:"1px solid #1a1a1a" }}>
                  <input type="checkbox" defaultChecked className="accent-purple-500" id={`m-${m}`} />
                  <span className="text-sm font-medium text-white">{m}</span>
                </label>
              ))}
            </div>
          </div>
          <Field label="Chave PIX" id="p-pix" placeholder="CNPJ, e-mail ou chave aleatória" />
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end anim-fadeUp">
        <button onClick={save} id="save-btn" className="btn btn-primary text-sm">
          {saved
            ? <><CheckCircle2 className="w-4 h-4 text-green-400" /> Salvo!</>
            : <><Save className="w-4 h-4" /> Salvar configurações</>
          }
        </button>
      </div>
    </div>
  );
}
