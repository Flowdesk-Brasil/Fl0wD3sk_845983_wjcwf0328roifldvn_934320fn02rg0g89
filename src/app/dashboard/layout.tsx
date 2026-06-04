"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, BookOpen, Package, ScrollText,
  CreditCard, QrCode, BarChart3, Bell, Shield, Activity,
  Settings, LogOut, Dumbbell, Menu, X, ChevronRight,
  Search
} from "lucide-react";

const NAV = [
  {
    title: "Visão Geral",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin","receptionist","professor"] },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/dashboard/alunos",     label: "Alunos",    icon: Users,      roles: ["admin","receptionist"] },
      { href: "/dashboard/matriculas", label: "Matrículas",icon: BookOpen,   roles: ["admin","receptionist"] },
      { href: "/dashboard/planos",     label: "Planos",    icon: Package,    roles: ["admin"] },
      { href: "/dashboard/contratos",  label: "Contratos", icon: ScrollText, roles: ["admin","receptionist"] },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/dashboard/pagamentos", label: "Pagamentos", icon: CreditCard, roles: ["admin","receptionist"] },
    ],
  },
  {
    title: "Operações",
    items: [
      { href: "/dashboard/checkin",       label: "Check-in",    icon: QrCode,     roles: ["admin","receptionist"] },
      { href: "/dashboard/relatorios",    label: "Relatórios",  icon: BarChart3,  roles: ["admin"] },
      { href: "/dashboard/notificacoes",  label: "Notificações",icon: Bell,       roles: ["admin"] },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/dashboard/usuarios",     label: "Usuários",    icon: Shield,   roles: ["admin"] },
      { href: "/dashboard/auditoria",    label: "Auditoria",   icon: Activity, roles: ["admin"] },
      { href: "/dashboard/configuracoes",label: "Configurações",icon: Settings, roles: ["admin"] },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  receptionist: "Recepcionista",
  professor: "Professor",
  student: "Aluno",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push("/");
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-[var(--brand-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  const handleLogout = () => { logout(); };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-app)]">
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 lg:hidden bg-zinc-900/40 backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full flex flex-col bg-white border-r border-[var(--border-light)]
          lg:static lg:translate-x-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
        style={{ width: 260, flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-6 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--brand-light)" }}>
              <Dumbbell className="w-5 h-5" style={{ color: "var(--brand-primary)" }} />
            </div>
            <div>
              <div className="font-bold text-zinc-900 tracking-tight">Studio</div>
              <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">Gestão</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="btn-icon lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          {NAV.map((section) => {
            const visible = section.items.filter(item => hasPermission(item.roles));
            if (!visible.length) return null;
            return (
              <div key={section.title}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-3 mb-2">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {visible.map(item => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                          ${active 
                            ? "bg-[var(--brand-light)] text-[var(--brand-primary)] shadow-sm" 
                            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"}`}
                      >
                        <Icon className={`w-4.5 h-4.5 ${active ? "text-[var(--brand-primary)]" : "text-zinc-400"}`} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-[var(--border-light)] bg-zinc-50/50">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-[var(--border-light)] shadow-sm">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-[var(--brand-light)] text-[var(--brand-primary)] flex-shrink-0">
              {user.full_name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-zinc-900 truncate">{user.full_name}</div>
              <div className="text-xs text-zinc-500 truncate">{ROLE_LABELS[user.app_role] || 'Usuário'}</div>
            </div>
            <button onClick={handleLogout} className="btn-icon w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200" title="Sair">
              <LogOut className="w-4 h-4 text-zinc-600" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-[var(--border-light)] sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="btn-icon lg:hidden">
              <Menu className="w-6 h-6 text-zinc-700" />
            </button>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-zinc-900 tracking-tight capitalize">
                {pathname.split("/").pop() === "dashboard" ? "Dashboard" : pathname.split("/").pop()?.replace("-", " ")}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input type="text" placeholder="Busca global..." 
                className="pl-10 pr-4 py-2 bg-zinc-100 border-transparent rounded-full text-sm w-64 focus:bg-white focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-light)] transition-all outline-none" 
              />
            </div>
            <button className="btn-icon relative bg-zinc-100 rounded-full w-10 h-10">
              <Bell className="w-5 h-5 text-zinc-600" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 border-2 border-zinc-100" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
