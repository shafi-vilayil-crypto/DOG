const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const SESSION_KEY = "dog.supabase.session";
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const FRONTEND_URL = process.env.REACT_APP_FRONTEND_URL || window.location.origin;

function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function normalizeSession(data, existingSession = null) {
  if (!data || typeof data !== "object") return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expires_at = data.expires_at || (nowSeconds + (data.expires_in || 3600));
  const user = data.user || existingSession?.user || null;
  return {
    ...data,
    expires_at,
    user,
  };
}

async function request(path, body) {
  if (!configured()) throw new Error("Supabase Auth is not configured. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to frontend/.env.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      const waitMsg = data.msg || data.message || data.error_description || "Too many attempts.";
      throw new Error(`Rate limit reached: ${waitMsg}`);
    }
    const msg = data.error_description || data.msg || data.message || (response.status === 400 ? "Invalid credentials or request" : "Authentication request failed");
    throw new Error(msg);
  }
  return data;
}

export function session() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return normalizeSession(stored);
  } catch {
    return null;
  }
}

export function saveSession(value) {
  if (value) {
    const normalized = normalizeSession(value);
    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    return normalized;
  } else {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export const signUp = async ({ email, password, name }) => {
  const data = await request("/signup", { email, password, data: { display_name: name } });
  if (data.access_token) return saveSession(data);
  return data;
};

export const signIn = async ({ email, password }) => {
  const data = await request("/token?grant_type=password", { email, password });
  return saveSession(data);
};

export const sendPasswordReset = email => request("/recover", { email, redirect_to: FRONTEND_URL });

export const refreshSession = async (refresh_token, existingSession = null) => {
  const data = await request("/token?grant_type=refresh_token", { refresh_token });
  const normalized = normalizeSession(data, existingSession);
  return saveSession(normalized);
};

export async function updatePassword(accessToken, password) {
  if (!configured()) throw new Error("Supabase Auth is not configured.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data.error_description || data.msg || data.message || "Could not update password";
    throw new Error(msg);
  }
  return data;
}

export const signOut = () => saveSession(null);

export async function bootstrapWorkspace(token) {
  const response = await fetch(`${BACKEND_URL}/api/v1/auth/bootstrap`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg || item).join(", ") : data.detail;
    throw new Error(detail || "Could not create your workspace");
  }
  return data;
}
