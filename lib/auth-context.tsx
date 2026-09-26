'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase-client';
import { User, Session } from '@supabase/supabase-js';

export type StaffRole = 'operator' | 'developer';
interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: StaffRole | null;
  isOperator: boolean;
  isDeveloper: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<StaffRole | null>;
  logout: () => Promise<void>;
  refreshOperatorStatus: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
async function readRole(userId: string): Promise<StaffRole | null> {
  const { data, error } = await supabase.from('operator_profiles')
    .select('is_operator,role').eq('id', userId).maybeSingle();
  if (error || !data?.is_operator) return null;
  return data.role === 'operator' || data.role === 'developer' ? data.role : null;
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const generation = useRef(0);
  const refresh = async (next: Session | null) => {
    const version = ++generation.current;
    setSession(next); setRole(null); setIsLoading(true);
    const nextRole = next?.user ? await readRole(next.user.id) : null;
    if (version === generation.current) { setRole(nextRole); setIsLoading(false); }
  };
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({data}) => { if (active) void refresh(data.session); });
    // Do not await other Supabase calls inside the auth callback (auth lock).
    const {data: {subscription}} = supabase.auth.onAuthStateChange((_event, next) => {
      setTimeout(() => { if (active) void refresh(next); }, 0);
    });
    return () => { active = false; generation.current++; subscription.unsubscribe(); };
  }, []);
  const login = async (email: string, password: string) => {
    const {data,error} = await supabase.auth.signInWithPassword({email,password});
    if (error) throw error;
    const nextRole = await readRole(data.user.id);
    await refresh(data.session);
    return nextRole;
  };
  const logout = async () => {
    const {error} = await supabase.auth.signOut(); if (error) throw error;
    await refresh(null);
  };
  return <AuthContext.Provider value={{
    user:session?.user ?? null,session,role,isOperator:role==='operator',isDeveloper:role==='developer',
    isLoading,login,logout,refreshOperatorStatus:()=>refresh(session),
  }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
