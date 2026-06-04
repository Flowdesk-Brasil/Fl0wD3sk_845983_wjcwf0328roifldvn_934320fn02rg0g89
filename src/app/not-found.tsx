import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5">
      <section className="card max-w-md p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><SearchX className="h-6 w-6" /></div>
        <h1 className="mt-5 text-xl font-bold tracking-[-.03em]">Página não encontrada</h1>
        <p className="mt-2 text-xs leading-5 text-[#657085]">O endereço informado não existe ou foi removido.</p>
        <Link className="btn btn-primary mt-6" href="/dashboard"><ArrowLeft className="h-4 w-4" /> Voltar ao painel</Link>
      </section>
    </main>
  );
}
