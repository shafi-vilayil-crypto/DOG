import { useEffect, useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { PerformanceChart } from "../components/Charts";
import { getPerformance } from "../services/dogApi";

export default function Performance() {
  const [range, setRange] = useState("24H");
  const [data, setData] = useState({ by_provider: [], series: [] });
  const hours = { "1H": 1, "24H": 24, "7D": 168, "30D": 720 }[range];
  useEffect(() => { getPerformance(hours).then(setData).catch(() => {}); }, [hours]);
  const latest = data.series[data.series.length - 1];
  const providerLatency = data.by_provider;
  const latencyBreakdown = latest ? [["Average latency", latest.avg, "latest hourly bucket"], ["P95 latency", latest.p95, "latest hourly bucket"], ["P99 latency", latest.p99, "latest hourly bucket"]] : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Performance</div>
          <h1 data-testid="page-title">How fast is my AI infrastructure?</h1>
          <p data-testid="page-description">Understand where every millisecond goes across providers, models, and steps.</p>
        </div>
        <button className="soft-button" data-testid="page-filter-button">Last 24 hours <ChevronDown size={15} /></button>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div><span className="eyebrow">Response quality</span><h2>AI response latency</h2></div>
          <div className="range-tabs">{["1H", "24H", "7D", "30D"].map((x, i) => (
            <button className={range === x ? "selected" : ""} onClick={() => setRange(x)} key={x} data-testid={`range-${x.toLowerCase()}-button`}>{x}</button>
          ))}</div>
        </div>
        <div className="chart-legend">
          <span><i className="legend-mint" />Average <b>428 ms</b></span>
          <span><i className="legend-gray" />P95 <b>812 ms</b></span>
          <span><i className="legend-light" />P99 <b>1.2 s</b></span>
        </div>
        <PerformanceChart data={data.series} />
      </section>

      <div className="section-title" style={{ marginTop: 32 }}>
        <div><span className="eyebrow">Latency breakdown</span><h2>Where the time goes</h2></div>
      </div>
      <div className="metric-grid latency-grid">
        {latencyBreakdown.map(([label, value, note]) => (
          <div className="metric-card tone-mint" key={label} data-testid={`latency-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="metric-label">{label}</div><div className="metric-value">{Math.round(value)} ms</div><div className="metric-note"><span>{note}</span></div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid lower-grid" style={{ marginTop: 24 }}>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Provider comparison</span><h2>Latency by provider</h2></div>
          </div>
          <table className="data-table" data-testid="provider-latency-table">
            <thead><tr><th>Provider</th><th>Avg</th><th>P95</th><th>P99</th></tr></thead>
            <tbody>
              {providerLatency.map(row => (
                <tr key={row.name}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.avg} ms</td>
                  <td>{row.p95} ms</td>
                  <td>{row.p99} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Investigation</span><h2>Why was this request slow?</h2></div>
            <button className="soft-button" data-testid="investigate-filter"><Filter size={14} /> Filter</button>
          </div>
          <p className="muted" style={{ fontSize: 12, padding: "20px 0" }}>Request-level traces are available in the Playground. Select a request there to inspect its live DOG telemetry.</p>
        </section>
      </div>
    </>
  );
}
