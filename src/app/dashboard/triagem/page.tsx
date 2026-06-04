"use client";

import { Construction } from "lucide-react";

export default function TriagemPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
        <Construction className="w-12 h-12 text-blue-600" />
      </div>
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Módulo em Desenvolvimento</h1>
      <p className="text-slate-500 max-w-md">O sistema de Triagem e Conferência (Bipagem e Validação) está sendo construído nesta fase e estará disponível em breve.</p>
    </div>
  );
}
