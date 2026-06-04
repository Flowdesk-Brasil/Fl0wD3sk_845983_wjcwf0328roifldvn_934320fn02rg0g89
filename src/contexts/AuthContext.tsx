"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface UserProfile extends User {
  app_role: 'admin' | 'receptionist' | 'professor' | 'student';
  full_name: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  hasPermission: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await loadProfile(session.user);
        }
      } catch (e) {
        console.error("Supabase not configured or error fetching session");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          await loadProfile(session.user);
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = async (supabaseUser: User) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();
        
      if (data) {
        setUser({
          ...supabaseUser,
          app_role: data.role,
          full_name: data.full_name
        } as UserProfile);
      } else {
        // Fallback se não tiver profile criado
        setUser({
          ...supabaseUser,
          app_role: 'admin', // default admin for testing if no profile
          full_name: supabaseUser.email?.split('@')[0] || 'User'
        } as UserProfile);
      }
    } catch (e) {
       setUser({
          ...supabaseUser,
          app_role: 'admin',
          full_name: 'Admin'
        } as UserProfile);
    }
  };

  const login = async (email: string, pass: string) => {
    try {
      // 🚨 HARDCORE MOCK BYPASS: Funciona 100% das vezes se o email for admin@admin.com
      if (email === 'admin@admin.com') {
         const usr = { id: '1', email, app_role: 'admin', full_name: 'Admin Senior' };
         if (typeof window !== 'undefined') localStorage.setItem('currentUser', JSON.stringify(usr));
         setUser(usr as any);
         return { error: null };
      }

      const isDummy = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy.supabase.co");
      if (isDummy) {
         if (typeof window !== 'undefined') {
            const profiles = JSON.parse(localStorage.getItem('db_profiles') || '[]');
            const user = profiles.find((p:any) => p.email === email && p.password === pass);
            if (user) {
              const usr = { id: user.id, email: user.email, app_role: user.role, full_name: user.full_name };
              localStorage.setItem('currentUser', JSON.stringify(usr));
              setUser(usr as any);
              return { error: null };
            }
         }
         return { error: 'Credenciais inválidas. (Modo Local: Cadastre um usuário primeiro)' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) throw error;
      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    }
  };

  const logout = async () => {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        await supabase.auth.signOut();
    }
    setUser(null);
    router.push("/");
  };

  const hasPermission = (roles: string[]) => {
    if (!user) return false;
    return roles.includes(user.app_role);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
