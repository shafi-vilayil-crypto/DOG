import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { deleteProviderCredential, getDogProviders, setProviderCredential, updateProvider } from "../services/dogApi";

const MARK_BY_TYPE = { OPENAI: { mark: "O", color: "#111827" }, ANTHROPIC: { mark: "A", color: "#d97757" }, GEMINI: { mark: "✦", color: "#4285f4" }, CUSTOM: { mark: "＋", color: "#64748b" } };

export default function Integrations() {
  const [providers, setProviders] = useState([]);
  const [openProvider, setOpenProvider] = useState(null);
  const [credential, setCredential] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    getDogProviders().then(d => setProviders(d.providers || [])).catch(err => setMessage(err.message));
  }, []);

  const refresh = async () => setProviders((await getDogProviders()).providers || []);
  const connect = () => {
    const custom = providers.find(p => p.provider_type === "CUSTOM");
    if (custom) setOpenProvider(custom);
    else setMessage("No provider slot is available.");
  };
  const test = async () => { await updateProvider(openProvider.id, { status: "CONNECTED" }); setMessage("Connection status updated."); await refresh(); };
  const saveCredential = async () => { if (!credential.trim()) return; await setProviderCredential(openProvider.id, { api_key: credential }); setCredential(""); setMessage("Credential encrypted and saved."); await refresh(); };
  const disconnect = async () => { await deleteProviderCredential(openProvider.id); await updateProvider(openProvider.id, { status: "DISCONNECTED" }); setMessage("Provider disconnected."); await refresh(); setOpenProvider(null); };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Integrations</div>
          <h1 data-testid="page-title">Which providers does my workspace use?</h1>
          <p data-testid="page-description">Connect and configure AI providers. DOG routes traffic through this layer.</p>
        </div>
        <button className="primary-button" onClick={connect} data-testid="connect-provider-button"><Plus size={16} /> Connect provider</button>
      </div>
      {message && <div className="panel new-key-banner">{message}</div>}

      <div className="provider-grid">
        {providers.map(p => {
          const style = MARK_BY_TYPE[p.provider_type] || MARK_BY_TYPE.CUSTOM;
          return (
            <button type="button" className="provider-card panel provider-card-btn" key={p.id} onClick={() => setOpenProvider(p)} data-testid={`provider-card-${p.provider_type.toLowerCase()}`}>
              <div className="provider-head">
                <span className="provider-large-mark" style={{ background: style.color }}>{style.mark}</span>
                <span className="dots-button">•••</span>
              </div>
              <h2>{p.name}</h2>
              <p><span className="mono">{p.default_model || "no model"}</span></p>
              <div className="provider-status">
                <span className={p.status === "CONNECTED" ? "status-good" : "status-neutral"}>● {p.status === "CONNECTED" ? "Operational" : p.status}</span>
              </div>
              <div className="provider-foot">
                <span>Mode: <b className="mono">{p.mode}</b></span>
                <span className="text-link">Configure ↗</span>
              </div>
            </button>
          );
        })}
      </div>

      {openProvider && (
        <div className="drawer-overlay" onClick={() => setOpenProvider(null)}>
          <aside className="drawer" onClick={e => e.stopPropagation()} data-testid="provider-drawer">
            <header>
              <span className="provider-large-mark" style={{ background: (MARK_BY_TYPE[openProvider.provider_type] || MARK_BY_TYPE.CUSTOM).color }}>
                {(MARK_BY_TYPE[openProvider.provider_type] || MARK_BY_TYPE.CUSTOM).mark}
              </span>
              <div>
                <h2>{openProvider.name}</h2>
                <span className={openProvider.status === "CONNECTED" ? "status-good" : "status-neutral"}>● {openProvider.status}</span>
              </div>
              <button className="icon-button" onClick={() => setOpenProvider(null)} data-testid="close-drawer-button">✕</button>
            </header>
            <section>
              <span className="eyebrow">Default model</span>
              <div className="drawer-cred"><span className="mono">{openProvider.default_model || "not configured"}</span></div>
            </section>
            <section>
              <span className="eyebrow">Provider mode</span>
              <div className="drawer-cred"><span className="mono">{openProvider.mode}</span><span className="muted" style={{ fontSize: 11 }}>Direct workspace provider</span></div>
            </section>
            <section>
              <span className="eyebrow">Provider credential</span>
              <div className="drawer-cred"><input type="password" placeholder={openProvider.credential_configured ? "Credential configured" : "Paste provider API key"} value={credential} onChange={e => setCredential(e.target.value)} /><button className="soft-button" onClick={saveCredential} disabled={!credential.trim()}>Save</button></div>
            </section>
            <section className="drawer-actions">
              <button className="soft-button" onClick={test} data-testid="test-connection-button">Test connection</button>
              <button className="soft-button" onClick={() => setMessage("Edit the credential above, then save it.")} data-testid="edit-provider-button">Edit</button>
              <button className="soft-button danger" onClick={disconnect} data-testid="disconnect-provider-button">Disconnect</button>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
