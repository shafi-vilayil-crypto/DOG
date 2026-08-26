import { useEffect, useMemo, useState } from "react";
import { getPolicies, updatePolicies } from "../services/dogApi";

const SECTIONS = [
  { key: "latency", label: "Latency", fields: [["latency_full_ms", "Normal threshold (ms)", "number"], ["latency_short_ms", "Slow threshold (ms)", "number"], ["latency_critical_ms", "Critical threshold (ms)", "number"]] },
  { key: "loop", label: "Loop protection", fields: [["loop_window_ms", "Detection window (ms)", "number"], ["loop_max_repetitions", "Maximum repetitions", "number"], ["loop_block_threshold", "Block threshold (risk %)", "number"]] },
  { key: "cost", label: "Cost protection", fields: [["max_session_cost", "Session budget ($)", "number"], ["max_request_tokens", "Request token limit", "number"]] },
  { key: "cache", label: "Cache", fields: [["cache_enabled", "Enabled", "toggle"], ["cache_ttl_seconds", "Default TTL (seconds)", "number"]] },
];

export default function Settings() {
  const [active, setActive] = useState(SECTIONS[0].key);
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const section = useMemo(() => SECTIONS.find(s => s.key === active), [active]);
  useEffect(() => { getPolicies().then(setValues).catch(err => setError(err.message)); }, []);
  const change = (key, value, type) => setValues(prev => ({ ...prev, [key]: type === "number" ? Number(value) : value }));
  const save = async () => { setError(""); try { await updatePolicies(values); setSaved(true); setTimeout(() => setSaved(false), 1800); } catch (err) { setError(err.message); } };
  return <>
    <div className="page-heading"><div><div className="eyebrow">Settings</div><h1 data-testid="page-title">How should DOG behave for my workspace?</h1><p data-testid="page-description">Policies that shape how the intelligence layer reacts to your traffic.</p></div></div>
    <div className="settings-layout">
      <aside className="settings-nav panel">{SECTIONS.map(s => <button key={s.key} type="button" className={`settings-nav-item ${active === s.key ? "active" : ""}`} onClick={() => setActive(s.key)} data-testid={`settings-nav-${s.key}`}>{s.label}</button>)}</aside>
      <section className="panel settings-form"><span className="eyebrow">{section.label}</span><h2>{section.label} policies</h2>
        <div className="settings-fields">{section.fields.map(([key, label, type]) => <label key={key} className="settings-field" data-testid={`settings-field-${key}`}><span>{label}</span>{type === "toggle" ? <button type="button" aria-pressed={Boolean(values[key])} className={`toggle ${values[key] ? "on" : ""}`} onClick={() => change(key, !values[key], type)}><span /></button> : <input type={type} value={values[key] ?? ""} onChange={e => change(key, e.target.value, type)} />}</label>)}</div>
        {error && <div className="playground-error">{error}</div>}<div className="settings-actions"><button className="primary-button" onClick={save} data-testid="settings-save">{saved ? "Saved" : "Save changes"}</button></div>
      </section>
    </div>
  </>;
}
