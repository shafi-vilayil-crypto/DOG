import { useEffect, useState } from "react";
import { Copy, FlaskConical, Gauge, Send, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { sendDogChat, getDogProviders } from "../services/dogApi";

const MODELS_BY_PROVIDER = {
  openai: ["gpt-5.2", "gpt-5.4", "gpt-5.4-mini", "mock-fast"],
  anthropic: ["claude-sonnet-4-6", "claude-sonnet-5", "claude-haiku-4-5-20251001", "mock-fast"],
  gemini: ["gemini-3.6-flash", "gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-2.5-flash", "mock-fast"],
  custom: ["mock-fast", "mock-reasoning"],
};

const DEMO_MODES = [
  { key: "normal", label: "Normal", desc: "Send a single well-formed request." },
  { key: "slow", label: "Slow", desc: "Simulate a heavy prompt to trigger latency intelligence." },
  { key: "duplicate", label: "Duplicate", desc: "Send the same prompt 3× to trigger DOG duplicate protection." },
  { key: "loop", label: "Loop", desc: "Send the same prompt 5× rapidly to trigger BLOCK." },
];

const SLOW_PROMPT = "Write a 1200-word thorough analysis with citations of the following topic. Take your time and be exhaustive: ";

function Toggle({ label, value, onChange, testId }) {
  return (
    <button type="button" className={`option-toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} data-testid={testId}>
      <span className="option-dot" />
      {label}
    </button>
  );
}

export default function Playground() {
  const [system, setSystem] = useState("You are a helpful assistant.");
  const [prompt, setPrompt] = useState("Explain quantum computing in one clear paragraph.");
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-5.2");
  const [mode, setMode] = useState("normal");
  const [options, setOptions] = useState({ dog: true, cache: true, loop: true, cost: true });
  const [result, setResult] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [providerModes, setProviderModes] = useState({});

  useEffect(() => {
    getDogProviders().then(data => {
      const modes = {};
      (data.providers || []).forEach(p => { modes[p.provider_type.toLowerCase()] = p.mode; });
      setProviderModes(modes);
    }).catch(() => setProviderModes({}));
  }, []);

  const changeProvider = next => {
    setProvider(next);
    setModel(MODELS_BY_PROVIDER[next][0]);
  };

  const run = async () => {
    setLoading(true);
    setError("");
    setRunHistory([]);
    try {
      const finalPrompt = mode === "slow" ? SLOW_PROMPT + prompt : prompt;
      const sessionId = `pg-${mode}-${Date.now()}`;
      const repetitions = mode === "duplicate" ? 3 : mode === "loop" ? 5 : 1;
      const results = [];
      for (let i = 0; i < repetitions; i++) {
        // reuse the same session for duplicate/loop modes to trigger DOG
        const res = await sendDogChat({ prompt: finalPrompt, system, provider, model, sessionId, tools: options.loop ? [{ name: "playground_tool" }] : [], metadata: options });
        results.push(res);
      }
      setResult(results[results.length - 1]);
      setRunHistory(results.map((r, i) => ({ decision: r.intelligence.decision, latency: Math.round(r.latency.total_latency_ms), idx: i + 1 })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentMode = providerModes[provider] || "mock";
  const isLive = currentMode === "live" && !model.startsWith("mock-");
  const chipLabel = isLive ? "Live providers active" : "Mock providers active";
  const ChipIcon = isLive ? Zap : FlaskConical;

  const cost = result ? ((result.response.usage.total_tokens || 0) * 0.000015).toFixed(4) : null;
  const cacheHit = result?.intelligence?.decision === "CACHE";

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Developer lab</div>
          <h1 data-testid="page-title">Let me test DOG.</h1>
          <p data-testid="page-description">Trace an AI request through the intelligence layer and see every decision it made.</p>
        </div>
        <span className={`mock-chip ${isLive ? "live-chip" : ""}`} data-testid="playground-mode-chip">
          <ChipIcon size={14} /> {chipLabel}
        </span>
      </div>

      <section className="playground-grid">
        <div className="panel playground-input">
          <div className="field-row">
            <label>Provider
              <select value={provider} onChange={e => changeProvider(e.target.value)} data-testid="playground-provider-select">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Gemini</option>
                <option value="custom">Custom (mock)</option>
              </select>
            </label>
            <label>Model
              <select value={model} onChange={e => setModel(e.target.value)} data-testid="playground-model-select">
                {MODELS_BY_PROVIDER[provider].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <label className="prompt-label">System prompt
            <textarea value={system} onChange={e => setSystem(e.target.value)} rows={2} style={{ minHeight: 60 }} data-testid="playground-system-input" />
          </label>
          <label className="prompt-label">User prompt
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} data-testid="playground-prompt-input" />
          </label>

          <div className="playground-section-title">Options</div>
          <div className="options-row">
            <Toggle label="Enable DOG" value={options.dog} onChange={v => setOptions({ ...options, dog: v })} testId="option-dog" />
            <Toggle label="Cache" value={options.cache} onChange={v => setOptions({ ...options, cache: v })} testId="option-cache" />
            <Toggle label="Loop detection" value={options.loop} onChange={v => setOptions({ ...options, loop: v })} testId="option-loop" />
            <Toggle label="Cost protection" value={options.cost} onChange={v => setOptions({ ...options, cost: v })} testId="option-cost" />
          </div>

          <div className="playground-section-title">Demo mode</div>
          <div className="mode-row">
            {DEMO_MODES.map(m => (
              <button
                key={m.key}
                type="button"
                className={`mode-chip ${mode === m.key ? "selected" : ""}`}
                onClick={() => setMode(m.key)}
                data-testid={`mode-${m.key}`}
                title={m.desc}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mode-desc">{DEMO_MODES.find(m => m.key === mode).desc}</p>

          <button className="primary-button send-button" onClick={run} disabled={loading || !prompt.trim()} data-testid="playground-send-button">
            {loading ? "Tracing request…" : "Send request"} <Send size={16} />
          </button>
          {error && <div className="playground-error" data-testid="playground-error">{error}</div>}
        </div>

        <div className="panel playground-output">
          <div className="panel-header">
            <div><span className="eyebrow">Gateway response</span><h2>Response</h2></div>
            <button className="icon-button" onClick={() => result && navigator.clipboard.writeText(result.response.content)} disabled={!result} data-testid="copy-response-button"><Copy size={16} /></button>
          </div>
          {result ? (
            <>
              <p className="response-copy" data-testid="playground-response">{result.response.content}</p>
              {runHistory.length > 1 && (
                <div className="run-history" data-testid="run-history">
                  {runHistory.map(r => (
                    <div key={r.idx} className={`run-history-row decision-${r.decision.toLowerCase()}`}>
                      <span>#{r.idx}</span>
                      <b>{r.decision}</b>
                      <small>{r.latency} ms</small>
                    </div>
                  ))}
                </div>
              )}
              <div className="dog-telemetry-grid" data-testid="dog-telemetry-grid">
                <div><Sparkles size={13} /><span>DOG decision</span><strong data-testid="playground-decision" className={`decision-tag decision-${(result.intelligence.decision || 'allow').toLowerCase()}`}>{result.intelligence.decision}</strong></div>
                <div><Gauge size={13} /><span>Latency</span><strong data-testid="playground-latency">{Math.round(result.latency.total_latency_ms)} ms</strong></div>
                <div><Zap size={13} /><span>TTFT</span><strong>{Math.round((result.latency.time_to_first_token_ms || result.latency.total_latency_ms) * 0.4)} ms</strong></div>
                <div><span>Tokens</span><strong>{result.response.usage.total_tokens}</strong></div>
                <div><span>Est. cost</span><strong>${cost}</strong></div>
                <div><span>Cache</span><strong>{cacheHit ? "HIT" : "MISS"}</strong></div>
                <div><ShieldCheck size={13} /><span>Loop risk</span><strong>{Math.min(99, Math.round((result.intelligence.loop?.score || 0) * 100))}%</strong></div>
                <div><span>Cost saved</span><strong style={{ color: "#10b981" }}>{["BLOCK", "DEDUPLICATE", "CACHE"].includes(result.intelligence.decision) ? "$0.0180" : "$0.0000"}</strong></div>
              </div>
            </>
          ) : (
            <div className="playground-empty" data-testid="playground-empty">
              <FlaskConical size={24} />
              <strong>Your traced response will appear here</strong>
              <span>Pick a demo mode and send a prompt to inspect DOG&apos;s control layer.</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
