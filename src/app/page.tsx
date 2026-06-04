"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, Lock, Mail, AlertTriangle, Hexagon } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: "#000" }}>
      
      {/* Background Glows (Vercel/Linear style) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] opacity-20 pointer-events-none" 
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(0,0,0,0) 70%)" }} />

      <div className="w-full max-w-[400px] relative z-10 anim-fadeUp">
        
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-[#111] border border-[#222] shadow-[0_0_30px_rgba(255,255,255,0.05)]">
            <Hexagon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">Studio Manager</h1>
          <p className="text-sm text-[#888]">Acesso seguro ao painel de gestão.</p>
        </div>

        {/* Login Card */}
        <div className="card p-8 backdrop-blur-xl bg-black/50 border border-[#222]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#888] mb-2">Endereço de E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
                <input
                  type="email" 
                  required
                  value={email} 
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@admin.com"
                  className="field pl-11 py-3 text-white"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#888]">Senha</label>
                <button type="button" className="text-xs text-[#888] hover:text-white transition-colors">Esqueci a senha</button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
                <input
                  type="password" 
                  required
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="field pl-11 py-3 text-white"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl text-sm border border-red-500/20 bg-red-500/10 text-red-400 anim-fadeIn">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit" 
              disabled={loading}
              className="btn btn-primary w-full py-3.5 mt-2 flex items-center justify-center gap-2 font-bold"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full anim-spin" />
              ) : (
                <>Entrar no Painel <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>
        
        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs font-medium text-[#444] uppercase tracking-widest">
            Powered by Supabase
          </p>
        </div>
        
      </div>
    </div>
  );
}
