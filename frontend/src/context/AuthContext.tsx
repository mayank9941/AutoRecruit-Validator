import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { HRUser } from '../types';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: HRUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<HRUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<HRUser | null>(null);
  // "checking" -- initial /auth/me call in flight
  // "authenticated" | "unauthenticated" -- resolved
  const [status, setStatus] = useState<AuthStatus>('checking');

  useEffect(() => {
    api
      .get('/auth/me')
      .then((data) => {
        setUser(data);
        setStatus('authenticated');
      })
      .catch(() => {
        setUser(null);
        setStatus('unauthenticated');
      });
  }, []);

  async function login(email: string, password: string) {
    const data = await api.post('/auth/login', { email, password });
    setUser(data);
    setStatus('authenticated');
    return data;
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the request fails, clear local state so the UI reflects
      // "logged out" -- staying logged in visually would be worse.
    }
    setUser(null);
    setStatus('unauthenticated');
  }

  return <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export { ApiError };
