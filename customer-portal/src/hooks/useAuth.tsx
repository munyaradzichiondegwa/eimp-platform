'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import type { PortalUser } from '@/types';

interface AuthContextType {
  user: PortalUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true,
  login: async () => {}, register: async () => {}, logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('eba_access_token') : null;
    if (token) {
      authApi.me()
        .then(setUser)
        .catch(() => { localStorage.clear(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const persistSession = (data: any) => {
    localStorage.setItem('eba_access_token', data.accessToken);
    localStorage.setItem('eba_refresh_token', data.refreshToken);
    localStorage.setItem('eba_user_id', data.user.id);
    setUser(data.user);
  };

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    persistSession(data);
    router.push('/dashboard');
  };

  const register = async (data: any) => {
    const result = await authApi.register(data);
    persistSession(result);
    router.push('/dashboard');
  };

  const logout = () => {
    authApi.logout().catch(() => {});
    localStorage.clear();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
