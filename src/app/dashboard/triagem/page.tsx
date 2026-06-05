"use client";

import { useState } from "react";
import { ScanLine, Search, AlertCircle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { getReceivings } from "@/lib/api";
import { ErrorBanner } from "@/components/ui";

export default function TriagemIntroPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTriagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const receivings = await getReceivings();
      const receiving = receivings.find(
        r => r.invoice_key === key.trim() || r.invoice_number === key.trim()
      );

      if (!receiving) {
        throw new Error("Nota Fiscal nÃ£o encontrada. Verifique se ela foi cadastrada no mÃ³dulo de Recebimento.");
      }

      if (receiving.status === "Finalizado") {
        throw new Error("Esta nota fiscal jÃ¡ foi finalizada.");
      }
      
      if (receiving.status === "Triagem ConcluÃ­da") {
        throw new Error("A triagem desta nota jÃ¡ foi concluÃ­da, pendente apenas de finalizaÃ§Ã£o.");
      }

      router.push(`/dashboard/triagem/${receiving.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar a nota.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border-8 border-blue-100/50">
            <ScanLine className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Triagem e ConferÃªncia</h1>
          <p className="text-slate-500">Inicie a contagem fÃ­sica das mercadorias bipando o cÃ³digo da nota fiscal.</p>
        </div>

        <form onSubmit={startTriagem} className="card p-6 shadow-xl shadow-slate-200/40">
          <ErrorBanner message={error} />
          
          <div className="mt-4">
            <label className="block text-sm font-bold text-slate-700 mb-2">
              NÃºmero da NF ou Chave de Acesso
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="block w-full pl-10 pr-3 py-4 border-2 border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 sm:text-lg transition font-mono"
                placeholder="Bipe a nota aqui..."
                autoFocus
              />
            </div>
            <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> 
              Certifique-se que o leitor USB estÃ¡ conectado.
            </p>
          </div>

          <div className="mt-6">
            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-sm text-base font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Localizando..." : "Iniciar Triagem"}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
