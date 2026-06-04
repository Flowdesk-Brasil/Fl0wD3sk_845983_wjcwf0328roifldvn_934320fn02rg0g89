"use client";

import { useState } from "react";
import { QrCode, Search, CheckCircle2, Shield, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function CheckInPage() {
  const [qrInput, setQrInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const processInput = async (code: string) => {
    if (!code.trim()) return;
    setScanning(true);
    
    try {
      const { data: student } = await supabase
        .from('students')
        .select('*, enrollments(*, plans(*))')
        .or(`qr_code.eq.${code.trim()},id.eq.${code.trim()}`)
        .single();
        
      if (!student) {
        setResult({ status: 'denied', reason: 'QR Code não encontrado.' });
        return;
      }
      
      if (student.status !== 'active') {
        setResult({ status: 'denied', student, reason: 'Aluno inativo ou bloqueado.' });
        return;
      }
      
      // Validação simplificada para demonstração (Em prod, validaria financeiro tb)
      setResult({ status: 'allowed', student });
      
      // Registrar o checkin real no Supabase
      await supabase.from('checkins').insert([{
        student_id: student.id,
        status: 'allowed',
        unit: 'Matriz'
      }]);
      
    } catch (e) {
      setResult({ status: 'denied', reason: 'Erro ao validar acesso.' });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Check-in</h1>
          <p className="text-zinc-500 text-sm mt-1">Validação de acesso na catraca</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left - Scanner */}
        <div className="card p-8 anim-fadeUp stagger-1 flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-20 h-20 rounded-full bg-[var(--brand-light)] flex items-center justify-center mb-6">
            <QrCode className="w-10 h-10 text-[var(--brand-primary)]" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">Leitor de QR Code</h2>
          <p className="text-zinc-500 text-center text-sm mb-8 max-w-xs">
            Aponte o celular do aluno para a câmera ou digite o código manualmente.
          </p>
          
          <form onSubmit={e => { e.preventDefault(); processInput(qrInput); }} className="w-full flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input type="text" value={qrInput} onChange={e => setQrInput(e.target.value)}
                placeholder="Código manual..." className="field pl-11" />
            </div>
            <button type="submit" disabled={scanning} className="btn btn-primary">
              {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : "Validar"}
            </button>
          </form>
        </div>

        {/* Right - Result */}
        <div className="card p-8 anim-fadeUp stagger-2 flex flex-col items-center justify-center min-h-[400px]">
          {!result ? (
            <div className="text-center">
              <Shield className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
              <p className="text-zinc-500 font-medium">Aguardando leitura...</p>
            </div>
          ) : (
            <div className={`w-full text-center p-8 rounded-2xl ${result.status === 'allowed' ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'} anim-fadeIn`}>
              <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-6 ${result.status === 'allowed' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {result.status === 'allowed' ? <CheckCircle2 className="w-12 h-12" /> : <Shield className="w-12 h-12" />}
              </div>
              
              <h2 className={`text-3xl font-black tracking-tight mb-2 ${result.status === 'allowed' ? 'text-green-700' : 'text-red-700'}`}>
                {result.status === 'allowed' ? 'ACESSO LIBERADO' : 'ACESSO NEGADO'}
              </h2>
              
              {result.student && (
                <div className="mt-6 p-4 bg-white rounded-xl shadow-sm text-left">
                  <div className="font-bold text-zinc-900 text-lg">{result.student.full_name}</div>
                  <div className="text-sm text-zinc-500 mt-1">{result.reason || "Matrícula regular."}</div>
                </div>
              )}
              
              <button onClick={() => {setResult(null); setQrInput("");}} className="mt-8 text-sm font-semibold text-zinc-500 hover:text-zinc-800">
                Nova Leitura
              </button>
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
