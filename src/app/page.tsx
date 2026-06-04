"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  Eye, EyeOff, Dumbbell, ArrowRight, Lock, Mail, AlertCircle,
  Zap, Shield, Users, BarChart3
} from "lucide-react";

const features = [
  { icon: Users, color: "#8b5cf6", label: "Gestão de Alunos", desc: "Cadastro completo e matrículas" },
  { icon: Zap, color: "#22c55e", label: "Check-in por QR Code", desc: "Controle de acesso em tempo real" },
  { icon: BarChart3, color: "#3b82f6", label: "Relatórios e Finanças", desc: "Dashboards e indicadores" },
  { icon: Shield, color: "#f97316", label: "Contratos Digitais", desc: "Assinatura eletrônica segura" },
];

const demoAccounts = [
  { role: "admin", label: "Administrador", email: "admin@corpoevolucao.com.br", pw: "admin123", color: "#8b5cf6" },
  { role: "receptionist", label: "Recepção", email: "recepcao@corpoevolucao.com.br", pw: "recepcao123", color: "#22c55e" },
  { role: "professor", label: "Professor", email: "professor@corpoevolucao.com.br", pw: "prof123", color: "#3b82f6" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) router.push("/dashboard");
    else setError("E-mail ou senha incorretos.");
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#000" }}>
      {/* ── Left hero ── */}
      <div
        className="hidden lg:flex flex-1 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "#0a0a0a", borderRight: "1px solid #1a1a1a" }}
      >
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: "linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Purple glow */}
        <div
          className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, #8b5cf615 0%, transparent 70%)" }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 anim-fadeUp">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-black" />
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight">Studio Corpo e Evolução</div>
            <div className="text-xs" style={{ color: "#52525b" }}>Sistema de Gestão</div>
          </div>
        </div>

        {/* Main headline */}
        <div className="relative z-10 anim-fadeUp stagger-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
            style={{ background: "#8b5cf620", color: "#a78bfa", border: "1px solid #8b5cf630" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] anim-pulse inline-block" />
            Sistema ativo • Versão 2.0
          </div>
          <h1 className="text-5xl font-black text-white leading-[1.1] tracking-tight mb-5">
            Gerencie sua<br />
            academia com<br />
            <span style={{ color: "#8b5cf6" }}>inteligência.</span>
          </h1>
          <p className="text-base max-w-sm" style={{ color: "#71717a" }}>
            Sistema completo para academias, studios fitness e centros de treinamento.
            Automatize matrículas, pagamentos e check-ins.
          </p>

          {/* Features list */}
          <div className="mt-10 space-y-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={f.label}
                  className={`flex items-center gap-3 anim-slideR stagger-${i + 3}`}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: f.color + "18" }}>
                    <Icon className="w-4 h-4" style={{ color: f.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{f.label}</div>
                    <div className="text-xs" style={{ color: "#52525b" }}>{f.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer stats */}
        <div className="relative z-10 flex items-center gap-8 anim-fadeUp stagger-4">
          {[
            { v: "248+", l: "Alunos" },
            { v: "R$38k", l: "Receita/mês" },
            { v: "87", l: "Check-ins hoje" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-2xl font-black text-white">{s.v}</div>
              <div className="text-xs mt-0.5" style={{ color: "#52525b" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form ── */}
      <div className="flex-1 flex items-center justify-center p-6" style={{ background: "#000" }}>
        <div className="w-full max-w-[400px] anim-slideL">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold text-white text-sm">Studio Corpo e Evolução</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-black text-white tracking-tight">Entrar</h2>
            <p className="mt-2 text-sm" style={{ color: "#71717a" }}>
              Acesse o painel de gestão
            </p>
          </div>

          {/* Demo pills */}
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#3f3f46" }}>
              Acesso rápido
            </p>
            <div className="flex gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.role}
                  onClick={() => { setEmail(acc.email); setPassword(acc.pw); }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-100"
                  style={{
                    background: acc.color + "12",
                    color: acc.color,
                    border: `1px solid ${acc.color}28`,
                  }}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-zinc-400">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#52525b" }} />
                <input
                  type="email" id="login-email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="email@dominio.com"
                  className="field pl-10"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-zinc-400">Senha</label>
                <button type="button" className="text-xs font-medium" style={{ color: "#8b5cf6" }}>
                  Esqueceu?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#52525b" }} />
                <input
                  type={showPass ? "text" : "password"} id="login-password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="field pl-10 pr-10"
                />
                <button type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-sm anim-fadeUp"
                style={{ background: "#ef444415", border: "1px solid #ef444428", color: "#f87171" }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading} id="login-submit"
              className="btn btn-primary w-full py-3 text-sm mt-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full anim-spin" />
              ) : (
                <>Entrar no sistema <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs" style={{ color: "#3f3f46" }}>
            Acesso registrado e monitorado · Studio Corpo e Evolução © 2024
          </p>
        </div>
      </div>
    </div>
  );
}
