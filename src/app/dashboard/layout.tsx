"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, BookOpen, Package, ScrollText,
  CreditCard, QrCode, BarChart3, Bell, Shield, Activity,
  Settings, LogOut, Dumbbell, Menu, X, ChevronRight,
  Search, User
} from "lucide-react";

/* ─── Nav config ─── */
const NAV = [
  {
    title: "Visão Geral",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "#8b5cf6", roles: ["admin","receptionist","professor"] },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/dashboard/alunos",     label: "Alunos",    icon: Users,      color: "#3b82f6", roles: ["admin","receptionist"] },
      { href: "/dashboard/matriculas", label: "Matrículas",icon: BookOpen,   color: "#22c55e", roles: ["admin","receptionist"] },
      { href: "/dashboard/planos",     label: "Planos",    icon: Package,    color: "#f97316", roles: ["admin"] },
      { href: "/dashboard/contratos",  label: "Contratos", icon: ScrollText, color: "#ec4899", roles: ["admin","receptionist"] },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/dashboard/pagamentos", label: "Pagamentos", icon: CreditCard, color: "#eab308", roles: ["admin","receptionist"] },
    ],
  },
  {
    title: "Operações",
    items: [
      { href: "/dashboard/checkin",       label: "Check-in",    icon: QrCode,     color: "#06b6d4", roles: ["admin","receptionist"] },
      { href: "/dashboard/relatorios",    label: "Relatórios",  icon: BarChart3,  color: "#a78bfa", roles: ["admin"] },
      { href: "/dashboard/notificacoes",  label: "Notificações",icon: Bell,       color: "#fb923c", roles: ["admin"] },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/dashboard/usuarios",     label: "Usuários",    icon: Shield,   color: "#f43f5e", roles: ["admin"] },
      { href: "/dashboard/auditoria",    label: "Auditoria",   icon: Activity, color: "#64748b", roles: ["admin"] },
      { href: "/dashboard/configuracoes",label: "Configurações",icon: Settings, color: "#71717a", roles: ["admin"] },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  receptionist: "Recepcionista",
  professor: "Professor",
  student: "Aluno",
};

/* ─── Sidebar ─── */
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout, hasPermission } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => { logout(); router.push("/"); };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full flex flex-col
          lg:static lg:translate-x-0 lg:z-auto
          transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 240, background: "#0a0a0a", borderRight: "1px solid #1a1a1a", flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <Dumbbell className="w-4 h-4 text-black" />
            </div>
            <div>
              <div className="text-xs font-bold text-white leading-tight">Corpo e Evolução</div>
              <div className="text-[10px]" style={{ color: "#3f3f46" }}>Gestão</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon lg:hidden">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {NAV.map((section) => {
            const visible = section.items.filter(item =>
              hasPermission(item.roles as ("admin"|"receptionist"|"professor"|"student")[])
            );
            if (!visible.length) return null;
            return (
              <div key={section.title}>
                <p className="text-[10px] font-semibold uppercase tracking-[.1em] px-2 mb-1.5"
                  style={{ color: "#3f3f46" }}>
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {visible.map(item => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link key={item.href} href={item.href} onClick={onClose}
                        className={`nav-item ${active ? "active" : ""}`}>
                        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ background: active ? item.color + "20" : "transparent" }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: active ? item.color : "#52525b" }} />
                        </div>
                        <span className="truncate">{item.label}</span>
                        {active && (
                          <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" style={{ color: "#52525b" }} />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User card */}
        <div className="p-3" style={{ borderTop: "1px solid #1a1a1a" }}>
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl"
            style={{ background: "#111", border: "1px solid #1a1a1a" }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: "#8b5cf620", color: "#a78bfa" }}>
              {user?.name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
              <div className="text-[10px] truncate" style={{ color: "#8b5cf6" }}>
                {ROLE_LABELS[user?.role ?? "admin"]}
              </div>
            </div>
            <button onClick={handleLogout} className="btn-icon p-1.5" title="Sair">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ─── Topbar ─── */
function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const PAGE_TITLES: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/dashboard/alunos": "Alunos",
    "/dashboard/alunos/novo": "Novo Aluno",
    "/dashboard/matriculas": "Matrículas",
    "/dashboard/planos": "Planos",
    "/dashboard/contratos": "Contratos",
    "/dashboard/pagamentos": "Pagamentos",
    "/dashboard/checkin": "Check-in",
    "/dashboard/relatorios": "Relatórios",
    "/dashboard/notificacoes": "Notificações",
    "/dashboard/usuarios": "Usuários",
    "/dashboard/auditoria": "Auditoria",
    "/dashboard/configuracoes": "Configurações",
  };

  const h = new Date().getHours();
  const greeting = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const first = user?.name?.split(" ")[0];

  return (
    <header className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
      style={{ background: "#0a0a0a", borderBottom: "1px solid #1a1a1a" }}>
      <div className="flex items-center gap-3.5">
        <button onClick={onMenu} className="btn-icon lg:hidden">
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-bold text-white">{PAGE_TITLES[pathname] ?? "Dashboard"}</h1>
          <p className="text-xs" style={{ color: "#52525b" }}>{greeting}, {first} 👋</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-icon relative">
          <Bell className="w-4.5 h-4.5 w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
        </button>
        <Link href="/dashboard/configuracoes"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-80"
          style={{ background: "#8b5cf620", color: "#a78bfa" }}>
          {user?.name?.[0]}
        </Link>
      </div>
    </header>
  );
}

/* ─── Layout ─── */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push("/");
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#000" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
            <Dumbbell className="w-6 h-6 text-black" />
          </div>
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-white rounded-full anim-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#000" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenu={() => setSidebarOpen(v => !v)} />
        <main className="flex-1 overflow-y-auto p-5 lg:p-6 anim-fadeUp">
          {children}
        </main>
      </div>
    </div>
  );
}
