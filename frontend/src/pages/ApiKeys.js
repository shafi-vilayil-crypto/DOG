import { useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { getApiKeys, createApiKey, rotateApiKey, revokeApiKey } from "../services/dogApi";

function timeAgo(iso) {
  if (!iso) return "Never";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const data = await getApiKeys();
      setKeys(data.api_keys);
    } catch (err) { setError(err.message); }
  };

  const copy = async (value) => {
    await navigator.clipboard.writeText(value);
  };

  const rotate = async (key) => {
    setError("");
    try {
      const res = await rotateApiKey(key.id);
      setNewKey(res.secret);
      await refresh();
    } catch (err) { setError(err.message); }
  };

  const revoke = async (key) => {
    if (key.revoked || !window.confirm(`Revoke ${key.name}?`)) return;
    setError("");
    try { await revokeApiKey(key.id); await refresh(); }
    catch (err) { setError(err.message); }
  };
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await createApiKey({ name: `Key ${keys.length + 1}`, environment: "test" });
      setNewKey(res.secret);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">API Keys</div>
          <h1 data-testid="page-title">How does my application authenticate with DOG?</h1>
          <p data-testid="page-description">These keys authenticate your application to the DOG gateway — separate from provider credentials.</p>
        </div>
        <button className="primary-button" onClick={create} disabled={creating} data-testid="create-api-key-button">
          <Plus size={16} /> {creating ? "Creating…" : "Create API key"}
        </button>
      </div>

      {newKey && (
        <div className="panel new-key-banner" data-testid="new-key-banner">
          <div>
            <span className="eyebrow">New key created — copy it now, it won&apos;t be shown again</span>
            <div className="new-key-value mono">{newKey}</div>
          </div>
          <button className="soft-button" onClick={() => { navigator.clipboard.writeText(newKey); setNewKey(null); }} data-testid="copy-new-key-button"><Copy size={14} /> Copy & dismiss</button>
        </div>
      )}

      {error && <div className="panel new-key-banner" style={{ background: "#fff1ef", borderColor: "#f4d0c9" }} data-testid="api-key-error">{error}</div>}

      <section className="panel" style={{ marginTop: 16 }}>
        <table className="data-table" data-testid="api-keys-table">
          <thead><tr><th>Name</th><th>Environment</th><th>Key</th><th>Last used</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {keys.map(k => (
              <tr key={k.id} className={k.revoked ? "muted" : ""}>
                <td><strong>{k.name}</strong></td>
                <td><span className={`env-chip env-${k.environment}`}>{k.environment === "live" ? "Live" : "Test"}</span></td>
                <td><span className="mono">{k.masked}</span></td>
                <td className="muted">{timeAgo(k.last_used_at)}</td>
                <td className="muted">{formatDate(k.created_at)}</td>
                <td className="row-actions">
                  <button className="text-link" onClick={() => copy(k.masked)} data-testid={`copy-${k.name.toLowerCase()}`}>Copy</button>
                  <button className="text-link" onClick={() => rotate(k)} disabled={k.revoked} data-testid={`rotate-${k.name.toLowerCase()}`}>Rotate</button>
                  <button className="text-link danger" onClick={() => revoke(k)} data-testid={`revoke-${k.name.toLowerCase()}`}>{k.revoked ? "Revoked" : "Revoke"}</button>
                </td>
              </tr>
            ))}
            {keys.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 20, fontSize: 12 }}>No API keys yet — click Create API key.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="panel key-distinction" style={{ marginTop: 20 }}>
        <span className="eyebrow">A quick reminder</span>
        <div className="distinction-grid">
          <div><h3>DOG API Key</h3><p>Used by your application to authenticate against the DOG gateway.</p><span className="mono muted">Customer app → DOG</span></div>
          <div><h3>Provider credential</h3><p>Configured under Integrations. Used by DOG to talk to OpenAI, Anthropic, or Gemini.</p><span className="mono muted">DOG → Provider</span></div>
        </div>
      </section>
    </>
  );
}
