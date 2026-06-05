"use client";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { localDB } from "@/lib/localDB";
import { supabase, useLocalData } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  app_role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  hasPermission: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authErrorMessage(message?: string) {
  if (!message) return null;
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (normalized.includes("too many requests")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (normalized.includes("failed to fetch")) return "Não foi possível conectar ao servidor de autenticação.";
  return "Não foi possível entrar. Revise os dados e tente novamente.";
}

function readLocalSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("currentUser") ?? "null") as AuthUser | null;
  } catch {
    return null;
  }
}

function storeSession(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem("currentUser", JSON.stringify(user));
  else localStorage.removeItem("currentUser");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const loadProfile = useCallback(async (authUser: SupabaseUser, accessToken?: string) => {
    const response = accessToken
      ? await fetch("/api/auth/profile", { headers: { Authorization: `Bearer ${accessToken}` } })
      : null;
    const payload = response?.ok
      ? await response.json() as { profile: { id: string; full_name: string; email: string; role: UserRole } }
      : null;

    const profile: AuthUser = !payload
      ? {
          id: authUser.id,
          email: authUser.email ?? "",
          full_name: authUser.user_metadata.full_name ?? authUser.email?.split("@")[0] ?? "Usuário",
          app_role: "student",
        }
      : {
          id: payload.profile.id,
          email: payload.profile.email,
          full_name: payload.profile.full_name,
          app_role: payload.profile.role,
        };

    storeSession(profile);
    setUser(profile);
  }, []);

  useEffect(() => {
    if (useLocalData) {
      setUser(readLocalSession());
      setIsLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (active && data.session?.user) await loadProfile(data.session.user, data.session.access_token);
      if (active) setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void loadProfile(session.user, session.access_token);
      else {
        storeSession(null);
        setUser(null);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (useLocalData) {
      const profile = localDB
        .get("profiles")
        .find((item) => item.email.toLowerCase() === normalizedEmail && item.password === password && item.active);
      if (!profile) return { error: "E-mail ou senha incorretos." };

      const session: AuthUser = {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        app_role: profile.role,
      };
      storeSession(session);
      setUser(session);
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    return { error: authErrorMessage(error?.message) };
  }, []);

  const logout = useCallback(async () => {
    storeSession(null);
    if (!useLocalData) await supabase.auth.signOut();
    setUser(null);
    router.replace("/");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login,
      logout,
      hasPermission: (roles) => Boolean(user && roles.includes(user.app_role)),
    }),
    [isLoading, login, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
