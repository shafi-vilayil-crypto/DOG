import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { bootstrapWorkspace, refreshSession, saveSession, session, signIn, signOut, signUp } from "./auth";

const AuthContext = createContext(null);

function isTokenExpired(sess, bufferSeconds = 120) {
  if (!sess || !sess.access_token) return true;
  const expiresAt = sess.expires_at;
  if (!expiresAt) return false;
  const now = Math.floor(Date.now() / 1000);
  return now >= (expiresAt - bufferSeconds);
}

export function AuthProvider({ children }) {
  const [current, setCurrent] = useState(() => session());
  const [workspace, setWorkspace] = useState(null);
  const [ready, setReady] = useState(false);
  const refreshTimerRef = useRef(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleSilentRefresh = useCallback((sess) => {
    clearRefreshTimer();
    if (!sess || !sess.refresh_token || !sess.expires_at) return;

    const nowSeconds = Math.floor(Date.now() / 1000);
    // Silent refresh 5 minutes (300s) before token expires, minimum 10 seconds delay
    const refreshInSeconds = Math.max(10, sess.expires_at - nowSeconds - 300);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const next = await refreshSession(sess.refresh_token, sess);
        setCurrent(next);
        scheduleSilentRefresh(next);
      } catch (err) {
        console.warn("Silent token refresh notice:", err.message);
      }
    }, refreshInSeconds * 1000);
  }, [clearRefreshTimer]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const existing = session();
      if (!existing) {
        if (!cancelled) setReady(true);
        return;
      }

      let activeSession = existing;
      let workspaceInfo = null;

      // 1. Try existing access token if it's still valid
      if (existing.access_token && !isTokenExpired(existing)) {
        try {
          workspaceInfo = await bootstrapWorkspace(existing.access_token);
        } catch (err) {
          workspaceInfo = null;
        }
      }

      // 2. If access token was expired or workspace bootstrap failed (401), try refresh token
      if (!workspaceInfo && existing.refresh_token) {
        try {
          const next = await refreshSession(existing.refresh_token, existing);
          workspaceInfo = await bootstrapWorkspace(next.access_token);
          activeSession = next;
        } catch (err) {
          const msg = err.message || "";
          if (msg.includes("grant") || msg.includes("invalid") || msg.includes("expired") || msg.includes("refresh_token")) {
            saveSession(null);
            activeSession = null;
          }
        }
      }

      if (!cancelled) {
        if (activeSession) {
          setCurrent(activeSession);
          setWorkspace(workspaceInfo);
          scheduleSilentRefresh(activeSession);
        } else {
          setCurrent(null);
          setWorkspace(null);
        }
        setReady(true);
      }
    };

    boot();
    return () => {
      cancelled = true;
      clearRefreshTimer();
    };
  }, [clearRefreshTimer, scheduleSilentRefresh]);

  const value = useMemo(() => ({
    ready,
    session: current,
    user: current?.user || null,
    workspace,
    async login(credentials) {
      const next = await signIn(credentials);
      const workspaceInfo = await bootstrapWorkspace(next.access_token);
      setCurrent(next);
      setWorkspace(workspaceInfo);
      scheduleSilentRefresh(next);
      return next;
    },
    async register(credentials) {
      const next = await signUp(credentials);
      if (next.access_token) {
        const workspaceInfo = await bootstrapWorkspace(next.access_token);
        setCurrent(next);
        setWorkspace(workspaceInfo);
        scheduleSilentRefresh(next);
      }
      return next;
    },
    logout() {
      clearRefreshTimer();
      signOut();
      setCurrent(null);
      setWorkspace(null);
    },
  }), [clearRefreshTimer, current, ready, scheduleSilentRefresh, workspace]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
