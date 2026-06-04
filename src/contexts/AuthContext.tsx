"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User, UserRole } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USERS: (User & { password: string })[] = [
  {
    id: "user-1",
    name: "Admin Master",
    email: "admin@corpoevolucao.com.br",
    role: "admin",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    lastLogin: new Date().toISOString(),
    password: "admin123",
  },
  {
    id: "user-2",
    name: "Maria Santos",
    email: "recepcao@corpoevolucao.com.br",
    role: "receptionist",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    lastLogin: new Date().toISOString(),
    password: "recepcao123",
  },
  {
    id: "user-3",
    name: "Prof. Ricardo Alves",
    email: "professor@corpoevolucao.com.br",
    role: "professor",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    lastLogin: new Date().toISOString(),
    password: "prof123",
  },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("ce_user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem("ce_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));

    const found = MOCK_USERS.find(
      (u) => u.email === email && u.password === password && u.active
    );

    if (found) {
      const { password: _, ...userWithoutPassword } = found;
      setUser(userWithoutPassword);
      localStorage.setItem("ce_user", JSON.stringify(userWithoutPassword));
      setIsLoading(false);
      return true;
    }

    setIsLoading(false);
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("ce_user");
  };

  const hasPermission = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
