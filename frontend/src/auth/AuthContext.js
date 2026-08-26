import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { bootstrapWorkspace, refreshSession, saveSession, session, signIn, signOut, signUp } from "./auth";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [current, setCurrent] = useState(() => session());
  const [workspace, setWorkspace] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const existing = session();
      if (existing?.refresh_token) {
        try { const next = await refreshSession(existing.refresh_token); const workspaceInfo = await bootstrapWorkspace(next.access_token); if (!cancelled) { saveSession(next); setCurrent(next); setWorkspace(workspaceInfo); } }
        catch { if (!cancelled) { saveSession(null); setCurrent(null); } }
      }
      if (!cancelled) setReady(true);
    };
    boot();
    return () => { cancelled = true; };
  }, []);
  const value = useMemo(() => ({
    ready, session: current, user: current?.user || null, workspace,
    async login(credentials) { const next = await signIn(credentials); const workspaceInfo = await bootstrapWorkspace(next.access_token); saveSession(next); setCurrent(next); setWorkspace(workspaceInfo); return next; },
    async register(credentials) { const next = await signUp(credentials); if (next.access_token) { const workspaceInfo = await bootstrapWorkspace(next.access_token); saveSession(next); setCurrent(next); setWorkspace(workspaceInfo); } return next; },
    logout() { signOut(); setCurrent(null); setWorkspace(null); },
  }), [current, ready, workspace]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
