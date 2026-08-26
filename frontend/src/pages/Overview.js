import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Sparkles } from "lucide-react";
import MetricCard from "../components/MetricCard";
import { PerformanceChart } from "../components/Charts";
import StatusList from "../components/StatusList";
import SavingsWidget from "../components/SavingsWidget";
import { getOverview, getDogProviders, getPerformance } from "../services/dogApi";
import { useAuth } from "../auth/AuthContext";

const REFRESH_MS = 8000;

function formatSpend(v) { return `$${(v || 0).toFixed(2)}`; }
function formatLatency(v) { return `${Math.round(v || 0)} ms`; }
function formatRequests(v) {
  if (v > 999) return `${(v / 1000).toFixed(1)}K`;
  return `${v || 0}`;
}
function formatReliability(v) { return `${((v || 1) * 100).toFixed(2)}%`; }

const EVENT_LABEL = {
  DUPLICATE_PREVENTED: ["Duplicate request prevented", "info"],
  LOOP_PREVENTED: ["Loop prevented", "warning"],
  CACHE_HIT: ["Cache hit", "success"],
  REQUEST_COALESCED: ["Requests coalesced", "info"],
};

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

export default function Overview() {
  const { user, workspace } = useAuth();
  const [overview, setOverview] = useState(null);
  const [providers, setProviders] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [range, setRange] = useState("24 hours");
  const rangeHours = { "24 hours": 24, "7 days": 168, "30 days": 720 }[range];

  useEffect(() => {
    let cancelled = false;
    const load = () => Promise.all([getOverview(), getDogProviders(), getPerformance(rangeHours)])
      .then(([o, p, perf]) => { if (!cancelled) { setOverview(o); setProviders(p.providers || []); setPerformance(perf.series || []); } })
      .catch(() => {});
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [rangeHours]);

  const metrics = [
    { label: "Average latency", value: overview ? formatLatency(overview.avg_latency_ms) : "—", delta: "live", note: "24 hour rolling", tone: "mint", icon: "activity", to: "/performance" },
    { label: "AI spend", value: overview ? formatSpend(overview.spend_24h) : "—", delta: overview ? formatSpend(overview.prevented_savings_24h) : "—", note: "optimized · 24h", tone: "blue", icon: "wallet", to: "/cost" },
    { label: "Requests", value: overview ? formatRequests(overview.requests_24h) : "—", delta: "live", note: "last 24 hours", tone: "amber", icon: "zap", to: "/performance" },
    { label: "Reliability", value: overview ? formatReliability(overview.reliability_24h) : "—", delta: "Healthy", note: "24 hour rolling", tone: "violet", icon: "shield", to: "/reliability" },
  ];

  const dogDidSummary = [
    { label: "Duplicate calls prevented", value: overview ? overview.prevented_calls_24h : 0, to: "/optimizations" },
    { label: "Loops stopped", value: overview ? overview.loops_today : 0, to: "/reliability" },
    { label: "Unnecessary requests blocked", value: overview ? overview.prevented_calls_24h : 0, to: "/optimizations" },
  ];
  const performanceScore = overview ? Math.max(0, Math.min(100, Math.round(100 - (overview.avg_latency_ms || 0) / 20))) : null;
  const reliabilityScore = overview ? Math.round((overview.reliability_24h || 0) * 100) : null;
  const costScore = overview ? Math.max(0, Math.min(100, Math.round(100 - (overview.spend_24h || 0) / 20))) : null;
  const healthScore = overview ? Math.round((performanceScore + reliabilityScore + costScore) / 3) : null;
  const firstName = (workspace?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "there").split(/\s+/)[0];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Live · updated every {REFRESH_MS / 1000}s</div>
          <h1 data-testid="page-title">Good morning, {firstName}</h1>
          <p data-testid="page-description">Your AI infrastructure at a glance — DOG is monitoring and optimizing your traffic.</p>
        </div>
        <button className="soft-button" onClick={() => setRange(current => current === "24 hours" ? "7 days" : current === "7 days" ? "30 days" : "24 hours")} data-testid="date-range-button">Last {range} <ChevronDown size={15} /></button>
      </div>

      <section className="health-hero" data-testid="health-summary">
        <div className="health-copy">
          <span className="section-kicker"><span className="pulse" /> AI Health</span>
          <h2>Your AI infrastructure<br /><em>{healthScore === null ? "is loading." : healthScore >= 80 ? "is performing well." : "needs attention."}</em></h2>
          <p>Live health calculated from latency, reliability, and recorded spend.</p>
          <div className="health-subscores">
            <span><b>{performanceScore ?? "—"}</b> Performance</span>
            <span><b>{reliabilityScore ?? "—"}</b> Reliability</span>
            <span><b>{costScore ?? "—"}</b> Cost efficiency</span>
          </div>
        </div>
        <div className="health-score">
          <div className="score-ring"><strong>{healthScore ?? "—"}</strong><span>/ 100</span></div>
          <span className="health-status"><span /> {healthScore === null ? "Loading" : healthScore >= 80 ? "Healthy" : "Needs attention"}</span>
        </div>
        <div className="health-spark"><Sparkles size={24} /><span>{healthScore === null ? "—" : `${healthScore}/100`}<small>live health score</small></span></div>
      </section>

      <SavingsWidget />

      <div className="section-title">
        <div><span className="eyebrow">At a glance</span><h2>Keep an eye on the essentials</h2></div>
        <Link to="/performance" className="text-link" data-testid="view-performance-link">View performance <span>↗</span></Link>
      </div>
      <div className="metric-grid">{metrics.map(item => <MetricCard item={item} key={item.label} />)}</div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Response quality</span><h2>AI activity</h2></div>
            <Link to="/performance" className="text-link" data-testid="activity-link">Details ↗</Link>
          </div>
          <div className="chart-legend">
            <span><i className="legend-mint" />Average <b>{overview ? formatLatency(overview.avg_latency_ms) : "—"}</b></span>
            <span><i className="legend-gray" />Requests <b>{overview ? formatRequests(overview.requests_24h) : "—"}</b></span>
          </div>
          <PerformanceChart data={performance} />
        </section>
        <section className="panel dog-summary-panel">
          <div className="panel-header">
            <div><span className="eyebrow">Value captured</span><h2>What DOG did today</h2></div>
            <Link to="/optimizations" className="text-link" data-testid="optimizations-link">Full report ↗</Link>
          </div>
          <div className="dog-summary-list">
            {dogDidSummary.map(row => (
              <Link key={row.label} to={row.to} className="dog-summary-row" data-testid={`dog-did-${row.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <span>{row.label}</span>
                <strong>{row.value.toLocaleString()}</strong>
              </Link>
            ))}
          </div>
          <div className="dog-summary-cta">
            <span>Estimated savings</span>
            <b>{overview ? formatSpend(overview.prevented_savings_24h) : "—"}</b>
          </div>
        </section>
      </div>

      <div className="dashboard-grid lower-grid">
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Live status</span><h2>Provider health</h2></div>
            <Link to="/reliability" className="text-link" data-testid="system-health-link">Details ↗</Link>
          </div>
          <StatusList items={[
            { name: "API Gateway", status: "Operational" },
            ...providers.map(p => ({ name: p.name, status: p.status === "CONNECTED" ? "Operational" : p.status })),
          ]} />
        </section>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Latest signals</span><h2>Recent events</h2></div>
            <Link to="/reliability" className="text-link" data-testid="events-link">View all ↗</Link>
          </div>
          <div className="event-list">
            {overview?.recent_events?.length ? overview.recent_events.map((ev, i) => {
              const [title, kind] = EVENT_LABEL[ev.type] || [ev.type, "info"];
              return (
                <div className="event-row" key={i}>
                  <span className={`event-dot ${kind}`} />
                  <div><strong>{title}</strong><span>saved ${ev.savings.toFixed(2)}</span></div>
                  <time>{timeAgo(ev.created_at)}</time>
                </div>
              );
            }) : <p className="muted" style={{ padding: "20px 0", fontSize: 12 }}>No recent activity — send a request from the Playground to see DOG in action.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
