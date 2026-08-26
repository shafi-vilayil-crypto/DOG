import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ShieldCheck } from "lucide-react";
import StatusList from "../components/StatusList";
import { getReliability, getDogProviders } from "../services/dogApi";

const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

export default function Reliability() {
  const [data, setData] = useState(null);
  const [providerStatus, setProviderStatus] = useState([]);

  useEffect(() => {
    const load = () => Promise.all([getReliability(), getDogProviders()])
      .then(([r, p]) => {
        setData(r);
        setProviderStatus([
          { name: "Gateway", status: "Operational" },
          ...(p.providers || []).map(prov => ({ name: prov.name, status: prov.status === "CONNECTED" ? "Operational" : prov.status })),
          { name: "Supabase", status: "Operational" },
        ]);
      }).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  const items = providerStatus;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Reliability</div>
          <h1 data-testid="page-title">Is anything going wrong?</h1>
          <p data-testid="page-description">Loop detection, provider incidents, and every intervention DOG made to protect execution.</p>
        </div>
        <button className="soft-button" data-testid="page-filter-button">Last 24 hours <ChevronDown size={15} /></button>
      </div>

      <section className="reliability-hero panel">
        <div>
          <span className="eyebrow">AI infrastructure</span>
          <h2><span className="status-dot" /> Operational</h2>
          <p>All providers responding within their expected latency envelope.</p>
        </div>
        <div className="reliability-hero-metrics">
          <div><span>Loops detected today</span><b>{data?.loops_today ?? 0}</b></div>
          <div><span>Loops prevented</span><b>{data?.loops_prevented ?? 0}</b></div>
          <div className="highlight"><span>Provider cost avoided</span><b>${(data?.cost_avoided ?? 0).toFixed(2)}</b></div>
        </div>
      </section>

      <div className="dashboard-grid lower-grid" style={{ marginTop: 24 }}>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Live status</span><h2>System components</h2></div>
          </div>
          <StatusList items={items} />
        </section>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Incidents</span><h2>Recent interventions</h2></div>
          </div>
          {data?.incidents?.length ? (
            <table className="data-table incidents-table" data-testid="incidents-table">
              <thead><tr><th>Event</th><th>Provider</th><th>Severity</th><th>Action</th><th>When</th></tr></thead>
              <tbody>
                {data.incidents.map((inc, i) => (
                  <tr key={i}>
                    <td><strong>{inc.title}</strong><div className="incident-detail mono">{inc.detail}</div></td>
                    <td>{inc.provider}</td>
                    <td><span className={`sev sev-${inc.severity}`}>{SEVERITY_LABEL[inc.severity]}</span></td>
                    <td><span className="mono">{inc.action}</span></td>
                    <td className="muted">{timeAgo(inc.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted" style={{ fontSize: 12, padding: "20px 0" }}>No incidents recorded yet — fire a Loop demo from the Playground to see one.</p>}
        </section>
      </div>

      <section className="panel loop-panel" style={{ marginTop: 24 }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">Loop detection · live events</span>
            <h2><AlertTriangle size={18} style={{ verticalAlign: "-3px", color: "#c98110" }} /> Execution timeline</h2>
          </div>
          <div className="loop-summary"><span>Loops today</span><b>{data?.loops_today ?? 0}</b><span>Prevented</span><b>{data?.loops_prevented ?? 0}</b><span>Saved</span><b>${(data?.cost_avoided ?? 0).toFixed(2)}</b></div>
        </div>
        <div className="loop-timeline">
          {data?.incidents?.length ? data.incidents.map((incident, i) => (
            <div className={`loop-step ${incident.severity === "high" ? "warn" : ""}`} key={`${incident.time}-${i}`} data-testid={`loop-step-${i}`}>
              <div className="loop-marker">{incident.severity === "high" ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}</div><div><strong>{incident.title}</strong><span>{incident.detail} · {incident.action} · {timeAgo(incident.time)}</span></div>
            </div>
          )) : <p className="muted" style={{ padding: "20px 0", fontSize: 12 }}>No loop events recorded yet. Run a loop scenario from the Playground.</p>}
        </div>
      </section>
    </>
  );
}
