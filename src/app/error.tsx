"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5">
      <section className="card max-w-md p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600"><AlertTriangle className="h-6 w-6" /></div>
        <h1 className="mt-5 text-xl font-bold tracking-[-.03em]">Algo nÃ£o saiu como esperado</h1>
        <p className="mt-2 text-xs leading-5 text-[#657085]">A operaÃ§Ã£o foi interrompida para proteger seus dados. Tente novamente.</p>
        <button className="btn btn-primary mt-6" onClick={reset}><RotateCcw className="h-4 w-4" /> Tentar novamente</button>
      </section>
    </main>
  );
}
