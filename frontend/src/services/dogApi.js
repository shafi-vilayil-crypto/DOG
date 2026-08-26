const API = `${process.env.REACT_APP_BACKEND_URL}/api/v1`;
const demoKey = process.env.REACT_APP_DOG_DEMO_API_KEY;
function accessToken() { try { return JSON.parse(localStorage.getItem("dog.supabase.session") || "null")?.access_token; } catch { return null; } }

const gatewayHeaders = { "Content-Type": "application/json", "X-DOG-API-Key": demoKey };
function readHeaders() { const token = accessToken(); return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }; }

async function json(response, fallbackError) {
  if (!response.ok) {
    let detail = fallbackError;
    try { detail = (await response.json()).detail || fallbackError; } catch { /* keep fallback */ }
    throw new Error(detail);
  }
  return response.json();
}

// --- Customer gateway surface ---
export async function sendDogChat({ prompt, system, provider, model, sessionId, tools, metadata }) {
  const response = await fetch(`${API}/ai/chat`, {
    method: "POST",
    headers: readHeaders(),
    body: JSON.stringify({ messages: [{ role: "system", content: system || "You are a helpful assistant." }, { role: "user", content: prompt }], provider, model, session_id: sessionId, tools, metadata }),
  });
  return json(response, "DOG gateway request failed");
}

// --- Dashboard read surface ---
export const getDogProviders    = () => fetch(`${API}/providers`,      { headers: readHeaders() }).then(r => json(r, "Failed to load providers"));
export const getSavingsToday    = () => fetch(`${API}/savings/today`,  { headers: readHeaders() }).then(r => json(r, "Failed to load savings"));
export const getOverview        = () => fetch(`${API}/overview`,       { headers: readHeaders() }).then(r => json(r, "Failed to load overview"));
export const getPerformance     = (hours = 24) => fetch(`${API}/performance?hours=${hours}`, { headers: readHeaders() }).then(r => json(r, "Failed to load performance"));
export const getCost            = (days = 30) => fetch(`${API}/cost?days=${days}`, { headers: readHeaders() }).then(r => json(r, "Failed to load cost"));
export const getReliability     = () => fetch(`${API}/reliability`,    { headers: readHeaders() }).then(r => json(r, "Failed to load reliability"));
export const getOptimizations   = (days = 30) => fetch(`${API}/optimizations?days=${days}`, { headers: readHeaders() }).then(r => json(r, "Failed to load optimizations"));
export const getApiKeys         = () => fetch(`${API}/api-keys`,       { headers: readHeaders() }).then(r => json(r, "Failed to load API keys"));

async function mutate(path, method = "POST", body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: readHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return json(response, "DOG request failed");
}

export async function createApiKey({ name, environment }) {
  const response = await fetch(`${API}/api-keys`, {
    method: "POST",
    headers: readHeaders(),
    body: JSON.stringify({ name, environment }),
  });
  return json(response, "Failed to create API key");
}

export const rotateApiKey = id => mutate(`/api-keys/${id}/rotate`);
export const revokeApiKey = id => mutate(`/api-keys/${id}/revoke`);
export const getPolicies = () => fetch(`${API}/policies`, { headers: readHeaders() }).then(r => json(r, "Failed to load policies"));
export const updatePolicies = policies => mutate("/policies", "PATCH", policies);
export const updateProvider = (id, body) => mutate(`/providers/${id}`, "PATCH", body);
export const setProviderCredential = (id, body) => mutate(`/providers/${id}/credential`, "POST", body);
export const deleteProviderCredential = id => mutate(`/providers/${id}/credential`, "DELETE");
export const getAdminMembers = () => fetch(`${API}/admin/members`, { headers: readHeaders() }).then(r => json(r, "Failed to load workspace members"));
export const updateAdminMember = (id, role) => mutate(`/admin/members/${id}`, "PATCH", { role });
export const removeAdminMember = id => mutate(`/admin/members/${id}`, "DELETE");
