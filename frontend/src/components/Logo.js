export default function Logo({ compact = false }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`} data-testid="dog-brand"><span>D</span><span className="brand-o">O<i className="clock-hand clock-hour" /><i className="clock-hand clock-minute" /></span><span>G</span>{!compact && <span className="brand-label">AI infrastructure control</span>}</div>;
}