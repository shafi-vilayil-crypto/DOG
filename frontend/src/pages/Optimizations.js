import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Database, GitMerge, ShieldCheck, Sparkles } from "lucide-react";
import { getOptimizations } from "../services/dogApi";

const TYPE_META = {
  DUPLICATE_PREVENTED: { name: "Duplicate prevention", icon: Copy, desc: "Identical requests coalesced inside the dedup window" },
  LOOP_PREVENTED: { name: "Loop prevention", icon: ShieldCheck, desc: "Runaway tool/LLM loops halted before compounding cost" },
  CACHE_HIT: { name: "Cache", icon: Database, desc: "Requests served instantly from the response cache" },
  REQUEST_COALESCED: { name: "Request coalescing", icon: GitMerge, desc: "Concurrent duplicates merged into a single upstream call" },
};
const KIND = {
  DUPLICATE_PREVENTED: "duplicate", LOOP_PREVENTED: "loop", CACHE_HIT: "cache", REQUEST_COALESCED: "coalesce",
};

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

export default function Optimizations() {
  const [data, setData] = useState({ by_type: [], recent: [] });
  const [selected, setSelected] = useState(null);
  const [range, setRange] = useState("30 days");
  const days = { "7 days": 7, "30 days": 30, "90 days": 90 }[range];

  useEffect(() => {
    const load = () => getOptimizations(days).then(setData).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [days]);

  useEffect(() => {
    if (!selected && data.recent[0]) setSelected(data.recent[0]);
  }, [data.recent, selected]);

  const totalSavings = useMemo(() => data.by_type.reduce((acc, r) => acc + (r.savings || 0), 0), [data.by_type]);
  const byTypeMap = useMemo(() => {
    const map = {};
    data.by_type.forEach(row => { map[row.type] = row; });
    return map;
  }, [data.by_type]);

  const categories = Object.keys(TYPE_META).map(type => ({
    type,
    ...TYPE_META[type],
    count: byTypeMap[type]?.count || 0,
    savings: byTypeMap[type]?.savings || 0,
  }));

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Optimizations</div>
          <h1 data-testid="page-title">What did DOG actually improve?</h1>
          <p data-testid="page-description">Every action the intelligence layer took, and the measurable dollars it produced.</p>
        </div>
        <button className="soft-button" onClick={() => setRange(current => current === "7 days" ? "30 days" : current === "30 days" ? "90 days" : "7 days")} data-testid="page-filter-button">Last {range} <ChevronDown size={15} /></button>
      </div>

      <section className="opt-hero panel">
        <div>
          <span className="eyebrow">Total optimization savings</span>
          <div className="opt-hero-value">${totalSavings.toFixed(2)}</div>
          <div className="opt-hero-note"><Sparkles size={14} /> Estimated based on prevented upstream calls</div>
        </div>
        <div className="opt-hero-breakdown">
          {categories.map(c => (
            <div key={c.name} data-testid={`opt-breakdown-${c.name.toLowerCase().replace(/\s+/g, "-")}`}>
              <span>{c.name}</span>
              <b>${c.savings.toFixed(2)}</b>
            </div>
          ))}
        </div>
      </section>

      <div className="opt-category-grid">
        {categories.map(c => {
          const Icon = c.icon;
          return (
            <div className="panel opt-category-card" key={c.type} data-testid={`opt-category-${c.type.toLowerCase()}`}>
              <div className="opt-category-icon"><Icon size={18} /></div>
              <div className="opt-category-count">{c.count.toLocaleString()}</div>
              <h2>{c.name}</h2>
              <p>{c.desc}</p>
              <div className="opt-category-foot"><span>Estimated savings</span><b>${c.savings.toFixed(2)}</b></div>
            </div>
          );
        })}
      </div>

      <div className="dashboard-grid lower-grid" style={{ marginTop: 24, gridTemplateColumns: "1.1fr 1fr" }}>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Timeline</span><h2>Recent optimizations</h2></div>
          </div>
          {data.recent.length ? (
            <div className="opt-timeline">
              {data.recent.map((event, i) => {
                const meta = TYPE_META[event.type] || { name: event.type };
                const kind = KIND[event.type] || "info";
                return (
                  <button key={i} type="button" className={`opt-timeline-row ${selected === event ? "selected" : ""}`} onClick={() => setSelected(event)} data-testid={`opt-event-${kind}-${i}`}>
                    <span className={`event-dot ${kind === "loop" ? "warning" : kind === "cache" ? "info" : "success"}`} />
                    <div>
                      <strong>{meta.name}</strong>
                      <span className="mono" style={{ fontSize: 10 }}>{event.metadata?.provider || ""} · {event.metadata?.model || ""}</span>
                    </div>
                    <div className="opt-timeline-right">
                      <b>${event.savings.toFixed(4)}</b>
                      <time>{timeAgo(event.created_at)}</time>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : <p className="muted" style={{ fontSize: 12, padding: "20px 0" }}>No optimizations recorded yet.</p>}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Optimization detail</span><h2>{selected ? (TYPE_META[selected.type]?.name || selected.type) : "Nothing selected"}</h2></div>
          </div>
          {selected ? (
            <div className="opt-detail-body">
              <p>DOG intercepted this request at the intelligence layer and prevented it from reaching the upstream provider.</p>
              <div className="opt-detail-grid">
                <div><span>Provider</span><b>{selected.metadata?.provider || "—"}</b></div>
                <div><span>Model</span><b className="mono" style={{ fontSize: 12 }}>{selected.metadata?.model || "—"}</b></div>
                <div className="highlight"><span>Decision</span><b>{selected.metadata?.decision || selected.type}</b></div>
                <div className="highlight"><span>Estimated savings</span><b>${selected.savings.toFixed(4)}</b></div>
              </div>
              <div className="opt-detail-meta">
                <span>When</span><b>{timeAgo(selected.created_at)}</b>
              </div>
            </div>
          ) : <p className="muted" style={{ fontSize: 12, padding: "20px 0" }}>Select an event on the left to see details.</p>}
        </section>
      </div>
    </>
  );
}
