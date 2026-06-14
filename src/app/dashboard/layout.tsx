"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, Bell, BookOpen, CalendarDays, ChevronDown, CreditCard, Database, LayoutDashboard,
  LogOut, Menu, Package, QrCode, ScrollText, Search, Settings, Shield, Users, X, ShoppingCart, Boxes, Tag, Truck, ScanLine, Printer
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { shouldUseLocalData, useLocalData } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PosTerminalListener } from "@/components/pos-terminal";
import { CheckinSidebar } from "@/components/checkin-sidebar";
import { FaceTerminalListener } from "@/components/face-terminal";
import { BrandIcon } from "@/components/brand-logo";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Visão geral",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "receptionist", "professor"] }],
  },
  {
    title: "Gestão",
    items: [
      { href: "/dashboard/alunos", label: "Alunos", icon: Users, roles: ["admin", "receptionist"] },
      { href: "/dashboard/matriculas", label: "Matrículas", icon: BookOpen, roles: ["admin", "receptionist"] },
      { href: "/dashboard/planos", label: "Planos", icon: Package, roles: ["admin"] },
      { href: "/dashboard/aulas", label: "Aulas", icon: Activity, roles: ["admin"] },
      { href: "/dashboard/contratos", label: "Contratos", icon: ScrollText, roles: ["admin", "receptionist"] },
    ],
  },
  {
    title: "Operação",
    items: [
      { href: "/dashboard/pagamentos", label: "Financeiro", icon: CreditCard, roles: ["admin", "receptionist"] },
      { href: "/dashboard/calendario", label: "Calendário", icon: CalendarDays, roles: ["admin", "receptionist", "professor"] },
      { href: "/dashboard/gestao/presencas", label: "Presenças", icon: Activity, roles: ["admin", "receptionist", "professor"] },
      { href: "/dashboard/checkin", label: "Check-in", icon: QrCode, roles: ["admin", "receptionist"] },
      { href: "/dashboard/relatorios", label: "Relatórios", icon: BarChart3, roles: ["admin"] },
      { href: "/dashboard/notificacoes", label: "Comunicados", icon: Bell, roles: ["admin"] },
    ],
  },
  {
    title: "Logística & Loja",
    items: [
      { href: "/dashboard/pdv", label: "Caixa (PDV)", icon: ShoppingCart, roles: ["admin", "receptionist"] },
      { href: "/dashboard/produtos", label: "Produtos", icon: Tag, roles: ["admin"] },
      { href: "/dashboard/estoque", label: "Estoque", icon: Boxes, roles: ["admin"] },
      { href: "/dashboard/fornecedores", label: "Fornecedores", icon: Truck, roles: ["admin"] },
      { href: "/dashboard/recebimentos", label: "Recebimento", icon: Truck, roles: ["admin"] },
      { href: "/dashboard/triagem", label: "Triagem", icon: ScanLine, roles: ["admin", "receptionist"] },
      { href: "/dashboard/logistica/reimpressao", label: "Reimpressao", icon: Printer, roles: ["admin", "receptionist"] },
    ],
  },
  {
    title: "Administração",
    items: [
      { href: "/dashboard/usuarios", label: "Equipe e acessos", icon: Shield, roles: ["admin"] },
      { href: "/dashboard/auditoria", label: "Auditoria", icon: Activity, roles: ["admin"] },
      { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
    ],
  },
];

const PAGE_NAMES: Record<string, string> = {
  dashboard: "Visão geral",
  alunos: "Alunos",
  novo: "Novo aluno",
  matriculas: "Matrículas",
  planos: "Planos",
  aulas: "Aulas",
  contratos: "Contratos",
  pagamentos: "Financeiro",
  calendario: "Calendário",
  presencas: "Presenças",
  checkin: "Check-in",
  pdv: "Caixa (PDV)",
  produtos: "Produtos",
  estoque: "Controle de Estoque",
  recebimentos: "Recebimentos de Mercadorias",
  reimpressao: "Reimpressao de Etiquetas",
  triagem: "Triagem e Conferência",
  relatorios: "Relatórios",
  notificacoes: "Comunicados",
  usuarios: "Equipe e acessos",
  auditoria: "Auditoria",
  configuracoes: "Configurações",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [localDataMode, setLocalDataMode] = useState(useLocalData);
  const [operationsReady, setOperationsReady] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [isLoading, router, user]);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .catch(() => {});
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search.trim()) router.push(`/dashboard/alunos?q=${encodeURIComponent(search.trim())}`);
  }

  if (isLoading || !user) {
    return <div className="loading-state min-h-screen">Preparando seu workspace...</div>;
  }

  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "dashboard";

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f9fc]">
      <PosTerminalListener email={user.email} />
      <FaceTerminalListener email={user.email} />
      <CheckinSidebar />

      {sidebarOpen && (
        <button className="fixed inset-0 z-40 bg-[#101827]/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-[#111c2e] text-white transition-transform duration-200 lg:static lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex h-[74px] items-center justify-between border-b border-white/[.07] px-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <BrandIcon size={40} className="rounded-xl shadow-lg shadow-white/5" />
            <span>
              <strong className="block text-sm tracking-[-.02em]">Corpo & Evolução</strong>
              <small className="text-[10px] font-medium uppercase tracking-[.15em] text-white/40">Workspace</small>
            </span>
          </Link>
          <button className="grid h-9 w-9 place-items-center rounded-lg text-white/50 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {NAV.map((section) => {
            const items = section.items.filter((item) => hasPermission(item.roles));
            if (!items.length) return null;
            return (
              <div className="mb-6" key={section.title}>
                <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-white/30">{section.title}</p>
                <div className="grid gap-1">
                  {items.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition",
                          active ? "bg-white text-[#162137] shadow-sm" : "text-white/55 hover:bg-white/[.07] hover:text-white",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-blue-600" : "text-white/35")} />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/[.07] p-3">
          <div className="flex items-center gap-3 rounded-xl bg-white/[.06] p-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-xs font-bold">{user.full_name[0]?.toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs">{user.full_name}</strong>
              <small className="block truncate text-[10px] uppercase tracking-wider text-white/35">{user.app_role}</small>
            </span>
            <button className="grid h-8 w-8 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white" onClick={() => void logout()} title="Sair" aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[74px] shrink-0 items-center justify-between border-b border-[#e3e8f0] bg-white/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button className="icon-btn lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8d97aa]">Workspace</p>
              <h2 className="text-sm font-bold tracking-[-.02em] text-[#172033]">{PAGE_NAMES[segment] ?? segment}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">

            <form onSubmit={submitSearch} className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d97aa]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-60 rounded-xl border border-[#e3e8f0] bg-[#f7f9fc] pl-9 pr-3 text-xs outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" placeholder="Buscar aluno..." />
            </form>
            <Link href="/dashboard/notificacoes" className="icon-btn relative" aria-label="Comunicados">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
            </Link>
            <button className="hidden items-center gap-2 rounded-xl border border-[#e3e8f0] bg-white px-2.5 py-1.5 sm:flex">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-[10px] font-bold text-blue-600">{user.full_name[0]}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#8d97aa]" />
            </button>
          </div>
        </header>

        <main className={cn("flex-1 overflow-y-auto", segment !== "pdv" && "p-4 sm:p-6 lg:p-8")}>
          <div className={cn("mx-auto", segment !== "pdv" && "grid max-w-[1440px] gap-4", segment === "pdv" && "h-full w-full")}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
