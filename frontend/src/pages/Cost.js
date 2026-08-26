import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SpendChart } from "../components/Charts";
import { getCost } from "../services/dogApi";

const PROVIDER_COLOR = { OPENAI: "#111827", ANTHROPIC: "#d97757", GEMINI: "#4285f4", CUSTOM: "#64748b" };

export default function Cost() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState("30D");

  useEffect(() => {
    let cancelled = false;
    const load = () => getCost({ "7D": 7, "30D": 30, "90D": 90 }[range]).then(d => { if (!cancelled) setData(d); }).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [range]);

  const actual = data?.actual || 0;
  const prevented = data?.prevented || 0;
  const potential = data?.potential || 0;
  const providerTotal = data?.by_provider?.reduce((acc, p) => acc + p.amount, 0) || 0;
  const monthlyLimit = 2000;
  const pct = Math.round((actual / monthlyLimit) * 100);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Cost</div>
          <h1 data-testid="page-title">Where is my AI spend going?</h1>
          <p data-testid="page-description">A clear view of AI spend, prevented spend, and cost by provider and model.</p>
        </div>
        <button className="soft-button" data-testid="page-filter-button">Last 30 days <ChevronDown size={15} /></button>
      </div>

      <section className="cost-hero panel">
        <div>
          <span className="eyebrow">AI spend</span>
          <div className="cost-hero-value">${actual.toFixed(2)}</div>
          <div className="cost-hero-note">Last 30 days · <b>live</b> from DOG telemetry</div>
        </div>
        <div className="cost-hero-trio">
          <div><span>Actual</span><b>${actual.toFixed(2)}</b></div>
          <div><span>Potential</span><b>${potential.toFixed(2)}</b></div>
          <div className="highlight"><span>Saved</span><b>${prevented.toFixed(2)}</b></div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-header">
          <div><span className="eyebrow">Spend trend</span><h2>Daily AI spend</h2></div>
          <div className="range-tabs">{["7D", "30D", "90D"].map((x, i) => (
            <button className={range === x ? "selected" : ""} onClick={() => setRange(x)} key={x} data-testid={`cost-range-${x.toLowerCase()}`}>{x}</button>
          ))}</div>
        </div>
        <SpendChart data={data?.series || []} />
      </section>

      <div className="dashboard-grid" style={{ marginTop: 24, gridTemplateColumns: "1fr 1.3fr" }}>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Allocation</span><h2>Cost by provider</h2></div>
          </div>
          {data?.by_provider?.length ? (
            <div className="cost-provider-list">
              {data.by_provider.map(p => {
                const color = PROVIDER_COLOR[p.name] || "#64748b";
                const pctP = providerTotal > 0 ? Math.round((p.amount / providerTotal) * 100) : 0;
                return (
                  <div className="cost-provider-row" key={p.name} data-testid={`cost-provider-${p.name.toLowerCase()}`}>
                    <div className="cost-provider-head">
                      <span><i className="cost-swatch" style={{ background: color }} />{p.name}</span>
                      <b>${p.amount.toFixed(2)}</b>
                    </div>
                    <div className="cost-bar"><span style={{ width: `${pctP}%`, background: color }} /></div>
                    <small>{pctP}% of total spend</small>
                  </div>
                );
              })}
            </div>
          ) : <p className="muted" style={{ fontSize: 12, padding: "20px 0" }}>No spend recorded yet.</p>}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Drill-down</span><h2>Cost by model</h2></div>
          </div>
          {data?.by_model?.length ? (
            <table className="data-table" data-testid="cost-model-table">
              <thead><tr><th>Provider</th><th>Model</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead>
              <tbody>
                {data.by_model.map(row => (
                  <tr key={`${row.provider}-${row.model}`}>
                    <td>{row.provider}</td>
                    <td><span className="mono">{row.model}</span></td>
                    <td>{row.requests.toLocaleString()}</td>
                    <td>{row.tokens.toLocaleString()}</td>
                    <td><b>${row.cost.toFixed(2)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted" style={{ fontSize: 12, padding: "20px 0" }}>No model usage yet.</p>}
        </section>
      </div>

      <section className="panel budget-panel" style={{ marginTop: 24 }}>
        <div className="panel-header">
          <div><span className="eyebrow">Cost protection</span><h2>Monthly budget</h2></div>
          <span className={`budget-chip ${pct > 80 ? "warn" : ""}`} data-testid="budget-chip">{pct}% used (policy default)</span>
        </div>
        <div className="budget-trio">
          <div><span>Monthly limit</span><b>${monthlyLimit.toLocaleString()}</b></div>
          <div><span>Current usage</span><b>${actual.toLocaleString()}</b></div>
          <div><span>Remaining</span><b>${Math.max(0, monthlyLimit - actual).toLocaleString()}</b></div>
        </div>
        <div className="budget-bar"><span style={{ width: `${pct}%` }} /></div>
      </section>
    </>
  );
}
