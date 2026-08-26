const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const SESSION_KEY = "dog.supabase.session";
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const FRONTEND_URL = process.env.REACT_APP_FRONTEND_URL || window.location.origin;

function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function request(path, body) {
  if (!configured()) throw new Error("Supabase Auth is not configured. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to frontend/.env.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || "Authentication request failed");
  return data;
}

export function session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } }
export function saveSession(value) { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); }
export const signUp = ({ email, password, name }) => request("/signup", { email, password, data: { display_name: name } });
export const signIn = ({ email, password }) => request("/token?grant_type=password", { email, password });
export const sendPasswordReset = email => request("/recover", { email, redirect_to: FRONTEND_URL });
export const refreshSession = refresh_token => request("/token?grant_type=refresh_token", { refresh_token });
export async function updatePassword(accessToken, password) {
  if (!configured()) throw new Error("Supabase Auth is not configured.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || "Could not update password");
  return data;
}
export const signOut = () => saveSession(null);
export async function bootstrapWorkspace(token) {
  const response = await fetch(`${BACKEND_URL}/api/v1/auth/bootstrap`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg || item).join(", ") : data.detail;
    throw new Error(detail || "Could not create your workspace");
  }
  return data;
}
