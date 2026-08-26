import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createApiKey } from "../services/dogApi";

const GUIDES = [
  "Connect OpenAI",
  "Connect Anthropic",
  "Connect a custom LLM",
  "Use DOG with RAG",
  "Use DOG with agents",
  "Enable loop protection",
  "Enable response caching",
];

const SDKS = [
  { name: "JavaScript", status: "Available" },
  { name: "Python", status: "Available" },
  { name: ".NET", status: "Coming soon" },
  { name: "Go", status: "Coming soon" },
];

export default function Docs() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  const [guide, setGuide] = useState(null);
  const create = async () => { await createApiKey({ name: "Documentation key", environment: "test" }); navigate("/api-keys"); };
  const copy = async text => { await navigator.clipboard.writeText(text); setNotice("Copied to clipboard"); setTimeout(() => setNotice(""), 1500); };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Documentation</div>
          <h1 data-testid="page-title">How do I integrate DOG?</h1>
          <p data-testid="page-description">Point your application at the DOG gateway and start receiving intelligence in minutes.</p>
        </div>
        <button className="primary-button" onClick={create} data-testid="create-key-docs-button">Create API key <Plus size={16} /></button>
      </div>

      <section className="docs-layout">
        <div className="panel endpoint-panel">
          <span className="eyebrow">Your API endpoint</span>
          <div className="endpoint">
            https://api.dog.dev/v1
            <button className="icon-button" onClick={() => copy("https://api.dog.dev/v1")} data-testid="copy-endpoint-button"><Copy size={16} /></button>
          </div>
          <span className="eyebrow">Quick start</span>
          <pre data-testid="quick-start-code"><code>{`curl https://api.dog.dev/v1/ai/chat \\
  -H "X-DOG-API-Key: dog_live_••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role":"user","content":"Hello"}],
    "provider": "openai",
    "model": "gpt-5.2"
  }'`}</code></pre>
        </div>
        <div className="panel steps-panel">
          <span className="eyebrow">Five minutes to value</span>
          {["Create an account", "Get your DOG API key", "Connect a provider", "Point your app at DOG", "Start receiving intelligence"].map((s, i) => (
            <div className="step" key={s}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <strong>{s}</strong>
              {i < 4 && <i />}
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-grid" style={{ marginTop: 24 }}>
        <section className="panel">
          <div className="panel-header"><div><span className="eyebrow">API reference</span><h2>Endpoints</h2></div></div>
          <ul className="api-ref-list">
            <li><span className="method">POST</span><span className="mono">/v1/ai/chat</span><small>Send a chat request through the gateway</small></li>
            <li><span className="method">POST</span><span className="mono">/v1/ai/stream</span><small>Stream tokens over SSE</small></li>
            <li><span className="method">GET</span><span className="mono">/v1/providers</span><small>List configured providers and their mode</small></li>
            <li><span className="method">GET</span><span className="mono">/v1/savings/today</span><small>Live saved-today counter data</small></li>
          </ul>
        </section>
        <section className="panel">
          <div className="panel-header"><div><span className="eyebrow">SDKs</span><h2>Official libraries</h2></div></div>
          <div className="sdk-grid">
            {SDKS.map(s => (
              <div className={`sdk-card ${s.status === "Available" ? "" : "muted"}`} key={s.name} data-testid={`sdk-${s.name.toLowerCase()}`}>
                <strong>{s.name}</strong>
                <span>{s.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-header"><div><span className="eyebrow">Guides</span><h2>Recipes</h2></div></div>
        <div className="guide-grid">
          {GUIDES.map(g => (
            <button type="button" onClick={() => setGuide(g)} className="guide-card" key={g} data-testid={`guide-${g.toLowerCase().replace(/\s+/g, "-")}`}>
              <strong>{g}</strong>
              <span>Read guide ↗</span>
            </button>
          ))}
        </div>
      </section>
      {notice && <div className="panel new-key-banner">{notice}</div>}
      {guide && <div className="panel new-key-banner"><strong>{guide}</strong><p>Configure this workflow using the live DOG gateway and the API key from the API Keys page.</p><button className="soft-button" onClick={() => setGuide(null)}>Close</button></div>}
    </>
  );
}
