"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, Lock, Mail, AlertCircle, Dumbbell } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await login(email, password);
    setLoading(false);
    
    if (err) {
      setError(err);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#f5f5f7" }}>
      {/* ── Left side (Branding) ── */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-16 relative overflow-hidden bg-white">
        <div className="relative z-10 anim-fadeUp">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--brand-light)" }}>
              <Dumbbell className="w-6 h-6" style={{ color: "var(--brand-primary)" }} />
            </div>
            <div className="font-bold text-xl tracking-tight text-zinc-900">Corpo & Evolução</div>
          </div>
          
          <h1 className="text-[56px] font-bold leading-[1.1] tracking-tight text-zinc-900 mb-6">
            Gestão inteligente.<br />
            <span style={{ color: "var(--brand-primary)" }}>Resultados reais.</span>
          </h1>
          <p className="text-lg text-zinc-500 max-w-md leading-relaxed">
            A plataforma definitiva para automatizar seu Studio. Controle financeiro, acessos, treinos e comunicação em um único lugar.
          </p>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 w-[600px] h-[600px] rounded-full blur-[100px] pointer-events-none"
          style={{ background: "rgba(130, 10, 209, 0.08)" }} />
          
        <div className="relative z-10 anim-fadeUp stagger-2">
          <p className="text-sm text-zinc-400 font-medium tracking-wide uppercase">
            © 2024 Studio Corpo & Evolução
          </p>
        </div>
      </div>

      {/* ── Right side (Form) ── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] anim-fadeIn">
          
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--brand-light)" }}>
              <Dumbbell className="w-5 h-5" style={{ color: "var(--brand-primary)" }} />
            </div>
            <div className="font-bold text-lg text-zinc-900">Corpo & Evolução</div>
          </div>

          <div className="card p-8 sm:p-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">Acesse sua conta</h2>
              <p className="text-zinc-500 text-sm">Insira suas credenciais para continuar.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="email" 
                    required
                    value={email} 
                    onChange={e => setEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                    className="field pl-11 py-3"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-zinc-700">Senha</label>
                  <button type="button" className="text-sm font-medium transition-colors" style={{ color: "var(--brand-primary)" }}>
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="password" 
                    required
                    value={password} 
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="field pl-11 py-3"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-4 rounded-xl text-sm anim-fadeUp"
                  style={{ background: "var(--status-error-bg)", color: "var(--status-error)" }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <button
                type="submit" 
                disabled={loading}
                className="btn btn-primary w-full py-3.5 text-base mt-4"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full anim-spin" />
                ) : (
                  <>Acessar Painel <ArrowRight className="w-4 h-4 ml-1" /></>
                )}
              </button>
            </form>
            
            <div className="mt-8 text-center">
              <p className="text-xs text-zinc-500">
                Acesso seguro e criptografado via Supabase.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
