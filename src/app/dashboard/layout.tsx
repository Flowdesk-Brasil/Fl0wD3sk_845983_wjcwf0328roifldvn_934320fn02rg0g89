"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, BookOpen, Package, ScrollText,
  CreditCard, QrCode, BarChart3, Bell, Shield, Activity,
  Settings, LogOut, Hexagon, Menu, X, Search
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#000" }}>
        <div className="w-8 h-8 border-2 border-[#333] border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const handleLogout = () => { logout(); };

  return (
    <div className="flex h-screen overflow-hidden bg-black text-[#ededed]">
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 lg:hidden bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full flex flex-col bg-[#050505] border-r border-[#1f1f22]
          lg:static lg:translate-x-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 260, flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-6 border-b border-[#1f1f22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#111] border border-[#222]">
              <Hexagon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-white tracking-tight">Studio</div>
              <div className="text-[10px] font-semibold text-[#888] uppercase tracking-widest">Workspace</div>
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#555] px-3 mb-2">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {visible.map(item => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all
                          ${active 
                            ? "bg-[#1a1a1a] text-white border border-[#333]" 
                            : "text-[#888] hover:bg-[#111] hover:text-[#ccc] border border-transparent"}`}
                      >
                        <Icon className={`w-4 h-4 ${active ? "text-white" : "text-[#666]"}`} />
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
        <div className="p-4 border-t border-[#1f1f22] bg-[#000]">
          <div className="flex items-center gap-3 p-3 rounded-xl border border-[#222] bg-[#0a0a0a]">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-[#222] text-white flex-shrink-0">
              {user.full_name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-white truncate">{user.full_name}</div>
              <div className="text-[11px] text-[#888] uppercase tracking-wider truncate">{user.app_role}</div>
            </div>
            <button onClick={handleLogout} className="btn-icon w-8 h-8 rounded-lg bg-[#111] hover:bg-[#222] border border-[#222]" title="Sair">
              <LogOut className="w-4 h-4 text-[#888]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-black">
        
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-4 bg-[#000]/80 backdrop-blur-xl border-b border-[#1f1f22] sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="btn-icon lg:hidden">
              <Menu className="w-5 h-5 text-white" />
            </button>
            <div className="hidden sm:block">
              <h1 className="text-[15px] font-semibold text-white tracking-wide capitalize">
                {pathname.split("/").pop() === "dashboard" ? "Dashboard Geral" : pathname.split("/").pop()?.replace("-", " ")}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
              <input type="text" placeholder="Buscar..." 
                className="pl-9 pr-4 py-1.5 bg-[#111] border border-[#222] rounded-md text-[13px] w-64 focus:bg-[#000] focus:border-[#444] text-white transition-all outline-none" 
              />
            </div>
            <button className="btn-icon relative bg-[#111] border border-[#222] rounded-md w-8 h-8">
              <Bell className="w-4 h-4 text-[#888]" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ef4444] border-2 border-black" />
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
