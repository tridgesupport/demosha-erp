import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AuthUser {
  user_id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'salesperson' | 'factory';
  signature_url: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>(null!);

const BASE = import.meta.env.VITE_API_URL ?? '';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    const t = localStorage.getItem('token');
    if (!t) { setIsLoading(false); return; }
    try {
      const res = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) setUser(await res.json());
      else { localStorage.removeItem('token'); setToken(null); setUser(null); }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { refreshUser(); }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Login failed'); }
    const { token: t, user: u } = await res.json();
    localStorage.setItem('token', t);
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}
